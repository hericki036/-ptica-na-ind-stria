# HydroSmart — Sua água. Sua rotina. Seu cuidado.

> **Tecnologia que hidrata.** Garrafa inteligente de 600 ml que monitora o consumo de água e envia lembretes de hidratação.

Projeto web completo da startup HydroSmart, feito a partir da apresentação oficial:

- **Landing page institucional** (`index.html`): problema, solução em 4 passos, recursos, linha do tempo da empresa (Ideia → Protótipo → Produto → Empresa), ficha técnica, personas e cadastro/login.
- **Painel do usuário** (`dashboard.html`): simulação do app com progresso diário, status da garrafa, histórico de 7 dias em SVG puro, lembretes (CRUD) e conquistas.
- **Modo claro e escuro** nas duas páginas (botão de sol/lua no topo), com a escolha salva no navegador.
- **Banco de dados** `hydrosmart_db` em MySQL/MariaDB (`database/database.sql`) e SQLite (`database/database.sqlite.sql`), com view, trigger e dados de demonstração.
- **Camada de integração** (`js/api.js`): funções `fetch()` para uma API REST. Nesta entrega, um **servidor simulado em localStorage** (`js/mock-servidor.js`) responde com a mesma estrutura do banco, então tudo funciona só no navegador.

Sem frameworks, sem CDNs e sem dependências: HTML5 semântico, CSS3 (variáveis, Grid e Flexbox) e JavaScript ES6+ em módulos.

---

## 1. Árvore de pastas

```
hydrosmart/
├── index.html                  # Landing page institucional
├── dashboard.html              # Painel do usuário (simulação do app)
├── README.md
├── assets/
│   ├── favicon.svg             # Ícone (gota em degradê)
│   ├── garrafa-hydrosmart.svg  # Ilustração da garrafa
│   └── icones.svg              # Sprite de ícones (<symbol>)
├── css/
│   └── style.css               # Estilos (tokens em :root, mobile-first)
├── database/
│   ├── database.sql            # MySQL 8.0.16+ / MariaDB 10.4+
│   └── database.sqlite.sql     # Variante SQLite 3.35+
└── js/
    ├── api.js                  # Cliente REST (fetch) + sessão + CONFIG.usarMock
    ├── mock-servidor.js        # Servidor REST simulado sobre localStorage
    ├── validacao.js            # Regras de validação (front e "servidor")
    ├── utils.js                # Datas e formatação pt-BR (funções puras)
    ├── ui.js                   # Utilitários de interface (toasts, erros, ícones)
    ├── tema.js                 # Modo claro/escuro (botão sol/lua)
    ├── app.js                  # Comportamento da landing page
    └── dashboard.js            # Comportamento do painel
```

Dependências entre os módulos:

```
app.js ───────┐
              ├──> api.js ──> mock-servidor.js ──> validacao.js, utils.js
dashboard.js ─┘       (só quando CONFIG.usarMock = true)
   └──> validacao.js, utils.js, ui.js, tema.js
```

---

## 2. Como rodar localmente

Os módulos JavaScript (`<script type="module">`) **não funcionam abrindo o arquivo direto** (`file://`). Use qualquer servidor estático dentro da pasta `hydrosmart/`:

```bash
# Opção 1 — Node.js
npx serve .

# Opção 2 — Python 3
python -m http.server 8000

# Opção 3 — VS Code
# Instale a extensão "Live Server" e clique em "Go Live"
```

Acesse `http://localhost:8000` (ou a porta que o servidor mostrar). Se a página for aberta por `file://`, um aviso no topo explica o que fazer.

### Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| Página sem estilo ou sem funcionar ao dar dois cliques no `index.html` | O navegador bloqueia módulos JS em `file://`. Use um dos servidores acima. |
| `Cannot GET /index.html/` ao sair do painel ou clicar em "Site" | Algum servidor (ou um redirecionamento antigo guardado no cache do navegador) trocava `/index.html` por `/index.html/`. O painel agora volta para a **raiz do site** (`./`), que todo servidor entrega. Se ainda aparecer, limpe o cache do site (Ctrl+Shift+R ou "Limpar dados de navegação") e acesse `http://localhost:PORTA/`. |
| Dados "presos" de testes antigos | Botão **"Restaurar dados de demonstração"** no rodapé do painel. |

### Contas de demonstração

| Persona | E-mail | Senha | Meta |
|---|---|---|---|
| Ana (estudante) | `ana@hydrosmart.com.br` | `hydro123` | 2.000 ml |
| Bruno (trabalhador) | `bruno@hydrosmart.com.br` | `hydro123` | 2.500 ml |
| Carla (atleta) | `carla@hydrosmart.com.br` | `hydro123` | 3.500 ml |

Na aba **Entrar** há o botão **"Entrar com a conta de demonstração"** (Ana, que tem 7 dias de histórico). Você também pode criar uma conta nova: ela começa sem garrafa, e o painel pede o **pareamento** (há um botão que gera um número de série de teste).

### O que dá para fazer no painel

- **Simular o sensor**: botões de gole (150, 250 e 300 ml) ou volume livre. O nível da garrafa desce, a bateria gasta 1% por leitura e o progresso, o gráfico e as conquistas são recalculados.
- **Garrafa**: encher, conectar/desconectar o Bluetooth, recarregar a bateria e mudar o status (`ativa`, `inativa`, `manutencao`). Desconectada, inativa, sem bateria ou vazia, a garrafa não registra leituras.
- **Meta diária**: alterar entre 1.000 e 5.000 ml. A nova meta vale a partir de hoje; os dias anteriores mantêm a meta da época (tabela `metas`).
- **Lembretes**: criar, editar, pausar e excluir. Com o painel aberto, um aviso aparece na hora marcada (e uma notificação do sistema, se você permitir).
- **Restaurar dados de demonstração**: no rodapé do painel.
- **Modo claro/escuro**: botão de sol/lua no topo (também no site). A escolha vale para as duas páginas e fica salva; sem escolha, o site segue o tema do sistema operacional.

