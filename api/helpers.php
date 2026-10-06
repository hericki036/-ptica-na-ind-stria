<?php
/**
 * Funções compartilhadas pelos endpoints da API:
 * respostas JSON, sessão PHP, CSRF, permissões e validação de dados.
 */

// Avisos do PHP nunca vão para a resposta (quebrariam o JSON); vão para o log.
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/conexao.php';

// Todas as respostas da API são JSON e nunca devem ficar em cache
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

// Qualquer erro não tratado vira uma resposta JSON (sem expor detalhes internos)
set_exception_handler(function (Throwable $e) {
    error_log('[gestao_visitas] ' . $e->getMessage() . ' em ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) {
        http_response_code(500);
    }
    echo json_encode(['ok' => false, 'erro' => 'Erro interno no servidor. Tente novamente.'], JSON_UNESCAPED_UNICODE);
    exit;
});

iniciar_sessao();

/* =====================================================================
   Respostas
   ===================================================================== */

function responder($dados = null, int $status = 200): void
{
    http_response_code($status);
    echo json_encode(['ok' => true, 'dados' => $dados], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Responde com erro. $campos permite apontar o erro de cada campo do
 * formulário (ex.: ['email' => 'E-mail já cadastrado']).
 *
 * Erros previstos (validação, senha errada, permissão, sessão expirada)
 * voltam com HTTP 200 e o código real no campo "status" do JSON: assim o
 * navegador não registra "falha de rede" no console a cada senha errada.
 * O front-end (js/db.js) lê o campo "status".
 */
function erro(string $mensagem, int $status = 400, array $campos = [], ?string $codigo = null): void
{
    http_response_code(200);
    header('X-Status: ' . $status);
    $corpo = ['ok' => false, 'status' => $status, 'erro' => $mensagem];
    if ($campos) {
        $corpo['campos'] = $campos;
    }
    if ($codigo) {
        $corpo['codigo'] = $codigo;
    }
    echo json_encode($corpo, JSON_UNESCAPED_UNICODE);
    exit;
}

/** Lê o corpo JSON da requisição. */
function entrada(): array
{
    static $dados = null;
    if ($dados === null) {
        $json = json_decode(file_get_contents('php://input') ?: '[]', true);
        $dados = is_array($json) ? $json : [];
    }
    return $dados;
}

function acao(): string
{
    return (string) ($_GET['acao'] ?? '');
}

/** Garante o método HTTP e, para escrita, valida o token CSRF. */
function exigir_metodo(string $metodo): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $metodo) {
        erro('Método não permitido.', 405);
    }
    if ($metodo === 'POST') {
        verificar_csrf();
    }
}

/* =====================================================================
   Sessão e autenticação
   ===================================================================== */

function iniciar_sessao(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_name('PORTARIA_SESSID');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'httponly' => true,              // JavaScript não lê o cookie
        'samesite' => 'Strict',          // bloqueia envio a partir de outros sites
        'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    ]);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.gc_maxlifetime', (string) SESSAO_TIMEOUT);
    session_start();
}

/** Token anti-CSRF guardado na sessão e enviado pelo front no cabeçalho. */
function token_csrf(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function verificar_csrf(): void
{
    $enviado = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($enviado) || !hash_equals(token_csrf(), $enviado)) {
        erro('Sua sessão de segurança expirou. Recarregue a página.', 419, [], 'csrf_invalido');
    }
}

/**
 * Devolve o usuário logado (sem a senha) ou null.
 * Encerra a sessão após SESSAO_TIMEOUT de inatividade; nesse caso
 * $motivo recebe "sessao_expirada".
 */
