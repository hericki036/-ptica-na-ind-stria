-- =====================================================================
-- database/database.sqlite.sql
-- HydroSmart — variante SQLite 3.35+ do banco hydrosmart_db
--
-- Como importar:
--   sqlite3 hydrosmart_db.sqlite < database/database.sqlite.sql
--
-- Diferenças em relação ao MySQL (database/database.sql):
--   • ENUM vira TEXT + CHECK (... IN (...))
--   • BOOLEAN vira INTEGER 0/1 com CHECK
--   • Datas são TEXT no formato 'AAAA-MM-DD HH:MM:SS' (horário local)
--   • O trigger não tem variáveis: cada regra é um INSERT ... SELECT
--   • Chaves estrangeiras exigem PRAGMA foreign_keys = ON a cada conexão
-- =====================================================================

PRAGMA foreign_keys = ON;

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

CREATE TABLE usuarios (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nome            TEXT    NOT NULL CHECK (length(trim(nome)) >= 2),
  email           TEXT    NOT NULL COLLATE NOCASE,
  senha_hash      TEXT    NOT NULL,
  meta_diaria_ml  INTEGER NOT NULL DEFAULT 2000
                  CHECK (meta_diaria_ml BETWEEN 1000 AND 5000),
  peso_kg         REAL    CHECK (peso_kg IS NULL OR peso_kg BETWEEN 20 AND 300),
  criado_em       TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  CONSTRAINT uq_usuarios_email UNIQUE (email)
);

CREATE TABLE garrafas (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id            INTEGER NOT NULL
                        REFERENCES usuarios (id) ON DELETE CASCADE ON UPDATE CASCADE,
  modelo                TEXT    NOT NULL DEFAULT 'HydroSmart 600',
  numero_serie          TEXT    NOT NULL,
  capacidade_ml         INTEGER NOT NULL DEFAULT 600 CHECK (capacidade_ml > 0),
  status                TEXT    NOT NULL DEFAULT 'ativa'
                        CHECK (status IN ('ativa', 'inativa', 'manutencao')),
  nivel_ml              INTEGER NOT NULL DEFAULT 0,
  bateria_pct           INTEGER NOT NULL DEFAULT 100 CHECK (bateria_pct BETWEEN 0 AND 100),
  conectada             INTEGER NOT NULL DEFAULT 0 CHECK (conectada IN (0, 1)),
  ultima_sincronizacao  TEXT,
  criado_em             TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  CONSTRAINT uq_garrafas_serie UNIQUE (numero_serie),
  CONSTRAINT ck_garrafas_nivel CHECK (nivel_ml >= 0 AND nivel_ml <= capacidade_ml)
);

CREATE INDEX idx_garrafas_usuario ON garrafas (usuario_id);

CREATE TABLE leituras_consumo (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  garrafa_id  INTEGER NOT NULL
              REFERENCES garrafas (id) ON DELETE CASCADE ON UPDATE CASCADE,
  volume_ml   INTEGER NOT NULL CHECK (volume_ml > 0 AND volume_ml <= 2000),
  lido_em     TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_leituras_garrafa_data ON leituras_consumo (garrafa_id, lido_em);
CREATE INDEX idx_leituras_data         ON leituras_consumo (lido_em);

-- dias_semana: '0,1,...,6' (0 = domingo). Sem REGEXP nativo no SQLite,
-- o CHECK aceita apenas dígitos de 0 a 6 e vírgulas.
CREATE TABLE lembretes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id   INTEGER NOT NULL
               REFERENCES usuarios (id) ON DELETE CASCADE ON UPDATE CASCADE,
  hora         TEXT    NOT NULL CHECK (time(hora) IS NOT NULL),
  dias_semana  TEXT    NOT NULL DEFAULT '0,1,2,3,4,5,6'
               CHECK (dias_semana <> '' AND dias_semana NOT GLOB '*[^0-6,]*'),
  rotulo       TEXT,
  ativo        INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  criado_em    TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  CONSTRAINT uq_lembretes_horario UNIQUE (usuario_id, hora)
);

CREATE TABLE metas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id   INTEGER NOT NULL
               REFERENCES usuarios (id) ON DELETE CASCADE ON UPDATE CASCADE,
  meta_ml      INTEGER NOT NULL CHECK (meta_ml BETWEEN 1000 AND 5000),
  data_inicio  TEXT    NOT NULL,
  data_fim     TEXT,
  status       TEXT    NOT NULL DEFAULT 'ativa'
               CHECK (status IN ('ativa', 'encerrada', 'cancelada')),
  CONSTRAINT ck_metas_periodo CHECK (data_fim IS NULL OR data_fim >= data_inicio)
);

