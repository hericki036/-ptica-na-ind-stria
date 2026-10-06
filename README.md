# Portaria — Sistema de Gestão de Visitas

Sistema web completo para controlar **visitas**, **agendamentos de horários** e **login de usuários**, com painel administrativo, tema claro/escuro e layout responsivo.

- **Front-end:** HTML, CSS e JavaScript puro (SPA, sem frameworks nem bibliotecas)
- **Back-end:** PHP 8 (PDO) + **MySQL/MariaDB do XAMPP**
- **Sem dependências externas** — apenas as fontes Inter e Plus Jakarta Sans do Google Fonts (com fonte do sistema como alternativa offline)

---

## Como rodar no XAMPP

1. Instale o [XAMPP](https://www.apachefriends.org/) e abra o **XAMPP Control Panel**.
2. Clique em **Start** em **Apache** e em **MySQL**.
3. Copie esta pasta para dentro de `C:\xampp\htdocs\` e renomeie para `portaria`
   (ficará `C:\xampp\htdocs\portaria\index.html`).
4. Acesse no navegador: **http://localhost/portaria**

Pronto. **O banco `gestao_visitas` e as tabelas são criados sozinhos no primeiro acesso.**
Se preferir criar manualmente: abra http://localhost/phpmyadmin → aba **Importar** → escolha `database/schema.sql` → **Executar**.

### Primeiro acesso

| E-mail | Senha | Nível |
|---|---|---|
| `admin@portaria.com` | `admin123` | Administrador |

> Troque essa senha em **Configurações → Mudar senha** logo após entrar.
> Para ver o painel com dados, use **Administração → Dados e backup → Gerar exemplos**.

### Configuração (`api/config.php`)

| Constante | Padrão | Para que serve |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS` | `127.0.0.1`, `3306`, `root`, *(vazio)* | Acesso ao MySQL (padrão do XAMPP). Se você definiu senha no MySQL, preencha `DB_PASS`. |
| `DB_NAME` | `gestao_visitas` | Nome do banco |
| `FUSO_HORARIO` | `America/Sao_Paulo` | Fuso usado pelo PHP **e** pelo MySQL |
| `SESSAO_TIMEOUT` | `30 * 60` | Logout automático após X segundos de inatividade |
| `DIAS_DADOS_ANTIGOS` | `30` | Idade mínima dos registros removidos na limpeza |
| `MODO_DESENVOLVIMENTO` | `true` | Mostra na tela o código de "Esqueci minha senha" (o XAMPP não envia e-mail). **Use `false` em produção.** |

---

## Direção visual

Antes de codar, comparei cinco linhas de referência:

| Estilo | Pontos fortes | Por que (não) usar sozinho |
|---|---|---|
| SaaS corporativo (Linear, Notion, Stripe) | Clareza, hierarquia, espaço em branco | Base ideal para um painel de dados usado o dia todo |
| Glassmorphism (Apple) | Profundidade, sensação premium | Em excesso prejudica leitura e contraste |
| Dark premium (Vercel, Raycast) | Sofisticação, conforto à noite | Não serve como único tema para uma portaria diurna |
| Soft UI / neomorfismo | Visual tátil | Contraste baixo em botões e campos — ruim para acessibilidade |
| Editorial minimalista | Tipografia elegante | Pouca densidade de informação para tabelas e filtros |

**Escolha:** *SaaS corporativo + glassmorphism sutil + tema escuro*. O SaaS garante leitura rápida de tabelas, filtros e números; o vidro (`backdrop-filter: blur(12px)`, bordas de 1px translúcidas) entra só em cards, modais, toasts, topo e menu, criando camadas sem atrapalhar o conteúdo; e o tema escuro usa os **mesmos tokens CSS** com valores próprios, então tudo funciona nos dois modos.

Detalhes aplicados: tokens de design em `:root`, gradiente azul → roxo (`#2563EB → #7C3AED`) nos botões principais, espaçamento em múltiplos de 8px, raio 12/8/999px, sombras em camadas, ícones SVG desenhados à mão (estilo Lucide), animações de entrada escalonadas, skeleton loading, ripple nos botões, toasts com barra de progresso, modais com foco preso (ESC e clique fora fecham), badges translúcidos, tabelas que viram cards no celular, menu em gaveta, scrollbar e seleção de texto personalizadas, `focus-visible` acessível e respeito a `prefers-reduced-motion`.

---

## Estrutura de arquivos

```
portaria/
├── index.html            Login, cadastro e recuperação de senha
├── dashboard.html        Painel (SPA com rotas por #hash)
├── css/style.css         Design system completo (claro/escuro, responsivo)
├── js/
│   ├── utils.js          Escape de HTML, ícones, datas, toasts, modais, CSV, tema
│   ├── db.js             Camada de dados: uma função por operação de cada tabela
│   ├── auth.js           Login, cadastro, sessão, inatividade, sincronização entre abas
│   └── app.js            Roteador SPA e todas as telas
├── api/                  Back-end PHP (JSON)
│   ├── config.php        Configurações
│   ├── conexao.php       Conexão PDO + instalação automática do banco
│   ├── helpers.php       Sessão, CSRF, permissões, validação
│   ├── auth.php          estado, login, cadastro, logout, ping, recuperar, redefinir
│   ├── visitas.php       listar (filtros), ativas, criar, finalizar, excluir
│   ├── agendamentos.php  listar, criar, cancelar, concluir, excluir
│   ├── usuarios.php      perfil, senha, excluir conta + CRUD do admin
│   ├── sessoes.php       log de login/logout (admin)
│   ├── dashboard.php     estatísticas
│   └── dados.php         exportação, backup JSON, limpeza, dados de exemplo
├── database/schema.sql   Script do banco (MySQL/MariaDB)
└── assets/favicon.svg
```

---

## Banco de dados

| Tabela | Colunas |
|---|---|
| `visitas` | `id`, `nome`, `email`, `data_visita`, `motivo`, `setor_visitado`, `tempo_duracao` (min), `status` (`ativo`/`finalizado`) + `data_saida`, `registrado_por` |
| `usuarios` | `id`, `nome_completo`, `email` (único), `senha` (hash), `nivel_acesso` (`admin`/`usuario`/`visitante`), `data_cadastro`, `ultima_sessao`, `foto_perfil` |
| `sessoes` | `id`, `usuario_id`, `data_entrada`, `data_saida`, `ip_aproximado`, `dispositivo`, `status` (`ativa`/`finalizada`) + `ultima_atividade` |
| `horarios` | `id`, `usuario_id`, `data`, `hora_inicio`, `hora_fim`, `titulo`, `descricao`, `status` (`agendado`/`concluido`/`cancelado`) + `criado_em` |
| `recuperacoes_senha` | Códigos de "Esqueci minha senha" (somente o hash, válidos por 15 min) |

As colunas extras (após o **+**) dão suporte às regras pedidas: `data_saida` é a base do cálculo de `tempo_duracao`; `ultima_atividade` permite encerrar sessões de quem fechou a aba sem sair.

---

## Níveis de acesso

| Recurso | Admin | Usuário | Visitante |
|---|:-:|:-:|:-:|
| Dashboard | ✔ (+ total de usuários) | ✔ | ✔ (só seus agendamentos) |
| Registrar / finalizar visita, histórico, CSV | ✔ | ✔ | — |
| Excluir visita | ✔ | — | — |
| Agendar horário / meus agendamentos | ✔ | ✔ | ✔ |
| Configurações (perfil, senha, excluir conta) | ✔ | ✔ | ✔ |
| Administração (usuários, todos os agendamentos, sessões, backup, limpeza) | ✔ | — | — |

Visitantes não veem as visitas porque elas contêm nome e e-mail de outras pessoas (LGPD).
O cadastro público cria contas de **Usuário** ou **Visitante**; administradores são criados pelo painel. Se o banco estiver vazio, a primeira conta criada vira administradora.

---

## Segurança

- **Senhas com `password_hash()` (bcrypt)** — muito mais seguro que `btoa`, que é apenas codificação e pode ser revertido por qualquer pessoa.
- **SQL Injection:** todas as consultas usam *prepared statements* (PDO).
- **XSS:** todo dado vindo do banco passa por `U.esc()` antes de entrar no HTML; URLs de foto só aceitam `http(s)` ou `data:image`.
- **Sessão no servidor** com cookie `HttpOnly` + `SameSite=Strict`, ID regenerado no login (evita *session fixation*).
- **CSRF:** toda requisição de escrita exige o cabeçalho `X-CSRF-Token`.
- **Verificação de sessão em todas as páginas e endpoints:** o painel só aparece depois que o servidor confirma o login; acesso direto a `dashboard.html` sem login volta para a tela de entrada.
- **Inatividade:** aviso com contagem regressiva 60 s antes e logout automático após 30 min (contados no navegador e também no servidor; abas abertas compartilham a atividade).
- **Força bruta:** 5 senhas erradas seguidas bloqueiam novas tentativas por 60 s; o código de recuperação aceita no máximo 5 tentativas.
- **CSV:** valores que começam com `= + - @` são neutralizados (evita fórmulas maliciosas no Excel).
- `.htaccess` bloqueia acesso direto a `database/` e aos arquivos internos da API.

---

## Funcionalidades

- **Login** com validação, mensagem de credenciais incorretas, "lembrar e-mail", mostrar/ocultar senha e redirecionamento automático.
- **Cadastro** com validação de todos os campos, medidor de força da senha e verificação de e-mail já existente.
- **Esqueci minha senha** em 2 passos (código de 6 dígitos válido por 15 min).
- **Dashboard:** visitas de hoje, visitas ativas, próximos agendamentos, total de usuários (admin), gráfico de barras dos últimos 7 dias (SVG com tooltip e tabela acessível), últimas 5 visitas e próximos horários.
- **Registrar visita:** data/hora automática, status `ativo`, lista ao vivo de quem está no local com **Finalizar Visita** (calcula a duração).
- **Histórico:** filtros por data, setor e status, busca por nome/e-mail, paginação e **exportação CSV**.
- **Agendar horário:** fim deve ser depois do início, não aceita horário passado nem **sobreposto** a outro agendamento seu; mostra a agenda do dia e destaca conflitos antes de salvar.
- **Meus agendamentos:** abas por status com cores (verde = agendado, cinza = concluído, vermelho = cancelado), **Finalizar**, **Cancelar** e excluir.
- **Configurações:** nome, e-mail, foto (upload com recorte automático ou URL), troca de senha, tema e **Excluir conta** (com confirmação de senha).
- **Administração:** CRUD de usuários (com status online), todos os agendamentos, log de sessões (IP, dispositivo, duração), exportação CSV de cada tabela, **backup completo em JSON**, **limpeza de dados com mais de 30 dias** (com prévia) e gerador de dados de exemplo.
- Confirmação antes de qualquer exclusão; botões com estado de carregamento; notificações toast de sucesso, erro e aviso.

---

## Problemas comuns

| Sintoma | Solução |
|---|---|
| "Não foi possível conectar ao MySQL" | Inicie o **MySQL** no XAMPP. Se o MySQL tem senha, ajuste `DB_PASS` em `api/config.php`. |
| "Abra o sistema pelo XAMPP…" | Você abriu o arquivo direto (`file://`). Use `http://localhost/portaria`. |
| MySQL não inicia (porta 3306 ocupada) | Feche outro MySQL instalado ou mude a porta em *Config → my.ini* e em `DB_PORT`. |
| Horários errados | Ajuste `FUSO_HORARIO` em `api/config.php` (ex.: `America/Manaus`). |
