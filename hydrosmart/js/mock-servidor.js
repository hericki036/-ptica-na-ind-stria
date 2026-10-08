/**
 * js/mock-servidor.js
 * Servidor REST SIMULADO que roda dentro do navegador.
 *
 * Por que existe: nesta primeira entrega não há backend. O api.js chama
 * `mockFetch(url, opcoes)` com os MESMOS argumentos que passaria para
 * `fetch()`, e este módulo devolve um objeto `Response` de verdade.
 * Para trocar pelo backend real basta CONFIG.usarMock = false no api.js.
 *
 * Persistência: localStorage, chave 'hydrosmart_db', com as MESMAS
 * tabelas e colunas do database/database.sql:
 *   usuarios, garrafas, leituras_consumo, lembretes, metas, conquistas
 * Regras do banco também são reproduzidas aqui: UNIQUE, CHECK, FK com
 * ON DELETE CASCADE, a VIEW vw_progresso_diario e o TRIGGER de conquistas.
 *
 * "Transação": cada requisição lê o banco do localStorage, trabalha numa
 * cópia em memória e só grava se terminar sem erro (rollback automático).
 */

import {
  validarNome, validarEmail, validarSenha, validarMeta, validarPeso,
  validarVolume, validarHora, validarDiasSemana, validarNumeroSerie,
  validarObjeto,
} from './validacao.js';
import {
  dataSQL, dataHoraSQL, paraDate, adicionarDias, hojeSQL, normalizarHora, esperar,
} from './utils.js';

const CHAVE_BANCO = 'hydrosmart_db';
const VERSAO_BANCO = 1;
const LATENCIA_MS = 120;                         // simula a ida e volta da rede
const VALIDADE_TOKEN_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const SENHA_DEMO = 'hydro123'; // mesma senha dos seeds do database.sql

const TABELAS = ['usuarios', 'garrafas', 'leituras_consumo', 'lembretes', 'metas', 'conquistas'];

/* ==================================================================== */
/* 1. Armazenamento (localStorage com plano B em memória)                */
/* ==================================================================== */

let memoriaReserva = null; // usado se o localStorage estiver bloqueado
let semeando = null;       // evita semear duas vezes em requisições paralelas

function lerArmazenamento() {
  try {
    const bruto = localStorage.getItem(CHAVE_BANCO);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return memoriaReserva ? structuredClone(memoriaReserva) : null;
  }
}

function gravarArmazenamento(banco) {
  try {
    localStorage.setItem(CHAVE_BANCO, JSON.stringify(banco));
  } catch {
    memoriaReserva = structuredClone(banco);
  }
}

function bancoVazio() {
  const banco = { versao: VERSAO_BANCO, sequencias: {} };
  for (const tabela of TABELAS) {
    banco[tabela] = [];
    banco.sequencias[tabela] = 0;
  }
  return banco;
}

/** Devolve uma cópia do banco; cria e popula (seeds) se ainda não existir */
async function obterBanco() {
  const salvo = lerArmazenamento();
  if (salvo && salvo.versao === VERSAO_BANCO) return salvo;

  if (!semeando) {
    semeando = (async () => {
      const banco = bancoVazio();
      await semear(banco);
      gravarArmazenamento(banco);
      return banco;
    })().finally(() => { semeando = null; });
  }
  return structuredClone(await semeando);
}

/** INSERT: gera o id (AUTO_INCREMENT) e adiciona a linha na tabela */
function inserir(banco, tabela, registro) {
  banco.sequencias[tabela] += 1;
  const linha = { id: banco.sequencias[tabela], ...registro };
  banco[tabela].push(linha);
  return linha;
}

/* ==================================================================== */
/* 2. Erros HTTP, respostas e senha                                       */
/* ==================================================================== */

class ErroHttp extends Error {
  constructor(status, mensagem, campos = undefined) {
    super(mensagem);
    this.status = status;
    this.campos = campos;
  }
}

