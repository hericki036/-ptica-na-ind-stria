-- =====================================================================
-- database/database.sql
-- HydroSmart — "Sua água. Sua rotina. Seu cuidado."
--
-- Banco: hydrosmart_db
-- Compatível com: MySQL 8.0.16+ e MariaDB 10.4+ (CHECK constraints ativas)
-- Variante SQLite: database/database.sqlite.sql
--
-- Como importar:
--   mysql -u root -p < database/database.sql
--   (ou phpMyAdmin → Importar → escolher este arquivo → Executar)
--
-- O script pode ser executado várias vezes: ele remove e recria
-- view, trigger e tabelas antes de inserir os dados de demonstração.
-- =====================================================================

SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS hydrosmart_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE hydrosmart_db;

-- ---------------------------------------------------------------------
-- Limpeza (ordem: dependentes primeiro)
-- ---------------------------------------------------------------------
DROP VIEW    IF EXISTS vw_progresso_diario;
DROP TRIGGER IF EXISTS trg_leituras_conquistas;
DROP TABLE   IF EXISTS conquistas;
DROP TABLE   IF EXISTS metas;
DROP TABLE   IF EXISTS lembretes;
DROP TABLE   IF EXISTS leituras_consumo;
DROP TABLE   IF EXISTS garrafas;
DROP TABLE   IF EXISTS usuarios;

-- =====================================================================
-- 1. TABELAS
-- =====================================================================

-- ---------------------------------------------------------------------
-- usuarios: conta de quem usa o app
-- meta_diaria_ml guarda a meta ATUAL; o histórico de metas fica em `metas`.
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  nome            VARCHAR(100)  NOT NULL,
  email           VARCHAR(160)  NOT NULL,
  senha_hash      VARCHAR(255)  NOT NULL COMMENT 'bcrypt ($2a$/$2b$) no backend real',
  meta_diaria_ml  INT           NOT NULL DEFAULT 2000,
  peso_kg         DECIMAL(5,2)  NULL,
  criado_em       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_usuarios        PRIMARY KEY (id),
  CONSTRAINT uq_usuarios_email  UNIQUE (email),
  CONSTRAINT ck_usuarios_nome   CHECK (CHAR_LENGTH(TRIM(nome)) >= 2),
  CONSTRAINT ck_usuarios_meta   CHECK (meta_diaria_ml BETWEEN 1000 AND 5000),
  CONSTRAINT ck_usuarios_peso   CHECK (peso_kg IS NULL OR peso_kg BETWEEN 20 AND 300)
) ENGINE=InnoDB COMMENT='Usuários do app HydroSmart';

-- ---------------------------------------------------------------------
-- garrafas: cada HydroSmart pareada com um usuário
-- As colunas nivel_ml, bateria_pct, conectada e ultima_sincronizacao
-- guardam a última telemetria enviada pela garrafa via app (Bluetooth).
-- ---------------------------------------------------------------------
CREATE TABLE garrafas (
  id                    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  usuario_id            INT UNSIGNED  NOT NULL,
  modelo                VARCHAR(60)   NOT NULL DEFAULT 'HydroSmart 600',
  numero_serie          VARCHAR(30)   NOT NULL,
  capacidade_ml         INT           NOT NULL DEFAULT 600,
  status                ENUM('ativa','inativa','manutencao') NOT NULL DEFAULT 'ativa',
  nivel_ml              INT           NOT NULL DEFAULT 0,
  bateria_pct           TINYINT       NOT NULL DEFAULT 100,
  conectada             BOOLEAN       NOT NULL DEFAULT FALSE,
  ultima_sincronizacao  DATETIME      NULL,
  criado_em             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_garrafas            PRIMARY KEY (id),
  CONSTRAINT uq_garrafas_serie      UNIQUE (numero_serie),
  INDEX idx_garrafas_usuario (usuario_id),
  CONSTRAINT fk_garrafas_usuario    FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT ck_garrafas_capacidade CHECK (capacidade_ml > 0),
  CONSTRAINT ck_garrafas_nivel      CHECK (nivel_ml >= 0 AND nivel_ml <= capacidade_ml),
  CONSTRAINT ck_garrafas_bateria    CHECK (bateria_pct BETWEEN 0 AND 100)
) ENGINE=InnoDB COMMENT='Garrafas inteligentes pareadas';

