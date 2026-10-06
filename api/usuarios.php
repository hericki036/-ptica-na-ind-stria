<?php
/**
 * Usuários: perfil do próprio usuário (Configurações) e
 * gerenciamento completo pelo administrador.
 */

require_once __DIR__ . '/helpers.php';

/** Valida os campos comuns de nome, e-mail e foto. */
function validar_perfil(array $in, int $ignorarId, array &$campos): array
{
    $nome  = limpar_texto($in['nome_completo'] ?? '');
    $email = mb_strtolower(limpar_texto($in['email'] ?? ''));
    $foto  = trim((string) ($in['foto_perfil'] ?? ''));

    if ($e = validar_nome($nome, 'Nome completo')) $campos['nome_completo'] = $e;
    if ($e = validar_email($email)) $campos['email'] = $e;
    elseif (email_em_uso($email, $ignorarId)) $campos['email'] = 'Este e-mail já está em uso por outra conta.';
    if ($e = validar_foto($foto)) $campos['foto_perfil'] = $e;

    return [$nome, $email, $foto === '' ? null : $foto];
}

function senha_confere(int $id, string $senha): bool
{
    $st = db()->prepare('SELECT senha FROM usuarios WHERE id = ?');
    $st->execute([$id]);
    return password_verify($senha, (string) $st->fetchColumn());
}