CREATE INDEX idx_metas_usuario_periodo ON metas (usuario_id, data_inicio, data_fim);

CREATE TABLE conquistas (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id       INTEGER NOT NULL
                   REFERENCES usuarios (id) ON DELETE CASCADE ON UPDATE CASCADE,
  tipo             TEXT    NOT NULL CHECK (tipo IN (
                     'boas_vindas', 'primeiro_gole', 'meta_diaria',
                     'sequencia_3_dias', 'sequencia_7_dias', 'dez_litros')),
  descricao        TEXT,
  data_referencia  TEXT    NOT NULL,
  obtida_em        TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  CONSTRAINT uq_conquistas_dia UNIQUE (usuario_id, tipo, data_referencia)
);

CREATE INDEX idx_conquistas_usuario_data ON conquistas (usuario_id, obtida_em);

-- =====================================================================
-- 2. VIEW vw_progresso_diario (mesma lógica da versão MySQL)
-- =====================================================================
CREATE VIEW vw_progresso_diario AS
SELECT
  p.usuario_id,
  p.nome,
  p.dia,
  p.total_ml,
  p.qtd_leituras,
  p.meta_ml,
  ROUND(p.total_ml * 100.0 / p.meta_ml, 1)            AS percentual,
  CASE WHEN p.total_ml >= p.meta_ml THEN 1 ELSE 0 END AS meta_atingida
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
      date(l.lido_em)  AS dia,
      SUM(l.volume_ml) AS total_ml,
      COUNT(*)         AS qtd_leituras
    FROM leituras_consumo l
    JOIN garrafas g ON g.id = l.garrafa_id
    GROUP BY g.usuario_id, date(l.lido_em)
  ) d
  JOIN usuarios u ON u.id = d.usuario_id
) p;

