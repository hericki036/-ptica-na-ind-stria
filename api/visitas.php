<?php
/**
 * Visitas: listar (com filtros), registrar, finalizar e excluir.
 * Acesso: administradores e usuários (visitantes não veem dados de terceiros).
 */

require_once __DIR__ . '/helpers.php';

const SELECT_VISITAS = 'SELECT v.id, v.nome, v.email, v.data_visita, v.data_saida, v.motivo, v.setor_visitado,
                               v.tempo_duracao, v.status, u.nome_completo AS registrado_por_nome
                        FROM visitas v LEFT JOIN usuarios u ON u.id = v.registrado_por';

function formatar_visita(array $v): array
{
    $v['id'] = (int) $v['id'];
    $v['tempo_duracao'] = $v['tempo_duracao'] === null ? null : (int) $v['tempo_duracao'];
    return $v;
}

function buscar_visita(int $id): ?array
{
    $st = db()->prepare(SELECT_VISITAS . ' WHERE v.id = ?');
    $st->execute([$id]);
    $v = $st->fetch();
    return $v ? formatar_visita($v) : null;
}

switch (acao()) {

    /* GET listar — filtros opcionais: data, setor, status, busca */
    case 'listar':
        exigir_metodo('GET');
        exigir_equipe();

        $where  = [];
        $params = [];

        $data = (string) ($_GET['data'] ?? '');
        if ($data !== '' && validar_data($data)) {
            $where[]  = 'v.data_visita >= ? AND v.data_visita < (? + INTERVAL 1 DAY)';
            $params[] = $data;
            $params[] = $data;
        }
        $setor = (string) ($_GET['setor'] ?? '');
        if ($setor !== '' && in_array($setor, SETORES, true)) {
            $where[]  = 'v.setor_visitado = ?';
            $params[] = $setor;
        }
        $status = (string) ($_GET['status'] ?? '');
        if (in_array($status, ['ativo', 'finalizado'], true)) {
            $where[]  = 'v.status = ?';
            $params[] = $status;
        }
        $busca = mb_substr(limpar_texto($_GET['busca'] ?? ''), 0, 80);
        if ($busca !== '') {
            $like     = '%' . addcslashes($busca, '%_\\') . '%';
            $where[]  = '(v.nome LIKE ? OR v.email LIKE ?)';
            $params[] = $like;
            $params[] = $like;
        }

        $sql = SELECT_VISITAS . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
             . ' ORDER BY v.data_visita DESC, v.id DESC LIMIT 2000';
        $st = db()->prepare($sql);
        $st->execute($params);
        responder(array_map('formatar_visita', $st->fetchAll()));

    /* GET ativas — visitantes que ainda estão no local */
    case 'ativas':
        exigir_metodo('GET');
        exigir_equipe();
        $st = db()->query(SELECT_VISITAS . ' WHERE v.status = "ativo" ORDER BY v.data_visita DESC');
        responder(array_map('formatar_visita', $st->fetchAll()));

    /* POST criar — registra a entrada do visitante */
    case 'criar':
        exigir_metodo('POST');
        $usuario = exigir_equipe();
        $in     = entrada();
        $nome   = limpar_texto($in['nome'] ?? '');
        $email  = mb_strtolower(limpar_texto($in['email'] ?? ''));
        $setor  = limpar_texto($in['setor_visitado'] ?? '');
        $motivo = limpar_texto($in['motivo'] ?? '');

        $campos = [];
        if ($e = validar_nome($nome, 'Nome do visitante')) $campos['nome'] = $e;
        if ($e = validar_email($email)) $campos['email'] = $e;
        if (!in_array($setor, SETORES, true)) $campos['setor_visitado'] = 'Selecione o setor visitado.';
        if (mb_strlen($motivo) < 3) $campos['motivo'] = 'Descreva o motivo (mín. 3 caracteres).';
        elseif (mb_strlen($motivo) > 1000) $campos['motivo'] = 'O motivo deve ter no máximo 1000 caracteres.';

        if (!isset($campos['email'])) {
            $st = db()->prepare('SELECT id FROM visitas WHERE email = ? AND status = "ativo" LIMIT 1');
            $st->execute([$email]);
            if ($st->fetchColumn()) {
                $campos['email'] = 'Este visitante já tem uma visita ativa. Finalize-a antes de registrar outra.';
            }
        }
        if ($campos) erro('Corrija os campos destacados.', 422, $campos);

        db()->prepare('INSERT INTO visitas (nome, email, data_visita, motivo, setor_visitado, status, registrado_por)
                       VALUES (?, ?, NOW(), ?, ?, "ativo", ?)')
            ->execute([$nome, $email, $motivo, $setor, $usuario['id']]);

        responder(buscar_visita((int) db()->lastInsertId()), 201);

    /* POST finalizar — registra a saída e calcula a duração em minutos */
    case 'finalizar':
        exigir_metodo('POST');
        exigir_equipe();
        $id = (int) (entrada()['id'] ?? 0);

        $st = db()->prepare('UPDATE visitas
                             SET status = "finalizado", data_saida = NOW(),
                                 tempo_duracao = GREATEST(TIMESTAMPDIFF(MINUTE, data_visita, NOW()), 0)
                             WHERE id = ? AND status = "ativo"');
        $st->execute([$id]);
        if ($st->rowCount() === 0) {
            erro(buscar_visita($id) ? 'Esta visita já foi finalizada.' : 'Visita não encontrada.', 404);
        }
        responder(buscar_visita($id));

    /* POST excluir — somente administradores */
    case 'excluir':
        exigir_metodo('POST');
        exigir_admin();
        $id = (int) (entrada()['id'] ?? 0);
        $st = db()->prepare('DELETE FROM visitas WHERE id = ?');
        $st->execute([$id]);
        if ($st->rowCount() === 0) erro('Visita não encontrada.', 404);
        responder(['id' => $id]);

    default:
        erro('Ação inválida.', 404);
}
