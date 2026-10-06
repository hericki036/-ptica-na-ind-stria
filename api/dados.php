<?php
/**
 * Administração dos dados: exportação (CSV é montado no navegador),
 * backup completo em JSON, limpeza de dados antigos e dados de exemplo.
 * Somente administradores.
 */

require_once __DIR__ . '/helpers.php';

/** Consultas de exportação de cada tabela (sem senhas nem fotos). */
const EXPORTACOES = [
    'visitas' => 'SELECT v.id, v.nome, v.email, v.data_visita, v.data_saida, v.setor_visitado, v.motivo,
                         v.tempo_duracao, v.status, u.nome_completo AS registrado_por
                  FROM visitas v LEFT JOIN usuarios u ON u.id = v.registrado_por ORDER BY v.data_visita DESC',
    'usuarios' => 'SELECT id, nome_completo, email, nivel_acesso, data_cadastro, ultima_sessao
                   FROM usuarios ORDER BY id',
    'horarios' => 'SELECT h.id, u.nome_completo AS usuario, u.email AS usuario_email, h.data,
                          TIME_FORMAT(h.hora_inicio, "%H:%i") AS hora_inicio, TIME_FORMAT(h.hora_fim, "%H:%i") AS hora_fim,
                          h.titulo, h.descricao, h.status, h.criado_em
                   FROM horarios h JOIN usuarios u ON u.id = h.usuario_id ORDER BY h.data DESC, h.hora_inicio DESC',
    'sessoes' => 'SELECT s.id, u.nome_completo AS usuario, u.email AS usuario_email, s.data_entrada, s.data_saida,
                         s.ip_aproximado, s.dispositivo, s.status
                  FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id ORDER BY s.data_entrada DESC',
];

/** Condições que definem um registro "antigo" (finalizado há mais de N dias). */
function condicoes_limpeza(): array
{
    $dias = (int) DIAS_DADOS_ANTIGOS;
    return [
        'visitas'  => "status = 'finalizado' AND data_visita < (NOW() - INTERVAL $dias DAY)",
        'sessoes'  => "status = 'finalizada' AND data_entrada < (NOW() - INTERVAL $dias DAY)",
        'horarios' => "status IN ('concluido', 'cancelado') AND data < (CURDATE() - INTERVAL $dias DAY)",
        'recuperacoes_senha' => "(usado = 1 OR expira_em < NOW()) AND criado_em < (NOW() - INTERVAL 1 DAY)",
    ];
}

exigir_admin();

switch (acao()) {

    case 'exportar':
        exigir_metodo('GET');
        $tabela = (string) ($_GET['tabela'] ?? '');
        if (!isset(EXPORTACOES[$tabela])) erro('Tabela inválida.', 422);
        responder(db()->query(EXPORTACOES[$tabela])->fetchAll());

    case 'backup':
        exigir_metodo('GET');
        $backup = ['gerado_em' => date('Y-m-d H:i:s'), 'sistema' => 'Portaria — Gestão de Visitas'];
        foreach (EXPORTACOES as $tabela => $sql) {
            $backup[$tabela] = db()->query($sql)->fetchAll();
        }
        responder($backup);

    case 'previa_limpeza':
        exigir_metodo('GET');
        $contagem = [];
        foreach (condicoes_limpeza() as $tabela => $cond) {
            $contagem[$tabela] = (int) db()->query("SELECT COUNT(*) FROM $tabela WHERE $cond")->fetchColumn();
        }
        responder(['dias' => DIAS_DADOS_ANTIGOS, 'contagem' => $contagem]);

    case 'limpar':
        exigir_metodo('POST');
        $removidos = [];
        db()->beginTransaction();
        foreach (condicoes_limpeza() as $tabela => $cond) {
            $removidos[$tabela] = db()->exec("DELETE FROM $tabela WHERE $cond");
        }
        db()->commit();
        responder(['removidos' => $removidos]);

    /* Gera visitas e agendamentos de exemplo (útil para apresentações) */
    case 'exemplo':
        exigir_metodo('POST');
        $admin = exigir_admin();
        $nomes = ['Ana Souza', 'Bruno Lima', 'Carla Mendes', 'Diego Rocha', 'Elisa Martins', 'Felipe Araújo',
                  'Gabriela Nunes', 'Henrique Costa', 'Isabela Ramos', 'João Pereira', 'Larissa Prado', 'Marcos Vieira'];
        $motivos = ['Reunião comercial', 'Entrevista de emprego', 'Entrega de documentos', 'Manutenção de equipamento',
                    'Visita técnica', 'Apresentação de proposta', 'Auditoria', 'Treinamento'];

        $ins = db()->prepare('INSERT INTO visitas (nome, email, data_visita, data_saida, motivo, setor_visitado, tempo_duracao, status, registrado_por)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $semAcento = ['á' => 'a', 'ã' => 'a', 'â' => 'a', 'é' => 'e', 'ê' => 'e', 'í' => 'i', 'ó' => 'o', 'ô' => 'o', 'ú' => 'u', 'ç' => 'c'];
        $criadas = 0;
        for ($dia = 6; $dia >= 0; $dia--) {
            shuffle($nomes);
            $qtd = random_int(2, 7);
            for ($i = 0; $i < $qtd; $i++) {
                $nome    = $nomes[$i];
                $email   = strtr(mb_strtolower(str_replace(' ', '.', $nome)), $semAcento) . '@exemplo.com';
                $entrada = strtotime(date('Y-m-d', strtotime("-$dia days")) . ' ' . sprintf('%02d:%02d', random_int(8, 16), random_int(0, 59)));
                if ($entrada > time()) {
                    $entrada = time() - random_int(5, 90) * 60;
                }
                $ativa   = $dia === 0 && $i < 2;   // duas visitas ainda em andamento hoje
                $duracao = random_int(15, 150);
                $saida    = $entrada + $duracao * 60;
                if (!$ativa && $saida > time()) {
                    $saida   = time();
                    $duracao = max(0, intdiv($saida - $entrada, 60));
                }
                $ins->execute([
                    $nome, $email, date('Y-m-d H:i:s', $entrada),
                    $ativa ? null : date('Y-m-d H:i:s', $saida),
                    $motivos[array_rand($motivos)], SETORES[array_rand(SETORES)],
                    $ativa ? null : $duracao, $ativa ? 'ativo' : 'finalizado', $admin['id'],
                ]);
                $criadas++;
            }
        }

        $titulos = ['Reunião com fornecedor', 'Visita de cliente', 'Entrevista — vaga de TI', 'Auditoria interna'];
        $insH = db()->prepare('INSERT INTO horarios (usuario_id, data, hora_inicio, hora_fim, titulo, descricao, status, criado_em)
                               VALUES (?, ?, ?, ?, ?, ?, "agendado", NOW())');
        foreach ($titulos as $i => $titulo) {
            $inicio = 9 + $i * 2;
            $insH->execute([$admin['id'], date('Y-m-d', strtotime('+' . ($i + 1) . ' days')),
                            sprintf('%02d:00', $inicio), sprintf('%02d:00', $inicio + 1), $titulo, 'Agendamento de exemplo.']);
        }

        responder(['visitas' => $criadas, 'agendamentos' => count($titulos)], 201);

    default:
        erro('Ação inválida.', 404);
}