-- =====================================================================
-- 3. TRIGGER trg_leituras_conquistas (mesmas regras da versão MySQL)
-- Cada INSERT ... SELECT só insere quando a condição do WHERE é verdadeira.
-- =====================================================================
CREATE TRIGGER trg_leituras_conquistas
AFTER INSERT ON leituras_consumo
FOR EACH ROW
BEGIN
  -- a) Primeiro gole
  INSERT INTO conquistas (usuario_id, tipo, descricao, data_referencia, obtida_em)
  SELECT g.usuario_id, 'primeiro_gole', 'Primeira leitura registrada pelo sensor',
         date(NEW.lido_em), NEW.lido_em
    FROM garrafas g
   WHERE g.id = NEW.garrafa_id
     AND NOT EXISTS (SELECT 1 FROM conquistas c
                      WHERE c.usuario_id = g.usuario_id AND c.tipo = 'primeiro_gole');

  -- b) Meta diária atingida (uma por dia)
  INSERT INTO conquistas (usuario_id, tipo, descricao, data_referencia, obtida_em)
  SELECT g.usuario_id, 'meta_diaria',
         'Meta de ' || t.meta_ml || ' ml atingida',
         date(NEW.lido_em), NEW.lido_em
    FROM garrafas g
    JOIN (
      SELECT
        (SELECT COALESCE(SUM(l.volume_ml), 0)
           FROM leituras_consumo l
           JOIN garrafas g2 ON g2.id = l.garrafa_id
          WHERE g2.usuario_id = gx.usuario_id
            AND date(l.lido_em) = date(NEW.lido_em)) AS total_dia,
        COALESCE(
          (SELECT m.meta_ml
             FROM metas m
            WHERE m.usuario_id = gx.usuario_id
              AND m.status <> 'cancelada'
              AND m.data_inicio <= date(NEW.lido_em)
              AND (m.data_fim IS NULL OR m.data_fim >= date(NEW.lido_em))
            ORDER BY m.data_inicio DESC
            LIMIT 1),
          (SELECT u.meta_diaria_ml FROM usuarios u WHERE u.id = gx.usuario_id)
        ) AS meta_ml
      FROM garrafas gx
      WHERE gx.id = NEW.garrafa_id
    ) t
   WHERE g.id = NEW.garrafa_id
     AND t.total_dia >= t.meta_ml
     AND NOT EXISTS (SELECT 1 FROM conquistas c
                      WHERE c.usuario_id = g.usuario_id
                        AND c.tipo = 'meta_diaria'
                        AND c.data_referencia = date(NEW.lido_em));

  -- c) Sequência de 3 dias com a meta batida
  INSERT INTO conquistas (usuario_id, tipo, descricao, data_referencia, obtida_em)
  SELECT g.usuario_id, 'sequencia_3_dias', 'Meta batida 3 dias seguidos',
         date(NEW.lido_em), NEW.lido_em
    FROM garrafas g
   WHERE g.id = NEW.garrafa_id
     AND (SELECT COUNT(*) FROM conquistas c
           WHERE c.usuario_id = g.usuario_id
             AND c.tipo = 'meta_diaria'
             AND c.data_referencia BETWEEN date(NEW.lido_em, '-2 days')
                                       AND date(NEW.lido_em)) = 3
     AND NOT EXISTS (SELECT 1 FROM conquistas c
                      WHERE c.usuario_id = g.usuario_id AND c.tipo = 'sequencia_3_dias');

  -- d) Sequência de 7 dias com a meta batida
  INSERT INTO conquistas (usuario_id, tipo, descricao, data_referencia, obtida_em)
  SELECT g.usuario_id, 'sequencia_7_dias', 'Meta batida 7 dias seguidos',
         date(NEW.lido_em), NEW.lido_em
    FROM garrafas g
   WHERE g.id = NEW.garrafa_id
     AND (SELECT COUNT(*) FROM conquistas c
           WHERE c.usuario_id = g.usuario_id
             AND c.tipo = 'meta_diaria'
             AND c.data_referencia BETWEEN date(NEW.lido_em, '-6 days')
                                       AND date(NEW.lido_em)) = 7
     AND NOT EXISTS (SELECT 1 FROM conquistas c
                      WHERE c.usuario_id = g.usuario_id AND c.tipo = 'sequencia_7_dias');

  -- e) 10 litros acumulados
  INSERT INTO conquistas (usuario_id, tipo, descricao, data_referencia, obtida_em)
  SELECT g.usuario_id, 'dez_litros', '10 litros de água registrados',
         date(NEW.lido_em), NEW.lido_em
    FROM garrafas g
   WHERE g.id = NEW.garrafa_id
     AND (SELECT COALESCE(SUM(l.volume_ml), 0)
            FROM leituras_consumo l
            JOIN garrafas g2 ON g2.id = l.garrafa_id
           WHERE g2.usuario_id = g.usuario_id) >= 10000
     AND NOT EXISTS (SELECT 1 FROM conquistas c
                      WHERE c.usuario_id = g.usuario_id AND c.tipo = 'dez_litros');
END;

-- =====================================================================
-- 4. SEEDS — mesmos dados da versão MySQL, com datas relativas a hoje.
-- Senha dos 3 usuários: hydro123 (hash bcrypt, custo 10).
-- =====================================================================

INSERT INTO usuarios (id, nome, email, senha_hash, meta_diaria_ml, peso_kg, criado_em) VALUES
  (1, 'Ana Souza',    'ana@hydrosmart.com.br',
      '$2a$10$pRq2A2Z0JY3/I12AyH9Q7Ont1sy4CFImR1nyXb4PdiATqy/3SXlx.', 2000, 55.0,
      datetime('now', 'localtime', 'start of day', '-60 days', '+19 hours', '+20 minutes')),
  (2, 'Bruno Lima',   'bruno@hydrosmart.com.br',
      '$2a$10$zby0ZGV5R4Fa28ZmSnDGE.CMNoZnYLuR30jtrJJCWDUj6vkHzM8/a', 2500, 80.0,
      datetime('now', 'localtime', 'start of day', '-30 days', '+8 hours', '+45 minutes')),
  (3, 'Carla Mendes', 'carla@hydrosmart.com.br',
      '$2a$10$LPoXcObN3K5rdMdLhC1R0OgJoqzMWMSrj0y2ZuWoYMgDibEMhY.fG', 3500, 65.0,
      datetime('now', 'localtime', 'start of day', '-30 days', '+6 hours', '+10 minutes'));