-- ---------------------------------------------------------------------
-- leituras_consumo: cada consumo detectado pelo sensor da garrafa
-- ---------------------------------------------------------------------
CREATE TABLE leituras_consumo (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  garrafa_id  INT UNSIGNED    NOT NULL,
  volume_ml   INT             NOT NULL,
  lido_em     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_leituras          PRIMARY KEY (id),
  -- Índice principal das consultas de histórico (garrafa + período).
  -- Declarado aqui para a FK reaproveitá-lo (sem índice duplicado).
  INDEX idx_leituras_garrafa_data (garrafa_id, lido_em),
  -- Relatórios gerais por período (todas as garrafas)
  INDEX idx_leituras_data (lido_em),
  CONSTRAINT fk_leituras_garrafa  FOREIGN KEY (garrafa_id)
    REFERENCES garrafas (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT ck_leituras_volume   CHECK (volume_ml > 0 AND volume_ml <= 2000)
) ENGINE=InnoDB COMMENT='Leituras do sensor de consumo';

-- ---------------------------------------------------------------------
-- lembretes: horários em que o app/garrafa avisa para beber água
-- dias_semana: lista separada por vírgula, 0 = domingo ... 6 = sábado
--              (mesma convenção de Date.getDay() no JavaScript)
-- ---------------------------------------------------------------------
CREATE TABLE lembretes (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id   INT UNSIGNED NOT NULL,
  hora         TIME         NOT NULL,
  dias_semana  VARCHAR(13)  NOT NULL DEFAULT '0,1,2,3,4,5,6',
  rotulo       VARCHAR(60)  NULL,
  ativo        BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_lembretes          PRIMARY KEY (id),
  CONSTRAINT uq_lembretes_horario  UNIQUE (usuario_id, hora),
  CONSTRAINT fk_lembretes_usuario  FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT ck_lembretes_dias     CHECK (dias_semana REGEXP '^[0-6](,[0-6]){0,6}$')
) ENGINE=InnoDB COMMENT='Lembretes de hidratação';

-- ---------------------------------------------------------------------
-- metas: histórico de metas diárias (permite saber qual era a meta
-- em qualquer dia do passado). data_fim NULL = meta vigente.
-- ---------------------------------------------------------------------
CREATE TABLE metas (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id   INT UNSIGNED NOT NULL,
  meta_ml      INT          NOT NULL,
  data_inicio  DATE         NOT NULL,
  data_fim     DATE         NULL,
  status       ENUM('ativa','encerrada','cancelada') NOT NULL DEFAULT 'ativa',

  CONSTRAINT pk_metas          PRIMARY KEY (id),
  INDEX idx_metas_usuario_periodo (usuario_id, data_inicio, data_fim),
  CONSTRAINT fk_metas_usuario  FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT ck_metas_valor    CHECK (meta_ml BETWEEN 1000 AND 5000),
  CONSTRAINT ck_metas_periodo  CHECK (data_fim IS NULL OR data_fim >= data_inicio)
) ENGINE=InnoDB COMMENT='Histórico de metas diárias';

-- ---------------------------------------------------------------------
-- conquistas: badges obtidas pelo usuário
-- data_referencia: o dia a que a conquista se refere. Para 'meta_diaria'
-- existe uma por dia; as demais são únicas por usuário (garantido no trigger).
-- ---------------------------------------------------------------------
CREATE TABLE conquistas (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id       INT UNSIGNED NOT NULL,
  tipo             ENUM(
                     'boas_vindas',
                     'primeiro_gole',
                     'meta_diaria',
                     'sequencia_3_dias',
                     'sequencia_7_dias',
                     'dez_litros'
                   ) NOT NULL,
  descricao        VARCHAR(120) NULL,
  data_referencia  DATE         NOT NULL,
  obtida_em        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_conquistas          PRIMARY KEY (id),
  CONSTRAINT uq_conquistas_dia      UNIQUE (usuario_id, tipo, data_referencia),
  INDEX idx_conquistas_usuario_data (usuario_id, obtida_em),
  CONSTRAINT fk_conquistas_usuario  FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Conquistas (badges) por metas atingidas';

-- =====================================================================
-- 2. VIEW vw_progresso_diario
-- Soma de ml por usuário/dia + meta vigente naquele dia + percentual.
-- A meta do dia vem da tabela `metas` (período que cobre o dia);
-- se não houver, usa usuarios.meta_diaria_ml.
-- Observação: só aparecem dias com pelo menos uma leitura; dias sem
-- consumo são completados com zero pela API (ver README).
-- =====================================================================
CREATE VIEW vw_progresso_diario AS
SELECT
  p.usuario_id,
  p.nome,
  p.dia,
  p.total_ml,
  p.qtd_leituras,
  p.meta_ml,
  ROUND(p.total_ml * 100 / p.meta_ml, 1) AS percentual,
  (p.total_ml >= p.meta_ml)               AS meta_atingida
FROM (
  SELECT
    d.usuario_id,
    u.nome,
    d.dia,
    d.total_ml,
    d.qtd_leituras,
    COALESCE(
      (SELECT m.meta_ml
         FROM metas m
        WHERE m.usuario_id = d.usuario_id
          AND m.status <> 'cancelada'
          AND m.data_inicio <= d.dia
          AND (m.data_fim IS NULL OR m.data_fim >= d.dia)
        ORDER BY m.data_inicio DESC
        LIMIT 1),
      u.meta_diaria_ml
    ) AS meta_ml
  FROM (
    SELECT
      g.usuario_id,
      DATE(l.lido_em)  AS dia,
      SUM(l.volume_ml) AS total_ml,
      COUNT(*)         AS qtd_leituras
    FROM leituras_consumo l
    JOIN garrafas g ON g.id = l.garrafa_id
    GROUP BY g.usuario_id, DATE(l.lido_em)
  ) d
  JOIN usuarios u ON u.id = d.usuario_id
) p;

-- =====================================================================
-- 3. TRIGGER trg_leituras_conquistas
-- Após cada leitura do sensor:
--   a) 'primeiro_gole'    → primeira leitura do usuário
--   b) 'meta_diaria'      → total do dia atingiu a meta vigente (1x por dia)
--   c) 'sequencia_3_dias' → meta batida 3 dias seguidos (1x por usuário)
--   d) 'sequencia_7_dias' → meta batida 7 dias seguidos (1x por usuário)
--   e) 'dez_litros'       → 10 litros acumulados (1x por usuário)
-- obtida_em recebe o horário da leitura que gerou a conquista.
-- =====================================================================
DELIMITER $$

