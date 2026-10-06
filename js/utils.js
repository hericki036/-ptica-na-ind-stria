/* =====================================================================
   utils.js — Funções utilitárias compartilhadas por todas as telas:
   segurança (escapar HTML), ícones SVG, datas, toasts, modais,
   validação de formulários, CSV, tema claro/escuro e animações.
   ===================================================================== */
'use strict';

const U = (() => {

  /* ------------------------------------------------------------------
     Segurança — todo texto vindo do banco passa por esc() antes de
     entrar no HTML, o que impede ataques XSS.
     ------------------------------------------------------------------ */
  const MAPA_HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  const esc = (v) => (v === null || v === undefined ? '' : String(v).replace(/[&<>"'`]/g, (c) => MAPA_HTML[c]));

  /** Só aceita imagens http(s) ou data:image — bloqueia "javascript:" etc. */
  const urlImagemSegura = (url) =>
    typeof url === 'string' && (/^https?:\/\//i.test(url) || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(url)) ? url : '';

  /* ------------------------------------------------------------------
     Ícones SVG inline (traço fino, estilo Lucide)
     ------------------------------------------------------------------ */
  const ICONES = {
    door: '<path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.56v16.88a.5.5 0 0 1-.68.47l-6-2.4A1 1 0 0 1 5.7 18.6V5.94a1 1 0 0 1 .62-.93l6-2.4a.5.5 0 0 1 .68.47Z"/>',
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    calendarPlus: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/>',
    calendarCheck: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    xCircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4M12 17h.01"/>',
    alertCircle: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
    eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7M5 11l9 9"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    mapPin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
    trendingUp: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    filterX: '<path d="M13.01 20.5 10 22v-8.54L2 4h20l-4.42 5.22"/><path d="m22 13-5 5M17 13l5 5"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  };

  const icon = (nome, classe = '') =>
    `<svg class="${classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONES[nome] || ''}</svg>`;

  /* ------------------------------------------------------------------
     Datas e números
     ------------------------------------------------------------------ */
  const pad2 = (n) => String(n).padStart(2, '0');

  /** Converte "YYYY-MM-DD" ou "YYYY-MM-DD HH:MM:SS" (do MySQL) em Date local. */
  function parseData(valor) {
    if (!valor) return null;
    if (valor instanceof Date) return valor;
    const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }

  /**
   * Relógio sincronizado com o servidor: se o computador estiver em outro
   * fuso ou com a hora errada, "hoje", "agora" e durações continuam batendo
   * com as datas gravadas pelo PHP/MySQL.
   */
  let desvioRelogio = 0;
  function sincronizarRelogio(agoraServidor) {
    const d = parseData(agoraServidor);
    if (d) desvioRelogio = d.getTime() - Date.now();
  }
  const agora = () => new Date(Date.now() + desvioRelogio);

  const isoData = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const hojeISO = () => isoData(agora());
  const horaAtual = () => { const d = agora(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

  const fmtData = (v) => { const d = parseData(v); return d ? `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}` : '—'; };
  const fmtHora = (v) => { const d = parseData(v); return d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '—'; };
  const fmtDataHora = (v) => (parseData(v) ? `${fmtData(v)} ${fmtHora(v)}` : '—');

  const fmtExtenso = (v, opcoes = { weekday: 'long', day: 'numeric', month: 'long' }) => {
    const d = parseData(v) || agora();
    const txt = new Intl.DateTimeFormat('pt-BR', opcoes).format(d);
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  };
  const mesCurto = (v) => new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(parseData(v)).replace('.', '');
  const diaSemanaCurto = (v) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(parseData(v)).replace('.', '');

  const minutosDesde = (v) => Math.max(0, Math.floor((agora().getTime() - parseData(v).getTime()) / 60000));

  /** 95 → "1h 35min" */
  function fmtDuracao(min) {
    if (min === null || min === undefined || min === '') return '—';
    min = Number(min);
    if (min < 1) return '< 1 min';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h}h ${pad2(m)}min` : `${h}h`;
  }

  /** Tempo relativo: "agora", "há 5 min", "há 2 h", "ontem"… */
  function relativo(v) {
    const d = parseData(v);
    if (!d) return '—';
    const min = Math.round((agora().getTime() - d.getTime()) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `há ${h} h`;
    const dias = Math.round(h / 24);
    if (dias === 1) return 'ontem';
    if (dias < 7) return `há ${dias} dias`;
    return fmtData(v);
  }

  const saudacao = () => { const h = agora().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
  const num = (n) => Number(n || 0).toLocaleString('pt-BR');
  const plural = (n, um, varios) => `${num(n)} ${Number(n) === 1 ? um : varios}`;

  /* ------------------------------------------------------------------
     Avatar com iniciais (ou foto)
     ------------------------------------------------------------------ */
  const iniciais = (nome = '') => {
    const partes = String(nome).trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    return ((partes[0][0] || '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
  };
  const corAvatar = (texto = '') => {
    let h = 0;
    for (const c of String(texto)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return (h % 5) + 1;
  };
  function avatar(nome, foto = '', classe = '') {
    const url = urlImagemSegura(foto);
    return `<span class="avatar ${classe}" data-cor="${corAvatar(nome)}" aria-hidden="true">${
      url ? `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : esc(iniciais(nome))}</span>`;
  }

  /* ------------------------------------------------------------------
     DOM
     ------------------------------------------------------------------ */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  function debounce(fn, ms = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  /** Lê um formulário como objeto (textos aparados, senhas intactas). */
  function dadosForm(form) {
    const dados = {};
    new FormData(form).forEach((valor, chave) => {
      const campo = form.elements[chave];
      dados[chave] = campo && campo.type === 'password' ? valor : String(valor).trim();
    });
    return dados;
  }

  /* ------------------------------------------------------------------
     Toasts (notificações)
     ------------------------------------------------------------------ */
  const ICONE_TOAST = { success: 'check', error: 'alertCircle', warning: 'alert', info: 'info' };

  function toast(tipo, titulo, mensagem = '', duracao = 4500) {
    let area = $('#toasts');
    if (!area) {
      area = document.createElement('div');
      area.id = 'toasts';
      area.className = 'toasts';
      document.body.appendChild(area);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${tipo}`;
    el.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
    el.innerHTML = `
      <div class="toast-icon">${icon(ICONE_TOAST[tipo] || 'info')}</div>
      <div><p class="toast-title">${esc(titulo)}</p>${mensagem ? `<p class="toast-msg">${esc(mensagem)}</p>` : ''}</div>
      <button class="toast-close" type="button" aria-label="Fechar notificação">${icon('x')}</button>
      <div class="toast-progress" style="animation-duration:${duracao}ms"></div>`;

    const remover = () => {
      if (el.classList.contains('is-leaving')) return;
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 250);
    };
    el.querySelector('.toast-close').addEventListener('click', remover);
    // A barra de progresso controla o tempo (pausa ao passar o mouse)
    el.querySelector('.toast-progress').addEventListener('animationend', remover);

    area.appendChild(el);
    while (area.children.length > 4) area.firstElementChild.remove();
  }

  /* ------------------------------------------------------------------
     Modais — fecham com ESC, clique fora ou botão; prendem o foco
     ------------------------------------------------------------------ */
  const pilhaModais = [];
  let contadorModal = 0;
  const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function modal({ titulo, descricao = '', icone = '', tipoIcone = '', corpo = '', rodape = '', tamanho = '', fecharFora = true, aoAbrir, aoFechar } = {}) {
    const id = `modal-${++contadorModal}`;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal ${tamanho === 'lg' ? 'modal-lg' : ''}" role="dialog" aria-modal="true" aria-labelledby="${id}-t" ${descricao ? `aria-describedby="${id}-d"` : ''}>
        <div class="modal-header">
          ${icone ? `<div class="modal-icon ${tipoIcone}">${icon(icone)}</div>` : ''}
          <div><h2 id="${id}-t">${esc(titulo)}</h2>${descricao ? `<p id="${id}-d">${esc(descricao)}</p>` : ''}</div>
          <button class="btn btn-ghost btn-icon btn-sm" type="button" data-fechar aria-label="Fechar">${icon('x')}</button>
        </div>
        ${corpo ? `<div class="modal-body">${corpo}</div>` : ''}
        ${rodape ? `<div class="modal-footer">${rodape}</div>` : ''}
      </div>`;

    const anterior = document.activeElement;
    const caixa = overlay.querySelector('.modal');
    let fechado = false;

    const registro = { overlay, fechar };
    function fechar(valor) {
      if (fechado) return;
      fechado = true;
      overlay.classList.add('is-closing');
      const i = pilhaModais.indexOf(registro);
      if (i >= 0) pilhaModais.splice(i, 1);
      setTimeout(() => {
        overlay.remove();
        if (!pilhaModais.length) document.body.classList.remove('modal-open');
        if (anterior && document.contains(anterior)) anterior.focus({ preventScroll: true });
        if (aoFechar) aoFechar(valor);
      }, 180);
    }

    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay && fecharFora) fechar(); });
    overlay.addEventListener('click', (e) => { if (e.target.closest('[data-fechar]')) fechar(); });

    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');
    pilhaModais.push(registro);

    if (aoAbrir) aoAbrir(caixa, fechar);
    const primeiro = caixa.querySelector('.modal-body ' + FOCAVEIS) || caixa.querySelector('.modal-footer .btn:last-child') || caixa;
    setTimeout(() => primeiro.focus({ preventScroll: true }), 40);

    return { el: caixa, fechar };
  }

  document.addEventListener('keydown', (e) => {
    const topo = pilhaModais[pilhaModais.length - 1];
    if (!topo) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      topo.fechar();
    } else if (e.key === 'Tab') {
      const itens = $$(FOCAVEIS, topo.overlay).filter((el) => el.offsetParent !== null);
      if (!itens.length) return;
      const [primeiro, ultimo] = [itens[0], itens[itens.length - 1]];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    }
  });

  /** Diálogo de confirmação. Retorna uma Promise<boolean>. */
  function confirmar({ titulo, mensagem = '', textoConfirmar = 'Confirmar', perigo = false, icone } = {}) {
    return new Promise((resolve) => {
      let confirmado = false;
      modal({
        titulo,
        descricao: mensagem,
        icone: icone || (perigo ? 'alert' : 'info'),
        tipoIcone: perigo ? 'danger' : '',
        rodape: `
          <button class="btn btn-secondary" type="button" data-fechar>Cancelar</button>
          <button class="btn ${perigo ? 'btn-danger' : 'btn-primary'}" type="button" data-confirmar>${esc(textoConfirmar)}</button>`,
        aoAbrir: (caixa, fechar) => {
          caixa.querySelector('[data-confirmar]').addEventListener('click', () => { confirmado = true; fechar(); });
        },
        aoFechar: () => resolve(confirmado),
      });
    });
  }

  /* ------------------------------------------------------------------
     Botões: carregamento e efeito ripple
     ------------------------------------------------------------------ */
  function carregando(botao, ativo) {
    if (!botao) return;
    botao.classList.toggle('is-loading', ativo);
    botao.disabled = ativo;
    botao.setAttribute('aria-busy', ativo ? 'true' : 'false');
  }

  document.addEventListener('pointerdown', (e) => {
    const botao = e.target.closest('.btn');
    if (!botao || botao.disabled) return;
    const r = botao.getBoundingClientRect();
    const tamanho = Math.max(r.width, r.height);
    const onda = document.createElement('span');
    onda.className = 'ripple';
    onda.style.cssText = `width:${tamanho}px;height:${tamanho}px;left:${e.clientX - r.left - tamanho / 2}px;top:${e.clientY - r.top - tamanho / 2}px`;
    botao.appendChild(onda);
    setTimeout(() => onda.remove(), 650);
  });

  /* ------------------------------------------------------------------
     Formulários: erros por campo, validação e força da senha
     ------------------------------------------------------------------ */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function campoDe(form, nome) {
    const input = form.elements[nome];
    const el = input && (input.length && !input.tagName ? input[0] : input);
    return el ? el.closest('.field') : null;
  }

  function limparErros(form) {
    $$('.field.has-error', form).forEach((f) => f.classList.remove('has-error'));
    $$('.field-error', form).forEach((e) => { e.textContent = ''; });
    $$('[aria-invalid]', form).forEach((e) => e.removeAttribute('aria-invalid'));
  }

  /** Mostra erros vindos da validação local ou da API: { campo: 'mensagem' } */
  function mostrarErros(form, campos = {}) {
    let primeiro = null;
    Object.entries(campos).forEach(([nome, msg]) => {
      const field = campoDe(form, nome);
      if (!field) return;
      field.classList.add('has-error');
      field.classList.remove('shake');
      void field.offsetWidth; // reinicia a animação
      field.classList.add('shake');
      const alvo = field.querySelector('.field-error');
      if (alvo) alvo.innerHTML = `${icon('alertCircle')}<span>${esc(msg)}</span>`;
      const input = form.elements[nome];
      if (input && input.setAttribute) input.setAttribute('aria-invalid', 'true');
      if (!primeiro && input && input.focus) primeiro = input;
    });
    if (primeiro) primeiro.focus();
  }

  /** Remove o erro do campo assim que o usuário volta a digitar. */
  function limparAoDigitar(form) {
    form.addEventListener('input', (e) => {
      const field = e.target.closest('.field');
      if (field && field.classList.contains('has-error')) {
        field.classList.remove('has-error');
        const alvo = field.querySelector('.field-error');
        if (alvo) alvo.textContent = '';
        e.target.removeAttribute('aria-invalid');
      }
    });
  }

  function validarSenha(s) {
    if (!s) return 'Informe a senha.';
    if (s.length < 6) return 'A senha deve ter ao menos 6 caracteres.';
    if (s.length > 72) return 'A senha deve ter no máximo 72 caracteres.';
    if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return 'Use letras e números na senha.';
    return null;
  }

  function validarNome(nome, rotulo = 'Nome') {
    if (nome.length < 3) return `${rotulo} deve ter ao menos 3 caracteres.`;
    if (nome.length > 120) return `${rotulo} deve ter no máximo 120 caracteres.`;
    if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(nome)) return `${rotulo} contém caracteres inválidos.`;
    return null;
  }

  /** 0 a 4 — usado no medidor visual de força da senha. */
  function forcaSenha(s = '') {
    let p = 0;
    if (s.length >= 6) p++;
    if (s.length >= 10) p++;
    if (/[A-Z]/.test(s) && /[a-z]/.test(s)) p++;
    if (/\d/.test(s) && /[^A-Za-z0-9]/.test(s)) p++;
    return s ? Math.max(1, p) : 0;
  }

  /** Liga o botão de mostrar/ocultar senha dentro de .input-wrap */
  function ligarOlhoSenha(raiz = document) {
    $$('[data-toggle-senha]', raiz).forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = btn.parentElement.querySelector('input');
        const mostrar = input.type === 'password';
        input.type = mostrar ? 'text' : 'password';
        btn.innerHTML = icon(mostrar ? 'eyeOff' : 'eye');
        btn.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
        btn.setAttribute('aria-pressed', String(mostrar));
      });
    });
  }

  /** HTML de um campo padrão (label + input com ícone + erro). */
  function campo({ nome, rotulo, tipo = 'text', icone = '', valor = '', placeholder = '', auto = 'off', extra = '', opcional = false, dica = '' }) {
    const id = `f-${nome}-${Math.random().toString(36).slice(2, 7)}`;
    const senha = tipo === 'password';
    return `
      <div class="field">
        <label class="field-label" for="${id}">${esc(rotulo)}${opcional ? '<span class="optional">opcional</span>' : ''}</label>
        <div class="input-wrap">
          ${icone ? icon(icone, 'input-icon') : ''}
          ${senha ? `<button type="button" class="input-action" data-toggle-senha aria-label="Mostrar senha" aria-pressed="false">${icon('eye')}</button>` : ''}
          <input class="input" id="${id}" name="${nome}" type="${tipo}" value="${esc(valor)}" placeholder="${esc(placeholder)}" autocomplete="${auto}" ${extra}>
        </div>
        ${dica ? `<p class="field-hint">${esc(dica)}</p>` : ''}
        <p class="field-error" role="alert"></p>
      </div>`;
  }

  /* ------------------------------------------------------------------
     CSV e downloads
     ------------------------------------------------------------------ */
  /** Gera CSV com ";" (padrão do Excel em português) e BOM UTF-8. */
  function gerarCSV(linhas, colunas) {
    const celula = (v) => {
      let t = v === null || v === undefined ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; // evita fórmulas maliciosas no Excel
      return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const cab = colunas.map((c) => celula(c.titulo)).join(';');
    const corpo = linhas.map((l) => colunas.map((c) => celula(c.valor ? c.valor(l) : l[c.chave])).join(';'));
    return '﻿' + [cab, ...corpo].join('\r\n');
  }

  function baixar(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
    const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const carimbo = () => { const d = agora(); return `${isoData(d)}_${pad2(d.getHours())}-${pad2(d.getMinutes())}`; };

  /* ------------------------------------------------------------------
     Tema claro/escuro (salvo no localStorage)
     ------------------------------------------------------------------ */
  const CHAVE_TEMA = 'portaria-tema';
  const tema = {
    atual: () => document.documentElement.dataset.theme || 'light',
    definir(valor) {
      const html = document.documentElement;
      html.classList.add('theme-transition');
      html.dataset.theme = valor;
      try { localStorage.setItem(CHAVE_TEMA, valor); } catch (e) { /* modo privado */ }
      setTimeout(() => html.classList.remove('theme-transition'), 400);
      $$('.theme-toggle').forEach((b) => b.setAttribute('aria-checked', String(valor === 'dark')));
    },
    alternar() { tema.definir(tema.atual() === 'dark' ? 'light' : 'dark'); },
    /** Cria o HTML do botão animado. */
    botao: () => `
      <button class="theme-toggle" type="button" role="switch" aria-checked="${document.documentElement.dataset.theme === 'dark'}" aria-label="Tema escuro" data-theme-toggle>
        <span class="knob">${icon('sun', 'i-sun')}${icon('moon', 'i-moon')}</span>
      </button>`,
  };
  document.addEventListener('click', (e) => { if (e.target.closest('[data-theme-toggle]')) tema.alternar(); });

  /* ------------------------------------------------------------------
     Animações e blocos visuais
     ------------------------------------------------------------------ */
  /** Anima um número de 0 até o valor final. */
  function contar(el, alvo, duracao = 900) {
    alvo = Number(alvo) || 0;
    if (!el) return;
    if (alvo === 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = num(alvo); return; }
    const inicio = performance.now();
    const passo = (agora) => {
      const p = Math.min(1, (agora - inicio) / duracao);
      el.textContent = num(Math.round(alvo * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  /** Estado vazio ilustrado. */
  function vazio({ icone = 'inbox', titulo, texto = '', acao = '' }) {
    const gid = `g${Math.random().toString(36).slice(2, 8)}`;
    return `
      <div class="empty">
        <svg class="empty-art" viewBox="0 0 120 96" fill="none" aria-hidden="true">
          <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563EB"/><stop offset="1" stop-color="#7C3AED"/></linearGradient></defs>
          <ellipse cx="60" cy="86" rx="40" ry="6" fill="url(#${gid})" opacity=".12"/>
          <rect x="22" y="18" width="76" height="56" rx="12" fill="url(#${gid})" opacity=".1"/>
          <rect x="30" y="10" width="60" height="56" rx="12" style="fill:var(--bg-elevated)" stroke="url(#${gid})" stroke-opacity=".35"/>
          <rect x="40" y="46" width="40" height="5" rx="2.5" fill="url(#${gid})" opacity=".25"/>
          <rect x="46" y="55" width="28" height="4" rx="2" fill="url(#${gid})" opacity=".15"/>
          <g transform="translate(48 20)" stroke="url(#${gid})" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <g transform="scale(1)">${ICONES[icone] || ICONES.inbox}</g>
          </g>
          <circle cx="98" cy="18" r="4" fill="#7C3AED" opacity=".35"/><circle cx="18" cy="60" r="3" fill="#2563EB" opacity=".3"/>
        </svg>
        <h3>${esc(titulo)}</h3>
        ${texto ? `<p>${esc(texto)}</p>` : ''}
        ${acao}
      </div>`;
  }

  /** Linhas de skeleton (carregando). */
  function skeletonLista(qtd = 5) {
    return Array.from({ length: qtd }, () => `
      <div class="sk-row">
        <div class="skeleton sk-circle" style="width:36px;height:36px"></div>
        <div style="flex:1;display:grid;gap:8px">
          <div class="skeleton sk-line" style="width:${40 + Math.random() * 30}%"></div>
          <div class="skeleton sk-line" style="width:${20 + Math.random() * 25}%"></div>
        </div>
        <div class="skeleton sk-line" style="width:72px;height:22px;border-radius:999px"></div>
      </div>`).join('');
  }

  function skeletonCards(qtd = 4) {
    return `<div class="stats">${Array.from({ length: qtd }, (_, i) => `
      <div class="card stat anim-in" style="--i:${i}">
        <div class="stat-top"><div class="skeleton sk-line" style="width:50%"></div><div class="skeleton" style="width:40px;height:40px;border-radius:10px"></div></div>
        <div><div class="skeleton sk-line lg" style="width:40%"></div><div class="skeleton sk-line" style="width:60%;margin-top:12px"></div></div>
      </div>`).join('')}</div>`;
  }

  /* ------------------------------------------------------------------
     Imagem de perfil: reduz para no máx. 256px antes de salvar
     ------------------------------------------------------------------ */
  function redimensionarImagem(arquivo, max = 256) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(png|jpe?g|webp|gif)$/.test(arquivo.type)) { reject(new Error('Escolha uma imagem PNG, JPG, WEBP ou GIF.')); return; }
      if (arquivo.size > 8 * 1024 * 1024) { reject(new Error('A imagem deve ter no máximo 8 MB.')); return; }
      const leitor = new FileReader();
      leitor.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      leitor.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Arquivo de imagem inválido.'));
        img.onload = () => {
          // Recorte quadrado central
          const lado = Math.min(img.width, img.height);
          const destino = Math.min(max, lado);
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = destino;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, destino, destino);
          resolve(canvas.toDataURL('image/jpeg', 0.86));
        };
        img.src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  return {
    esc, urlImagemSegura, icon,
    parseData, sincronizarRelogio, agora, isoData, hojeISO, horaAtual, fmtData, fmtHora, fmtDataHora, fmtExtenso, mesCurto, diaSemanaCurto,
    minutosDesde, fmtDuracao, relativo, saudacao, num, plural,
    iniciais, avatar,
    $, $$, debounce, dadosForm,
    toast, modal, confirmar, carregando,
    EMAIL_RE, limparErros, mostrarErros, limparAoDigitar, validarSenha, validarNome, forcaSenha, ligarOlhoSenha, campo,
    gerarCSV, baixar, carimbo,
    tema, contar, vazio, skeletonLista, skeletonCards, redimensionarImagem,
  };
})();