INSERT INTO garrafas (id, usuario_id, modelo, numero_serie, capacidade_ml, status,
                      nivel_ml, bateria_pct, conectada, ultima_sincronizacao, criado_em) VALUES
  (1, 1, 'HydroSmart 600', 'HS600-2026-000101', 600, 'ativa', 350, 78, 1,
      datetime('now', 'localtime', 'start of day', '+10 hours', '+30 minutes'),
      datetime('now', 'localtime', 'start of day', '-60 days', '+19 hours', '+25 minutes')),
  (2, 2, 'HydroSmart 600', 'HS600-2026-000102', 600, 'ativa', 100, 41, 0,
      datetime('now', 'localtime', 'start of day', '+9 hours'),
      datetime('now', 'localtime', 'start of day', '-30 days', '+8 hours', '+50 minutes')),
  (3, 3, 'HydroSmart 600', 'HS600-2026-000103', 600, 'ativa', 0, 92, 1,
      datetime('now', 'localtime', 'start of day', '+6 hours', '+40 minutes'),
      datetime('now', 'localtime', 'start of day', '-30 days', '+6 hours', '+15 minutes'));

INSERT INTO metas (usuario_id, meta_ml, data_inicio, data_fim, status) VALUES
  (1, 1500, date('now', 'localtime', '-60 days'), date('now', 'localtime', '-31 days'), 'encerrada'),
  (1, 2000, date('now', 'localtime', '-30 days'), NULL, 'ativa'),
  (2, 2500, date('now', 'localtime', '-30 days'), NULL, 'ativa'),
  (3, 3500, date('now', 'localtime', '-30 days'), NULL, 'ativa');

INSERT INTO lembretes (usuario_id, hora, dias_semana, rotulo, ativo) VALUES
  (1, '07:30:00', '1,2,3,4,5',     'Ao acordar',            1),
  (1, '10:00:00', '1,2,3,4,5',     'Intervalo da aula',     1),
  (1, '12:30:00', '0,1,2,3,4,5,6', 'Depois do almoço',      1),
  (1, '15:30:00', '1,2,3,4,5',     'Pausa nos estudos',     1),
  (1, '19:00:00', '0,1,2,3,4,5,6', 'Antes do jantar',       1),
  (1, '22:00:00', '0,6',           'Fim de semana à noite', 0),
  (2, '09:00:00', '1,2,3,4,5',     'Chegada no trabalho',   1),
  (2, '14:00:00', '1,2,3,4,5',     'Depois da reunião',     1),
  (3, '06:00:00', '0,1,2,3,4,5,6', 'Antes do treino',       1),
  (3, '17:00:00', '1,3,5',         'Treino da tarde',       1);

INSERT INTO conquistas (usuario_id, tipo, descricao, data_referencia, obtida_em) VALUES
  (1, 'boas_vindas', 'Conta criada no app HydroSmart',
      date('now', 'localtime', '-60 days'),
      datetime('now', 'localtime', 'start of day', '-60 days', '+19 hours', '+20 minutes')),
  (2, 'boas_vindas', 'Conta criada no app HydroSmart',
      date('now', 'localtime', '-30 days'),
      datetime('now', 'localtime', 'start of day', '-30 days', '+8 hours', '+45 minutes')),
  (3, 'boas_vindas', 'Conta criada no app HydroSmart',
      date('now', 'localtime', '-30 days'),
      datetime('now', 'localtime', 'start of day', '-30 days', '+6 hours', '+10 minutes'));