CREATE TRIGGER trg_leituras_conquistas
AFTER INSERT ON leituras_consumo
FOR EACH ROW
BEGIN
  DECLARE v_usuario     INT UNSIGNED;
  DECLARE v_dia         DATE;
  DECLARE v_total_dia   INT DEFAULT 0;
  DECLARE v_meta        INT DEFAULT 2000;
  DECLARE v_total_geral BIGINT DEFAULT 0;

  SET v_dia = DATE(NEW.lido_em);

  -- Dono da garrafa que enviou a leitura
  SELECT usuario_id INTO v_usuario
    FROM garrafas
   WHERE id = NEW.garrafa_id;

  -- Total consumido pelo usuário no dia da leitura (todas as garrafas dele)
  SELECT COALESCE(SUM(l.volume_ml), 0) INTO v_total_dia
    FROM leituras_consumo l
    JOIN garrafas g ON g.id = l.garrafa_id
   WHERE g.usuario_id = v_usuario
     AND l.lido_em >= v_dia
     AND l.lido_em <  v_dia + INTERVAL 1 DAY;

  -- Meta vigente no dia (histórico em `metas`, senão a meta do cadastro)
  SELECT COALESCE(
           (SELECT m.meta_ml
              FROM metas m
             WHERE m.usuario_id = v_usuario
               AND m.status <> 'cancelada'
               AND m.data_inicio <= v_dia
               AND (m.data_fim IS NULL OR m.data_fim >= v_dia)
             ORDER BY m.data_inicio DESC
             LIMIT 1),
           (SELECT u.meta_diaria_ml FROM usuarios u WHERE u.id = v_usuario)
         ) INTO v_meta;

  -- a) Primeiro gole
  INSERT INTO conquistas (usuario_id, tipo, descricao, data_referencia, obtida_em)
  SELECT v_usuario, 'primeiro_gole', 'Primeira leitura registrada pelo sensor', v_dia, NEW.lido_em
    FROM DUAL
   WHERE NOT EXISTS (SELECT 1 FROM conquistas
                      WHERE usuario_id = v_usuario AND tipo = 'primeiro_gole');

  -- b) Meta diária atingida (uma por dia)
  IF v_total_dia >= v_meta THEN
    INSERT INTO conquistas (usuario_id, tipo, descricao, data_referencia, obtida_em)
    SELECT v_usuario, 'meta_diaria',
           CONCAT('Meta de ', v_meta, ' ml atingida'), v_dia, NEW.lido_em
      FROM DUAL
     WHERE NOT EXISTS (SELECT 1 FROM conquistas
                        WHERE usuario_id = v_usuario
                          AND tipo = 'meta_diaria'
                          AND data_referencia = v_dia);
  END IF;

  -- c) Sequência de 3 dias com a meta batida
  IF (SELECT COUNT(*) FROM conquistas
       WHERE usuario_id = v_usuario
         AND tipo = 'meta_diaria'
         AND data_referencia BETWEEN v_dia - INTERVAL 2 DAY AND v_dia) = 3 THEN
    INSERT INTO conquistas (usuario_id, tipo, descricao, data_referencia, obtida_em)
    SELECT v_usuario, 'sequencia_3_dias', 'Meta batida 3 dias seguidos', v_dia, NEW.lido_em
      FROM DUAL
     WHERE NOT EXISTS (SELECT 1 FROM conquistas
                        WHERE usuario_id = v_usuario AND tipo = 'sequencia_3_dias');
  END IF;

  -- d) Sequência de 7 dias com a meta batida
  IF (SELECT COUNT(*) FROM conquistas
       WHERE usuario_id = v_usuario
         AND tipo = 'meta_diaria'
         AND data_referencia BETWEEN v_dia - INTERVAL 6 DAY AND v_dia) = 7 THEN
    INSERT INTO conquistas (usuario_id, tipo, descricao, data_referencia, obtida_em)
    SELECT v_usuario, 'sequencia_7_dias', 'Meta batida 7 dias seguidos', v_dia, NEW.lido_em
      FROM DUAL
     WHERE NOT EXISTS (SELECT 1 FROM conquistas
                        WHERE usuario_id = v_usuario AND tipo = 'sequencia_7_dias');
  END IF;

  -- e) 10 litros acumulados
  SELECT COALESCE(SUM(l.volume_ml), 0) INTO v_total_geral
    FROM leituras_consumo l
    JOIN garrafas g ON g.id = l.garrafa_id
   WHERE g.usuario_id = v_usuario;

  IF v_total_geral >= 10000 THEN
    INSERT INTO conquistas (usuario_id, tipo, descricao, data_referencia, obtida_em)
    SELECT v_usuario, 'dez_litros', '10 litros de água registrados', v_dia, NEW.lido_em
      FROM DUAL
     WHERE NOT EXISTS (SELECT 1 FROM conquistas
                        WHERE usuario_id = v_usuario AND tipo = 'dez_litros');
  END IF;
