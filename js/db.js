/* =====================================================================
   db.js — Camada de acesso ao banco de dados.
   O navegador não fala direto com o MySQL: cada função abaixo chama um
   endpoint PHP em /api, que valida os dados e executa o SQL no XAMPP.
   Há uma função para cada operação (CRUD) de cada tabela.
   ===================================================================== */
'use strict';

/** Erro padronizado da API (mensagem + código HTTP + erros por campo). */
class ApiErro extends Error {
  constructor(mensagem, status = 0, codigo = '', campos = null) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.campos = campos;
  }
}

const API = (() => {
  let csrf = '';
  let aoPerderSessao = null;

  /**
   * Faz a requisição para api/<arquivo>.php?acao=<acao>.
   * GET envia parâmetros na URL; POST envia JSON + token CSRF.
   */
  async function requisitar(arquivo, acao, { metodo = 'GET', params = {}, corpo = null, tentarNovamente = true } = {}) {
    const url = new URL(`api/${arquivo}.php`, location.href);
    url.searchParams.set('acao', acao);
    Object.entries(params).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) url.searchParams.set(k, v); });

    const opcoes = { method: metodo, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (metodo === 'POST') {
      opcoes.headers['Content-Type'] = 'application/json';
      opcoes.headers['X-CSRF-Token'] = csrf;
      opcoes.body = JSON.stringify(corpo || {});
    }

    let resposta;
    try {
      resposta = await fetch(url, opcoes);
    } catch (e) {
      throw new ApiErro(
        location.protocol === 'file:'
          ? 'Abra o sistema pelo XAMPP (http://localhost/...), não direto pelo arquivo.'
          : 'Sem conexão com o servidor. Verifique se o Apache está ligado no XAMPP.',
        0, 'offline');
    }

    let json;
    try {
      json = await resposta.json();
    } catch (e) {
      throw new ApiErro(
        resposta.status === 404
          ? 'API não encontrada. Confira se a pasta "api" está junto do index.html.'
          : 'Resposta inválida do servidor. Verifique se o PHP está funcionando no XAMPP.',
        resposta.status, 'resposta_invalida');
    }

    // A API devolve erros previstos com HTTP 200 e o código real em json.status
    const status = Number(json.status) || resposta.status;

    // Token CSRF expirou → busca um novo e repete a requisição uma vez
    if (status === 419 && tentarNovamente) {
      await estado();
      return requisitar(arquivo, acao, { metodo, params, corpo, tentarNovamente: false });
    }

    if (!json.ok) {
      const erro = new ApiErro(json.erro || 'Erro inesperado.', status, json.codigo || '', json.campos || null);
      if (status === 401 && aoPerderSessao) aoPerderSessao(erro);
      throw erro;
    }

    if (json.dados && typeof json.dados === 'object' && json.dados.csrf) csrf = json.dados.csrf;
    return json.dados;
  }

  const get = (arquivo, acao, params) => requisitar(arquivo, acao, { params });
  const post = (arquivo, acao, corpo) => requisitar(arquivo, acao, { metodo: 'POST', corpo });

  /** Estado da sessão (não gera 401; serve para descobrir se está logado). */
  async function estado() {
    const dados = await requisitar('auth', 'estado', { tentarNovamente: false });
    csrf = dados.csrf;
    return dados;
  }

  return {
    get, post, estado,
    /** Função chamada quando a API responde 401 (sessão perdida/expirada). */
    aoPerderSessao(fn) { aoPerderSessao = fn; },
  };
})();

/* ---------------------------------------------------------------------
   Funções separadas por tabela
   --------------------------------------------------------------------- */
const DB = {
  auth: {
    estado: () => API.estado(),
    login: (email, senha) => API.post('auth', 'login', { email, senha }),
    cadastrar: (dados) => API.post('auth', 'cadastro', dados),
    logout: () => API.post('auth', 'logout'),
    ping: () => API.post('auth', 'ping'),
    recuperarSenha: (email) => API.post('auth', 'recuperar', { email }),
    redefinirSenha: (dados) => API.post('auth', 'redefinir', dados),
  },

  /** Tabela: visitas */
  visitas: {
    listar: (filtros = {}) => API.get('visitas', 'listar', filtros),
    ativas: () => API.get('visitas', 'ativas'),
    criar: (dados) => API.post('visitas', 'criar', dados),
    finalizar: (id) => API.post('visitas', 'finalizar', { id }),
    excluir: (id) => API.post('visitas', 'excluir', { id }),
  },

  /** Tabela: horarios (agendamentos) */
  horarios: {
    listar: (todos = false) => API.get('agendamentos', 'listar', todos ? { escopo: 'todos' } : {}),
    criar: (dados) => API.post('agendamentos', 'criar', dados),
    cancelar: (id) => API.post('agendamentos', 'cancelar', { id }),
    concluir: (id) => API.post('agendamentos', 'concluir', { id }),
    excluir: (id) => API.post('agendamentos', 'excluir', { id }),
  },

  /** Tabela: usuarios */
  usuarios: {
    listar: () => API.get('usuarios', 'listar'),
    criar: (dados) => API.post('usuarios', 'criar', dados),
    editar: (dados) => API.post('usuarios', 'editar', dados),
    excluir: (id) => API.post('usuarios', 'excluir', { id }),
    atualizarPerfil: (dados) => API.post('usuarios', 'atualizar_perfil', dados),
    alterarSenha: (dados) => API.post('usuarios', 'alterar_senha', dados),
    excluirConta: (senha) => API.post('usuarios', 'excluir_conta', { senha }),
  },

  /** Tabela: sessoes (log de login/logout) */
  sessoes: {
    listar: (status = '') => API.get('sessoes', 'listar', { status }),
  },

  dashboard: {
    resumo: () => API.get('dashboard', 'resumo'),
  },

  /** Backup, exportação e limpeza */
  dados: {
    exportar: (tabela) => API.get('dados', 'exportar', { tabela }),
    backup: () => API.get('dados', 'backup'),
    previaLimpeza: () => API.get('dados', 'previa_limpeza'),
    limpar: () => API.post('dados', 'limpar'),
    gerarExemplo: () => API.post('dados', 'exemplo'),
  },
};