---

## 3. Modelo de dados

```
                                    ┌────────────────────┐
                                    │ usuarios           │
                                    │ PK id              │
                                    │ UQ email           │
                                    │    nome            │
                                    │    senha_hash      │
                                    │    meta_diaria_ml  │
                                    │    peso_kg         │
                                    │    criado_em       │
                                    └──────────┬─────────┘
           ┌───────────────────────┬───────────┴───────────┬───────────────────────┐
           │ 1:N                   │ 1:N                   │ 1:N                   │ 1:N
┌──────────┴─────────┐  ┌──────────┴─────────┐  ┌──────────┴─────────┐  ┌──────────┴─────────┐
│ garrafas           │  │ lembretes          │  │ metas              │  │ conquistas         │
│ PK id              │  │ PK id              │  │ PK id              │  │ PK id              │
│ FK usuario_id      │  │ FK usuario_id      │  │ FK usuario_id      │  │ FK usuario_id      │
│ UQ numero_serie    │  │ UQ (usuario_id,    │  │    meta_ml         │  │    tipo (ENUM)     │
│    modelo          │  │      hora)         │  │    data_inicio     │  │    descricao       │
│    capacidade_ml   │  │    dias_semana     │  │    data_fim        │  │ UQ (usuario_id,    │
│    status (ENUM)   │  │    rotulo          │  │    status (ENUM)   │  │      tipo, data_   │
│    nivel_ml        │  │    ativo (BOOL)    │  └────────────────────┘  │      referencia)   │
│    bateria_pct     │  └────────────────────┘                          │    obtida_em       │
│    conectada       │                                                  └────────────────────┘
│    ultima_sincron. │
└──────────┬─────────┘
           │ 1:N
┌──────────┴─────────┐
│ leituras_consumo   │
│ PK id              │
│ FK garrafa_id      │
│    volume_ml > 0   │
│    lido_em         │
└────────────────────┘

Todas as FKs: ON DELETE CASCADE / ON UPDATE CASCADE
VIEW    vw_progresso_diario      soma de ml por usuário/dia + meta do dia + % + meta_atingida
TRIGGER trg_leituras_conquistas  AFTER INSERT em leituras_consumo → INSERT em conquistas
```

| Tabela | Chaves e restrições |
|---|---|
| `usuarios` | PK `id`; UNIQUE `email`; CHECK de nome (≥ 2 letras), meta (1.000–5.000 ml) e peso (20–300 kg) |
| `garrafas` | PK `id`; FK `usuario_id`; UNIQUE `numero_serie`; `capacidade_ml` DEFAULT 600; `status` ENUM(`ativa`,`inativa`,`manutencao`); CHECK de capacidade > 0, 0 ≤ nível ≤ capacidade e bateria 0–100 |
| `leituras_consumo` | PK `id`; FK `garrafa_id`; CHECK `volume_ml` > 0 (e ≤ 2.000); índices `(garrafa_id, lido_em)` e `(lido_em)` para o histórico |
| `lembretes` | PK `id`; FK `usuario_id`; UNIQUE `(usuario_id, hora)`; `dias_semana` no formato `'1,2,3,4,5'` (0 = domingo … 6 = sábado, igual ao `Date.getDay()`) validado por CHECK |
| `metas` | PK `id`; FK `usuario_id`; CHECK de valor e de período (`data_fim ≥ data_inicio`); índice `(usuario_id, data_inicio, data_fim)` |
| `conquistas` | PK `id`; FK `usuario_id`; `tipo` ENUM(`boas_vindas`, `primeiro_gole`, `meta_diaria`, `sequencia_3_dias`, `sequencia_7_dias`, `dez_litros`); UNIQUE `(usuario_id, tipo, data_referencia)` |

**Por que existe a tabela `metas`?** A meta de um usuário pode mudar. Guardando o período de cada meta, a view e o trigger sabem qual era a meta **naquele dia**, e o histórico não muda quando a pessoa troca a meta hoje. `usuarios.meta_diaria_ml` guarda só a meta atual.

### View `vw_progresso_diario`

Uma linha por usuário/dia com leituras: `usuario_id`, `nome`, `dia`, `total_ml`, `qtd_leituras`, `meta_ml` (meta vigente no dia), `percentual` e `meta_atingida` (0/1). Dias sem leitura não aparecem; a API completa com zero usando um calendário (`WITH RECURSIVE`), como mostram os exemplos no fim do `database.sql`.

### Trigger `trg_leituras_conquistas`

Roda depois de cada `INSERT` em `leituras_consumo` e concede:

| Conquista | Regra |
|---|---|
| `primeiro_gole` | primeira leitura do usuário |
| `meta_diaria` | total do dia ≥ meta vigente do dia (uma por dia) |
| `sequencia_3_dias` | meta batida 3 dias seguidos (uma vez) |
| `sequencia_7_dias` | meta batida 7 dias seguidos (uma vez) |
| `dez_litros` | 10 litros acumulados (uma vez) |

`boas_vindas` é inserida no cadastro. Nos seeds, as conquistas de exemplo de boas-vindas são inseridas manualmente e as outras **são geradas pelo próprio trigger** durante a carga das leituras.

### Seeds

