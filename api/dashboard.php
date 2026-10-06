<?php
/**
 * Resumo do Dashboard. O conteúdo depende do nível de acesso:
 *  - admin/usuario: visitas de hoje, ativas, gráfico da semana e últimas visitas
 *  - admin: também o total de usuários
 *  - visitante: apenas os próprios agendamentos
 */

require_once __DIR__ . '/helpers.php';

exigir_metodo('GET');
$usuario = exigir_login();
$pdo     = db();
$hoje    = date('Y-m-d');
$agora   = date('H:i');

$resumo = ['nivel_acesso' => $usuario['nivel_acesso']];

// Próximos agendamentos do usuário (ainda não terminados)
$condProximos = 'usuario_id = ? AND status = "agendado" AND (data > ? OR (data = ? AND hora_fim > ?))';
$st = $pdo->prepare("SELECT COUNT(*) FROM horarios WHERE $condProximos");
$st->execute([$usuario['id'], $hoje, $hoje, $agora]);
$resumo['proximos_agendamentos'] = (int) $st->fetchColumn();

$st = $pdo->prepare("SELECT id, titulo, data, TIME_FORMAT(hora_inicio, '%H:%i') AS hora_inicio,
                            TIME_FORMAT(hora_fim, '%H:%i') AS hora_fim, status
                     FROM horarios WHERE $condProximos
                     ORDER BY data, hora_inicio LIMIT 5");
$st->execute([$usuario['id'], $hoje, $hoje, $agora]);
$resumo['lista_proximos'] = $st->fetchAll();

if ($usuario['nivel_acesso'] === 'visitante') {
    $st = $pdo->prepare('SELECT status, COUNT(*) AS total FROM horarios WHERE usuario_id = ? GROUP BY status');
    $st->execute([$usuario['id']]);
    $porStatus = array_column($st->fetchAll(), 'total', 'status');
    $resumo['agendamentos_concluidos'] = (int) ($porStatus['concluido'] ?? 0);
    $resumo['agendamentos_total']      = (int) array_sum($porStatus);
    responder($resumo);
}

// ---- Visitas (admin e usuário) ----
$st = $pdo->prepare('SELECT COUNT(*) FROM visitas WHERE data_visita >= ?');
$st->execute([$hoje]);
$resumo['visitas_hoje'] = (int) $st->fetchColumn();

$resumo['visitas_ativas'] = (int) $pdo->query('SELECT COUNT(*) FROM visitas WHERE status = "ativo"')->fetchColumn();

// Visitas por dia nos últimos 7 dias (inclui dias sem visita, com zero)
$inicioSemana = date('Y-m-d', strtotime('-6 days'));
$st = $pdo->prepare('SELECT DATE(data_visita) AS dia, COUNT(*) AS total FROM visitas
                     WHERE data_visita >= ? GROUP BY DATE(data_visita)');
$st->execute([$inicioSemana]);
$porDia = array_column($st->fetchAll(), 'total', 'dia');
$semana = [];
for ($i = 6; $i >= 0; $i--) {
    $dia = date('Y-m-d', strtotime("-$i days"));
    $semana[] = ['data' => $dia, 'total' => (int) ($porDia[$dia] ?? 0)];
}
$resumo['semana'] = $semana;

$resumo['ultimas_visitas'] = $pdo->query('SELECT id, nome, email, data_visita, setor_visitado, status, tempo_duracao
                                          FROM visitas ORDER BY data_visita DESC, id DESC LIMIT 5')->fetchAll();

if ($usuario['nivel_acesso'] === 'admin') {
    $resumo['total_usuarios'] = (int) $pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn();
}

responder($resumo);
