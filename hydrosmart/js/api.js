/**
 * js/api.js
 * Camada de integração com a API REST da HydroSmart.
 *
 * Todas as telas usam SOMENTE as funções exportadas em `api`. Cada uma
 * monta uma requisição fetch() para um endpoint REST. Enquanto não existe
 * backend, CONFIG.usarMock = true desvia a chamada para o servidor
 * simulado (mock-servidor.js), que responde com um `Response` idêntico ao
 * do fetch() — o restante do código não percebe a diferença.
 *
 * Migração para o backend real (Node.js + Express + mysql2):
 *   1. Suba o servidor (ver README) em http://localhost:3000
 *   2. Troque CONFIG.usarMock para false
 *   Pronto: as mesmas rotas passam a ir pela rede.
 *
 * Endpoints:
 *   POST   /auth/cadastro              POST   /auth/login            POST /auth/logout
 *   GET    /usuarios                   GET    /usuarios/:id          PATCH /usuarios/:id
 *   GET    /usuarios/:id/garrafas      POST   /garrafas              PATCH /garrafas/:id
 *   POST   /leituras                   GET    /leituras?usuario_id=&data=
 *   GET    /historico/:usuario?dias=7
 *   GET    /usuarios/:id/lembretes     POST   /lembretes
 *   PUT    /lembretes/:id              PATCH  /lembretes/:id         DELETE /lembretes/:id
 *   GET    /usuarios/:id/metas         GET    /usuarios/:id/conquistas
 */

import { mockFetch } from './mock-servidor.js';

export const CONFIG = {
  /** true = localStorage (sem backend) | false = fetch() para baseURL */
  usarMock: true,
  /** Endereço do backend real (Express). Pode ser relativo, ex.: '/api' */
  baseURL: 'http://localhost:3000/api',
};

const CHAVE_SESSAO = 'hydrosmart_sessao';

/** Conta de demonstração (existe nos seeds do mock e do database.sql) */
export const CONTA_DEMO = Object.freeze({ email: 'ana@hydrosmart.com.br', senha: 'hydro123' });

/** Erro padronizado das chamadas à API */
export class ErroApi extends Error {
  /**
   * @param {string} mensagem  texto pronto para mostrar ao usuário
   * @param {number} status    código HTTP (0 = sem conexão)
   * @param {Object} campos    erros por campo do formulário
   */
  constructor(mensagem, status = 0, campos = {}) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
    this.campos = campos;
  }
}

/* ------------------------------------------------------------------ */
/* Sessão (token + dados públicos do usuário)                          */
/* ------------------------------------------------------------------ */

export const sessao = {
  obter() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_SESSAO)) || null;
    } catch {
      return null;
    }
  },
  salvar(dados) {
    try {
      localStorage.setItem(CHAVE_SESSAO, JSON.stringify(dados));
    } catch {
      /* navegação privada sem storage: a sessão dura só esta página */
    }
  },
  limpar() {
    try {
      localStorage.removeItem(CHAVE_SESSAO);
    } catch {
      /* ignora */
    }
  },
  /** Atualiza os dados do usuário guardados na sessão (ex.: nova meta) */
  atualizarUsuario(usuario) {
    const atual = this.obter();
    if (atual) this.salvar({ ...atual, usuario });
  },
};

/* ------------------------------------------------------------------ */
/* Requisição genérica                                                 */
/* ------------------------------------------------------------------ */

/**
 * Faz a chamada HTTP (real ou simulada) e devolve o JSON da resposta.
 * Lança ErroApi quando o status não é 2xx.
 */
async function requisicao(metodo, caminho, corpo) {
  const atual = sessao.obter();
  const opcoes = { method: metodo, headers: { Accept: 'application/json' } };

  if (corpo !== undefined) {
    opcoes.headers['Content-Type'] = 'application/json';
    opcoes.body = JSON.stringify(corpo);
  }
  if (atual?.token) opcoes.headers.Authorization = `Bearer ${atual.token}`;

  const url = `${CONFIG.baseURL}${caminho}`;
  let respostaHttp;
  try {
    respostaHttp = CONFIG.usarMock ? await mockFetch(url, opcoes) : await fetch(url, opcoes);
  } catch {
    throw new ErroApi('Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.', 0);
  }

  if (respostaHttp.status === 204) return null;
  const dados = await respostaHttp.json().catch(() => null);

  if (!respostaHttp.ok) {
    if (respostaHttp.status === 401 && atual) sessao.limpar(); // token expirado/inválido
    throw new ErroApi(dados?.erro || `Erro ${respostaHttp.status} no servidor.`, respostaHttp.status, dados?.campos || {});
  }
  return dados;
}