END$$

DELIMITER ;

-- =====================================================================
-- 4. SEEDS (dados de demonstração)
-- As datas são relativas a CURDATE(), então o histórico sempre cobre
-- os últimos 7 dias, não importa quando o script for executado.
-- Senha dos 3 usuários: hydro123 (hash bcrypt, custo 10).
-- =====================================================================

-- Usuários (personas: estudante, trabalhador e atleta)
INSERT INTO usuarios (id, nome, email, senha_hash, meta_diaria_ml, peso_kg, criado_em) VALUES
  (1, 'Ana Souza',    'ana@hydrosmart.com.br',
      '$2a$10$pRq2A2Z0JY3/I12AyH9Q7Ont1sy4CFImR1nyXb4PdiATqy/3SXlx.', 2000, 55.00,
      TIMESTAMP(CURDATE() - INTERVAL 60 DAY, '19:20:00')),
  (2, 'Bruno Lima',   'bruno@hydrosmart.com.br',
      '$2a$10$zby0ZGV5R4Fa28ZmSnDGE.CMNoZnYLuR30jtrJJCWDUj6vkHzM8/a', 2500, 80.00,
      TIMESTAMP(CURDATE() - INTERVAL 30 DAY, '08:45:00')),
  (3, 'Carla Mendes', 'carla@hydrosmart.com.br',
      '$2a$10$LPoXcObN3K5rdMdLhC1R0OgJoqzMWMSrj0y2ZuWoYMgDibEMhY.fG', 3500, 65.00,
      TIMESTAMP(CURDATE() - INTERVAL 30 DAY, '06:10:00'));