function usuario_logado(?string &$motivo = null): ?array
{
    $motivo = 'nao_autenticado';
    if (empty($_SESSION['usuario_id'])) {
        return null;
    }

    $agora = time();
    $ultimo = (int) ($_SESSION['ultimo_acesso'] ?? 0);
    if ($agora - $ultimo > SESSAO_TIMEOUT) {
        encerrar_sessao(date('Y-m-d H:i:s', $ultimo ?: $agora));
        $motivo = 'sessao_expirada';
        return null;
    }

    $usuario = buscar_usuario((int) $_SESSION['usuario_id']);
    if (!$usuario) {
        encerrar_sessao();
        return null;
    }

    // Registra a atividade (no banco, no máximo uma vez por minuto)
    $_SESSION['ultimo_acesso'] = $agora;
    if ($agora - (int) ($_SESSION['atividade_gravada'] ?? 0) >= 60 && !empty($_SESSION['sessao_log_id'])) {
        db()->prepare('UPDATE sessoes SET ultima_atividade = NOW() WHERE id = ? AND status = "ativa"')
            ->execute([$_SESSION['sessao_log_id']]);
        $_SESSION['atividade_gravada'] = $agora;
    }

    $motivo = null;
    return $usuario;
}

/** Exige usuário logado; responde 401 caso contrário. */
function exigir_login(): array
{
    $usuario = usuario_logado($motivo);
    if (!$usuario) {
        $msg = $motivo === 'sessao_expirada'
            ? 'Sua sessão expirou por inatividade. Entre novamente.'
            : 'Faça login para continuar.';
        erro($msg, 401, [], $motivo);
    }
    return $usuario;
}

function exigir_admin(): array
{
    $usuario = exigir_login();
    if ($usuario['nivel_acesso'] !== 'admin') {
        erro('Acesso restrito a administradores.', 403);
    }
    return $usuario;
}

/** Usuários e administradores gerenciam visitas; visitantes não. */
function exigir_equipe(): array
{
    $usuario = exigir_login();
    if ($usuario['nivel_acesso'] === 'visitante') {
        erro('Seu nível de acesso não permite gerenciar visitas.', 403);
    }
    return $usuario;
}

/**
 * Finaliza o registro no log de sessões e limpa a sessão PHP.
 * O ID da sessão é trocado (o antigo é apagado no servidor), então
 * nenhum cookie antigo volta a funcionar.
 */
function encerrar_sessao(?string $dataSaida = null): void
{
    if (!empty($_SESSION['sessao_log_id'])) {
        db()->prepare('UPDATE sessoes SET status = "finalizada", data_saida = ? WHERE id = ? AND status = "ativa"')
            ->execute([$dataSaida ?? date('Y-m-d H:i:s'), $_SESSION['sessao_log_id']]);
    }
    $_SESSION = [];
    session_regenerate_id(true);
}

/** Fecha sessões que ficaram abertas (aba fechada sem logout). */
function fechar_sessoes_abandonadas(): void
{
    db()->prepare('UPDATE sessoes SET status = "finalizada", data_saida = ultima_atividade
                   WHERE status = "ativa" AND ultima_atividade < (NOW() - INTERVAL ? SECOND)')
        ->execute([SESSAO_TIMEOUT]);
}

/* =====================================================================
   Usuários
   ===================================================================== */

const CAMPOS_USUARIO = 'id, nome_completo, email, nivel_acesso, data_cadastro, ultima_sessao, foto_perfil';

function buscar_usuario(int $id): ?array
{
    $st = db()->prepare('SELECT ' . CAMPOS_USUARIO . ' FROM usuarios WHERE id = ?');
    $st->execute([$id]);
    $u = $st->fetch();
    return $u ? formatar_usuario($u) : null;
}

function formatar_usuario(array $u): array
{
    $u['id'] = (int) $u['id'];
    return $u;
}

function email_em_uso(string $email, int $ignorarId = 0): bool
{
    $st = db()->prepare('SELECT id FROM usuarios WHERE email = ? AND id <> ?');
    $st->execute([$email, $ignorarId]);
    return (bool) $st->fetchColumn();
}

function total_admins(): int
{
    return (int) db()->query('SELECT COUNT(*) FROM usuarios WHERE nivel_acesso = "admin"')->fetchColumn();
}

/* =====================================================================
   Validação
   ===================================================================== */

/** Remove espaços extras e caracteres de controle de um texto. */
function limpar_texto($valor): string
{
    $valor = is_scalar($valor) ? (string) $valor : '';
    $valor = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $valor) ?? '';
    return trim($valor);
}

