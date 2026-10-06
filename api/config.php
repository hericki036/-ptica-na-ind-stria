<?php
/**
 * Configurações do sistema.
 * Os valores abaixo são o padrão do XAMPP (usuário "root" sem senha).
 * Se você definiu uma senha para o MySQL, altere DB_PASS.
 */

define('DB_HOST', '127.0.0.1');
define('DB_PORT', 3306);
define('DB_NAME', 'gestao_visitas');
define('DB_USER', 'root');
define('DB_PASS', '');

// Fuso horário usado pelo PHP e pelo MySQL (mantém NOW() e date() iguais)
define('FUSO_HORARIO', 'America/Sao_Paulo');

// Tempo máximo de inatividade antes de encerrar a sessão (em segundos)
define('SESSAO_TIMEOUT', 30 * 60);

// Dias para considerar um registro "antigo" na limpeza de dados
define('DIAS_DADOS_ANTIGOS', 30);

/**
 * Modo de desenvolvimento.
 * true  → o código de "Esqueci minha senha" aparece na tela (XAMPP local
 *         normalmente não tem servidor de e-mail configurado).
 * false → o código é enviado apenas por e-mail (função mail() do PHP).
 * Em produção, use SEMPRE false.
 */
define('MODO_DESENVOLVIMENTO', true);

// Setores disponíveis no formulário de visita (mesma lista do front-end)
const SETORES = [
    'Recepção', 'Administrativo', 'Financeiro', 'Recursos Humanos', 'Comercial',
    'Tecnologia da Informação', 'Produção', 'Logística', 'Manutenção', 'Diretoria',
];