-- Garrafas (uma por usuário) com a última telemetria recebida
INSERT INTO garrafas (id, usuario_id, modelo, numero_serie, capacidade_ml, status,
                      nivel_ml, bateria_pct, conectada, ultima_sincronizacao, criado_em) VALUES
  (1, 1, 'HydroSmart 600', 'HS600-2026-000101', 600, 'ativa', 350, 78, TRUE,
      TIMESTAMP(CURDATE(), '10:30:00'), TIMESTAMP(CURDATE() - INTERVAL 60 DAY, '19:25:00')),
  (2, 2, 'HydroSmart 600', 'HS600-2026-000102', 600, 'ativa', 100, 41, FALSE,
      TIMESTAMP(CURDATE(), '09:00:00'), TIMESTAMP(CURDATE() - INTERVAL 30 DAY, '08:50:00')),
  (3, 3, 'HydroSmart 600', 'HS600-2026-000103', 600, 'ativa', 0, 92, TRUE,
      TIMESTAMP(CURDATE(), '06:40:00'), TIMESTAMP(CURDATE() - INTERVAL 30 DAY, '06:15:00'));

-- Metas (inseridas ANTES das leituras para o trigger encontrar a meta do dia)
INSERT INTO metas (usuario_id, meta_ml, data_inicio, data_fim, status) VALUES
  (1, 1500, CURDATE() - INTERVAL 60 DAY, CURDATE() - INTERVAL 31 DAY, 'encerrada'),
  (1, 2000, CURDATE() - INTERVAL 30 DAY, NULL, 'ativa'),
  (2, 2500, CURDATE() - INTERVAL 30 DAY, NULL, 'ativa'),
  (3, 3500, CURDATE() - INTERVAL 30 DAY, NULL, 'ativa');

-- Lembretes (dias_semana: 0 = domingo ... 6 = sábado)
INSERT INTO lembretes (usuario_id, hora, dias_semana, rotulo, ativo) VALUES
  (1, '07:30:00', '1,2,3,4,5',     'Ao acordar',               TRUE),
  (1, '10:00:00', '1,2,3,4,5',     'Intervalo da aula',        TRUE),
  (1, '12:30:00', '0,1,2,3,4,5,6', 'Depois do almoço',         TRUE),
  (1, '15:30:00', '1,2,3,4,5',     'Pausa nos estudos',        TRUE),
  (1, '19:00:00', '0,1,2,3,4,5,6', 'Antes do jantar',          TRUE),
  (1, '22:00:00', '0,6',           'Fim de semana à noite',    FALSE),
  (2, '09:00:00', '1,2,3,4,5',     'Chegada no trabalho',      TRUE),
  (2, '14:00:00', '1,2,3,4,5',     'Depois da reunião',        TRUE),
  (3, '06:00:00', '0,1,2,3,4,5,6', 'Antes do treino',          TRUE),
  (3, '17:00:00', '1,3,5',         'Treino da tarde',          TRUE);

-- Conquistas de exemplo inseridas manualmente (boas-vindas no cadastro).
-- As demais (primeiro gole, meta diária, sequência, 10 litros) são
-- geradas AUTOMATICAMENTE pelo trigger durante a carga das leituras.
INSERT INTO conquistas (usuario_id, tipo, descricao, data_referencia, obtida_em) VALUES
  (1, 'boas_vindas', 'Conta criada no app HydroSmart',
      CURDATE() - INTERVAL 60 DAY, TIMESTAMP(CURDATE() - INTERVAL 60 DAY, '19:20:00')),
  (2, 'boas_vindas', 'Conta criada no app HydroSmart',
      CURDATE() - INTERVAL 30 DAY, TIMESTAMP(CURDATE() - INTERVAL 30 DAY, '08:45:00')),
  (3, 'boas_vindas', 'Conta criada no app HydroSmart',
      CURDATE() - INTERVAL 30 DAY, TIMESTAMP(CURDATE() - INTERVAL 30 DAY, '06:10:00'));