const consulta = (parametros) => {
  const texto = new URLSearchParams(
    Object.entries(parametros).filter(([, valor]) => valor !== undefined && valor !== null && valor !== ''),
  ).toString();
  return texto ? `?${texto}` : '';
};

/* ------------------------------------------------------------------ */
/* Funções da API                                                      */
/* ------------------------------------------------------------------ */

export const api = {
  /* Autenticação ---------------------------------------------------- */

  /** @param {{nome, email, senha, meta_diaria_ml, peso_kg?}} dados */
  async cadastrar(dados) {
    const resultado = await requisicao('POST', '/auth/cadastro', dados);
    sessao.salvar(resultado);
    return resultado.usuario;
  },

  async login(email, senha) {
    const resultado = await requisicao('POST', '/auth/login', { email, senha });
    sessao.salvar(resultado);
    return resultado.usuario;
  },

  async logout() {
    try {
      await requisicao('POST', '/auth/logout');
    } finally {
      sessao.limpar();
    }
  },

  /* Usuários -------------------------------------------------------- */

  listarUsuarios: () => requisicao('GET', '/usuarios'),
  obterUsuario: (id) => requisicao('GET', `/usuarios/${id}`),

  async atualizarUsuario(id, dados) {
    const usuario = await requisicao('PATCH', `/usuarios/${id}`, dados);
    sessao.atualizarUsuario(usuario);
    return usuario;
  },

  /* Garrafas -------------------------------------------------------- */

  listarGarrafas: (usuarioId) => requisicao('GET', `/usuarios/${usuarioId}/garrafas`),
  parearGarrafa: (numeroSerie) => requisicao('POST', '/garrafas', { numero_serie: numeroSerie }),
  /** dados: { status?, nivel_ml?, bateria_pct?, conectada? } */
  atualizarGarrafa: (id, dados) => requisicao('PATCH', `/garrafas/${id}`, dados),

  /* Leituras do sensor ---------------------------------------------- */

  /**
   * Registra uma leitura vinda da garrafa.
   * @param {{garrafa_id:number, volume_ml:number, nivel_ml?:number, bateria_pct?:number}} leitura
   * @returns {{leitura, garrafa, conquistas_novas}}
   */
  registrarLeitura: (leitura) => requisicao('POST', '/leituras', leitura),

  /** @param {{data?: 'AAAA-MM-DD', garrafa_id?: number}} filtros */
  listarLeituras: (usuarioId, filtros = {}) =>
    requisicao('GET', `/leituras${consulta({ usuario_id: usuarioId, ...filtros })}`),

  /** Linhas da vw_progresso_diario dos últimos `dias` (dias vazios = 0) */
  obterHistorico: (usuarioId, dias = 7) => requisicao('GET', `/historico/${usuarioId}${consulta({ dias })}`),

  /* Lembretes (CRUD) ------------------------------------------------ */

  listarLembretes: (usuarioId) => requisicao('GET', `/usuarios/${usuarioId}/lembretes`),
  /** dados: { hora: 'HH:MM', dias_semana: '1,2,3', rotulo?, ativo? } */
  criarLembrete: (dados) => requisicao('POST', '/lembretes', dados),
  atualizarLembrete: (id, dados) => requisicao('PUT', `/lembretes/${id}`, dados),
  alternarLembrete: (id, ativo) => requisicao('PATCH', `/lembretes/${id}`, { ativo }),
  excluirLembrete: (id) => requisicao('DELETE', `/lembretes/${id}`),

  /* Metas e conquistas ---------------------------------------------- */

  listarMetas: (usuarioId) => requisicao('GET', `/usuarios/${usuarioId}/metas`),
  listarConquistas: (usuarioId) => requisicao('GET', `/usuarios/${usuarioId}/conquistas`),

  /* Somente no modo demonstração ------------------------------------ */

  /** Recria os dados de exemplo no localStorage (sem efeito no backend real) */
  async resetarDemo() {
    if (!CONFIG.usarMock) throw new ErroApi('Disponível apenas no modo demonstração.', 400);
    await requisicao('POST', '/demo/reset');
    sessao.limpar();
  },
};