3 usuários (as personas da landing page), 3 garrafas, 4 metas (uma encerrada, para mostrar o histórico de metas), 10 lembretes e **37 leituras nos últimos 7 dias**. As datas são relativas a `CURDATE()`, então o histórico sempre cobre a última semana, não importa quando o script rode. Depois da carga existem 14 conquistas.

---

## 4. Importando o banco

### MySQL / MariaDB

```bash
mysql -u root -p < database/database.sql
```

Ou no **phpMyAdmin** (XAMPP/WAMP): aba **Importar** → escolha `database/database.sql` → **Executar**.

O script cria o banco `hydrosmart_db` e pode ser executado de novo quando quiser: ele apaga e recria view, trigger e tabelas antes de inserir os dados.

Para conferir:

```sql
USE hydrosmart_db;
SELECT * FROM vw_progresso_diario WHERE usuario_id = 1 ORDER BY dia;
SELECT tipo, data_referencia, obtida_em FROM conquistas WHERE usuario_id = 1;

-- Teste do trigger: Ana tem 750 ml hoje e meta de 2.000 ml
INSERT INTO leituras_consumo (garrafa_id, volume_ml) VALUES (1, 600), (1, 650);
SELECT * FROM conquistas WHERE usuario_id = 1 AND data_referencia = CURDATE();
```

Observações:

- **Versão:** CHECK constraints só são aplicadas a partir do MySQL **8.0.16** e do MariaDB **10.2**. Em versões antigas o script roda, mas os CHECKs são ignorados.
- **Erro 1419 ao criar o trigger** (MySQL com log binário ligado e usuário sem privilégio SUPER): rode `SET GLOBAL log_bin_trust_function_creators = 1;` como administrador ou importe com o usuário `root`.
- **Fuso horário:** `CURDATE()` e `NOW()` usam o fuso do servidor MySQL. Para o horário de Brasília: `SET GLOBAL time_zone = '-03:00';`.

### SQLite

```bash
sqlite3 hydrosmart_db.sqlite < database/database.sqlite.sql
sqlite3 hydrosmart_db.sqlite "SELECT * FROM vw_progresso_diario;"
```

Diferenças da variante: `ENUM` vira `TEXT` + `CHECK (... IN (...))`, `BOOLEAN` vira `INTEGER` 0/1, datas são `TEXT` (`'AAAA-MM-DD HH:MM:SS'`, horário local) e o trigger, sem variáveis, usa um `INSERT ... SELECT ... WHERE` por regra. Lembre que no SQLite as chaves estrangeiras só valem com `PRAGMA foreign_keys = ON;` em cada conexão.

---

## 5. API REST

Todas as rotas (menos cadastro e login) exigem `Authorization: Bearer <token>`. Erros seguem um formato único: `{ "erro": "mensagem", "campos": { "campo": "mensagem" } }` com status 401 (sessão), 403 (dados de outro usuário), 404, 409 (duplicado) ou 422 (validação).

| Método | Rota | Função em `api.js` | Descrição |
|---|---|---|---|
| POST | `/auth/cadastro` | `api.cadastrar(dados)` | Cria conta, meta inicial, conquista de boas-vindas e lembretes iniciais |
| POST | `/auth/login` | `api.login(email, senha)` | Devolve `{ token, usuario }` |
| POST | `/auth/logout` | `api.logout()` | Encerra a sessão |
| GET | `/usuarios` | `api.listarUsuarios()` | Lista usuários sem `senha_hash` (no backend real, restrinja a administradores) |
| GET / PATCH | `/usuarios/:id` | `api.obterUsuario(id)` / `api.atualizarUsuario(id, dados)` | Dados do usuário / troca de meta |
| GET | `/usuarios/:id/garrafas` | `api.listarGarrafas(id)` | Garrafas pareadas |
| POST | `/garrafas` | `api.parearGarrafa(numeroSerie)` | Pareia uma garrafa nova |
| PATCH | `/garrafas/:id` | `api.atualizarGarrafa(id, dados)` | Status e telemetria (nível, bateria, conexão) |
| POST | `/leituras` | `api.registrarLeitura(leitura)` | Leitura do sensor → `{ leitura, garrafa, conquistas_novas }` |
| GET | `/leituras?usuario_id=&data=` | `api.listarLeituras(id, filtros)` | Leituras (mais recentes primeiro) |
| GET | `/historico/:usuario?dias=7` | `api.obterHistorico(id, dias)` | Linhas da view com dias vazios = 0 |
| GET | `/usuarios/:id/lembretes` | `api.listarLembretes(id)` | Lembretes ordenados por hora |
| POST | `/lembretes` | `api.criarLembrete(dados)` | Cria |
| PUT | `/lembretes/:id` | `api.atualizarLembrete(id, dados)` | Edita |
| PATCH | `/lembretes/:id` | `api.alternarLembrete(id, ativo)` | Liga/pausa |
| DELETE | `/lembretes/:id` | `api.excluirLembrete(id)` | Exclui |
| GET | `/usuarios/:id/metas` | `api.listarMetas(id)` | Histórico de metas |
| GET | `/usuarios/:id/conquistas` | `api.listarConquistas(id)` | Conquistas obtidas |

---

## 6. Como funciona o mock (localStorage)

`api.js` monta cada requisição exatamente como faria com `fetch()`. Com `CONFIG.usarMock = true`, em vez de ir para a rede ela chama `mockFetch(url, opcoes)`, que:

1. Lê o banco da chave **`hydrosmart_db`** do localStorage (e cria os seeds na primeira vez). O objeto tem as mesmas tabelas e colunas do SQL, mais os contadores de `AUTO_INCREMENT`:
   ```json
   { "versao": 1, "sequencias": { "usuarios": 3, "...": 0 },
     "usuarios": [{ "id": 1, "nome": "Ana Souza", "email": "...", "senha_hash": "sha256$...", "meta_diaria_ml": 2000, "peso_kg": 55, "criado_em": "2026-08-09 19:20:00" }],
     "garrafas": [], "leituras_consumo": [], "lembretes": [], "metas": [], "conquistas": [] }
   ```
2. Encontra a rota, confere o token e a posse dos dados, valida com **as mesmas funções de `validacao.js`** usadas no front e aplica as regras do banco: UNIQUE, CHECK, cascata, a view e o trigger (mesmas 5 regras, na mesma ordem).
3. Grava só se tudo deu certo. Se der erro no meio, nada é salvo, como numa transação.
4. Devolve um `Response` de verdade (status + JSON), então o código das telas é o mesmo para o mock e para o backend real.

A sessão fica na chave `hydrosmart_sessao` (`{ token, usuario }`) e o tema escolhido em `hydrosmart_tema` (`"claro"` ou `"escuro"`). As senhas do mock são guardadas com SHA-256 + sal (Web Crypto), mas o localStorage não é um lugar seguro: o mock serve apenas para demonstração. O backend real usa **bcrypt**.

Para começar do zero: botão **"Restaurar dados de demonstração"** no painel, ou `localStorage.clear()` no console.

---

## 7. Migrando para um backend real (Node.js + Express + mysql2)

O front **não muda**. O passo a passo abaixo foi testado com MariaDB 10.11: o mesmo `dashboard.html` funcionou contra esta API só trocando a flag.

### 7.1. Estrutura

```
hydrosmart/
├── server/
│   ├── package.json
│   ├── .env
│   └── server.js
└── js/validacao.js    ← importado também pelo servidor (mesmas regras)
```

### 7.2. Instalação

```bash
mkdir server && cd server
npm init -y
npm pkg set type=module scripts.start="node server.js"
npm install express@5 mysql2 bcrypt jsonwebtoken cors dotenv
```

Use **Express 5**: ele encaminha automaticamente os erros de rotas `async` para o tratador de erros.

`.env` (nunca suba este arquivo para o Git):

```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASS=
JWT_SECRET=troque-por-uma-frase-longa-e-aleatoria
ORIGEM_FRONT=http://localhost:8000
PORT=3000
```

### 7.3. `server/server.js`

Pontos importantes:

- `dateStrings: true` devolve `DATETIME` como `'AAAA-MM-DD HH:MM:SS'`, o mesmo formato do mock.
- `decimalNumbers: true` faz `SUM()` e `DECIMAL` virarem `number`.
- `typeCast` converte `BOOLEAN` (`TINYINT(1)`) em `true`/`false`.
- Toda consulta usa **placeholders `?`** (prepared statements), nunca concatenação de texto do usuário.
- O trigger do banco gera as conquistas. A rota `POST /leituras` guarda o último `id` de conquista antes do `INSERT` e devolve as que surgiram depois em `conquistas_novas`.

<details>
<summary><strong>Código completo de <code>server/server.js</code> (clique para abrir)</strong></summary>