-- Leituras: 37 registros nos últimos 7 dias (o trigger gera as conquistas)
-- Formato das datas: datetime('now','localtime','start of day','-N days','+H hours','+M minutes')
INSERT INTO leituras_consumo (garrafa_id, volume_ml, lido_em) VALUES
  (1, 500, datetime('now', 'localtime', 'start of day', '-6 days', '+7 hours',  '+40 minutes')),
  (1, 450, datetime('now', 'localtime', 'start of day', '-6 days', '+10 hours', '+15 minutes')),
  (1, 600, datetime('now', 'localtime', 'start of day', '-6 days', '+13 hours', '+30 minutes')),
  (1, 500, datetime('now', 'localtime', 'start of day', '-6 days', '+17 hours', '+20 minutes')),
  (1, 400, datetime('now', 'localtime', 'start of day', '-5 days', '+8 hours',  '+5 minutes')),
  (1, 350, datetime('now', 'localtime', 'start of day', '-5 days', '+12 hours', '+40 minutes')),
  (1, 500, datetime('now', 'localtime', 'start of day', '-5 days', '+19 hours', '+10 minutes')),
  (1, 600, datetime('now', 'localtime', 'start of day', '-4 days', '+7 hours',  '+55 minutes')),
  (1, 500, datetime('now', 'localtime', 'start of day', '-4 days', '+11 hours', '+20 minutes')),
  (1, 450, datetime('now', 'localtime', 'start of day', '-4 days', '+15 hours', '+5 minutes')),
  (1, 500, datetime('now', 'localtime', 'start of day', '-4 days', '+20 hours', '+30 minutes')),
  (1, 550, datetime('now', 'localtime', 'start of day', '-3 days', '+8 hours',  '+20 minutes')),
  (1, 600, datetime('now', 'localtime', 'start of day', '-3 days', '+12 hours', '+10 minutes')),
  (1, 500, datetime('now', 'localtime', 'start of day', '-3 days', '+16 hours', '+45 minutes')),
  (1, 400, datetime('now', 'localtime', 'start of day', '-3 days', '+21 hours')),
  (1, 500, datetime('now', 'localtime', 'start of day', '-2 days', '+7 hours',  '+30 minutes')),
  (1, 600, datetime('now', 'localtime', 'start of day', '-2 days', '+10 hours', '+50 minutes')),
  (1, 450, datetime('now', 'localtime', 'start of day', '-2 days', '+14 hours', '+15 minutes')),
  (1, 500, datetime('now', 'localtime', 'start of day', '-2 days', '+18 hours', '+40 minutes')),
  (1, 300, datetime('now', 'localtime', 'start of day', '-1 days', '+9 hours',  '+10 minutes')),
  (1, 400, datetime('now', 'localtime', 'start of day', '-1 days', '+13 hours')),
  (1, 350, datetime('now', 'localtime', 'start of day', '-1 days', '+16 hours', '+30 minutes')),
  (1, 450, datetime('now', 'localtime', 'start of day', '+8 hours',  '+10 minutes')),
  (1, 300, datetime('now', 'localtime', 'start of day', '+10 hours', '+30 minutes'));

INSERT INTO leituras_consumo (garrafa_id, volume_ml, lido_em) VALUES
  (2, 600, datetime('now', 'localtime', 'start of day', '-1 days', '+8 hours',  '+30 minutes')),
  (2, 600, datetime('now', 'localtime', 'start of day', '-1 days', '+11 hours')),
  (2, 500, datetime('now', 'localtime', 'start of day', '-1 days', '+14 hours', '+20 minutes')),
  (2, 500, datetime('now', 'localtime', 'start of day', '-1 days', '+17 hours', '+45 minutes')),
  (2, 300, datetime('now', 'localtime', 'start of day', '-1 days', '+20 hours', '+15 minutes')),
  (2, 500, datetime('now', 'localtime', 'start of day', '+9 hours'));

INSERT INTO leituras_consumo (garrafa_id, volume_ml, lido_em) VALUES
  (3, 600, datetime('now', 'localtime', 'start of day', '-1 days', '+6 hours',  '+15 minutes')),
  (3, 600, datetime('now', 'localtime', 'start of day', '-1 days', '+8 hours')),
  (3, 500, datetime('now', 'localtime', 'start of day', '-1 days', '+10 hours', '+30 minutes')),
  (3, 600, datetime('now', 'localtime', 'start of day', '-1 days', '+13 hours', '+15 minutes')),
  (3, 600, datetime('now', 'localtime', 'start of day', '-1 days', '+17 hours', '+30 minutes')),
  (3, 600, datetime('now', 'localtime', 'start of day', '-1 days', '+19 hours', '+45 minutes')),
  (3, 600, datetime('now', 'localtime', 'start of day', '+6 hours',  '+40 minutes'));

-- =====================================================================
-- 5. CONSULTA ÚTIL — histórico de 7 dias com dias vazios = 0
-- =====================================================================
-- WITH RECURSIVE calendario(dia) AS (
--   SELECT date('now', 'localtime', '-6 days')
--   UNION ALL
--   SELECT date(dia, '+1 day') FROM calendario WHERE dia < date('now', 'localtime')
-- )
-- SELECT c.dia, COALESCE(v.total_ml, 0) AS total_ml, v.meta_ml, v.percentual
--   FROM calendario c
--   LEFT JOIN vw_progresso_diario v ON v.dia = c.dia AND v.usuario_id = 1
--  ORDER BY c.dia;