function resposta(status, dados) {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(dados ?? null), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function hexAleatorio(bytes = 16) {
  const valores = crypto.getRandomValues(new Uint8Array(bytes));
  return [...valores].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash da senha no mock: SHA-256(sal:senha) via Web Crypto.
 * O backend real deve usar bcrypt (ver README). Se a página for aberta
 * fora de um "contexto seguro" (ex.: http://192.168.x.x), crypto.subtle
 * não existe e usamos FNV-1a — apenas para a demonstração funcionar.
 */
async function resumo(algoritmo, texto) {
  if (algoritmo === 'sha256') {
    if (!globalThis.crypto?.subtle) {
      throw new ErroHttp(503, 'Abra o site por http://localhost para usar a criptografia do navegador.');
    }
    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // FNV-1a 32 bits repetido (NÃO é seguro — só fallback de demonstração)
  let hash = 0x811c9dc5;
  let saida = '';
  for (let rodada = 0; rodada < 4; rodada += 1) {
    for (const caractere of `${rodada}${texto}`) {
      hash ^= caractere.codePointAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    saida += hash.toString(16).padStart(8, '0');
  }
  return saida;
}

async function gerarHashSenha(senha) {
  const algoritmo = globalThis.crypto?.subtle ? 'sha256' : 'fnv1a';
  const sal = hexAleatorio(16);
  return `${algoritmo}$${sal}$${await resumo(algoritmo, `${sal}:${senha}`)}`;
}

async function conferirSenha(senha, hashSalvo) {
  const [algoritmo, sal, esperado] = String(hashSalvo).split('$');
  return (await resumo(algoritmo, `${sal}:${senha}`)) === esperado;
}

/* Token no estilo JWT (sem assinatura — é só uma simulação) */
function gerarToken(usuarioId) {
  const carga = btoa(JSON.stringify({ sub: usuarioId, exp: Date.now() + VALIDADE_TOKEN_MS }));
  return `mock.${carga}.${hexAleatorio(8)}`;
}

function autenticar(banco, cabecalhos = {}) {
  const autorizacao = cabecalhos.Authorization || cabecalhos.authorization || '';
  const token = autorizacao.replace(/^Bearer\s+/i, '');
  try {
    const [prefixo, carga] = token.split('.');
    if (prefixo !== 'mock') throw new Error();
    const { sub, exp } = JSON.parse(atob(carga));
    const usuario = banco.usuarios.find((u) => u.id === sub);
    if (!usuario || Date.now() > exp) throw new Error();
    return usuario;
  } catch {
    throw new ErroHttp(401, 'Sessão expirada. Entre novamente.');
  }
}

/** Garante que o usuário autenticado só acesse os próprios dados */
function exigirDono(usuarioAuth, usuarioId) {
  if (Number(usuarioId) !== usuarioAuth.id) {
    throw new ErroHttp(403, 'Você não tem permissão para acessar estes dados.');
  }
}

/** Remove a senha antes de devolver o usuário (nunca expor senha_hash) */
function usuarioPublico({ senha_hash: _omitida, ...usuario }) {
  return usuario;
}

function exigirValidos(erros) {
  if (Object.keys(erros).length) throw new ErroHttp(422, 'Confira os campos destacados.', erros);
}

/* ==================================================================== */
/* 3. Regras de banco: meta do dia, VIEW e TRIGGER                       */
/* ==================================================================== */

/** Meta vigente num dia (tabela metas → senão usuarios.meta_diaria_ml) */
function metaDoDia(banco, usuarioId, dia) {
  const vigente = banco.metas
    .filter((m) => m.usuario_id === usuarioId
      && m.status !== 'cancelada'
      && m.data_inicio <= dia
      && (m.data_fim === null || m.data_fim >= dia))
    .sort((a, b) => b.data_inicio.localeCompare(a.data_inicio))[0];
  if (vigente) return vigente.meta_ml;
  return banco.usuarios.find((u) => u.id === usuarioId)?.meta_diaria_ml ?? 2000;
}

function leiturasDoUsuario(banco, usuarioId) {
  const garrafas = new Set(banco.garrafas.filter((g) => g.usuario_id === usuarioId).map((g) => g.id));
  return banco.leituras_consumo.filter((l) => garrafas.has(l.garrafa_id));
}

/** Equivalente à VIEW vw_progresso_diario (só dias com leituras) */
function vwProgressoDiario(banco, usuarioId) {
  const porDia = new Map();
  for (const leitura of leiturasDoUsuario(banco, usuarioId)) {
    const dia = leitura.lido_em.slice(0, 10);
    const atual = porDia.get(dia) || { total_ml: 0, qtd_leituras: 0 };
    atual.total_ml += leitura.volume_ml;
    atual.qtd_leituras += 1;
    porDia.set(dia, atual);
  }
  const usuario = banco.usuarios.find((u) => u.id === usuarioId);
  return [...porDia.entries()].map(([dia, soma]) => linhaProgresso(banco, usuario, dia, soma));
}

function linhaProgresso(banco, usuario, dia, { total_ml, qtd_leituras }) {
  const meta_ml = metaDoDia(banco, usuario.id, dia);
  return {
    usuario_id: usuario.id,
    nome: usuario.nome,
    dia,
    total_ml,
    qtd_leituras,
    meta_ml,
    percentual: Math.round((total_ml * 1000) / meta_ml) / 10,
    meta_atingida: total_ml >= meta_ml ? 1 : 0,
  };
}

/**
 * Equivalente ao TRIGGER trg_leituras_conquistas (AFTER INSERT).
 * Mesmas 5 regras, na mesma ordem, do database.sql.
 */
function triggerConquistas(banco, leitura) {
  const usuarioId = banco.garrafas.find((g) => g.id === leitura.garrafa_id).usuario_id;
  const dia = leitura.lido_em.slice(0, 10);
  const leituras = leiturasDoUsuario(banco, usuarioId);
  const totalDia = leituras.filter((l) => l.lido_em.startsWith(dia)).reduce((s, l) => s + l.volume_ml, 0);
  const totalGeral = leituras.reduce((s, l) => s + l.volume_ml, 0);
  const meta = metaDoDia(banco, usuarioId, dia);

  const possui = (tipo, referencia) => banco.conquistas.some((c) => c.usuario_id === usuarioId
    && c.tipo === tipo && (referencia === undefined || c.data_referencia === referencia));
  const conceder = (tipo, descricao) => inserir(banco, 'conquistas', {
    usuario_id: usuarioId, tipo, descricao, data_referencia: dia, obtida_em: leitura.lido_em,
  });
  const metasNosUltimos = (dias) => banco.conquistas.filter((c) => c.usuario_id === usuarioId
    && c.tipo === 'meta_diaria'
    && c.data_referencia >= adicionarDias(dia, -(dias - 1))
    && c.data_referencia <= dia).length;

  if (!possui('primeiro_gole')) conceder('primeiro_gole', 'Primeira leitura registrada pelo sensor');
  if (totalDia >= meta && !possui('meta_diaria', dia)) conceder('meta_diaria', `Meta de ${meta} ml atingida`);
  if (metasNosUltimos(3) === 3 && !possui('sequencia_3_dias')) conceder('sequencia_3_dias', 'Meta batida 3 dias seguidos');
  if (metasNosUltimos(7) === 7 && !possui('sequencia_7_dias')) conceder('sequencia_7_dias', 'Meta batida 7 dias seguidos');
  if (totalGeral >= 10000 && !possui('dez_litros')) conceder('dez_litros', '10 litros de água registrados');
}

/** Encerra a meta vigente e abre uma nova a partir de hoje */
function registrarNovaMeta(banco, usuarioId, metaMl) {
  const hoje = hojeSQL();
  const vigente = banco.metas.find((m) => m.usuario_id === usuarioId && m.status === 'ativa');
  if (vigente) {
    if (vigente.data_inicio === hoje) {
      vigente.meta_ml = metaMl; // trocou de novo no mesmo dia: só atualiza
      return;
    }
    vigente.data_fim = adicionarDias(hoje, -1);
    vigente.status = 'encerrada';
  }
  inserir(banco, 'metas', { usuario_id: usuarioId, meta_ml: metaMl, data_inicio: hoje, data_fim: null, status: 'ativa' });
}

/* ==================================================================== */
/* 4. Seeds — os mesmos dados do database.sql (datas relativas a hoje)   */
/* ==================================================================== */

/** Data/hora relativa: (-2, '07:30') → anteontem às 07:30 */
function momento(diasAtras, hora) {
  const data = new Date();
  data.setHours(0, 0, 0, 0);
  data.setDate(data.getDate() + diasAtras);
  const [h, m] = hora.split(':').map(Number);
  data.setHours(h, m, 0, 0);
  return data;
}

/** Leituras de "hoje" com horário no futuro são trazidas para antes de agora */
function momentoPassado(diasAtras, hora, recuoMin = 0) {
  const data = momento(diasAtras, hora);
  const agora = new Date();
  if (data > agora) {
    const ajustada = new Date(agora.getTime() - (recuoMin + 1) * 60000);
    const inicioDoDia = momento(0, '00:00');
    return dataHoraSQL(ajustada < inicioDoDia ? inicioDoDia : ajustada);
  }
  return dataHoraSQL(data);
}

const SEED = {
  usuarios: [
    { nome: 'Ana Souza', email: 'ana@hydrosmart.com.br', meta_diaria_ml: 2000, peso_kg: 55, criado: [-60, '19:20'] },
    { nome: 'Bruno Lima', email: 'bruno@hydrosmart.com.br', meta_diaria_ml: 2500, peso_kg: 80, criado: [-30, '08:45'] },
    { nome: 'Carla Mendes', email: 'carla@hydrosmart.com.br', meta_diaria_ml: 3500, peso_kg: 65, criado: [-30, '06:10'] },
  ],
  garrafas: [
    { usuario_id: 1, numero_serie: 'HS600-2026-000101', nivel_ml: 350, bateria_pct: 78, conectada: true, sinc: [0, '10:30'], criado: [-60, '19:25'] },
    { usuario_id: 2, numero_serie: 'HS600-2026-000102', nivel_ml: 100, bateria_pct: 41, conectada: false, sinc: [0, '09:00'], criado: [-30, '08:50'] },
    { usuario_id: 3, numero_serie: 'HS600-2026-000103', nivel_ml: 0, bateria_pct: 92, conectada: true, sinc: [0, '06:40'], criado: [-30, '06:15'] },
  ],
  metas: [
    { usuario_id: 1, meta_ml: 1500, inicio: -60, fim: -31, status: 'encerrada' },
    { usuario_id: 1, meta_ml: 2000, inicio: -30, fim: null, status: 'ativa' },
    { usuario_id: 2, meta_ml: 2500, inicio: -30, fim: null, status: 'ativa' },
    { usuario_id: 3, meta_ml: 3500, inicio: -30, fim: null, status: 'ativa' },
  ],
  lembretes: [
    [1, '07:30', '1,2,3,4,5', 'Ao acordar', true],
    [1, '10:00', '1,2,3,4,5', 'Intervalo da aula', true],
    [1, '12:30', '0,1,2,3,4,5,6', 'Depois do almoço', true],
    [1, '15:30', '1,2,3,4,5', 'Pausa nos estudos', true],
    [1, '19:00', '0,1,2,3,4,5,6', 'Antes do jantar', true],
    [1, '22:00', '0,6', 'Fim de semana à noite', false],
    [2, '09:00', '1,2,3,4,5', 'Chegada no trabalho', true],
    [2, '14:00', '1,2,3,4,5', 'Depois da reunião', true],
    [3, '06:00', '0,1,2,3,4,5,6', 'Antes do treino', true],
    [3, '17:00', '1,3,5', 'Treino da tarde', true],
  ],
  // [garrafa_id, volume_ml, dias atrás, hora] — 37 leituras em ordem cronológica
  leituras: [
    [1, 500, -6, '07:40'], [1, 450, -6, '10:15'], [1, 600, -6, '13:30'], [1, 500, -6, '17:20'],
    [1, 400, -5, '08:05'], [1, 350, -5, '12:40'], [1, 500, -5, '19:10'],
    [1, 600, -4, '07:55'], [1, 500, -4, '11:20'], [1, 450, -4, '15:05'], [1, 500, -4, '20:30'],
    [1, 550, -3, '08:20'], [1, 600, -3, '12:10'], [1, 500, -3, '16:45'], [1, 400, -3, '21:00'],
    [1, 500, -2, '07:30'], [1, 600, -2, '10:50'], [1, 450, -2, '14:15'], [1, 500, -2, '18:40'],
    [1, 300, -1, '09:10'], [1, 400, -1, '13:00'], [1, 350, -1, '16:30'],
    [1, 450, 0, '08:10'], [1, 300, 0, '10:30'],
    [2, 600, -1, '08:30'], [2, 600, -1, '11:00'], [2, 500, -1, '14:20'], [2, 500, -1, '17:45'], [2, 300, -1, '20:15'],
    [2, 500, 0, '09:00'],
    [3, 600, -1, '06:15'], [3, 600, -1, '08:00'], [3, 500, -1, '10:30'], [3, 600, -1, '13:15'],
    [3, 600, -1, '17:30'], [3, 600, -1, '19:45'],
    [3, 600, 0, '06:40'],
  ],
};

async function semear(banco) {
  for (const u of SEED.usuarios) {
    const criado_em = dataHoraSQL(momento(...u.criado));
    const usuario = inserir(banco, 'usuarios', {
      nome: u.nome,
      email: u.email,
      senha_hash: await gerarHashSenha(SENHA_DEMO),
      meta_diaria_ml: u.meta_diaria_ml,
      peso_kg: u.peso_kg,
      criado_em,
    });
    inserir(banco, 'conquistas', {
      usuario_id: usuario.id, tipo: 'boas_vindas', descricao: 'Conta criada no app HydroSmart',
      data_referencia: criado_em.slice(0, 10), obtida_em: criado_em,
    });
  }

  for (const g of SEED.garrafas) {
    inserir(banco, 'garrafas', {
      usuario_id: g.usuario_id,
      modelo: 'HydroSmart 600',
      numero_serie: g.numero_serie,
      capacidade_ml: 600,
      status: 'ativa',
      nivel_ml: g.nivel_ml,
      bateria_pct: g.bateria_pct,
      conectada: g.conectada,
      ultima_sincronizacao: momentoPassado(...g.sinc),
      criado_em: dataHoraSQL(momento(...g.criado)),
    });
  }

  // Metas antes das leituras, para o "trigger" encontrar a meta do dia
  for (const m of SEED.metas) {
    inserir(banco, 'metas', {
      usuario_id: m.usuario_id,
      meta_ml: m.meta_ml,
      data_inicio: dataSQL(momento(m.inicio, '00:00')),
      data_fim: m.fim === null ? null : dataSQL(momento(m.fim, '00:00')),
      status: m.status,
    });
  }

  for (const [usuario_id, hora, dias_semana, rotulo, ativo] of SEED.lembretes) {
    inserir(banco, 'lembretes', {
      usuario_id, hora: normalizarHora(hora), dias_semana, rotulo, ativo,
      criado_em: banco.usuarios[usuario_id - 1].criado_em,
    });
  }

  SEED.leituras.forEach(([garrafa_id, volume_ml, dias, hora], indice) => {
    // recuo decrescente mantém a ordem cronológica das leituras de hoje
    const leitura = inserir(banco, 'leituras_consumo', {
      garrafa_id, volume_ml, lido_em: momentoPassado(dias, hora, SEED.leituras.length - indice),
    });
    triggerConquistas(banco, leitura);
  });
}

/* ==================================================================== */
/* 5. Rotas REST                                                          */
/* ==================================================================== */

const rotas = [];

/** Registra uma rota. ':param' vira parâmetro; publica = sem login */
function rota(metodo, padrao, manipulador, { publica = false } = {}) {
  const chaves = [];
  const fonte = padrao.replace(/:(\w+)/g, (_, chave) => { chaves.push(chave); return '([^/]+)'; });
  rotas.push({ metodo, regex: new RegExp(`^${fonte}/?$`), chaves, manipulador, publica });
}

/* ---------- Autenticação ---------- */

rota('POST', '/auth/cadastro', async ({ banco, corpo }) => {
  exigirValidos(validarObjeto(corpo, {
    nome: validarNome, email: validarEmail, senha: validarSenha,
    meta_diaria_ml: validarMeta, peso_kg: validarPeso,
  }));

  const email = corpo.email.trim().toLowerCase();
  if (banco.usuarios.some((u) => u.email.toLowerCase() === email)) {
    throw new ErroHttp(409, 'Este e-mail já está cadastrado.', { email: 'Este e-mail já está cadastrado. Tente entrar.' });
  }

  const agora = dataHoraSQL();
  const usuario = inserir(banco, 'usuarios', {
    nome: corpo.nome.trim(),
    email,
    senha_hash: await gerarHashSenha(corpo.senha),
    meta_diaria_ml: Number(corpo.meta_diaria_ml),
    peso_kg: corpo.peso_kg === '' || corpo.peso_kg == null ? null : Number(corpo.peso_kg),
    criado_em: agora,
  });

  registrarNovaMeta(banco, usuario.id, usuario.meta_diaria_ml);
  inserir(banco, 'conquistas', {
    usuario_id: usuario.id, tipo: 'boas_vindas', descricao: 'Conta criada no app HydroSmart',
    data_referencia: agora.slice(0, 10), obtida_em: agora,
  });

  // Lembretes iniciais para a pessoa já começar com uma rotina
  [['09:00', 'Bom dia, hora da água'], ['12:00', 'Antes do almoço'], ['15:00', 'Pausa da tarde'], ['18:00', 'Fim do dia']]
    .forEach(([hora, rotulo]) => inserir(banco, 'lembretes', {
      usuario_id: usuario.id, hora: normalizarHora(hora), dias_semana: '0,1,2,3,4,5,6', rotulo, ativo: true, criado_em: agora,
    }));

  return { status: 201, dados: { token: gerarToken(usuario.id), usuario: usuarioPublico(usuario) } };
}, { publica: true });

rota('POST', '/auth/login', async ({ banco, corpo }) => {
  const email = String(corpo.email ?? '').trim().toLowerCase();
  const usuario = banco.usuarios.find((u) => u.email.toLowerCase() === email);
  if (!usuario || !(await conferirSenha(String(corpo.senha ?? ''), usuario.senha_hash))) {
    throw new ErroHttp(401, 'E-mail ou senha incorretos.');
  }
  return { dados: { token: gerarToken(usuario.id), usuario: usuarioPublico(usuario) } };
}, { publica: true });

rota('POST', '/auth/logout', () => ({ status: 204 }));

/* ---------- Usuários ---------- */

rota('GET', '/usuarios', ({ banco }) => ({ dados: banco.usuarios.map(usuarioPublico) }));

rota('GET', '/usuarios/:id', ({ banco, params, usuarioAuth }) => {
  exigirDono(usuarioAuth, params.id);
  return { dados: usuarioPublico(banco.usuarios.find((u) => u.id === Number(params.id))) };
});

rota('PATCH', '/usuarios/:id', ({ banco, params, corpo, usuarioAuth }) => {
  exigirDono(usuarioAuth, params.id);
  const regras = {};
  if ('nome' in corpo) regras.nome = validarNome;
  if ('meta_diaria_ml' in corpo) regras.meta_diaria_ml = validarMeta;
  if ('peso_kg' in corpo) regras.peso_kg = validarPeso;
  exigirValidos(validarObjeto(corpo, regras));

  const usuario = banco.usuarios.find((u) => u.id === usuarioAuth.id);
  if ('nome' in corpo) usuario.nome = corpo.nome.trim();
  if ('peso_kg' in corpo) usuario.peso_kg = corpo.peso_kg === '' || corpo.peso_kg == null ? null : Number(corpo.peso_kg);
  if ('meta_diaria_ml' in corpo && Number(corpo.meta_diaria_ml) !== usuario.meta_diaria_ml) {
    usuario.meta_diaria_ml = Number(corpo.meta_diaria_ml);
    registrarNovaMeta(banco, usuario.id, usuario.meta_diaria_ml);
  }
  return { dados: usuarioPublico(usuario) };
});

/** DELETE /usuarios/:id — simula ON DELETE CASCADE em todas as tabelas filhas */
rota('DELETE', '/usuarios/:id', ({ banco, params, usuarioAuth }) => {
  exigirDono(usuarioAuth, params.id);
  const id = usuarioAuth.id;
  const garrafas = new Set(banco.garrafas.filter((g) => g.usuario_id === id).map((g) => g.id));
  banco.leituras_consumo = banco.leituras_consumo.filter((l) => !garrafas.has(l.garrafa_id));
  for (const tabela of ['garrafas', 'lembretes', 'metas', 'conquistas']) {
    banco[tabela] = banco[tabela].filter((linha) => linha.usuario_id !== id);
  }
  banco.usuarios = banco.usuarios.filter((u) => u.id !== id);
  return { status: 204 };
});

/* ---------- Garrafas ---------- */

rota('GET', '/usuarios/:id/garrafas', ({ banco, params, usuarioAuth }) => {
  exigirDono(usuarioAuth, params.id);
  return { dados: banco.garrafas.filter((g) => g.usuario_id === usuarioAuth.id) };
});

/** Pareamento de uma nova garrafa pelo número de série */
rota('POST', '/garrafas', ({ banco, corpo, usuarioAuth }) => {
  exigirValidos(validarObjeto(corpo, { numero_serie: validarNumeroSerie }));
  const numeroSerie = corpo.numero_serie.trim().toUpperCase();
  if (banco.garrafas.some((g) => g.numero_serie === numeroSerie)) {
    throw new ErroHttp(409, 'Esta garrafa já está pareada.', { numero_serie: 'Este número de série já está pareado com uma conta.' });
  }
  const agora = dataHoraSQL();
  const garrafa = inserir(banco, 'garrafas', {
    usuario_id: usuarioAuth.id,
    modelo: 'HydroSmart 600',
    numero_serie: numeroSerie,
    capacidade_ml: 600,
    status: 'ativa',
    nivel_ml: 600,
    bateria_pct: 100,
    conectada: true,
    ultima_sincronizacao: agora,
    criado_em: agora,
  });
  return { status: 201, dados: garrafa };
});

/** Atualiza status e/ou telemetria (nível, bateria, conexão) */
rota('PATCH', '/garrafas/:id', ({ banco, params, corpo, usuarioAuth }) => {
  const garrafa = banco.garrafas.find((g) => g.id === Number(params.id));
  if (!garrafa) throw new ErroHttp(404, 'Garrafa não encontrada.');
  exigirDono(usuarioAuth, garrafa.usuario_id);

  const erros = {};
  if ('status' in corpo && !['ativa', 'inativa', 'manutencao'].includes(corpo.status)) {
    erros.status = 'Status inválido.';
  }
  if ('nivel_ml' in corpo) {
    const nivel = Number(corpo.nivel_ml);
    if (!Number.isInteger(nivel) || nivel < 0 || nivel > garrafa.capacidade_ml) {
      erros.nivel_ml = `O nível deve ficar entre 0 e ${garrafa.capacidade_ml} ml.`;
    }
  }
  if ('bateria_pct' in corpo) {
    const bateria = Number(corpo.bateria_pct);
    if (!Number.isInteger(bateria) || bateria < 0 || bateria > 100) erros.bateria_pct = 'A bateria deve ficar entre 0 e 100%.';
  }
  exigirValidos(erros);

  if ('status' in corpo) garrafa.status = corpo.status;
  if ('nivel_ml' in corpo) garrafa.nivel_ml = Number(corpo.nivel_ml);
  if ('bateria_pct' in corpo) garrafa.bateria_pct = Number(corpo.bateria_pct);
  if ('conectada' in corpo) garrafa.conectada = Boolean(corpo.conectada);
  if (garrafa.conectada) garrafa.ultima_sincronizacao = dataHoraSQL();
  return { dados: garrafa };
});

/* ---------- Leituras do sensor ---------- */

/**
 * POST /leituras — o app recebe a leitura da garrafa (Bluetooth) e envia:
 *   { garrafa_id, volume_ml, lido_em?, nivel_ml?, bateria_pct? }
 * Resposta: { leitura, garrafa, conquistas_novas }
 */
rota('POST', '/leituras', ({ banco, corpo, usuarioAuth }) => {
  const garrafa = banco.garrafas.find((g) => g.id === Number(corpo.garrafa_id));
  if (!garrafa) throw new ErroHttp(404, 'Garrafa não encontrada.');
  exigirDono(usuarioAuth, garrafa.usuario_id);
  if (garrafa.status !== 'ativa') throw new ErroHttp(409, 'A garrafa está inativa ou em manutenção.');
  exigirValidos(validarObjeto(corpo, { volume_ml: validarVolume }));

  let lidoEm = dataHoraSQL();
  if (corpo.lido_em) {
    const data = paraDate(corpo.lido_em);
    if (Number.isNaN(data.getTime()) || data > new Date()) {
      throw new ErroHttp(422, 'Data da leitura inválida.', { lido_em: 'Use uma data/hora no passado.' });
    }
    lidoEm = dataHoraSQL(data);
  }

  const idsAntes = new Set(banco.conquistas.map((c) => c.id));
  const leitura = inserir(banco, 'leituras_consumo', {
    garrafa_id: garrafa.id, volume_ml: Number(corpo.volume_ml), lido_em: lidoEm,
  });
  triggerConquistas(banco, leitura); // AFTER INSERT

  // Telemetria enviada junto com a leitura
  garrafa.nivel_ml = 'nivel_ml' in corpo
    ? Math.min(garrafa.capacidade_ml, Math.max(0, Number(corpo.nivel_ml)))
    : Math.max(0, garrafa.nivel_ml - leitura.volume_ml);
  if ('bateria_pct' in corpo) garrafa.bateria_pct = Math.min(100, Math.max(0, Number(corpo.bateria_pct)));
  garrafa.conectada = true;
  garrafa.ultima_sincronizacao = lidoEm;

  return {
    status: 201,
    dados: { leitura, garrafa, conquistas_novas: banco.conquistas.filter((c) => !idsAntes.has(c.id)) },
  };
});

/** GET /leituras?usuario_id=1&data=AAAA-MM-DD — mais recentes primeiro */
rota('GET', '/leituras', ({ banco, query, usuarioAuth }) => {
  const usuarioId = Number(query.usuario_id ?? usuarioAuth.id);
  exigirDono(usuarioAuth, usuarioId);
  let leituras = leiturasDoUsuario(banco, usuarioId);
  if (query.data) leituras = leituras.filter((l) => l.lido_em.startsWith(query.data));
  if (query.garrafa_id) leituras = leituras.filter((l) => l.garrafa_id === Number(query.garrafa_id));
  return { dados: leituras.sort((a, b) => b.lido_em.localeCompare(a.lido_em)) };
});

/**
 * GET /historico/:usuario?dias=7
 * Lê a "view" e completa com zero os dias sem leitura (igual ao
 * WITH RECURSIVE calendario do README). Ordem: mais antigo → hoje.
 */
rota('GET', '/historico/:usuario', ({ banco, params, query, usuarioAuth }) => {
  exigirDono(usuarioAuth, params.usuario);
  const dias = Math.min(90, Math.max(1, Number(query.dias) || 7));
  const usuario = banco.usuarios.find((u) => u.id === usuarioAuth.id);
  const view = new Map(vwProgressoDiario(banco, usuario.id).map((linha) => [linha.dia, linha]));
  const hoje = hojeSQL();
  const historico = [];
  for (let i = dias - 1; i >= 0; i -= 1) {
    const dia = adicionarDias(hoje, -i);
    historico.push(view.get(dia) || linhaProgresso(banco, usuario, dia, { total_ml: 0, qtd_leituras: 0 }));
  }
  return { dados: historico };
});

/* ---------- Lembretes (CRUD) ---------- */

rota('GET', '/usuarios/:id/lembretes', ({ banco, params, usuarioAuth }) => {
  exigirDono(usuarioAuth, params.id);
  return {
    dados: banco.lembretes
      .filter((l) => l.usuario_id === usuarioAuth.id)
      .sort((a, b) => a.hora.localeCompare(b.hora)),
  };
});

/** Valida e normaliza os dados de um lembrete (criação ou edição) */
function dadosLembrete(banco, corpo, usuarioId, idIgnorado = null) {
  exigirValidos(validarObjeto(corpo, { hora: validarHora, dias_semana: validarDiasSemana }));
  const rotulo = String(corpo.rotulo ?? '').trim();
  if (rotulo.length > 60) exigirValidos({ rotulo: 'O nome do lembrete pode ter até 60 caracteres.' });

  const hora = normalizarHora(corpo.hora);
  const diasSemana = [...new Set(String(corpo.dias_semana).split(',').map(Number))].sort((a, b) => a - b).join(',');
  const duplicado = banco.lembretes.some((l) => l.usuario_id === usuarioId && l.hora === hora && l.id !== idIgnorado);
  if (duplicado) {
    throw new ErroHttp(409, 'Já existe um lembrete neste horário.', { hora: `Você já tem um lembrete às ${hora.slice(0, 5)}.` });
  }
  return { hora, dias_semana: diasSemana, rotulo: rotulo || null, ativo: corpo.ativo === undefined ? true : Boolean(corpo.ativo) };
}

rota('POST', '/lembretes', ({ banco, corpo, usuarioAuth }) => {
  const dados = dadosLembrete(banco, corpo, usuarioAuth.id);
  const lembrete = inserir(banco, 'lembretes', { usuario_id: usuarioAuth.id, ...dados, criado_em: dataHoraSQL() });
  return { status: 201, dados: lembrete };
});

function buscarLembrete(banco, id, usuarioAuth) {
  const lembrete = banco.lembretes.find((l) => l.id === Number(id));
  if (!lembrete) throw new ErroHttp(404, 'Lembrete não encontrado.');
  exigirDono(usuarioAuth, lembrete.usuario_id);
  return lembrete;
}

rota('PUT', '/lembretes/:id', ({ banco, params, corpo, usuarioAuth }) => {
  const lembrete = buscarLembrete(banco, params.id, usuarioAuth);
  Object.assign(lembrete, dadosLembrete(banco, corpo, usuarioAuth.id, lembrete.id));
  return { dados: lembrete };
});

/** PATCH parcial — usado para ligar/desligar (campo `ativo`) */
rota('PATCH', '/lembretes/:id', ({ banco, params, corpo, usuarioAuth }) => {
  const lembrete = buscarLembrete(banco, params.id, usuarioAuth);
  Object.assign(lembrete, dadosLembrete(banco, { ...lembrete, ...corpo }, usuarioAuth.id, lembrete.id));
  return { dados: lembrete };
});

rota('DELETE', '/lembretes/:id', ({ banco, params, usuarioAuth }) => {
  const lembrete = buscarLembrete(banco, params.id, usuarioAuth);
  banco.lembretes = banco.lembretes.filter((l) => l.id !== lembrete.id);
  return { status: 204 };
});

/* ---------- Metas e conquistas ---------- */

rota('GET', '/usuarios/:id/metas', ({ banco, params, usuarioAuth }) => {
  exigirDono(usuarioAuth, params.id);
  return {
    dados: banco.metas
      .filter((m) => m.usuario_id === usuarioAuth.id)
      .sort((a, b) => b.data_inicio.localeCompare(a.data_inicio)),
  };
});

rota('GET', '/usuarios/:id/conquistas', ({ banco, params, usuarioAuth }) => {
  exigirDono(usuarioAuth, params.id);
  return {
    dados: banco.conquistas
      .filter((c) => c.usuario_id === usuarioAuth.id)
      .sort((a, b) => b.obtida_em.localeCompare(a.obtida_em)),
  };
});

/* ---------- Somente no mock ---------- */

/** POST /demo/reset — apaga o banco local e recria os dados de demonstração */
rota('POST', '/demo/reset', async () => {
  const banco = bancoVazio();
  await semear(banco);
  gravarArmazenamento(banco);
  return { status: 204, semGravar: true };
}, { publica: true });

/* ==================================================================== */
/* 6. Ponto de entrada: mesma assinatura do fetch()                      */
/* ==================================================================== */

/**
 * @param {string} url    ex.: 'http://localhost:3000/api/historico/1?dias=7'
 * @param {RequestInit} opcoes  method, headers (objeto simples) e body (JSON)
 * @returns {Promise<Response>}
 */
export async function mockFetch(url, opcoes = {}) {
  await esperar(LATENCIA_MS);
  const metodo = (opcoes.method || 'GET').toUpperCase();
  const endereco = new URL(url, 'http://mock.local');
  const caminho = endereco.pathname.replace(/^\/api(?=\/)/, '');

  try {
    let parametros = null;
    const encontrada = rotas.find((r) => {
      if (r.metodo !== metodo) return false;
      const resultado = r.regex.exec(caminho);
      if (!resultado) return false;
      parametros = Object.fromEntries(r.chaves.map((chave, i) => [chave, decodeURIComponent(resultado[i + 1])]));
      return true;
    });
    if (!encontrada) throw new ErroHttp(404, `Rota não encontrada: ${metodo} ${caminho}`);

    let corpo = {};
    if (opcoes.body) {
      try { corpo = JSON.parse(opcoes.body); } catch { throw new ErroHttp(400, 'JSON inválido.'); }
    }

    const banco = await obterBanco();
    const usuarioAuth = encontrada.publica ? null : autenticar(banco, opcoes.headers);
    const { status = 200, dados, semGravar = false } = await encontrada.manipulador({
      banco, params: parametros, query: Object.fromEntries(endereco.searchParams), corpo, usuarioAuth,
    });

    // Commit: grava só se a requisição alterou dados e terminou sem erro
    if (metodo !== 'GET' && !semGravar) gravarArmazenamento(banco);
    return resposta(status, dados);
  } catch (erro) {
    if (erro instanceof ErroHttp) return resposta(erro.status, { erro: erro.message, campos: erro.campos });
    console.error('[mock-servidor]', erro);
    return resposta(500, { erro: 'Erro interno no servidor simulado.' });
  }
}