```js
// server/server.js — API REST da HydroSmart (Express 5 + mysql2)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {
  validarObjeto, validarNome, validarEmail, validarSenha, validarMeta, validarPeso,
  validarVolume, validarHora, validarDiasSemana, validarNumeroSerie,
} from '../js/validacao.js'; // mesmas regras do front

const app = express();
app.use(cors({ origin: process.env.ORIGEM_FRONT || 'http://localhost:8000' }));
app.use(express.json());

const db = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: 'hydrosmart_db',
  dateStrings: true,      // DATETIME → 'AAAA-MM-DD HH:MM:SS' (igual ao mock)
  decimalNumbers: true,   // DECIMAL/SUM → number
  typeCast(campo, proximo) { // BOOLEAN (TINYINT(1)) → true/false
    if (campo.type === 'TINY' && campo.length === 1) return campo.string() === '1';
    return proximo();
  },
});

const SEGREDO = process.env.JWT_SECRET || 'troque-este-segredo';
const COLUNAS_USUARIO = 'id, nome, email, meta_diaria_ml, peso_kg, criado_em';

/* Middlewares --------------------------------------------------------- */
function autenticar(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    req.usuarioId = jwt.verify(token, SEGREDO).sub;
    next();
  } catch {
    res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });
  }
}

// Só deixa o usuário acessar os próprios dados (/usuarios/:id, /historico/:usuario)
function exigirDono(req, res, next) {
  const alvo = Number(req.params.id ?? req.params.usuario ?? req.query.usuario_id);
  if (alvo !== req.usuarioId) return res.status(403).json({ erro: 'Você não tem permissão para acessar estes dados.' });
  next();
}

const invalido = (res, campos) => res.status(422).json({ erro: 'Confira os campos destacados.', campos });
const gerarToken = (id) => jwt.sign({ sub: id }, SEGREDO, { expiresIn: '7d' });

/* Autenticação -------------------------------------------------------- */
app.post('/api/auth/cadastro', async (req, res) => {
  const erros = validarObjeto(req.body, {
    nome: validarNome, email: validarEmail, senha: validarSenha,
    meta_diaria_ml: validarMeta, peso_kg: validarPeso,
  });
  if (Object.keys(erros).length) return invalido(res, erros);

  const { nome, email, senha, meta_diaria_ml: meta, peso_kg: peso } = req.body;
  const conexao = await db.getConnection();
  try {
    await conexao.beginTransaction();
    const [r] = await conexao.execute(
      'INSERT INTO usuarios (nome, email, senha_hash, meta_diaria_ml, peso_kg) VALUES (?, ?, ?, ?, ?)',
      [nome.trim(), email.trim().toLowerCase(), await bcrypt.hash(senha, 10), meta, peso || null],
    );
    await conexao.execute('INSERT INTO metas (usuario_id, meta_ml, data_inicio) VALUES (?, ?, CURDATE())', [r.insertId, meta]);
    await conexao.execute(
      "INSERT INTO conquistas (usuario_id, tipo, descricao, data_referencia) VALUES (?, 'boas_vindas', 'Conta criada no app HydroSmart', CURDATE())",
      [r.insertId],
    );
    // Lembretes iniciais (mesmos do mock)
    await conexao.query('INSERT INTO lembretes (usuario_id, hora, rotulo) VALUES ?', [[
      [r.insertId, '09:00', 'Bom dia, hora da água'], [r.insertId, '12:00', 'Antes do almoço'],
      [r.insertId, '15:00', 'Pausa da tarde'], [r.insertId, '18:00', 'Fim do dia'],
    ]]);
    await conexao.commit();
    const [[usuario]] = await db.execute(`SELECT ${COLUNAS_USUARIO} FROM usuarios WHERE id = ?`, [r.insertId]);
    res.status(201).json({ token: gerarToken(usuario.id), usuario });
  } catch (erro) {
    await conexao.rollback();
    if (erro.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ erro: 'Este e-mail já está cadastrado.', campos: { email: 'Este e-mail já está cadastrado. Tente entrar.' } });
    }
    throw erro; // Express 5 encaminha para o tratador de erros
  } finally {
    conexao.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  const [[usuario]] = await db.execute('SELECT * FROM usuarios WHERE email = ?', [String(req.body.email || '').trim().toLowerCase()]);
  if (!usuario || !(await bcrypt.compare(String(req.body.senha || ''), usuario.senha_hash))) {
    return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  }
  delete usuario.senha_hash;
  res.json({ token: gerarToken(usuario.id), usuario });
});

app.post('/api/auth/logout', (req, res) => res.status(204).end());

/* Usuários ------------------------------------------------------------ */
app.get('/api/usuarios/:id', autenticar, exigirDono, async (req, res) => {
  const [[usuario]] = await db.execute(`SELECT ${COLUNAS_USUARIO} FROM usuarios WHERE id = ?`, [req.usuarioId]);
  res.json(usuario);
});

// Troca de meta: encerra a meta vigente e abre outra a partir de hoje
app.patch('/api/usuarios/:id', autenticar, exigirDono, async (req, res) => {
  if ('meta_diaria_ml' in req.body) {
    const erro = validarMeta(req.body.meta_diaria_ml);
    if (erro) return invalido(res, { meta_diaria_ml: erro });
    const meta = Number(req.body.meta_diaria_ml);
    const conexao = await db.getConnection();
    try {
      await conexao.beginTransaction();
      await conexao.execute('UPDATE usuarios SET meta_diaria_ml = ? WHERE id = ?', [meta, req.usuarioId]);
      const [r] = await conexao.execute(
        "UPDATE metas SET meta_ml = ? WHERE usuario_id = ? AND status = 'ativa' AND data_inicio = CURDATE()", [meta, req.usuarioId]);
      if (r.affectedRows === 0) {
        await conexao.execute(
          "UPDATE metas SET status = 'encerrada', data_fim = CURDATE() - INTERVAL 1 DAY WHERE usuario_id = ? AND status = 'ativa'", [req.usuarioId]);
        await conexao.execute('INSERT INTO metas (usuario_id, meta_ml, data_inicio) VALUES (?, ?, CURDATE())', [req.usuarioId, meta]);
      }
      await conexao.commit();
    } catch (erro) {
      await conexao.rollback();
      throw erro;
    } finally {
      conexao.release();
    }
  }
  const [[usuario]] = await db.execute(`SELECT ${COLUNAS_USUARIO} FROM usuarios WHERE id = ?`, [req.usuarioId]);
  res.json(usuario);
});

/* Garrafas ------------------------------------------------------------ */
app.get('/api/usuarios/:id/garrafas', autenticar, exigirDono, async (req, res) => {
  const [garrafas] = await db.execute('SELECT * FROM garrafas WHERE usuario_id = ?', [req.usuarioId]);
  res.json(garrafas);
});

// Pareamento de uma garrafa nova pelo número de série
app.post('/api/garrafas', autenticar, async (req, res) => {
  const erro = validarNumeroSerie(req.body.numero_serie);
  if (erro) return invalido(res, { numero_serie: erro });
  try {
    const [r] = await db.execute(
      'INSERT INTO garrafas (usuario_id, numero_serie, nivel_ml, conectada, ultima_sincronizacao) VALUES (?, ?, 600, TRUE, NOW())',
      [req.usuarioId, req.body.numero_serie.trim().toUpperCase()],
    );
    const [[garrafa]] = await db.execute('SELECT * FROM garrafas WHERE id = ?', [r.insertId]);
    res.status(201).json(garrafa);
  } catch (falha) {
    if (falha.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ erro: 'Esta garrafa já está pareada.', campos: { numero_serie: 'Este número de série já está pareado com uma conta.' } });
    }
    throw falha;
  }
});

app.patch('/api/garrafas/:id', autenticar, async (req, res) => {
  const [[garrafa]] = await db.execute('SELECT * FROM garrafas WHERE id = ?', [req.params.id]);
  if (!garrafa) return res.status(404).json({ erro: 'Garrafa não encontrada.' });
  if (garrafa.usuario_id !== req.usuarioId) return res.status(403).json({ erro: 'Sem permissão.' });
  const campos = ['status', 'nivel_ml', 'bateria_pct', 'conectada'].filter((c) => c in req.body);
  if (campos.length) {
    await db.execute(
      `UPDATE garrafas SET ${campos.map((c) => `${c} = ?`).join(', ')},
              ultima_sincronizacao = IF(conectada, NOW(), ultima_sincronizacao) WHERE id = ?`,
      [...campos.map((c) => req.body[c]), garrafa.id],
    ); // CHECKs do banco barram nível/bateria fora da faixa
  }
  const [[atualizada]] = await db.execute('SELECT * FROM garrafas WHERE id = ?', [garrafa.id]);
  res.json(atualizada);
});

/* Leituras do sensor -------------------------------------------------- */
app.post('/api/leituras', autenticar, async (req, res) => {
  const { garrafa_id: garrafaId, volume_ml: volume, nivel_ml: nivel, bateria_pct: bateria } = req.body;
  const erro = validarVolume(volume);
  if (erro) return invalido(res, { volume_ml: erro });

  const [[garrafa]] = await db.execute('SELECT * FROM garrafas WHERE id = ?', [garrafaId]);
  if (!garrafa) return res.status(404).json({ erro: 'Garrafa não encontrada.' });
  if (garrafa.usuario_id !== req.usuarioId) return res.status(403).json({ erro: 'Sem permissão.' });
  if (garrafa.status !== 'ativa') return res.status(409).json({ erro: 'A garrafa está inativa ou em manutenção.' });

  // Guarda o último id de conquista para descobrir o que o TRIGGER criou
  const [[{ ultima }]] = await db.execute('SELECT COALESCE(MAX(id), 0) AS ultima FROM conquistas WHERE usuario_id = ?', [req.usuarioId]);
  const [r] = await db.execute('INSERT INTO leituras_consumo (garrafa_id, volume_ml) VALUES (?, ?)', [garrafa.id, volume]);
  await db.execute(
    'UPDATE garrafas SET nivel_ml = ?, bateria_pct = COALESCE(?, bateria_pct), conectada = TRUE, ultima_sincronizacao = NOW() WHERE id = ?',
    [nivel ?? Math.max(0, garrafa.nivel_ml - volume), bateria ?? null, garrafa.id],
  );

  const [[leitura]] = await db.execute('SELECT * FROM leituras_consumo WHERE id = ?', [r.insertId]);
  const [[atualizada]] = await db.execute('SELECT * FROM garrafas WHERE id = ?', [garrafa.id]);
  const [novas] = await db.execute('SELECT * FROM conquistas WHERE usuario_id = ? AND id > ?', [req.usuarioId, ultima]);
  res.status(201).json({ leitura, garrafa: atualizada, conquistas_novas: novas });
});

app.get('/api/leituras', autenticar, exigirDono, async (req, res) => {
  const [leituras] = await db.execute(
    `SELECT l.* FROM leituras_consumo l JOIN garrafas g ON g.id = l.garrafa_id
      WHERE g.usuario_id = ? AND (? IS NULL OR DATE(l.lido_em) = ?)
      ORDER BY l.lido_em DESC`,
    [req.usuarioId, req.query.data ?? null, req.query.data ?? null],
  );
  res.json(leituras);
});

/* Histórico (VIEW + calendário para os dias sem leitura) --------------- */
app.get('/api/historico/:usuario', autenticar, exigirDono, async (req, res) => {
  const dias = Math.min(90, Math.max(1, Number(req.query.dias) || 7));
  const [linhas] = await db.query(
    `WITH RECURSIVE calendario AS (
       SELECT CURDATE() - INTERVAL ? DAY AS dia
       UNION ALL
       SELECT dia + INTERVAL 1 DAY FROM calendario WHERE dia < CURDATE()
     )
     SELECT DATE_FORMAT(c.dia, '%Y-%m-%d')  AS dia,
            COALESCE(v.total_ml, 0)         AS total_ml,
            COALESCE(v.qtd_leituras, 0)     AS qtd_leituras,
            COALESCE(v.meta_ml,
              (SELECT m.meta_ml FROM metas m
                WHERE m.usuario_id = ? AND m.status <> 'cancelada'
                  AND m.data_inicio <= c.dia AND (m.data_fim IS NULL OR m.data_fim >= c.dia)
                ORDER BY m.data_inicio DESC LIMIT 1),
              (SELECT meta_diaria_ml FROM usuarios WHERE id = ?)) AS meta_ml,
            COALESCE(v.percentual, 0)       AS percentual,
            COALESCE(v.meta_atingida, 0)    AS meta_atingida
       FROM calendario c
       LEFT JOIN vw_progresso_diario v ON v.dia = c.dia AND v.usuario_id = ?
      ORDER BY c.dia`,
    [dias - 1, req.usuarioId, req.usuarioId, req.usuarioId],
  );
  res.json(linhas);
});

/* Lembretes (CRUD) ---------------------------------------------------- */
function validarLembrete(corpo) {
  const erros = validarObjeto(corpo, { hora: validarHora, dias_semana: validarDiasSemana });
  if (String(corpo.rotulo || '').length > 60) erros.rotulo = 'Use até 60 caracteres.';
  return erros;
}

const conflitoHorario = (res) => res.status(409).json({ erro: 'Já existe um lembrete neste horário.', campos: { hora: 'Você já tem um lembrete neste horário.' } });

app.get('/api/usuarios/:id/lembretes', autenticar, exigirDono, async (req, res) => {
  const [lembretes] = await db.execute('SELECT * FROM lembretes WHERE usuario_id = ? ORDER BY hora', [req.usuarioId]);
  res.json(lembretes);
});

app.post('/api/lembretes', autenticar, async (req, res) => {
  const erros = validarLembrete(req.body);
  if (Object.keys(erros).length) return invalido(res, erros);
  const { hora, dias_semana: dias, rotulo, ativo = true } = req.body;
  try {
    const [r] = await db.execute(
      'INSERT INTO lembretes (usuario_id, hora, dias_semana, rotulo, ativo) VALUES (?, ?, ?, ?, ?)',
      [req.usuarioId, hora, dias, rotulo || null, Boolean(ativo)],
    );
    const [[lembrete]] = await db.execute('SELECT * FROM lembretes WHERE id = ?', [r.insertId]);
    res.status(201).json(lembrete);
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') return conflitoHorario(res);
    throw erro;
  }
});

// PUT (edição completa) e PATCH (ex.: só { ativo }) usam o mesmo código
async function atualizarLembrete(req, res) {
  const [[atual]] = await db.execute('SELECT * FROM lembretes WHERE id = ? AND usuario_id = ?', [req.params.id, req.usuarioId]);
  if (!atual) return res.status(404).json({ erro: 'Lembrete não encontrado.' });
  const dados = { ...atual, ...req.body };
  const erros = validarLembrete(dados);
  if (Object.keys(erros).length) return invalido(res, erros);
  try {
    await db.execute(
      'UPDATE lembretes SET hora = ?, dias_semana = ?, rotulo = ?, ativo = ? WHERE id = ?',
      [dados.hora, dados.dias_semana, dados.rotulo || null, Boolean(dados.ativo), atual.id],
    );
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') return conflitoHorario(res);
    throw erro;
  }
  const [[lembrete]] = await db.execute('SELECT * FROM lembretes WHERE id = ?', [atual.id]);
  res.json(lembrete);
}
app.put('/api/lembretes/:id', autenticar, atualizarLembrete);
app.patch('/api/lembretes/:id', autenticar, atualizarLembrete);

app.delete('/api/lembretes/:id', autenticar, async (req, res) => {
  const [r] = await db.execute('DELETE FROM lembretes WHERE id = ? AND usuario_id = ?', [req.params.id, req.usuarioId]);
  if (r.affectedRows === 0) return res.status(404).json({ erro: 'Lembrete não encontrado.' });
  res.status(204).end();
});

/* Metas e conquistas -------------------------------------------------- */
app.get('/api/usuarios/:id/metas', autenticar, exigirDono, async (req, res) => {
  const [metas] = await db.execute('SELECT * FROM metas WHERE usuario_id = ? ORDER BY data_inicio DESC', [req.usuarioId]);
  res.json(metas);
});

app.get('/api/usuarios/:id/conquistas', autenticar, exigirDono, async (req, res) => {
  const [conquistas] = await db.execute('SELECT * FROM conquistas WHERE usuario_id = ? ORDER BY obtida_em DESC', [req.usuarioId]);
  res.json(conquistas);
});

/* Erros --------------------------------------------------------------- */
app.use((erro, req, res, _next) => {
  console.error(erro);
  if (erro.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || erro.errno === 4025 || erro.errno === 3819) {
    return res.status(422).json({ erro: 'Valor fora da faixa permitida.' });
  }
  res.status(500).json({ erro: 'Erro interno no servidor.' });
});

app.listen(process.env.PORT || 3000, () => console.log('API HydroSmart em http://localhost:3000/api'));
```

