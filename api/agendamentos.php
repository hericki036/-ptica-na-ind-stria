<?php
/**
 * Agendamentos (tabela "horarios"): listar, criar, cancelar, concluir e excluir.
 * Cada usuário gerencia os próprios; o administrador vê e gerencia todos.
 */

require_once __DIR__ . '/helpers.php';

const SELECT_HORARIOS = 'SELECT h.id, h.usuario_id, h.data,
                                TIME_FORMAT(h.hora_inicio, "%H:%i") AS hora_inicio,
                                TIME_FORMAT(h.hora_fim, "%H:%i") AS hora_fim,
                                h.titulo, h.descricao, h.status, h.criado_em,
                                u.nome_completo AS usuario_nome, u.email AS usuario_email
                         FROM horarios h JOIN usuarios u ON u.id = h.usuario_id';

function formatar_horario(array $h): array
{
    $h['id'] = (int) $h['id'];
    $h['usuario_id'] = (int) $h['usuario_id'];
    $h['descricao'] = $h['descricao'] ?? '';
    return $h;
}

/** Busca o agendamento e confere se o usuário pode alterá-lo. */
function horario_permitido(int $id, array $usuario): array
{
    $st = db()->prepare(SELECT_HORARIOS . ' WHERE h.id = ?');
    $st->execute([$id]);
    $h = $st->fetch();
    if (!$h || ($h['usuario_id'] != $usuario['id'] && $usuario['nivel_acesso'] !== 'admin')) {
        erro('Agendamento não encontrado.', 404);
    }
    return formatar_horario($h);
}

/** Troca o status de um agendamento que ainda está "agendado". */
function mudar_status(string $novo, array $usuario): void
{
    $h = horario_permitido((int) (entrada()['id'] ?? 0), $usuario);
    if ($h['status'] !== 'agendado') {
        erro('Somente agendamentos ativos podem ser alterados.', 409);
    }
    db()->prepare('UPDATE horarios SET status = ? WHERE id = ?')->execute([$novo, $h['id']]);
    $h['status'] = $novo;
    responder($h);
}

switch (acao()) {

    /* GET listar — os do usuário logado, ou todos (?escopo=todos, admin) */
    case 'listar':
        exigir_metodo('GET');
        $usuario = exigir_login();

        $params = [];
        $sql    = SELECT_HORARIOS;
        if (($_GET['escopo'] ?? '') === 'todos') {
            if ($usuario['nivel_acesso'] !== 'admin') erro('Acesso restrito a administradores.', 403);
        } else {
            $sql     .= ' WHERE h.usuario_id = ?';
            $params[] = $usuario['id'];
        }
        $sql .= ' ORDER BY h.data DESC, h.hora_inicio DESC LIMIT 2000';

        $st = db()->prepare($sql);
        $st->execute($params);
        responder(array_map('formatar_horario', $st->fetchAll()));

    /* POST criar */
    case 'criar':
        exigir_metodo('POST');
        $usuario   = exigir_login();
        $in        = entrada();
        $titulo    = limpar_texto($in['titulo'] ?? '');
        $data      = limpar_texto($in['data'] ?? '');
        $inicio    = limpar_texto($in['hora_inicio'] ?? '');
        $fim       = limpar_texto($in['hora_fim'] ?? '');
        $descricao = limpar_texto($in['descricao'] ?? '');

        $campos = [];
        if (mb_strlen($titulo) < 3) $campos['titulo'] = 'O título deve ter ao menos 3 caracteres.';
        elseif (mb_strlen($titulo) > 120) $campos['titulo'] = 'O título deve ter no máximo 120 caracteres.';
        if (!validar_data($data)) $campos['data'] = 'Informe uma data válida.';
        if (!validar_hora($inicio)) $campos['hora_inicio'] = 'Informe a hora de início.';
        if (!validar_hora($fim)) $campos['hora_fim'] = 'Informe a hora de fim.';
        if (mb_strlen($descricao) > 1000) $campos['descricao'] = 'A descrição deve ter no máximo 1000 caracteres.';

        if (!$campos) {
            if ($fim <= $inicio) {
                $campos['hora_fim'] = 'A hora de fim deve ser posterior à hora de início.';
            } elseif ("$data $inicio" < date('Y-m-d H:i')) {
                $campos[$data < date('Y-m-d') ? 'data' : 'hora_inicio'] = 'Escolha uma data e hora no futuro.';
            } else {
                // Não permite dois agendamentos ativos com horários sobrepostos
                $st = db()->prepare('SELECT titulo, TIME_FORMAT(hora_inicio, "%H:%i") AS ini, TIME_FORMAT(hora_fim, "%H:%i") AS fim
                                     FROM horarios
                                     WHERE usuario_id = ? AND data = ? AND status = "agendado"
                                       AND hora_inicio < ? AND hora_fim > ?
                                     LIMIT 1');
                $st->execute([$usuario['id'], $data, $fim, $inicio]);
                if ($conflito = $st->fetch()) {
                    $campos['hora_inicio'] = "Conflito com \"{$conflito['titulo']}\" ({$conflito['ini']}–{$conflito['fim']}). Escolha outro horário.";
                }
            }
        }
        if ($campos) erro('Corrija os campos destacados.', 422, $campos);

        db()->prepare('INSERT INTO horarios (usuario_id, data, hora_inicio, hora_fim, titulo, descricao, status, criado_em)
                       VALUES (?, ?, ?, ?, ?, ?, "agendado", NOW())')
            ->execute([$usuario['id'], $data, $inicio, $fim, $titulo, $descricao]);

        responder(horario_permitido((int) db()->lastInsertId(), $usuario), 201);

    /* POST cancelar / concluir */
    case 'cancelar':
        exigir_metodo('POST');
        mudar_status('cancelado', exigir_login());

    case 'concluir':
        exigir_metodo('POST');
        mudar_status('concluido', exigir_login());

    /* POST excluir */
    case 'excluir':
        exigir_metodo('POST');
        $h = horario_permitido((int) (entrada()['id'] ?? 0), exigir_login());
        db()->prepare('DELETE FROM horarios WHERE id = ?')->execute([$h['id']]);
        responder(['id' => $h['id']]);

    default:
        erro('Ação inválida.', 404);
}