switch (acao()) {

    /* =================== Perfil do usuário logado =================== */

    case 'atualizar_perfil':
        exigir_metodo('POST');
        $usuario = exigir_login();
        $campos  = [];
        [$nome, $email, $foto] = validar_perfil(entrada(), $usuario['id'], $campos);
        if ($campos) erro('Corrija os campos destacados.', 422, $campos);

        db()->prepare('UPDATE usuarios SET nome_completo = ?, email = ?, foto_perfil = ? WHERE id = ?')
            ->execute([$nome, $email, $foto, $usuario['id']]);
        responder(buscar_usuario($usuario['id']));

    case 'alterar_senha':
        exigir_metodo('POST');
        $usuario   = exigir_login();
        $in        = entrada();
        $atual     = is_string($in['senha_atual'] ?? null) ? $in['senha_atual'] : '';
        $nova      = is_string($in['nova_senha'] ?? null) ? $in['nova_senha'] : '';
        $confirmar = is_string($in['confirmar_senha'] ?? null) ? $in['confirmar_senha'] : '';

        $campos = [];
        if ($atual === '') $campos['senha_atual'] = 'Informe a senha atual.';
        elseif (!senha_confere($usuario['id'], $atual)) $campos['senha_atual'] = 'Senha atual incorreta.';
        if ($e = validar_senha($nova)) $campos['nova_senha'] = $e;
        elseif ($nova === $atual) $campos['nova_senha'] = 'A nova senha deve ser diferente da atual.';
        if ($confirmar !== $nova) $campos['confirmar_senha'] = 'As senhas não coincidem.';
        if ($campos) erro('Corrija os campos destacados.', 422, $campos);

        db()->prepare('UPDATE usuarios SET senha = ? WHERE id = ?')
            ->execute([password_hash($nova, PASSWORD_DEFAULT), $usuario['id']]);
        responder(['mensagem' => 'Senha alterada com sucesso.']);

    case 'excluir_conta':
        exigir_metodo('POST');
        $usuario = exigir_login();
        $senha   = (string) (entrada()['senha'] ?? '');

        if (!senha_confere($usuario['id'], $senha)) {
            erro('Senha incorreta.', 422, ['senha' => 'Senha incorreta.']);
        }
        if ($usuario['nivel_acesso'] === 'admin' && total_admins() <= 1) {
            erro('Você é o único administrador. Promova outro usuário a administrador antes de excluir sua conta.', 409);
        }

        encerrar_sessao();
        db()->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$usuario['id']]);
        responder(['mensagem' => 'Conta excluída.', 'csrf' => token_csrf()]);

    /* =================== Administração =================== */

    case 'listar':
        exigir_metodo('GET');
        exigir_admin();
        $st = db()->prepare('SELECT ' . CAMPOS_USUARIO . ',
                                    EXISTS(SELECT 1 FROM sessoes s
                                           WHERE s.usuario_id = usuarios.id AND s.status = "ativa"
                                             AND s.ultima_atividade > (NOW() - INTERVAL ? SECOND)) AS online
                             FROM usuarios ORDER BY nome_completo');
        $st->execute([SESSAO_TIMEOUT]);
        responder(array_map(function ($u) {
            $u = formatar_usuario($u);
            $u['online'] = (bool) $u['online'];
            return $u;
        }, $st->fetchAll()));

    case 'criar':
        exigir_metodo('POST');
        exigir_admin();
        $in     = entrada();
        $campos = [];
        [$nome, $email, $foto] = validar_perfil($in, 0, $campos);
        $senha = is_string($in['senha'] ?? null) ? $in['senha'] : '';
        $nivel = (string) ($in['nivel_acesso'] ?? '');
        if ($e = validar_senha($senha)) $campos['senha'] = $e;
        if (!in_array($nivel, ['admin', 'usuario', 'visitante'], true)) $campos['nivel_acesso'] = 'Selecione o nível de acesso.';
        if ($campos) erro('Corrija os campos destacados.', 422, $campos);

        db()->prepare('INSERT INTO usuarios (nome_completo, email, senha, nivel_acesso, foto_perfil, data_cadastro)
                       VALUES (?, ?, ?, ?, ?, NOW())')
            ->execute([$nome, $email, password_hash($senha, PASSWORD_DEFAULT), $nivel, $foto]);
        responder(buscar_usuario((int) db()->lastInsertId()), 201);

    case 'editar':
        exigir_metodo('POST');
        $admin = exigir_admin();
        $in    = entrada();
        $id    = (int) ($in['id'] ?? 0);
        $alvo  = buscar_usuario($id);
        if (!$alvo) erro('Usuário não encontrado.', 404);

        $campos = [];
        [$nome, $email, $foto] = validar_perfil($in, $id, $campos);
        $nivel = (string) ($in['nivel_acesso'] ?? '');
        $senha = is_string($in['senha'] ?? null) ? $in['senha'] : '';
        if (!in_array($nivel, ['admin', 'usuario', 'visitante'], true)) $campos['nivel_acesso'] = 'Selecione o nível de acesso.';
        elseif ($alvo['nivel_acesso'] === 'admin' && $nivel !== 'admin' && total_admins() <= 1) {
            $campos['nivel_acesso'] = 'O sistema precisa de ao menos um administrador.';
        }
        if ($senha !== '' && ($e = validar_senha($senha))) $campos['senha'] = $e;
        if ($campos) erro('Corrija os campos destacados.', 422, $campos);

        db()->prepare('UPDATE usuarios SET nome_completo = ?, email = ?, nivel_acesso = ?, foto_perfil = ? WHERE id = ?')
            ->execute([$nome, $email, $nivel, $foto, $id]);
        if ($senha !== '') {
            db()->prepare('UPDATE usuarios SET senha = ? WHERE id = ?')->execute([password_hash($senha, PASSWORD_DEFAULT), $id]);
        }
        responder(buscar_usuario($id));

    case 'excluir':
        exigir_metodo('POST');
        $admin = exigir_admin();
        $id    = (int) (entrada()['id'] ?? 0);
        $alvo  = buscar_usuario($id);
        if (!$alvo) erro('Usuário não encontrado.', 404);
        if ($id === $admin['id']) erro('Para excluir a sua própria conta, use a tela Configurações.', 409);
        if ($alvo['nivel_acesso'] === 'admin' && total_admins() <= 1) erro('O sistema precisa de ao menos um administrador.', 409);

        db()->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$id]);
        responder(['id' => $id]);

    default:
        erro('Ação inválida.', 404);
}