</details>

### 7.4. Ligar o front ao backend

1. Importe o banco (`database/database.sql`) e rode `npm start` dentro de `server/`.
2. Em `js/api.js`, troque:
   ```js
   export const CONFIG = {
     usarMock: false,                          // ← era true
     baseURL: 'http://localhost:3000/api',
   };
   ```
3. Sirva o front (por exemplo `npx serve . -l 8000`) e entre com `ana@hydrosmart.com.br` / `hydro123`. Os seeds do SQL usam hashes bcrypt dessa senha.

Se quiser front e API na mesma origem (sem CORS), sirva só os arquivos públicos (nunca a pasta inteira, que contém o `.env`) e use `baseURL: '/api'`:

```js
import path from 'node:path';
const raiz = path.resolve(import.meta.dirname, '..');
for (const pasta of ['css', 'js', 'assets']) app.use(`/${pasta}`, express.static(path.join(raiz, pasta)));
for (const pagina of ['index.html', 'dashboard.html']) app.get(`/${pagina}`, (req, res) => res.sendFile(path.join(raiz, pagina)));
app.get('/', (req, res) => res.sendFile(path.join(raiz, 'index.html')));
```

### 7.5. Antes de ir para produção

- HTTPS e `JWT_SECRET` forte. Avalie guardar o token em cookie `HttpOnly` + `SameSite` em vez do localStorage.
- `helmet` (cabeçalhos de segurança) e `express-rate-limit` no login e no cadastro.
- Um usuário MySQL próprio da aplicação, só com `SELECT/INSERT/UPDATE/DELETE` em `hydrosmart_db`.
- Logs estruturados e backup diário do banco.

