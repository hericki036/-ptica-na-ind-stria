-- =====================================================================
--  Portaria — Sistema de Gestão de Visitas
--  Banco de dados MySQL / MariaDB (XAMPP)
--
--  Como usar:
--    1. Abra o painel do XAMPP e inicie "Apache" e "MySQL".
--    2. Acesse http://localhost/phpmyadmin
--    3. Aba "Importar" > escolha este arquivo > "Executar".
--
--  Obs.: a API também cria o banco e as tabelas sozinha no primeiro
--  acesso, caso você não importe este arquivo manualmente.
--
--  Usuário administrador inicial:
--    e-mail: admin@portaria.com   senha: admin123
--    (troque a senha em Configurações após o primeiro login)
-- =====================================================================

CREATE DATABASE IF NOT EXISTS gestao_visitas
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE gestao_visitas;

-- ---------------------------------------------------------------------
-- Tabela: usuarios (login)
-- A senha é guardada com password_hash() (bcrypt), nunca em texto puro.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome_completo  VARCHAR(120) NOT NULL,
  email          VARCHAR(160) NOT NULL,
  senha          VARCHAR(255) NOT NULL,
  nivel_acesso   ENUM('admin','usuario','visitante') NOT NULL DEFAULT 'usuario',
  data_cadastro  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultima_sessao  DATETIME     NULL,
  foto_perfil    MEDIUMTEXT   NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_usuarios_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Tabela: visitas
-- data_saida e registrado_por são colunas de apoio: guardam o horário
-- de saída (base do cálculo de tempo_duracao) e quem registrou a visita.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visitas (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome            VARCHAR(120) NOT NULL,
  email           VARCHAR(160) NOT NULL,
  data_visita     DATETIME     NOT NULL,
  data_saida      DATETIME     NULL,
  motivo          TEXT         NOT NULL,
  setor_visitado  VARCHAR(60)  NOT NULL,
  tempo_duracao   INT UNSIGNED NULL COMMENT 'minutos entre entrada e saída',
  status          ENUM('ativo','finalizado') NOT NULL DEFAULT 'ativo',
  registrado_por  INT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY idx_visitas_data (data_visita),
  KEY idx_visitas_status (status),
  CONSTRAINT fk_visitas_usuario FOREIGN KEY (registrado_por)
    REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Tabela: sessoes (log de login/logout)
-- ultima_atividade permite encerrar sessões abandonadas (aba fechada
-- sem logout) depois de 30 minutos.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessoes (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id        INT UNSIGNED NOT NULL,
  data_entrada      DATETIME     NOT NULL,
  data_saida        DATETIME     NULL,
  ultima_atividade  DATETIME     NOT NULL,
  ip_aproximado     VARCHAR(45)  NOT NULL DEFAULT '',
  dispositivo       VARCHAR(160) NOT NULL DEFAULT '',
  status            ENUM('ativa','finalizada') NOT NULL DEFAULT 'ativa',
  PRIMARY KEY (id),
  KEY idx_sessoes_usuario (usuario_id),
  KEY idx_sessoes_status (status),
  CONSTRAINT fk_sessoes_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Tabela: horarios (agendamentos)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS horarios (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id   INT UNSIGNED NOT NULL,
  data         DATE         NOT NULL,
  hora_inicio  TIME         NOT NULL,
  hora_fim     TIME         NOT NULL,
  titulo       VARCHAR(120) NOT NULL,
  descricao    TEXT         NULL,
  status       ENUM('agendado','concluido','cancelado') NOT NULL DEFAULT 'agendado',
  criado_em    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_horarios_usuario_data (usuario_id, data),
  CONSTRAINT fk_horarios_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Tabela: recuperacoes_senha (fluxo "Esqueci minha senha")
-- Guarda apenas o hash do código de 6 dígitos, válido por 15 minutos.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recuperacoes_senha (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id   INT UNSIGNED NOT NULL,
  codigo_hash  VARCHAR(255) NOT NULL,
  expira_em    DATETIME     NOT NULL,
  tentativas   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  usado        TINYINT(1)   NOT NULL DEFAULT 0,
  criado_em    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_recuperacao_usuario (usuario_id),
  CONSTRAINT fk_recuperacao_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Administrador inicial (senha: admin123 — hash bcrypt)
-- ---------------------------------------------------------------------
INSERT IGNORE INTO usuarios (nome_completo, email, senha, nivel_acesso)
VALUES ('Administrador', 'admin@portaria.com',
        '$2y$10$ejHMwM5SGq4sUqQuQ9UMveKvzw4bK5tRpl8k1Yu7clBPnDki89Uw2', 'admin');
