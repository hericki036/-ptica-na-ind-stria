<?php
/**
 * Log de sessões (login/logout) — somente administradores.
 */

require_once __DIR__ . '/helpers.php';

switch (acao()) {

    case 'listar':
        exigir_metodo('GET');
        exigir_admin();
        fechar_sessoes_abandonadas();

        $sql    = 'SELECT s.id, s.usuario_id, s.data_entrada, s.data_saida, s.ip_aproximado, s.dispositivo, s.status,
                          u.nome_completo AS usuario_nome, u.email AS usuario_email
                   FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id';
        $params = [];
        $status = (string) ($_GET['status'] ?? '');
        if (in_array($status, ['ativa', 'finalizada'], true)) {
            $sql     .= ' WHERE s.status = ?';
            $params[] = $status;
        }
        $sql .= ' ORDER BY s.data_entrada DESC LIMIT 1000';

        $st = db()->prepare($sql);
        $st->execute($params);
        responder(array_map(function ($s) {
            $s['id'] = (int) $s['id'];
            $s['usuario_id'] = (int) $s['usuario_id'];
            return $s;
        }, $st->fetchAll()));

    default:
        erro('Ação inválida.', 404);
}