---

## 8. Acessibilidade e design

- **HTML semântico:** `header`, `nav`, `main`, `section`, `article`, `footer`, `dl`, `table` com `caption` e `scope`, listas ordenadas para passos e linha do tempo.
- **Teclado:** link "Pular para o conteúdo", foco visível em todos os controles, abas no padrão WAI-ARIA (setas, Home, End), diálogos nativos `<dialog>` (Esc fecha e o foco fica preso dentro), menu fecha com Esc.
- **Leitores de tela:** `aria-label`, `aria-expanded`, `aria-current`, `role="switch"` com `aria-checked`, `role="progressbar"` com `aria-valuetext`, erros ligados aos campos por `aria-describedby` e `aria-invalid`, avisos em regiões `aria-live`.
- **Gráfico acessível:** cada barra é focável e tem descrição completa; dica no hover e no foco; tabela "Ver dados em tabela" com os mesmos números; nenhuma informação depende só de cor (ícones e texto acompanham status).
- **Contraste:** textos com contraste mínimo de 4,5:1 (cinzas e azuis conferidos), barras do gráfico ≥ 3:1 contra o fundo.
- **Movimento:** animações de revelação ao rolar com `IntersectionObserver` e desligadas com `prefers-reduced-motion`. Sem JavaScript, todo o conteúdo continua visível.
- **Modo escuro:** todas as cores são variáveis em `:root`; o tema escuro só redefine essas variáveis em `:root[data-tema="escuro"]` (com `color-scheme: dark` para campos e barras de rolagem). Um script curto no `<head>` aplica o tema antes de desenhar a página, evitando o "piscar" de claro para escuro. O botão usa `aria-pressed` ("Modo escuro" ligado/desligado).
- **Paleta:** tirada da apresentação, com azul-marinho → azul → ciano da garrafa sobre branco e azul-gelo, e o violeta dos títulos como cor de destaque. Todas as cores, espaçamentos, raios e sombras são variáveis em `:root`.
- **Responsivo:** mobile-first com breakpoints em **480px**, **768px** e **1024px**. O painel usa grid de 12 colunas no desktop e o gráfico é redesenhado na largura real do cartão (`ResizeObserver`).