-- Leituras do sensor — 37 registros nos últimos 7 dias (em ordem cronológica)
-- Ana (garrafa 1, meta 2.000 ml): bate a meta em D-6, D-4, D-3 e D-2
INSERT INTO leituras_consumo (garrafa_id, volume_ml, lido_em) VALUES
  (1, 500, TIMESTAMP(CURDATE() - INTERVAL 6 DAY, '07:40:00')),
  (1, 450, TIMESTAMP(CURDATE() - INTERVAL 6 DAY, '10:15:00')),
  (1, 600, TIMESTAMP(CURDATE() - INTERVAL 6 DAY, '13:30:00')),
  (1, 500, TIMESTAMP(CURDATE() - INTERVAL 6 DAY, '17:20:00')),
  (1, 400, TIMESTAMP(CURDATE() - INTERVAL 5 DAY, '08:05:00')),
  (1, 350, TIMESTAMP(CURDATE() - INTERVAL 5 DAY, '12:40:00')),
  (1, 500, TIMESTAMP(CURDATE() - INTERVAL 5 DAY, '19:10:00')),
  (1, 600, TIMESTAMP(CURDATE() - INTERVAL 4 DAY, '07:55:00')),
  (1, 500, TIMESTAMP(CURDATE() - INTERVAL 4 DAY, '11:20:00')),
  (1, 450, TIMESTAMP(CURDATE() - INTERVAL 4 DAY, '15:05:00')),
  (1, 500, TIMESTAMP(CURDATE() - INTERVAL 4 DAY, '20:30:00')),
  (1, 550, TIMESTAMP(CURDATE() - INTERVAL 3 DAY, '08:20:00')),
  (1, 600, TIMESTAMP(CURDATE() - INTERVAL 3 DAY, '12:10:00')),
  (1, 500, TIMESTAMP(CURDATE() - INTERVAL 3 DAY, '16:45:00')),
  (1, 400, TIMESTAMP(CURDATE() - INTERVAL 3 DAY, '21:00:00')),
  (1, 500, TIMESTAMP(CURDATE() - INTERVAL 2 DAY, '07:30:00')),
  (1, 600, TIMESTAMP(CURDATE() - INTERVAL 2 DAY, '10:50:00')),
  (1, 450, TIMESTAMP(CURDATE() - INTERVAL 2 DAY, '14:15:00')),
  (1, 500, TIMESTAMP(CURDATE() - INTERVAL 2 DAY, '18:40:00')),
  (1, 300, TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '09:10:00')),
  (1, 400, TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '13:00:00')),
  (1, 350, TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '16:30:00')),
  (1, 450, TIMESTAMP(CURDATE(), '08:10:00')),
  (1, 300, TIMESTAMP(CURDATE(), '10:30:00'));

-- Bruno (garrafa 2, meta 2.500 ml): bate a meta ontem
INSERT INTO leituras_consumo (garrafa_id, volume_ml, lido_em) VALUES
  (2, 600, TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '08:30:00')),
  (2, 600, TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '11:00:00')),
  (2, 500, TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '14:20:00')),
  (2, 500, TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '17:45:00')),
  (2, 300, TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '20:15:00')),
  (2, 500, TIMESTAMP(CURDATE(), '09:00:00'));

-- Carla (garrafa 3, meta 3.500 ml): bate a meta ontem
INSERT INTO leituras_consumo (garrafa_id, volume_ml, lido_em) VALUES
  (3, 600, TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '06:15:00')),
  (3, 600, TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '08:00:00')),
  (3, 500, TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '10:30:00')),
  (3, 600, TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '13:15:00')),
  (3, 600, TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '17:30:00')),
  (3, 600, TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '19:45:00')),
  (3, 600, TIMESTAMP(CURDATE(), '06:40:00'));

-- =====================================================================
-- 5. CONSULTAS ÚTEIS (exemplos para o backend — descomente para testar)
-- =====================================================================

-- Histórico dos últimos 7 dias de um usuário, com dias sem consumo = 0:
-- WITH RECURSIVE calendario AS (
--   SELECT CURDATE() - INTERVAL 6 DAY AS dia
--   UNION ALL
--   SELECT dia + INTERVAL 1 DAY FROM calendario WHERE dia < CURDATE()
-- )
-- SELECT c.dia,
--        COALESCE(v.total_ml, 0)     AS total_ml,
--        COALESCE(v.qtd_leituras, 0) AS qtd_leituras,
--        v.meta_ml, v.percentual, v.meta_atingida
--   FROM calendario c
--   LEFT JOIN vw_progresso_diario v
--          ON v.dia = c.dia AND v.usuario_id = 1
--  ORDER BY c.dia;

-- Progresso de hoje:
-- SELECT * FROM vw_progresso_diario WHERE usuario_id = 1 AND dia = CURDATE();

-- Lembretes ativos para hoje (DAYOFWEEK: 1 = domingo → subtrai 1):
-- SELECT * FROM lembretes
--  WHERE usuario_id = 1 AND ativo = TRUE
--    AND FIND_IN_SET(DAYOFWEEK(CURDATE()) - 1, dias_semana) > 0
--  ORDER BY hora;

-- Conquistas de um usuário:
-- SELECT tipo, descricao, data_referencia, obtida_em
--   FROM conquistas WHERE usuario_id = 1 ORDER BY obtida_em;
