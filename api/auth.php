<?php
/**
 * Autenticação: estado da sessão, login, cadastro, logout,
 * "manter conectado" (ping) e recuperação de senha.
 */

require_once __DIR__ . '/helpers.php';

// Hash fictício usado quando o e-mail não existe, para que o tempo de
// resposta seja o mesmo (não revela quais e-mails estão cadastrados).
const HASH_FICTICIO = '$2y$10$ejHMwM5SGq4sUqQuQ9UMveKvzw4bK5tRpl8k1Yu7clBPnDki89Uw2';

switch (acao()) {

    /* -----------------------------------------------------------------
       GET estado — quem está logado? Também entrega o token CSRF.
       ----------------------------------------------------------------- */
    case 'estado':
        exigir_metodo('GET');
        db(); // confere o MySQL (e instala as tabelas no primeiro acesso)
        $usuario = usuario_logado($motivo);
        responder([
            'autenticado' => (bool) $usuario,
            'motivo'      => $usuario ? null : $motivo,
            'usuario'     => $usuario,
            'csrf'        => token_csrf(),
            'setores'     => SETORES,
            'timeout'     => SESSAO_TIMEOUT,
            'agora'       => date('Y-m-d H:i:s'),
        ]);

    /* -----------------------------------------------------------------
       POST login
       ----------------------------------------------------------------- */
    case 'login':
        exigir_metodo('POST');
        $in    = entrada();
        $email = mb_strtolower(limpar_texto($in['email'] ?? ''));
        $senha = is_string($in['senha'] ?? null) ? $in['senha'] : '';

        $campos = [];
        if ($email === '') $campos['email'] = 'Informe o e-mail.';
        if ($senha === '') $campos['senha'] = 'Informe a senha.';
        if ($campos) erro('Preencha os campos obrigatórios.', 422, $campos);

        // Bloqueio simples contra tentativas repetidas
        $bloqueio = (int) ($_SESSION['login_bloqueado_ate'] ?? 0);
        if ($bloqueio > time()) {
            erro('Muitas tentativas. Aguarde ' . ($bloqueio - time()) . ' segundos e tente novamente.', 429);
        }

        $st = db()->prepare('SELECT id, senha FROM usuarios WHERE email = ?');
        $st->execute([$email]);
        $conta = $st->fetch();

        if (!password_verify($senha, $conta['senha'] ?? HASH_FICTICIO) || !$conta) {
            $falhas = (int) ($_SESSION['login_falhas'] ?? 0) + 1;
            $_SESSION['login_falhas'] = $falhas;
            if ($falhas >= 5) {
                $_SESSION['login_falhas'] = 0;
                $_SESSION['login_bloqueado_ate'] = time() + 60;
            }
            erro('E-mail ou senha incorretos.', 401, [], 'credenciais_invalidas');
        }

        $id = (int) $conta['id'];
        if (password_needs_rehash($conta['senha'], PASSWORD_DEFAULT)) {
            db()->prepare('UPDATE usuarios SET senha = ? WHERE id = ?')
                ->execute([password_hash($senha, PASSWORD_DEFAULT), $id]);
        }

        // Se já havia alguém logado neste navegador, fecha aquela sessão
        if (!empty($_SESSION['usuario_id'])) {
            encerrar_sessao();
        }

        // Novo ID de sessão (evita "session fixation") e novo token CSRF
        session_regenerate_id(true);
        $_SESSION = [
            'usuario_id'        => $id,
            'ultimo_acesso'     => time(),
            'atividade_gravada' => time(),
            'csrf'              => bin2hex(random_bytes(32)),
        ];

        fechar_sessoes_abandonadas();
        db()->prepare('INSERT INTO sessoes (usuario_id, data_entrada, ultima_atividade, ip_aproximado, dispositivo, status)
                       VALUES (?, NOW(), NOW(), ?, ?, "ativa")')
            ->execute([$id, ip_cliente(), descrever_dispositivo($_SERVER['HTTP_USER_AGENT'] ?? '')]);
        $_SESSION['sessao_log_id'] = (int) db()->lastInsertId();

        db()->prepare('UPDATE usuarios SET ultima_sessao = NOW() WHERE id = ?')->execute([$id]);

        responder([
            'usuario' => buscar_usuario($id),
            'csrf'    => $_SESSION['csrf'],
            'setores' => SETORES,
            'timeout' => SESSAO_TIMEOUT,
        ]);

    /* -----------------------------------------------------------------
       POST cadastro (conta nova pela tela pública)
       ----------------------------------------------------------------- */
    case 'cadastro':
        exigir_metodo('POST');
        $in        = entrada();
        $nome      = limpar_texto($in['nome_completo'] ?? '');
        $email     = mb_strtolower(limpar_texto($in['email'] ?? ''));
        $senha     = is_string($in['senha'] ?? null) ? $in['senha'] : '';
        $confirmar = is_string($in['confirmar_senha'] ?? null) ? $in['confirmar_senha'] : '';
        $nivel     = (string) ($in['nivel_acesso'] ?? '');

        $campos = [];
        if ($e = validar_nome($nome, 'Nome completo')) $campos['nome_completo'] = $e;
        if ($e = validar_email($email)) $campos['email'] = $e;
        elseif (email_em_uso($email)) $campos['email'] = 'Este e-mail já está cadastrado.';
        if ($e = validar_senha($senha)) $campos['senha'] = $e;
        if ($confirmar === '') $campos['confirmar_senha'] = 'Confirme a senha.';
        elseif ($confirmar !== $senha) $campos['confirmar_senha'] = 'As senhas não coincidem.';

        // O primeiro usuário do sistema vira administrador automaticamente.
        // Depois disso, só um administrador cria outros administradores.
        $primeiro = (int) db()->query('SELECT COUNT(*) FROM usuarios')->fetchColumn() === 0;
        if ($primeiro) {
            $nivel = 'admin';
        } elseif (!in_array($nivel, ['usuario', 'visitante'], true)) {
            $campos['nivel_acesso'] = $nivel === 'admin'
                ? 'Contas de administrador são criadas por um administrador.'
                : 'Selecione o nível de acesso.';
        }

        if ($campos) erro('Corrija os campos destacados.', 422, $campos);

        try {
            db()->prepare('INSERT INTO usuarios (nome_completo, email, senha, nivel_acesso, data_cadastro) VALUES (?, ?, ?, ?, NOW())')
                ->execute([$nome, $email, password_hash($senha, PASSWORD_DEFAULT), $nivel]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                erro('Corrija os campos destacados.', 422, ['email' => 'Este e-mail já está cadastrado.']);
            }
            throw $e;
        }

        responder([
            'mensagem' => $primeiro
                ? 'Conta criada! Por ser a primeira conta, ela tem acesso de administrador.'
                : 'Conta criada com sucesso! Faça login para continuar.',
            'nivel_acesso' => $nivel,
        ], 201);

    /* -----------------------------------------------------------------
       POST logout
       ----------------------------------------------------------------- */
    case 'logout':
        exigir_metodo('POST');
        encerrar_sessao();
        responder(['csrf' => token_csrf()]);

    /* -----------------------------------------------------------------
       POST ping — mantém a sessão viva enquanto o usuário interage
       ----------------------------------------------------------------- */
    case 'ping':
        exigir_metodo('POST');
        exigir_login();
        responder(['timeout' => SESSAO_TIMEOUT]);

    /* -----------------------------------------------------------------
       POST recuperar — gera um código de 6 dígitos (válido por 15 min)
       ----------------------------------------------------------------- */
    case 'recuperar':
        exigir_metodo('POST');
        $email = mb_strtolower(limpar_texto(entrada()['email'] ?? ''));
        if ($e = validar_email($email)) erro($e, 422, ['email' => $e]);

        $resposta = ['mensagem' => 'Se o e-mail estiver cadastrado, enviaremos um código de 6 dígitos válido por 15 minutos.'];

        $st = db()->prepare('SELECT id, nome_completo FROM usuarios WHERE email = ?');
        $st->execute([$email]);
        $conta = $st->fetch();

        if ($conta) {
            $st = db()->prepare('SELECT COUNT(*) FROM recuperacoes_senha WHERE usuario_id = ? AND criado_em > (NOW() - INTERVAL 15 MINUTE)');
            $st->execute([$conta['id']]);
            if ((int) $st->fetchColumn() >= 3) {
                erro('Você já pediu vários códigos. Aguarde alguns minutos e tente de novo.', 429);
            }

            // Invalida códigos anteriores e cria um novo
            db()->prepare('UPDATE recuperacoes_senha SET usado = 1 WHERE usuario_id = ? AND usado = 0')->execute([$conta['id']]);
            $codigo = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            db()->prepare('INSERT INTO recuperacoes_senha (usuario_id, codigo_hash, expira_em, criado_em)
                           VALUES (?, ?, NOW() + INTERVAL 15 MINUTE, NOW())')
                ->execute([$conta['id'], password_hash($codigo, PASSWORD_DEFAULT)]);

            if (MODO_DESENVOLVIMENTO) {
                // Sem servidor de e-mail no XAMPP: o código é mostrado na tela
                $resposta['codigo_dev'] = $codigo;
            } else {
                $texto = "Olá, {$conta['nome_completo']}!\n\nSeu código para redefinir a senha é: $codigo\n"
                       . "Ele expira em 15 minutos. Se você não pediu, ignore este e-mail.";
                @mail($email, 'Código de recuperação de senha', $texto, 'Content-Type: text/plain; charset=utf-8');
            }
        }
        responder($resposta);

    /* -----------------------------------------------------------------
       POST redefinir — troca a senha usando o código recebido
       ----------------------------------------------------------------- */
    case 'redefinir':
        exigir_metodo('POST');
        $in        = entrada();
        $email     = mb_strtolower(limpar_texto($in['email'] ?? ''));
        $codigo    = preg_replace('/\D/', '', (string) ($in['codigo'] ?? ''));
        $senha     = is_string($in['senha'] ?? null) ? $in['senha'] : '';
        $confirmar = is_string($in['confirmar_senha'] ?? null) ? $in['confirmar_senha'] : '';

        $campos = [];
        if (strlen($codigo) !== 6) $campos['codigo'] = 'Digite o código de 6 dígitos.';
        if ($e = validar_senha($senha)) $campos['senha'] = $e;
        if ($confirmar !== $senha) $campos['confirmar_senha'] = 'As senhas não coincidem.';
        if ($campos) erro('Corrija os campos destacados.', 422, $campos);

        $st = db()->prepare('SELECT r.id, r.usuario_id, r.codigo_hash, r.tentativas
                             FROM recuperacoes_senha r JOIN usuarios u ON u.id = r.usuario_id
                             WHERE u.email = ? AND r.usado = 0 AND r.expira_em > NOW()
                             ORDER BY r.id DESC LIMIT 1');
        $st->execute([$email]);
        $pedido = $st->fetch();

        if (!$pedido) {
            erro('Código inválido ou expirado. Solicite um novo.', 422, ['codigo' => 'Código inválido ou expirado.']);
        }
        if (!password_verify($codigo, $pedido['codigo_hash'])) {
            $tentativas = (int) $pedido['tentativas'] + 1;
            db()->prepare('UPDATE recuperacoes_senha SET tentativas = ?, usado = ? WHERE id = ?')
                ->execute([$tentativas, $tentativas >= 5 ? 1 : 0, $pedido['id']]);
            $msg = $tentativas >= 5 ? 'Muitas tentativas. Solicite um novo código.' : 'Código incorreto.';
            erro($msg, 422, ['codigo' => $msg]);
        }

        db()->prepare('UPDATE usuarios SET senha = ? WHERE id = ?')
            ->execute([password_hash($senha, PASSWORD_DEFAULT), $pedido['usuario_id']]);
        db()->prepare('UPDATE recuperacoes_senha SET usado = 1 WHERE usuario_id = ?')->execute([$pedido['usuario_id']]);

        responder(['mensagem' => 'Senha redefinida com sucesso! Entre com a nova senha.']);

    default:
        erro('Ação inválida.', 404);
}