---

## 9. Testes realizados nesta entrega

| O quê | Como | Resultado |
|---|---|---|
| `database.sql` | Importado 2× seguidas no MariaDB 10.11 | Idempotente; 37 leituras → 14 conquistas pelo trigger; view, CTE de calendário e consulta de lembretes de hoje conferidas; todos os CHECK, UNIQUE, FK e CASCADE testados com inserções inválidas |
| `database.sqlite.sql` | SQLite 3.45 | Mesmos 14 registros de conquistas e mesma view do MySQL |
| Mock REST | 30 verificações em Node (cadastro, login, 401/403/409/422, CRUD de lembretes, troca de meta, trigger, pareamento, reset) | Todas passaram; conquistas e histórico idênticos aos do SQL |
| Interface | Chromium (Playwright) em 390, 800, 1024 e 1280 px | Fluxos de cadastro, login, gole, garrafa, meta e CRUD de lembretes; sem erros no console; sem rolagem horizontal |
| Acessibilidade | axe-core (regras WCAG 2 A/AA) na landing, no painel e no diálogo, nos temas claro e escuro | Nenhuma violação, inclusive de contraste |
| Navegação Site/Sair | Live Server, Five Server, serve, http-server e lite-server | Volta para a raiz do site em todos |
| Backend real | `server.js` acima + MariaDB, com o front em `usarMock: false` | Login, painel, leituras, lembretes e troca de meta funcionando sem mudar o front |

---

## 10. Próximos passos

1. **Backend real:** colocar o `server.js` da seção 7 em produção (Render, Railway, VPS) com um MySQL gerenciado. Depois, adicionar testes automatizados (Vitest para `validacao.js`/`utils.js`, Playwright para os fluxos) e CI no GitHub Actions.
2. **Integração BLE com a garrafa:**
   - Firmware (ex.: ESP32 ou nRF52) expõe um serviço GATT próprio com uma *characteristic* de **notificação** por gole (`volume_ml` + `timestamp`) e o **Battery Service** padrão (`0x180F`, nível em `0x2A19`).
   - Protótipo web: **Web Bluetooth** no Chrome/Edge (Android e desktop), com `navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'HydroSmart' }] })` e `startNotifications()` → cada notificação vira um `api.registrarLeitura(...)`. O Safari/iOS não oferece Web Bluetooth.
   - App mobile: React Native + `react-native-ble-plx` ou Flutter + `flutter_blue_plus`.
   - Sincronização offline: a garrafa guarda as leituras com horário enquanto está desconectada e envia em lote depois. Para isso, `POST /leituras` deve aceitar `lido_em` (o mock já aceita) e um identificador para evitar leituras duplicadas.
3. **Notificações push:**
   - Web/PWA: `manifest.json` + Service Worker + Push API com chaves VAPID (biblioteca `web-push`), guardando as inscrições numa tabela `inscricoes_push (usuario_id, endpoint, p256dh, auth)`.
   - App nativo: Firebase Cloud Messaging (Android) e APNs (iOS).
   - Agendador no servidor (cron a cada minuto) consulta `lembretes` com `FIND_IN_SET(DAYOFWEEK(CURDATE()) - 1, dias_semana)` e a hora atual. **Lembrete inteligente:** não avisar quem já bateu a meta do dia ou bebeu nos últimos 30 minutos.
4. **Produto:** sugestão de meta por clima e atividade física, relatórios semanais por e-mail, compartilhamento de conquistas.
5. **LGPD:** termo de consentimento no cadastro, exportação dos dados e exclusão de conta. O `ON DELETE CASCADE` já remove tudo do usuário, e o mock tem a rota `DELETE /usuarios/:id`.

---

<sub>As metas sugeridas (≈ 35 ml por kg) são uma referência geral e não substituem orientação de um profissional de saúde.</sub>