function validar_nome(string $nome, string $rotulo = 'Nome'): ?string
{
    $tam = mb_strlen($nome);
    if ($tam < 3) return "$rotulo deve ter ao menos 3 caracteres.";
    if ($tam > 120) return "$rotulo deve ter no máximo 120 caracteres.";
    if (!preg_match("/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u", $nome)) return "$rotulo contém caracteres inválidos.";
    return null;
}

function validar_email(string $email): ?string
{
    if ($email === '') return 'Informe o e-mail.';
    if (mb_strlen($email) > 160 || !filter_var($email, FILTER_VALIDATE_EMAIL)) return 'Informe um e-mail válido.';
    return null;
}

/** Senha: 6+ caracteres, com ao menos uma letra e um número. */
function validar_senha(string $senha): ?string
{
    if (strlen($senha) < 6) return 'A senha deve ter ao menos 6 caracteres.';
    if (strlen($senha) > 72) return 'A senha deve ter no máximo 72 caracteres.';
    if (!preg_match('/[A-Za-z]/', $senha) || !preg_match('/\d/', $senha)) return 'Use letras e números na senha.';
    return null;
}

/** Aceita URL http(s) ou imagem em data URL (até ~400 KB). */
function validar_foto(string $foto): ?string
{
    if ($foto === '') return null;
    if (preg_match('#^data:image/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$#', $foto)) {
        return strlen($foto) <= 550000 ? null : 'A imagem é muito grande (máx. 400 KB).';
    }
    if (strlen($foto) <= 2000 && filter_var($foto, FILTER_VALIDATE_URL) && preg_match('#^https?://#i', $foto)) {
        return null;
    }
    return 'Informe uma URL de imagem válida (http ou https).';
}

function validar_data(string $data): bool
{
    $d = DateTime::createFromFormat('Y-m-d', $data);
    return $d && $d->format('Y-m-d') === $data;
}

function validar_hora(string $hora): bool
{
    return (bool) preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $hora);
}

/* =====================================================================
   Outros
   ===================================================================== */

/** IP de quem fez a requisição (o servidor enxerga o IP real). */
function ip_cliente(): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    if ($ip === '::1') $ip = '127.0.0.1 (local)';
    return mb_substr($ip, 0, 45);
}

/** Descrição curta do dispositivo a partir do User-Agent. */
function descrever_dispositivo(string $ua): string
{
    if ($ua === '') return 'Desconhecido';

    $tipo = preg_match('/iPad|Tablet/i', $ua) ? 'Tablet'
        : (preg_match('/Mobi|Android|iPhone/i', $ua) ? 'Celular' : 'Computador');

    $navegadores = [
        'Edge'    => '/Edg\/(\d+)/',
        'Opera'   => '/OPR\/(\d+)/',
        'Firefox' => '/Firefox\/(\d+)/',
        'Chrome'  => '/Chrome\/(\d+)/',
        'Safari'  => '/Version\/(\d+).*Safari/',
    ];
    $navegador = 'Navegador';
    foreach ($navegadores as $nome => $re) {
        if (preg_match($re, $ua, $m)) {
            $navegador = "$nome {$m[1]}";
            break;
        }
    }

    $sistemas = [
        'Windows' => '/Windows NT/',
        'Android' => '/Android/',
        'iOS'     => '/iPhone|iPad/',
        'macOS'   => '/Mac OS X/',
        'Linux'   => '/Linux/',
    ];
    $sistema = '';
    foreach ($sistemas as $nome => $re) {
        if (preg_match($re, $ua)) {
            $sistema = $nome;
            break;
        }
    }

    return mb_substr(trim("$tipo · $navegador" . ($sistema ? " · $sistema" : '')), 0, 160);
}
