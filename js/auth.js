/* =====================================================================
   auth.js — Autenticação e controle de sessão.
   - Tela de login / cadastro / recuperação de senha (index.html)
   - Proteção do painel: sem sessão válida → volta para o login
   - Logout automático após 30 minutos de inatividade (com aviso)
   - Sincronização entre abas via localStorage
   A sessão "de verdade" fica no servidor (cookie HttpOnly do PHP);
   o localStorage guarda apenas um resumo (nome, nível) para a interface.
   ===================================================================== */
'use strict';

const Auth = (() => {
  const CHAVE_SESSAO = 'portaria-sessao';
  const CHAVE_ATIVIDADE = 'portaria-atividade';
  const CHAVE_EMAIL = 'portaria-lembrar-email';

  let usuario = null;
  let setores = [];
  let timeoutSeg = 30 * 60;

  /* ------------------------------------------------------------------
     Sessão no localStorage (somente dados não sensíveis)
     ------------------------------------------------------------------ */
  function salvarSessaoLocal(u) {
    try {
      localStorage.setItem(CHAVE_SESSAO, JSON.stringify({ id: u.id, nome: u.nome_completo, nivel: u.nivel_acesso, inicio: Date.now() }));
      localStorage.setItem(CHAVE_ATIVIDADE, String(Date.now()));
    } catch (e) { /* armazenamento indisponível */ }
  }
  function limparSessaoLocal() {
    try { localStorage.removeItem(CHAVE_SESSAO); localStorage.removeItem(CHAVE_ATIVIDADE); } catch (e) { /* ignore */ }
  }

  function irParaLogin(motivo) {
    const q = motivo === 'sessao_expirada' ? '?motivo=expirada' : motivo === 'logout' ? '?motivo=saiu' : '';
    location.replace(`index.html${q}`);
  }

  /* ------------------------------------------------------------------
     Páginas protegidas
     ------------------------------------------------------------------ */
  /** Verifica a sessão no servidor. Sem login → redireciona. */
  async function exigirLogin() {
    const est = await DB.auth.estado();
    if (!est.autenticado) {
      limparSessaoLocal();
      irParaLogin(est.motivo);
      return null;
    }
    U.sincronizarRelogio(est.agora);
    usuario = est.usuario;
    setores = est.setores || [];
    timeoutSeg = est.timeout || timeoutSeg;
    salvarSessaoLocal(usuario);

    // Qualquer resposta 401 da API (sessão expirada no servidor) → login
    API.aoPerderSessao((erro) => { limparSessaoLocal(); irParaLogin(erro.codigo); });

    // Logout ou troca de usuário em outra aba
    window.addEventListener('storage', (e) => {
      if (e.key !== CHAVE_SESSAO) return;
      if (!e.newValue) irParaLogin('logout');
      else {
        try { if (JSON.parse(e.newValue).id !== usuario.id) location.reload(); } catch (err) { /* ignore */ }
      }
    });

    monitorarInatividade();
    return usuario;
  }

  async function logout(motivo = 'logout') {
    try { await DB.auth.logout(); } catch (e) { /* mesmo com erro, sai da interface */ }
    limparSessaoLocal();
    irParaLogin(motivo);
  }

  /* ------------------------------------------------------------------
     Inatividade: 30 min sem interação → logout. Aviso 60 s antes.
     A última atividade é compartilhada entre abas pelo localStorage.
     ------------------------------------------------------------------ */
  function monitorarInatividade() {
    let atividadeLocal = Date.now();
    let ultimoPing = Date.now();
    let aviso = null;

    const ultimaAtividade = () => {
      let compartilhada = 0;
      try { compartilhada = Number(localStorage.getItem(CHAVE_ATIVIDADE)) || 0; } catch (e) { /* ignore */ }
      return Math.max(atividadeLocal, compartilhada);
    };

    function registrar(forcar = false) {
      if (aviso && !forcar) return;
      const agora = Date.now();
      if (!forcar && agora - atividadeLocal < 5000) return;
      atividadeLocal = agora;
      try { localStorage.setItem(CHAVE_ATIVIDADE, String(agora)); } catch (e) { /* ignore */ }
      // Mantém a sessão do servidor viva (no máximo 1 ping por minuto)
      if (forcar || agora - ultimoPing > 60000) {
        ultimoPing = agora;
        DB.auth.ping().catch(() => { /* 401 já é tratado pela API */ });
      }
    }

    function mostrarAviso() {
      let restante = 60;
      let contador;
      aviso = U.modal({
        titulo: 'Você ainda está aí?',
        descricao: 'Por segurança, sua sessão será encerrada por inatividade.',
        icone: 'clock',
        tipoIcone: 'warning',
        corpo: `<p class="muted">Você será desconectado em <strong data-contagem style="color:var(--text)">60</strong> segundos.</p>`,
        rodape: `
          <button class="btn btn-secondary" type="button" data-sair>${U.icon('logout')}<span>Sair agora</span></button>
          <button class="btn btn-primary" type="button" data-fechar>Continuar conectado</button>`,
        aoAbrir: (caixa) => {
          const alvo = caixa.querySelector('[data-contagem]');
          contador = setInterval(() => {
            restante = Math.max(0, Math.round((timeoutSeg * 1000 - (Date.now() - ultimaAtividade())) / 1000));
            alvo.textContent = restante;
          }, 1000);
          caixa.querySelector('[data-sair]').addEventListener('click', () => logout());
        },
        aoFechar: () => {
          clearInterval(contador);
          aviso = null;
          registrar(true);
        },
      });
    }

    function verificar() {
      const ocioso = (Date.now() - ultimaAtividade()) / 1000;
      if (ocioso >= timeoutSeg) {
        logout('sessao_expirada');
      } else if (ocioso >= timeoutSeg - 60) {
        if (!aviso) mostrarAviso();
      } else if (aviso) {
        aviso.fechar(); // houve atividade em outra aba
      }
    }

    ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart', 'wheel'].forEach((ev) =>
      window.addEventListener(ev, () => registrar(), { passive: true }));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) verificar(); });
    setInterval(verificar, 5000);
  }

  /* ==================================================================
     Tela de login / cadastro / recuperação (index.html)
     ================================================================== */
  function iniciarPaginaLogin() {
    const card = U.$('#auth-card');
    const views = { login: U.$('#view-login'), cadastro: U.$('#view-cadastro'), recuperar: U.$('#view-recuperar') };

    // Mensagem vinda de um redirecionamento
    const motivo = new URLSearchParams(location.search).get('motivo');
    if (motivo === 'expirada') U.toast('warning', 'Sessão expirada', 'Por segurança, sua sessão foi encerrada por inatividade. Entre novamente.', 7000);
    if (motivo === 'saiu') U.toast('info', 'Você saiu da sua conta', 'Até logo!');
    if (motivo === 'excluida') U.toast('info', 'Conta excluída', 'Sua conta e seus dados foram removidos.');
    if (motivo) history.replaceState(null, '', location.pathname + location.hash);

    // Aviso quando o arquivo é aberto sem o XAMPP
    if (location.protocol === 'file:') {
      U.$('#aviso-servidor').hidden = false;
    }

    // Já está logado? Vai direto para o painel.
    DB.auth.estado()
      .then((est) => { if (est.autenticado) location.replace('dashboard.html'); })
      .catch((e) => {
        const aviso = U.$('#aviso-servidor');
        aviso.hidden = false;
        aviso.querySelector('[data-msg]').textContent = e.message;
      });

    /* ---------- Troca de telas pelo #hash (o botão "voltar" funciona) ---------- */
    function mostrar() {
      const alvo = location.hash.replace('#', '');
      const nome = views[alvo] ? alvo : 'login';
      Object.entries(views).forEach(([k, el]) => { el.hidden = k !== nome; });
      views[nome].classList.remove('auth-view');
      void views[nome].offsetWidth;
      views[nome].classList.add('auth-view');
      document.title = { login: 'Entrar', cadastro: 'Criar conta', recuperar: 'Recuperar senha' }[nome] + ' · Portaria';
      if (nome === 'recuperar') passoRecuperar(1);
      const foco = views[nome].querySelector('input:not([type=hidden])');
      if (foco && matchMedia('(min-width: 721px)').matches) setTimeout(() => foco.focus(), 60);
    }
    window.addEventListener('hashchange', mostrar);
    mostrar();

    U.ligarOlhoSenha(card);
    Object.values(views).forEach((v) => U.$$('form', v).forEach(U.limparAoDigitar));

    /* ---------- Login ---------- */
    const formLogin = U.$('#form-login');
    const erroLogin = U.$('#erro-login');
    try {
      const lembrado = localStorage.getItem(CHAVE_EMAIL);
      if (lembrado) { formLogin.email.value = lembrado; formLogin.lembrar.checked = true; }
    } catch (e) { /* ignore */ }

    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      U.limparErros(formLogin);
      erroLogin.hidden = true;
      const d = U.dadosForm(formLogin);

      const erros = {};
      if (!d.email) erros.email = 'Informe o e-mail.';
      else if (!U.EMAIL_RE.test(d.email)) erros.email = 'Informe um e-mail válido.';
      if (!d.senha) erros.senha = 'Informe a senha.';
      if (Object.keys(erros).length) { U.mostrarErros(formLogin, erros); return; }

      const botao = formLogin.querySelector('[type=submit]');
      U.carregando(botao, true);
      try {
        const r = await DB.auth.login(d.email, d.senha);
        try {
          if (formLogin.lembrar.checked) localStorage.setItem(CHAVE_EMAIL, d.email);
          else localStorage.removeItem(CHAVE_EMAIL);
        } catch (err) { /* ignore */ }
        salvarSessaoLocal(r.usuario);
        U.toast('success', `Bem-vindo(a), ${r.usuario.nome_completo.split(' ')[0]}!`, 'Redirecionando para o painel…', 2000);
        setTimeout(() => location.replace('dashboard.html'), 650);
      } catch (err) {
        U.carregando(botao, false);
        if (err.campos) U.mostrarErros(formLogin, err.campos);
        erroLogin.querySelector('span').textContent = err.message;
        erroLogin.hidden = false;
        if (err.codigo === 'credenciais_invalidas') {
          formLogin.senha.value = '';
          formLogin.senha.focus();
        }
      }
    });

    /* ---------- Cadastro ---------- */
    const formCad = U.$('#form-cadastro');
    const medidor = U.$('#forca-senha');
    formCad.senha.addEventListener('input', () => { medidor.dataset.nivel = U.forcaSenha(formCad.senha.value); });

    formCad.addEventListener('submit', async (e) => {
      e.preventDefault();
      U.limparErros(formCad);
      const d = U.dadosForm(formCad);

      const erros = {};
      const eNome = U.validarNome(d.nome_completo, 'Nome completo');
      if (eNome) erros.nome_completo = eNome;
      if (!d.email) erros.email = 'Informe o e-mail.';
      else if (!U.EMAIL_RE.test(d.email)) erros.email = 'Informe um e-mail válido.';
      const eSenha = U.validarSenha(d.senha);
      if (eSenha) erros.senha = eSenha;
      if (!d.confirmar_senha) erros.confirmar_senha = 'Confirme a senha.';
      else if (d.confirmar_senha !== d.senha) erros.confirmar_senha = 'As senhas não coincidem.';
      if (!d.nivel_acesso) erros.nivel_acesso = 'Selecione o nível de acesso.';
      if (Object.keys(erros).length) { U.mostrarErros(formCad, erros); return; }

      const botao = formCad.querySelector('[type=submit]');
      U.carregando(botao, true);
      try {
        const r = await DB.auth.cadastrar(d);
        U.toast('success', 'Cadastro realizado!', r.mensagem, 5000);
        formCad.reset();
        medidor.dataset.nivel = 0;
        formLogin.email.value = d.email;
        formLogin.senha.value = '';
        setTimeout(() => { location.hash = ''; }, 500);
      } catch (err) {
        if (err.campos) U.mostrarErros(formCad, err.campos);
        else U.toast('error', 'Não foi possível cadastrar', err.message);
      } finally {
        U.carregando(botao, false);
      }
    });

    /* ---------- Recuperação de senha (2 passos) ---------- */
    const formRec1 = U.$('#form-recuperar');
    const formRec2 = U.$('#form-redefinir');
    let emailRecuperacao = '';

    function passoRecuperar(n) {
      formRec1.hidden = n !== 1;
      formRec2.hidden = n !== 2;
      U.$$('#view-recuperar .steps-dots span').forEach((s, i) => s.classList.toggle('is-done', i < n));
      U.$('#rec-subtitulo').textContent = n === 1
        ? 'Informe o e-mail da sua conta para receber um código de verificação.'
        : 'Digite o código de 6 dígitos e escolha uma nova senha.';
    }

    formRec1.addEventListener('submit', async (e) => {
      e.preventDefault();
      U.limparErros(formRec1);
      const email = formRec1.email.value.trim();
      if (!U.EMAIL_RE.test(email)) { U.mostrarErros(formRec1, { email: 'Informe um e-mail válido.' }); return; }

      const botao = formRec1.querySelector('[type=submit]');
      U.carregando(botao, true);
      try {
        const r = await DB.auth.recuperarSenha(email);
        emailRecuperacao = email;
        const info = U.$('#rec-info');
        info.innerHTML = `${U.icon('mail')}<div><span>${U.esc(r.mensagem)}</span>${r.codigo_dev ? `
            <p style="margin-top:8px"><strong>Modo de desenvolvimento:</strong> sem servidor de e-mail no XAMPP, o código aparece aqui.</p>
            <div class="code-box" aria-label="Código de verificação">${U.esc(r.codigo_dev)}</div>` : ''}</div>`;
        formRec2.reset();
        passoRecuperar(2);
        formRec2.codigo.focus();
      } catch (err) {
        if (err.campos) U.mostrarErros(formRec1, err.campos);
        else U.toast('error', 'Não foi possível enviar o código', err.message);
      } finally {
        U.carregando(botao, false);
      }
    });

    formRec2.codigo.addEventListener('input', () => { formRec2.codigo.value = formRec2.codigo.value.replace(/\D/g, '').slice(0, 6); });

    formRec2.addEventListener('submit', async (e) => {
      e.preventDefault();
      U.limparErros(formRec2);
      const d = U.dadosForm(formRec2);
      const erros = {};
      if (!/^\d{6}$/.test(d.codigo)) erros.codigo = 'Digite o código de 6 dígitos.';
      const eSenha = U.validarSenha(d.senha);
      if (eSenha) erros.senha = eSenha;
      if (d.confirmar_senha !== d.senha) erros.confirmar_senha = 'As senhas não coincidem.';
      if (Object.keys(erros).length) { U.mostrarErros(formRec2, erros); return; }

      const botao = formRec2.querySelector('[type=submit]');
      U.carregando(botao, true);
      try {
        const r = await DB.auth.redefinirSenha({ ...d, email: emailRecuperacao });
        U.toast('success', 'Senha redefinida!', r.mensagem, 5000);
        formLogin.email.value = emailRecuperacao;
        formLogin.senha.value = '';
        location.hash = '';
      } catch (err) {
        if (err.campos) U.mostrarErros(formRec2, err.campos);
        else U.toast('error', 'Não foi possível redefinir', err.message);
      } finally {
        U.carregando(botao, false);
      }
    });

    U.$('#rec-voltar').addEventListener('click', () => passoRecuperar(1));
  }

  return {
    exigirLogin,
    logout,
    iniciarPaginaLogin,
    get usuario() { return usuario; },
    get setores() { return setores; },
    atualizarUsuario(u) { usuario = u; salvarSessaoLocal(u); },
    get ehAdmin() { return usuario && usuario.nivel_acesso === 'admin'; },
    get ehEquipe() { return usuario && usuario.nivel_acesso !== 'visitante'; },
  };
})();
