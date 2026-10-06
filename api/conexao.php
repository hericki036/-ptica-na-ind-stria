<?php
/**
 * Conexão com o MySQL via PDO + instalação automática do banco.
 *
 * Na primeira execução, se o banco "gestao_visitas" ou as tabelas ainda não
 * existirem, este arquivo os cria a partir de database/schema.sql.
 */

require_once __DIR__ . '/config.php';

date_default_timezone_set(FUSO_HORARIO);

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $opcoes = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    $dsnServidor = sprintf('mysql:host=%s;port=%d;charset=utf8mb4', DB_HOST, DB_PORT);

    try {
        $pdo = new PDO($dsnServidor . ';dbname=' . DB_NAME, DB_USER, DB_PASS, $opcoes);
    } catch (PDOException $e) {
        // 1049 = banco de dados desconhecido → cria o banco e conecta de novo
        if ((int) $e->getCode() === 1049) {
            try {
                $pdo = new PDO($dsnServidor, DB_USER, DB_PASS, $opcoes);
                $pdo->exec('CREATE DATABASE IF NOT EXISTS `' . DB_NAME . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
                $pdo->exec('USE `' . DB_NAME . '`');
            } catch (PDOException $e2) {
                falha_conexao($e2);
            }
        } else {
            falha_conexao($e);
        }
    }

    // Alinha o fuso do MySQL com o do PHP (NOW() passa a bater com date())
    // e garante que aspas duplas sejam tratadas como texto nas consultas.
    $pdo->exec("SET time_zone = '" . (new DateTime())->format('P') . "'");
    $pdo->exec("SET SESSION sql_mode = REPLACE(@@SESSION.sql_mode, 'ANSI_QUOTES', '')");

    instalar_tabelas($pdo);
    return $pdo;
}

/** Cria as tabelas a partir do schema.sql se ainda não existirem. */
function instalar_tabelas(PDO $pdo): void
{
    $existe = $pdo->query("SHOW TABLES LIKE 'recuperacoes_senha'")->fetchColumn();
    if ($existe) {
        return;
    }

    $sql = file_get_contents(__DIR__ . '/../database/schema.sql');
    if ($sql === false) {
        throw new RuntimeException('Arquivo database/schema.sql não encontrado.');
    }

    // Remove comentários e as linhas CREATE DATABASE / USE (o banco já está selecionado)
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    $comandos = preg_split('/;\s*$/m', $sql);
    foreach ($comandos as $comando) {
        $comando = trim($comando);
        if ($comando === '' || preg_match('/^(CREATE\s+DATABASE|USE)\s/i', $comando)) {
            continue;
        }
        $pdo->exec($comando);
    }
}

/** Resposta amigável quando o MySQL não está acessível. */
function falha_conexao(PDOException $e): void
{
    error_log('[gestao_visitas] Falha de conexão: ' . $e->getMessage());
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'ok'     => false,
        'codigo' => 'banco_indisponivel',
        'erro'   => 'Não foi possível conectar ao MySQL. Verifique se o MySQL está iniciado no painel do XAMPP e se os dados em api/config.php estão corretos.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
