/* =====================================================================
   app.js — Lógica principal do painel (SPA).
   - Roteador por #hash: troca de tela sem recarregar a página
   - Montagem do layout (menu lateral, topo, menu do usuário)
   - Todas as telas: Dashboard, Registrar Visita, Histórico, Agendar,
     Meus Agendamentos, Configurações e Administração
   Todo dado vindo do banco é escapado com U.esc() antes de ir ao HTML.
   ===================================================================== */
'use strict';

const App = (() => {
  const { esc, icon } = U;
  const conteudo = U.$('#conteudo');

  let renderAtual = 0;   // identifica a tela atual (ignora respostas de telas antigas)
  let limpezas = [];     // intervalos/observadores a encerrar ao trocar de tela

  /* ------------------------------------------------------------------
     Rótulos e badges de status
     ------------------------------------------------------------------ */
  const NIVEIS = {
    admin: ['Administrador', 'badge-brand'],
    usuario: ['Usuário', 'badge-info'],
    visitante: ['Visitante', ''],
  };
  const STATUS_VISITA = { ativo: ['Ativo', 'badge-success badge-live'], finalizado: ['Finalizado', ''] };
  const STATUS_AGENDA = { agendado: ['Agendado', 'badge-success'], concluido: ['Concluído', ''], cancelado: ['Cancelado', 'badge-danger'] };
  const STATUS_SESSAO = { ativa: ['Ativa', 'badge-success badge-live'], finalizada: ['Finalizada', ''] };

  const badge = (mapa, valor) => {
    const [texto, classe] = mapa[valor] || [valor, ''];
    return `<span class="badge ${classe}">${esc(texto)}</span>`;
  };
  const primeiroNome = (nome = '') => String(nome).trim().split(/\s+/)[0] || '';

  /* ------------------------------------------------------------------
     Pequenos geradores de HTML de formulário
     ------------------------------------------------------------------ */
  let seq = 0;
  const novoId = (p) => `${p}-${++seq}`;

  function selectHTML({ nome, rotulo, opcoes, valor = '', vazio = 'Selecione…', dica = '' }) {
    const id = novoId(nome);
    return `
      <div class="field">
        <label class="field-label" for="${id}">${esc(rotulo)}</label>
        <select class="select" id="${id}" name="${nome}">
          ${vazio !== null ? `<option value="">${esc(vazio)}</option>` : ''}
          ${opcoes.map((o) => `<option value="${esc(o.valor)}" ${o.valor === valor ? 'selected' : ''}>${esc(o.texto)}</option>`).join('')}
        </select>
        ${dica ? `<p class="field-hint">${esc(dica)}</p>` : ''}
        <p class="field-error" role="alert"></p>
      </div>`;
  }

  function textareaHTML({ nome, rotulo, max = 1000, placeholder = '', opcional = false, valor = '' }) {
    const id = novoId(nome);
    return `
      <div class="field">
        <label class="field-label" for="${id}">
          <span>${esc(rotulo)}${opcional ? ' <span class="optional">(opcional)</span>' : ''}</span>
          <span class="char-count" data-contador="${nome}">0/${max}</span>
        </label>
        <textarea class="textarea" id="${id}" name="${nome}" maxlength="${max}" placeholder="${esc(placeholder)}">${esc(valor)}</textarea>
        <p class="field-error" role="alert"></p>
      </div>`;
  }

  /** Contador de caracteres dos textareas. */
  function ligarContadores(form) {
    U.$$('[data-contador]', form).forEach((c) => {
      const t = form.elements[c.dataset.contador];
      const atualizar = () => { c.textContent = `${t.value.length}/${t.maxLength}`; };
      t.addEventListener('input', atualizar);
      form.addEventListener('reset', () => setTimeout(atualizar));
      atualizar();
    });
  }

  /** Mostra o erro da API: por campo (formulário) ou em toast. */
  function falha(erro, titulo = 'Algo deu errado', form = null) {
    if (erro && erro.status === 401) return; // a sessão caiu: o Auth já redireciona
    if (form && erro && erro.campos) U.mostrarErros(form, erro.campos);
    else U.toast('error', titulo, erro ? erro.message : '');
  }

  const telaErro = (erro) => U.vazio({
    icone: 'alertCircle',
    titulo: 'Não foi possível carregar esta tela',
    texto: erro.message,
    acao: `<button class="btn btn-secondary" type="button" data-recarregar>${icon('refresh')}<span>Tentar novamente</span></button>`,
  });

  /* ------------------------------------------------------------------
     Datas de agendamento
     ------------------------------------------------------------------ */
  const minutosDoDia = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };

  function rotuloDia(dataISO) {
    const hoje = U.hojeISO();
    const amanha = U.isoData(new Date(U.agora().getTime() + 86400000));
    if (dataISO === hoje) return 'Hoje';
    if (dataISO === amanha) return 'Amanhã';
    return U.fmtExtenso(dataISO, { weekday: 'short', day: '2-digit', month: 'short' }).replace(/\./g, '');
  }

  const horarioPassou = (h) => `${h.data} ${h.hora_fim}` < `${U.hojeISO()} ${U.horaAtual()}`;

  /* ------------------------------------------------------------------
     Tabela paginada reutilizável (vira cards no celular)
     ------------------------------------------------------------------ */
  function tabelaPaginada(host, { colunas, porPagina = 12, vazio }) {
    let dados = [];
    let pagina = 1;

    function render() {
      const total = dados.length;
      if (!total) { host.innerHTML = vazio(); return; }
      const paginas = Math.ceil(total / porPagina);
      pagina = Math.min(Math.max(1, pagina), paginas);
      const ini = (pagina - 1) * porPagina;
      const fatia = dados.slice(ini, ini + porPagina);

      host.innerHTML = `
        <div class="table-wrap">
          <table class="table responsive">
            <thead><tr>${colunas.map((c) => `<th scope="col" class="${c.classe || ''}">${esc(c.titulo)}</th>`).join('')}</tr></thead>
            <tbody>
              ${fatia.map((l) => `<tr data-id="${esc(l.id)}">${colunas.map((c) =>
                `<td class="${c.classe || ''}" data-label="${esc(c.titulo)}">${c.render(l)}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${paginas > 1 ? `
          <div class="card-footer">
            <span class="small muted mono">Mostrando ${ini + 1}–${Math.min(ini + porPagina, total)} de ${U.num(total)}</span>
            <div class="pagination">
              <button class="btn btn-secondary btn-sm btn-icon" type="button" data-pag="-1" aria-label="Página anterior" ${pagina === 1 ? 'disabled' : ''}>${icon('chevronLeft')}</button>
              <span class="page-info">Página ${pagina} de ${paginas}</span>
              <button class="btn btn-secondary btn-sm btn-icon" type="button" data-pag="1" aria-label="Próxima página" ${pagina === paginas ? 'disabled' : ''}>${icon('chevronRight')}</button>
            </div>
          </div>` : ''}`;
    }

    host.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pag]');
      if (!b) return;
      pagina += Number(b.dataset.pag);
      render();
      host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    return {
      definir(novos, manterPagina = false) { dados = novos; if (!manterPagina) pagina = 1; render(); },
      carregando() { host.innerHTML = U.skeletonLista(6); },
      get dados() { return dados; },
    };
  }

  /** Atualiza a cada 30 s os textos "há X min" das visitas em andamento. */
  function relogioDuracoes(raiz) {
    const tick = () => U.$$('[data-desde]', raiz).forEach((el) => { el.textContent = U.fmtDuracao(U.minutosDesde(el.dataset.desde)); });
    const t = setInterval(tick, 30000);
    limpezas.push(() => clearInterval(t));
  }

  /* ==================================================================
     LAYOUT: menu lateral, topo e menu do usuário
     ================================================================== */
  function hidratarIcones(raiz = document) {
    U.$$('[data-icon]', raiz).forEach((el) => {
      if (el.classList.contains('brand-mark')) el.innerHTML = icon(el.dataset.icon);
      else el.outerHTML = icon(el.dataset.icon);
    });
  }

  function renderUsuario() {
    const u = Auth.usuario;
    const [nivel] = NIVEIS[u.nivel_acesso] || [u.nivel_acesso];

    U.$('#sidebar-user').innerHTML = `
      ${U.avatar(u.nome_completo, u.foto_perfil)}
      <div class="info"><strong>${esc(u.nome_completo)}</strong><span>${esc(nivel)}</span></div>`;

    U.$('#user-btn').innerHTML = `
      ${U.avatar(u.nome_completo, u.foto_perfil)}
      <span class="hello"><span>Olá,</span><strong>${esc(primeiroNome(u.nome_completo))}</strong></span>
      ${icon('chevronDown')}`;
    U.$('#user-btn').setAttribute('aria-label', `Menu do usuário ${u.nome_completo}`);

    U.$('#user-dropdown').innerHTML = `
      <div class="dropdown-head"><strong>${esc(u.nome_completo)}</strong><span>${esc(u.email)}</span></div>
      <a class="dropdown-item" role="menuitem" href="#/configuracoes">${icon('settings')}Configurações</a>
      ${Auth.ehAdmin ? `<a class="dropdown-item" role="menuitem" href="#/admin">${icon('shield')}Administração</a>` : ''}
      <button class="dropdown-item danger" role="menuitem" type="button" data-logout>${icon('logout')}Sair</button>`;
  }

  function atualizarBadge(qtd) {
    const b = U.$('#badge-ativas');
    if (!b) return;
    b.textContent = qtd;
    b.hidden = !qtd;
    b.setAttribute('aria-label', `${qtd} visitas ativas`);
  }

  function montarLayout() {
    hidratarIcones();

    // Itens do menu conforme o nível de acesso
    U.$$('[data-equipe]').forEach((el) => { if (!Auth.ehEquipe) el.remove(); });
    U.$$('[data-admin]').forEach((el) => { if (!Auth.ehAdmin) el.remove(); });

    U.$('#slot-tema').outerHTML = U.tema.botao();
    renderUsuario();

    // Menu lateral no celular (drawer)
    const sidebar = U.$('#sidebar');
    const fundo = U.$('#sidebar-backdrop');
    const botaoMenu = U.$('#menu-btn');
    const abrirMenu = (abrir) => {
      sidebar.classList.toggle('is-open', abrir);
      fundo.classList.toggle('is-open', abrir);
      botaoMenu.setAttribute('aria-expanded', String(abrir));
      if (abrir) setTimeout(() => { const l = U.$('.nav-link', sidebar); if (l) l.focus(); }, 100);
    };
    botaoMenu.addEventListener('click', () => abrirMenu(!sidebar.classList.contains('is-open')));
    fundo.addEventListener('click', () => abrirMenu(false));
    App.fecharMenu = () => abrirMenu(false);

    // Menu do usuário (dropdown)
    const userBtn = U.$('#user-btn');
    const drop = U.$('#user-dropdown');
    const abrirDrop = (abrir) => { drop.hidden = !abrir; userBtn.setAttribute('aria-expanded', String(abrir)); };
    userBtn.addEventListener('click', (e) => { e.stopPropagation(); abrirDrop(drop.hidden); });
    document.addEventListener('click', (e) => { if (!drop.hidden && !e.target.closest('.user-menu')) abrirDrop(false); });
    drop.addEventListener('click', (e) => { if (e.target.closest('a,button')) abrirDrop(false); });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || document.body.classList.contains('modal-open')) return;
      if (!drop.hidden) { abrirDrop(false); userBtn.focus(); }
      if (sidebar.classList.contains('is-open')) { abrirMenu(false); botaoMenu.focus(); }
    });

    // Logout (menu lateral e dropdown)
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-logout]')) Auth.logout();
      if (e.target.closest('[data-recarregar]')) navegar();
    });

    if (Auth.ehEquipe) DB.visitas.ativas().then((l) => atualizarBadge(l.length)).catch(() => {});
  }

  /* ==================================================================
     ROTEADOR (SPA)
     ================================================================== */
  const ROTAS = {
    dashboard: { titulo: 'Dashboard', sub: 'Visão geral', render: telaDashboard },
    'visitas/nova': { titulo: 'Registrar Visita', sub: 'Entrada de visitantes', equipe: true, render: telaRegistrarVisita },
    visitas: { titulo: 'Histórico de Visitas', sub: 'Todas as visitas registradas', equipe: true, render: telaHistorico },
    agendar: { titulo: 'Agendar Horário', sub: 'Novo agendamento', render: telaAgendar },
    agendamentos: { titulo: 'Meus Agendamentos', sub: 'Seus horários', render: telaAgendamentos },
    configuracoes: { titulo: 'Configurações', sub: 'Perfil e segurança', render: telaConfiguracoes },
    admin: { titulo: 'Administração', sub: 'Usuários, agenda, sessões e dados', admin: true, render: telaAdmin },
  };

  async function navegar() {
    const caminho = location.hash.replace(/^#\/?/, '') || 'dashboard';
    let chave = caminho;
    let param = '';
    if (!ROTAS[chave]) {
      const partes = caminho.split('/');
      chave = partes[0];
      param = partes.slice(1).join('/');
    }
    const rota = ROTAS[chave];

    if (!rota) { location.replace('#/dashboard'); return; }
    if ((rota.admin && !Auth.ehAdmin) || (rota.equipe && !Auth.ehEquipe)) {
      U.toast('warning', 'Acesso restrito', 'Seu nível de acesso não permite abrir esta tela.');
      location.replace('#/dashboard');
      return;
    }

    limpezas.forEach((fn) => fn());
    limpezas = [];
    const id = ++renderAtual;

    U.$('#titulo-pagina').textContent = rota.titulo;
    U.$('#subtitulo-pagina').textContent = rota.sub;
    document.title = `${rota.titulo} · Portaria`;
    U.$$('.nav-link[data-rota]').forEach((a) => {
      const ativo = a.dataset.rota === chave;
      a.classList.toggle('is-active', ativo);
      if (ativo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (App.fecharMenu) App.fecharMenu();

    conteudo.innerHTML = '';
    window.scrollTo(0, 0);

    try {
      await rota.render(conteudo, { param, ativa: () => id === renderAtual });
    } catch (erro) {
      if (id !== renderAtual || erro.status === 401) return;
      console.warn(erro);
      conteudo.innerHTML = `<div class="card">${telaErro(erro)}</div>`;
    }
  }

  /* ==================================================================
     TELA: DASHBOARD
     ================================================================== */
  async function telaDashboard(el, ctx) {
    const u = Auth.usuario;
    const equipe = Auth.ehEquipe;

    el.innerHTML = `
      <div class="page">
        <div class="page-head anim-in">
          <div>
            <h2>${U.saudacao()}, ${esc(primeiroNome(u.nome_completo))}</h2>
            <p>${esc(U.fmtExtenso(U.agora()))} · Aqui está o resumo do seu dia.</p>
          </div>
          <div class="actions">
            ${equipe ? `<a class="btn btn-primary" href="#/visitas/nova">${icon('userPlus')}<span>Registrar visita</span></a>` : ''}
            <a class="btn ${equipe ? 'btn-secondary' : 'btn-primary'}" href="#/agendar">${icon('calendarPlus')}<span>Novo agendamento</span></a>
          </div>
        </div>
        <div id="dash-stats">${U.skeletonCards(Auth.ehAdmin ? 4 : 3)}</div>
        <div class="grid ${equipe ? 'grid-3-1' : ''}" id="dash-meio">
          ${equipe ? `<div class="card"><div class="card-body"><div class="skeleton" style="height:260px"></div></div></div>` : ''}
          <div class="card"><div class="card-body flush" style="padding-top:8px">${U.skeletonLista(4)}</div></div>
        </div>
        <div id="dash-ultimas"></div>
      </div>`;

    const r = await DB.dashboard.resumo();
    if (!ctx.ativa()) return;

    // ---- Cards de estatística ----
    const cards = equipe
      ? [
          { rotulo: 'Visitas hoje', valor: r.visitas_hoje, icone: 'users', dica: 'Desde 00:00' },
          { rotulo: 'Visitas ativas agora', valor: r.visitas_ativas, icone: 'activity', dica: `${r.visitas_ativas ? '<span class="pulse-dot"></span>' : ''}No local neste momento` },
          { rotulo: 'Próximos agendamentos', valor: r.proximos_agendamentos, icone: 'calendar', dica: 'Seus horários futuros' },
          ...(Auth.ehAdmin ? [{ rotulo: 'Usuários cadastrados', valor: r.total_usuarios, icone: 'shield', dica: 'Total no sistema' }] : []),
        ]
      : [
          { rotulo: 'Próximos agendamentos', valor: r.proximos_agendamentos, icone: 'calendar', dica: 'Seus horários futuros' },
          { rotulo: 'Agendamentos concluídos', valor: r.agendamentos_concluidos, icone: 'checkCircle', dica: 'Finalizados por você' },
          { rotulo: 'Total de agendamentos', valor: r.agendamentos_total, icone: 'calendarCheck', dica: 'Desde o cadastro' },
        ];

    U.$('#dash-stats', el).innerHTML = `<div class="stats">${cards.map((c, i) => `
      <div class="card stat anim-in" style="--i:${i}">
        <div class="stat-top"><span class="stat-label">${esc(c.rotulo)}</span><span class="stat-icon">${icon(c.icone)}</span></div>
        <div><div class="stat-value" data-valor="${Number(c.valor) || 0}">0</div><p class="stat-hint">${c.dica}</p></div>
      </div>`).join('')}</div>`;
    U.$$('[data-valor]', el).forEach((v) => U.contar(v, v.dataset.valor));

    // ---- Próximos agendamentos ----
    const proximos = `
      <div class="card anim-in" style="--i:5">
        <div class="card-header">
          <div><h3 class="card-title">Próximos agendamentos</h3><p class="card-subtitle">${U.plural(r.proximos_agendamentos, 'horário', 'horários')} pela frente</p></div>
          <a class="btn btn-ghost btn-sm" href="#/agendamentos">Ver todos ${icon('arrowRight')}</a>
        </div>
        <div class="list" style="margin-top:16px">
          ${r.lista_proximos.length ? r.lista_proximos.map((h) => `
            <div class="list-item">
              <div class="date-chip"><strong>${U.parseData(h.data).getDate()}</strong><span>${esc(U.mesCurto(h.data))}</span></div>
              <div class="grow">
                <p class="title">${esc(h.titulo)}</p>
                <p class="meta"><span>${icon('clock')}${esc(h.hora_inicio)}–${esc(h.hora_fim)}</span><span>${esc(rotuloDia(h.data))}</span></p>
              </div>
            </div>`).join('') : U.vazio({
              icone: 'calendar', titulo: 'Agenda livre',
              texto: 'Você não tem horários marcados. Que tal agendar o próximo?',
              acao: `<a class="btn btn-secondary btn-sm" href="#/agendar">${icon('plus')}<span>Agendar horário</span></a>`,
            })}
        </div>
      </div>`;

    if (!equipe) {
      U.$('#dash-meio', el).innerHTML = proximos;
      return;
    }

    atualizarBadge(r.visitas_ativas);
    const totalSemana = r.semana.reduce((s, d) => s + d.total, 0);
    U.$('#dash-meio', el).innerHTML = `
      <div class="card anim-in" style="--i:4">
        <div class="card-header">
          <div><h3 class="card-title">Visitas nos últimos 7 dias</h3><p class="card-subtitle">${U.plural(totalSemana, 'visita registrada', 'visitas registradas')} na semana</p></div>
          <span class="badge badge-brand no-dot">${icon('trendingUp')} Semana</span>
        </div>
        <div class="card-body"><div class="chart" id="grafico"></div></div>
      </div>
      ${proximos}`;
    graficoSemana(U.$('#grafico', el), r.semana);

    // ---- Últimas 5 visitas ----
    U.$('#dash-ultimas', el).innerHTML = `
      <div class="card anim-in" style="--i:6">
        <div class="card-header">
          <div><h3 class="card-title">Últimas visitas</h3><p class="card-subtitle">As 5 visitas mais recentes</p></div>
          <a class="btn btn-ghost btn-sm" href="#/visitas">Ver histórico ${icon('arrowRight')}</a>
        </div>
        <div class="list" style="margin-top:16px">
          ${r.ultimas_visitas.length ? r.ultimas_visitas.map((v) => `
            <div class="list-item">
              ${U.avatar(v.nome)}
              <div class="grow">
                <p class="title">${esc(v.nome)}</p>
                <p class="meta"><span>${icon('mapPin')}${esc(v.setor_visitado)}</span><span>${icon('clock')}${esc(U.relativo(v.data_visita))}</span></p>
              </div>
              <div class="end">
                ${badge(STATUS_VISITA, v.status)}
                <span class="small muted mono">${v.status === 'ativo'
                  ? `<span data-desde="${esc(v.data_visita)}">${U.fmtDuracao(U.minutosDesde(v.data_visita))}</span>`
                  : U.fmtDuracao(v.tempo_duracao)}</span>
              </div>
            </div>`).join('') : U.vazio({
              icone: 'users', titulo: 'Nenhuma visita ainda',
              texto: 'As visitas registradas aparecerão aqui.',
              acao: `<a class="btn btn-secondary btn-sm" href="#/visitas/nova">${icon('userPlus')}<span>Registrar primeira visita</span></a>`,
            })}
        </div>
      </div>`;
    relogioDuracoes(el);
  }

  /**
   * Gráfico de colunas em SVG (visitas por dia). Uma única série:
   * colunas finas com topo arredondado, grade discreta, tooltip ao
   * passar o mouse/focar e tabela oculta para leitores de tela.
   */
  function graficoSemana(host, dados) {
    let primeiraVez = true;

    function desenhar() {
      const largura = Math.max(280, host.clientWidth);
      const altura = 260;
      const m = { topo: 24, dir: 8, base: 44, esq: 32 };
      const areaL = largura - m.esq - m.dir;
      const areaA = altura - m.topo - m.base;

      // Escala com números "redondos"
      const maximo = Math.max(...dados.map((d) => d.total), 0);
      const passo = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000].find((p) => maximo / p <= 4) || 1000;
      const teto = Math.max(passo * Math.ceil(maximo / passo), passo * 2);
      const y = (v) => m.topo + areaA - (v / teto) * areaA;

      const faixa = areaL / dados.length;
      const barra = Math.min(24, faixa * 0.5);
      const hoje = U.hojeISO();
      const destaque = new Set([dados.length - 1, dados.reduce((mi, d, i) => (d.total > dados[mi].total ? i : mi), 0)]);

      let grade = '';
      for (let v = 0; v <= teto; v += passo) {
        grade += `<line class="grid-line" x1="${m.esq}" x2="${largura - m.dir}" y1="${y(v)}" y2="${y(v)}"/>
                  <text class="axis-label" x="${m.esq - 10}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
      }

      const colunas = dados.map((d, i) => {
        const cx = m.esq + faixa * i + faixa / 2;
        const x = cx - barra / 2;
        const h = (d.total / teto) * areaA;
        const topo = m.topo + areaA - h;
        const r = Math.min(4, h, barra / 2);
        const ehHoje = d.data === hoje;
        const caminho = h > 0
          ? `<path class="bar ${primeiraVez ? 'bar-grow' : ''}" data-i="${i}" style="animation-delay:${i * 60}ms"
               d="M${x},${topo + h} V${topo + r} Q${x},${topo} ${x + r},${topo} H${x + barra - r} Q${x + barra},${topo} ${x + barra},${topo + r} V${topo + h} Z"/>`
          : '';
        const valor = destaque.has(i) && d.total > 0
          ? `<text class="bar-value" x="${cx}" y="${topo - 8}" text-anchor="middle">${d.total}</text>` : '';
        const rotulo = ehHoje ? 'Hoje' : U.diaSemanaCurto(d.data);
        return `${caminho}${valor}
          <text class="axis-label ${ehHoje ? 'is-today' : ''}" x="${cx}" y="${altura - 22}" text-anchor="middle">${esc(rotulo.charAt(0).toUpperCase() + rotulo.slice(1))}</text>
          <text class="axis-label" x="${cx}" y="${altura - 6}" text-anchor="middle" style="font-size:11px">${esc(U.fmtData(d.data).slice(0, 5))}</text>
          <rect class="hit" x="${m.esq + faixa * i}" y="${m.topo}" width="${faixa}" height="${areaA}" data-i="${i}" tabindex="0"
                aria-label="${esc(U.fmtExtenso(d.data))}: ${U.plural(d.total, 'visita', 'visitas')}"/>`;
      }).join('');

      host.innerHTML = `
        <svg viewBox="0 0 ${largura} ${altura}" width="${largura}" height="${altura}" role="img" aria-label="Gráfico de visitas por dia nos últimos 7 dias">
          ${grade}
          <line x1="${m.esq}" x2="${largura - m.dir}" y1="${y(0)}" y2="${y(0)}" stroke="var(--border-strong)"/>
          ${colunas}
        </svg>
        <div class="chart-tooltip" role="status"></div>
        <table class="sr-only"><caption>Visitas por dia</caption><tr><th>Dia</th><th>Visitas</th></tr>
          ${dados.map((d) => `<tr><td>${esc(U.fmtData(d.data))}</td><td>${d.total}</td></tr>`).join('')}</table>`;
      primeiraVez = false;

      const tip = host.querySelector('.chart-tooltip');
      const mostrar = (alvo) => {
        const i = Number(alvo.dataset.i);
        const d = dados[i];
        host.classList.add('is-hovering');
        host.querySelectorAll('.bar').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.i) === i));
        tip.innerHTML = `<strong>${U.plural(d.total, 'visita', 'visitas')}</strong><span class="muted">${esc(U.fmtExtenso(d.data))}</span>`;
        const cx = m.esq + faixa * i + faixa / 2;
        const topo = y(d.total);
        tip.style.left = `${Math.min(Math.max(cx, 80), largura - 80)}px`;
        tip.style.top = `${topo}px`;
        tip.classList.add('is-visible');
      };
      const esconder = () => {
        host.classList.remove('is-hovering');
        tip.classList.remove('is-visible');
      };
      host.querySelectorAll('.hit').forEach((h) => {
        h.addEventListener('pointerenter', () => mostrar(h));
        h.addEventListener('focus', () => mostrar(h));
        h.addEventListener('pointerleave', esconder);
        h.addEventListener('blur', esconder);
      });
    }

    desenhar();
    // Redesenha quando o card muda de largura (responsivo)
    let ultimaLargura = host.clientWidth;
    const obs = new ResizeObserver(U.debounce(() => {
      if (Math.abs(host.clientWidth - ultimaLargura) > 4) { ultimaLargura = host.clientWidth; desenhar(); }
    }, 120));
    obs.observe(host);
    limpezas.push(() => obs.disconnect());
  }

  /* ==================================================================
     TELA: REGISTRAR VISITA
     ================================================================== */
  async function telaRegistrarVisita(el, ctx) {
    el.innerHTML = `
      <div class="page">
        <div class="page-head anim-in">
          <div><h2>Registrar visita</h2><p>A data e a hora de entrada são salvas automaticamente.</p></div>
        </div>
        <div class="grid grid-1-1">
          <div class="card anim-in" style="--i:1">
            <div class="card-header">
              <div><h3 class="card-title">Dados do visitante</h3><p class="card-subtitle">Todos os campos são obrigatórios.</p></div>
              <span class="badge badge-info no-dot mono">${icon('clock')}<span id="relogio">${U.horaAtual()}</span></span>
            </div>
            <div class="card-body">
              <form class="form" id="form-visita" novalidate>
                ${U.campo({ nome: 'nome', rotulo: 'Nome do visitante', icone: 'user', placeholder: 'Ex.: Maria da Silva', extra: 'maxlength="120"' })}
                ${U.campo({ nome: 'email', rotulo: 'E-mail do visitante', tipo: 'email', icone: 'mail', placeholder: 'maria@email.com', extra: 'maxlength="160"' })}
                ${selectHTML({ nome: 'setor_visitado', rotulo: 'Setor visitado', opcoes: Auth.setores.map((s) => ({ valor: s, texto: s })), vazio: 'Selecione o setor…' })}
                ${textareaHTML({ nome: 'motivo', rotulo: 'Motivo da visita', placeholder: 'Ex.: Reunião com a equipe comercial', max: 1000 })}
                <div class="form-actions">
                  <button class="btn btn-ghost" type="reset">Limpar</button>
                  <button class="btn btn-primary" type="submit">${icon('check')}<span>Registrar Visita</span></button>
                </div>
              </form>
            </div>
          </div>

          <div class="card anim-in" style="--i:2">
            <div class="card-header">
              <div><h3 class="card-title">Visitantes no local</h3><p class="card-subtitle" id="ativas-sub">Carregando…</p></div>
              <button class="btn btn-ghost btn-icon btn-sm" type="button" id="recarregar-ativas" aria-label="Atualizar lista">${icon('refresh')}</button>
            </div>
            <div class="list" id="lista-ativas" style="margin-top:16px">${U.skeletonLista(3)}</div>
          </div>
        </div>
      </div>`;

    const form = U.$('#form-visita', el);
    const lista = U.$('#lista-ativas', el);
    U.limparAoDigitar(form);
    ligarContadores(form);
    form.addEventListener('reset', () => U.limparErros(form));

    const relogio = setInterval(() => { const r = U.$('#relogio', el); if (r) r.textContent = U.horaAtual(); }, 10000);
    limpezas.push(() => clearInterval(relogio));
    relogioDuracoes(el);

    async function carregarAtivas() {
      const ativas = await DB.visitas.ativas();
      if (!ctx.ativa()) return;
      atualizarBadge(ativas.length);
      U.$('#ativas-sub', el).textContent = ativas.length
        ? `${U.plural(ativas.length, 'pessoa', 'pessoas')} em visita agora`
        : 'Ninguém no local no momento';
      lista.innerHTML = ativas.length ? ativas.map((v) => `
        <div class="list-item" data-id="${v.id}">
          ${U.avatar(v.nome)}
          <div class="grow">
            <p class="title">${esc(v.nome)}</p>
            <p class="meta"><span>${icon('mapPin')}${esc(v.setor_visitado)}</span><span>${icon('login')}Entrada ${esc(U.fmtHora(v.data_visita))}</span></p>
          </div>
          <div class="end">
            <span class="badge badge-success badge-live mono" data-desde="${esc(v.data_visita)}">${U.fmtDuracao(U.minutosDesde(v.data_visita))}</span>
            <button class="btn btn-success-soft btn-sm" type="button" data-finalizar="${v.id}" data-nome="${esc(v.nome)}">${icon('logout')}<span>Finalizar Visita</span></button>
          </div>
        </div>`).join('') : U.vazio({ icone: 'door', titulo: 'Nenhum visitante no local', texto: 'Quando você registrar uma entrada, ela aparece aqui até ser finalizada.' });
    }

    lista.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-finalizar]');
      if (!b) return;
      const ok = await U.confirmar({
        titulo: 'Finalizar visita?',
        mensagem: `Registrar a saída de ${b.dataset.nome} agora. A duração será calculada automaticamente.`,
        textoConfirmar: 'Finalizar visita',
        icone: 'logout',
      });
      if (!ok) return;
      U.carregando(b, true);
      try {
        const v = await DB.visitas.finalizar(Number(b.dataset.finalizar));
        U.toast('success', 'Visita finalizada', `${v.nome} — duração de ${U.fmtDuracao(v.tempo_duracao)}.`);
        await carregarAtivas();
      } catch (erro) {
        U.carregando(b, false);
        falha(erro, 'Não foi possível finalizar');
        carregarAtivas().catch(() => {});
      }
    });
    U.$('#recarregar-ativas', el).addEventListener('click', () => carregarAtivas().catch((e) => falha(e)));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      U.limparErros(form);
      const d = U.dadosForm(form);
      const erros = {};
      const eNome = U.validarNome(d.nome, 'Nome do visitante');
      if (eNome) erros.nome = eNome;
      if (!d.email) erros.email = 'Informe o e-mail.';
      else if (!U.EMAIL_RE.test(d.email)) erros.email = 'Informe um e-mail válido.';
      if (!d.setor_visitado) erros.setor_visitado = 'Selecione o setor visitado.';
      if (d.motivo.length < 3) erros.motivo = 'Descreva o motivo (mín. 3 caracteres).';
      if (Object.keys(erros).length) { U.mostrarErros(form, erros); return; }

      const botao = form.querySelector('[type=submit]');
      U.carregando(botao, true);
      try {
        const v = await DB.visitas.criar(d);
        U.toast('success', 'Visita registrada', `${v.nome} entrou às ${U.fmtHora(v.data_visita)} · ${v.setor_visitado}.`);
        form.reset();
        form.elements.nome.focus();
        await carregarAtivas();
      } catch (erro) {
        falha(erro, 'Não foi possível registrar', form);
      } finally {
        U.carregando(botao, false);
      }
    });

    await carregarAtivas();
  }

  /* ==================================================================
     TELA: HISTÓRICO DE VISITAS
     ================================================================== */
  async function telaHistorico(el, ctx) {
    const filtros = { busca: '', data: '', setor: '', status: '' };

    el.innerHTML = `
      <div class="page">
        <div class="page-head anim-in">
          <div><h2>Histórico de visitas</h2><p>Pesquise, filtre e exporte todas as visitas registradas.</p></div>
          <div class="actions">
            <button class="btn btn-secondary" type="button" id="exportar">${icon('download')}<span>Exportar CSV</span></button>
            <a class="btn btn-primary" href="#/visitas/nova">${icon('userPlus')}<span>Nova visita</span></a>
          </div>
        </div>
        <div class="card anim-in" style="--i:1">
          <form class="toolbar" id="filtros" role="search" onsubmit="return false">
            <div class="field grow">
              <label class="field-label" for="f-busca">Pesquisar</label>
              <div class="input-wrap">${icon('search', 'input-icon')}<input class="input" id="f-busca" name="busca" type="search" placeholder="Nome ou e-mail do visitante" autocomplete="off"></div>
            </div>
            <div class="field">
              <label class="field-label" for="f-data">Data</label>
              <input class="input" id="f-data" name="data" type="date" max="${U.hojeISO()}">
            </div>
            <div class="field">
              <label class="field-label" for="f-setor">Setor</label>
              <select class="select" id="f-setor" name="setor"><option value="">Todos os setores</option>
                ${Auth.setores.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select>
            </div>
            <div class="field">
              <label class="field-label" for="f-status">Status</label>
              <select class="select" id="f-status" name="status">
                <option value="">Todos</option><option value="ativo">Ativo</option><option value="finalizado">Finalizado</option>
              </select>
            </div>
            <div class="toolbar-actions">
              <button class="btn btn-ghost" type="button" id="limpar-filtros">${icon('filterX')}<span>Limpar</span></button>
            </div>
          </form>
          <div class="result-bar"><span id="contagem">Carregando…</span><span class="small">Clique em <strong>Finalizar</strong> para registrar a saída.</span></div>
          <div id="tabela-visitas"></div>
        </div>
      </div>`;

    const formFiltros = U.$('#filtros', el);
    const temFiltro = () => Object.values(filtros).some(Boolean);

    const tabela = tabelaPaginada(U.$('#tabela-visitas', el), {
      porPagina: 12,
      vazio: () => (temFiltro()
        ? U.vazio({ icone: 'search', titulo: 'Nenhuma visita encontrada', texto: 'Tente ajustar ou limpar os filtros da pesquisa.' })
        : U.vazio({ icone: 'history', titulo: 'Nenhuma visita registrada', texto: 'O histórico começa a ser preenchido assim que você registrar a primeira visita.',
            acao: `<a class="btn btn-primary btn-sm" href="#/visitas/nova">${icon('userPlus')}<span>Registrar visita</span></a>` })),
      colunas: [
        { titulo: 'Nome / E-mail', classe: 'td-main', render: (v) => `<div class="cell-user">${U.avatar(v.nome, '', 'avatar-sm')}<div class="cell-text"><strong>${esc(v.nome)}</strong><span>${esc(v.email)}</span></div></div>` },
        { titulo: 'Data/Hora', render: (v) => `<span class="cell-stack mono">${esc(U.fmtData(v.data_visita))}<small>${esc(U.fmtHora(v.data_visita))}</small></span>` },
        { titulo: 'Setor', render: (v) => esc(v.setor_visitado) },
        { titulo: 'Motivo', render: (v) => `<span class="cell-clamp" title="${esc(v.motivo)}">${esc(v.motivo)}</span>` },
        { titulo: 'Status', render: (v) => badge(STATUS_VISITA, v.status) },
        { titulo: 'Duração', render: (v) => (v.status === 'ativo'
            ? `<span class="nowrap mono muted"><span data-desde="${esc(v.data_visita)}">${U.fmtDuracao(U.minutosDesde(v.data_visita))}</span> …</span>`
            : `<span class="nowrap mono">${U.fmtDuracao(v.tempo_duracao)}</span>`) },
        { titulo: 'Ações', classe: 'col-actions', render: (v) => `<div class="table-actions">
            ${v.status === 'ativo' ? `<button class="btn btn-success-soft btn-sm" type="button" data-acao="finalizar" data-id="${v.id}">${icon('logout')}<span>Finalizar</span></button>` : ''}
            ${Auth.ehAdmin ? `<button class="btn btn-ghost btn-icon btn-sm" type="button" data-acao="excluir" data-id="${v.id}" aria-label="Excluir visita de ${esc(v.nome)}">${icon('trash')}</button>` : ''}
            ${v.status !== 'ativo' && !Auth.ehAdmin ? '<span class="muted small">—</span>' : ''}
          </div>` },
      ],
    });
    relogioDuracoes(el);

    async function carregar(manterPagina = false) {
      if (!manterPagina) tabela.carregando();
      const lista = await DB.visitas.listar(filtros);
      if (!ctx.ativa()) return;
      U.$('#contagem', el).textContent = `${U.plural(lista.length, 'visita encontrada', 'visitas encontradas')}${lista.length >= 2000 ? ' (limite de 2000)' : ''}`;
      tabela.definir(lista, manterPagina);
    }
    const recarregar = () => carregar().catch((e) => falha(e, 'Erro ao carregar visitas'));

    formFiltros.busca.addEventListener('input', U.debounce(() => { filtros.busca = formFiltros.busca.value.trim(); recarregar(); }, 350));
    ['data', 'setor', 'status'].forEach((nome) => formFiltros[nome].addEventListener('change', () => { filtros[nome] = formFiltros[nome].value; recarregar(); }));
    U.$('#limpar-filtros', el).addEventListener('click', () => {
      formFiltros.reset();
      Object.keys(filtros).forEach((k) => { filtros[k] = ''; });
      recarregar();
    });

    U.$('#tabela-visitas', el).addEventListener('click', async (e) => {
      const b = e.target.closest('[data-acao]');
      if (!b) return;
      const v = tabela.dados.find((x) => x.id === Number(b.dataset.id));
      if (!v) return;

      if (b.dataset.acao === 'finalizar') {
        const ok = await U.confirmar({ titulo: 'Finalizar visita?', mensagem: `Registrar a saída de ${v.nome} agora.`, textoConfirmar: 'Finalizar visita', icone: 'logout' });
        if (!ok) return;
        U.carregando(b, true);
        try {
          const f = await DB.visitas.finalizar(v.id);
          U.toast('success', 'Visita finalizada', `${f.nome} — duração de ${U.fmtDuracao(f.tempo_duracao)}.`);
          DB.visitas.ativas().then((l) => atualizarBadge(l.length)).catch(() => {});
          await carregar(true);
        } catch (erro) { U.carregando(b, false); falha(erro, 'Não foi possível finalizar'); }
      }

      if (b.dataset.acao === 'excluir') {
        const ok = await U.confirmar({
          titulo: 'Excluir esta visita?',
          mensagem: `A visita de ${v.nome} (${U.fmtDataHora(v.data_visita)}) será apagada permanentemente.`,
          textoConfirmar: 'Excluir', perigo: true,
        });
        if (!ok) return;
        U.carregando(b, true);
        try {
          await DB.visitas.excluir(v.id);
          U.toast('success', 'Visita excluída');
          await carregar(true);
        } catch (erro) { U.carregando(b, false); falha(erro, 'Não foi possível excluir'); }
      }
    });

    U.$('#exportar', el).addEventListener('click', () => {
      const linhas = tabela.dados;
      if (!linhas.length) { U.toast('warning', 'Nada para exportar', 'Não há visitas com os filtros atuais.'); return; }
      const csv = U.gerarCSV(linhas, [
        { titulo: 'ID', chave: 'id' },
        { titulo: 'Nome', chave: 'nome' },
        { titulo: 'E-mail', chave: 'email' },
        { titulo: 'Data/Hora de entrada', valor: (v) => U.fmtDataHora(v.data_visita) },
        { titulo: 'Data/Hora de saída', valor: (v) => (v.data_saida ? U.fmtDataHora(v.data_saida) : '') },
        { titulo: 'Setor', chave: 'setor_visitado' },
        { titulo: 'Motivo', chave: 'motivo' },
        { titulo: 'Status', chave: 'status' },
        { titulo: 'Duração (min)', valor: (v) => (v.tempo_duracao ?? '') },
        { titulo: 'Registrado por', chave: 'registrado_por_nome' },
      ]);
      U.baixar(`visitas_${U.carimbo()}.csv`, csv);
      U.toast('success', 'CSV exportado', `${U.plural(linhas.length, 'visita', 'visitas')} no arquivo.`);
    });

    await carregar();
  }

  /* ==================================================================
     TELA: AGENDAR HORÁRIO
     ================================================================== */
  function horarioPadrao() {
    const d = U.agora();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    if (d.getHours() >= 22 || d.getHours() < 7) {
      if (d.getHours() >= 22) d.setDate(d.getDate() + 1);
      d.setHours(9);
    }
    const ini = `${String(d.getHours()).padStart(2, '0')}:00`;
    const fim = `${String(d.getHours() + 1).padStart(2, '0')}:00`;
    return { data: U.isoData(d), ini, fim };
  }

  async function telaAgendar(el, ctx) {
    const padrao = horarioPadrao();
    el.innerHTML = `
      <div class="page">
        <div class="page-head anim-in">
          <div><h2>Agendar horário</h2><p>Escolha data e horário. O sistema impede horários sobrepostos.</p></div>
          <div class="actions"><a class="btn btn-secondary" href="#/agendamentos">${icon('calendarCheck')}<span>Meus agendamentos</span></a></div>
        </div>
        <div class="grid grid-1-1">
          <div class="card anim-in" style="--i:1">
            <div class="card-header"><div><h3 class="card-title">Novo agendamento</h3><p class="card-subtitle">Campos com * são obrigatórios.</p></div></div>
            <div class="card-body">
              <form class="form" id="form-agendar" novalidate>
                ${U.campo({ nome: 'titulo', rotulo: 'Título *', icone: 'type', placeholder: 'Ex.: Reunião com fornecedor', extra: 'maxlength="120"' })}
                ${U.campo({ nome: 'data', rotulo: 'Data *', tipo: 'date', icone: 'calendar', valor: padrao.data, extra: `min="${U.hojeISO()}"` })}
                <div class="form-row">
                  ${U.campo({ nome: 'hora_inicio', rotulo: 'Hora de início *', tipo: 'time', icone: 'clock', valor: padrao.ini })}
                  ${U.campo({ nome: 'hora_fim', rotulo: 'Hora de fim *', tipo: 'time', icone: 'clock', valor: padrao.fim })}
                </div>
                <p class="field-hint" id="duracao-hint" style="margin-top:-8px"></p>
                ${textareaHTML({ nome: 'descricao', rotulo: 'Descrição', opcional: true, placeholder: 'Detalhes, participantes, local…', max: 1000 })}
                <div class="form-actions">
                  <button class="btn btn-ghost" type="reset">Limpar</button>
                  <button class="btn btn-primary" type="submit">${icon('calendarPlus')}<span>Agendar</span></button>
                </div>
              </form>
            </div>
          </div>

          <div class="card anim-in" style="--i:2">
            <div class="card-header"><div><h3 class="card-title" id="dia-titulo">Sua agenda</h3><p class="card-subtitle" id="dia-sub"></p></div></div>
            <div class="card-body"><div class="day-timeline" id="dia-lista">${U.skeletonLista(2)}</div></div>
          </div>
        </div>
      </div>`;

    const form = U.$('#form-agendar', el);
    U.limparAoDigitar(form);
    ligarContadores(form);
    let meus = [];

    /** Mostra os agendamentos do dia escolhido + prévia do novo horário. */
    function atualizarDia() {
      const { data, hora_inicio: ini, hora_fim: fim } = U.dadosForm(form);
      const hint = U.$('#duracao-hint', el);
      const valido = ini && fim && fim > ini;
      hint.textContent = valido ? `Duração: ${U.fmtDuracao(minutosDoDia(fim) - minutosDoDia(ini))}` : '';

      const lista = U.$('#dia-lista', el);
      if (!data) { lista.innerHTML = ''; return; }
      U.$('#dia-titulo', el).textContent = `Sua agenda · ${rotuloDia(data)}`;
      const doDia = meus.filter((h) => h.data === data && h.status === 'agendado').sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
      U.$('#dia-sub', el).textContent = U.fmtExtenso(data, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

      const itens = doDia.map((h) => {
        const conflito = valido && h.hora_inicio < fim && h.hora_fim > ini;
        return `<div class="slot ${conflito ? 'is-conflict' : ''}">
          <span class="time">${esc(h.hora_inicio)}–${esc(h.hora_fim)}</span>
          <span class="slot-title">${esc(h.titulo)}</span>
          ${conflito ? `<span class="badge badge-danger" style="margin-left:auto">Conflito</span>` : ''}
        </div>`;
      });
      if (valido) {
        itens.push(`<div class="slot is-preview"><span class="time">${esc(ini)}–${esc(fim)}</span><span class="slot-title">${esc(form.titulo.value || 'Novo agendamento')}</span><span class="badge badge-brand no-dot" style="margin-left:auto">Novo</span></div>`);
        itens.sort((a, b) => a.match(/class="time">([^<]+)/)[1].localeCompare(b.match(/class="time">([^<]+)/)[1]));
      }
      lista.innerHTML = doDia.length || valido
        ? itens.join('') + (doDia.length ? '' : '<p class="small muted" style="margin-top:8px">Nenhum outro horário seu neste dia.</p>')
        : U.vazio({ icone: 'calendar', titulo: 'Dia livre', texto: 'Você não tem agendamentos nesta data.' });
    }

    ['input', 'change'].forEach((ev) => form.addEventListener(ev, atualizarDia));
    form.addEventListener('reset', () => setTimeout(() => {
      const p = horarioPadrao();
      form.data.value = p.data; form.hora_inicio.value = p.ini; form.hora_fim.value = p.fim;
      U.limparErros(form);
      atualizarDia();
    }));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      U.limparErros(form);
      const d = U.dadosForm(form);
      const erros = {};
      if (d.titulo.length < 3) erros.titulo = 'O título deve ter ao menos 3 caracteres.';
      if (!d.data) erros.data = 'Informe a data.';
      else if (d.data < U.hojeISO()) erros.data = 'Escolha uma data a partir de hoje.';
      if (!d.hora_inicio) erros.hora_inicio = 'Informe a hora de início.';
      if (!d.hora_fim) erros.hora_fim = 'Informe a hora de fim.';
      if (d.hora_inicio && d.hora_fim && d.hora_fim <= d.hora_inicio) erros.hora_fim = 'A hora de fim deve ser posterior à hora de início.';
      if (!erros.data && !erros.hora_inicio && d.data === U.hojeISO() && d.hora_inicio < U.horaAtual()) erros.hora_inicio = 'Esse horário já passou. Escolha um horário futuro.';
      if (!Object.keys(erros).length) {
        const conflito = meus.find((h) => h.data === d.data && h.status === 'agendado' && h.hora_inicio < d.hora_fim && h.hora_fim > d.hora_inicio);
        if (conflito) erros.hora_inicio = `Conflito com "${conflito.titulo}" (${conflito.hora_inicio}–${conflito.hora_fim}). Escolha outro horário.`;
      }
      if (Object.keys(erros).length) { U.mostrarErros(form, erros); return; }

      const botao = form.querySelector('[type=submit]');
      U.carregando(botao, true);
      try {
        const h = await DB.horarios.criar(d);
        U.toast('success', 'Horário agendado!', `${h.titulo} · ${rotuloDia(h.data)}, ${h.hora_inicio}–${h.hora_fim}.`);
        meus.push(h);
        form.titulo.value = '';
        form.descricao.value = '';
        form.descricao.dispatchEvent(new Event('input'));
        form.titulo.focus();
        atualizarDia();
      } catch (erro) {
        falha(erro, 'Não foi possível agendar', form);
      } finally {
        U.carregando(botao, false);
      }
    });

    meus = await DB.horarios.listar();
    if (!ctx.ativa()) return;
    atualizarDia();
  }

  /* ==================================================================
     TELA: MEUS AGENDAMENTOS
     ================================================================== */
  /** Card de um agendamento (usado em Meus Agendamentos). */
  function cardAgendamento(h, i) {
    const d = U.parseData(h.data);
    const passou = h.status === 'agendado' && horarioPassou(h);
    return `
      <article class="card appt anim-in" style="--i:${Math.min(i, 8)}" data-status="${esc(h.status)}" data-id="${h.id}">
        <div class="date-chip"><strong>${d.getDate()}</strong><span>${esc(U.mesCurto(h.data))}</span></div>
        <div style="min-width:0">
          <p class="appt-title">${esc(h.titulo)}</p>
          <p class="appt-meta">
            <span>${icon('clock')}${esc(h.hora_inicio)}–${esc(h.hora_fim)} · ${U.fmtDuracao(minutosDoDia(h.hora_fim) - minutosDoDia(h.hora_inicio))}</span>
            <span>${icon('calendar')}${esc(rotuloDia(h.data))}</span>
            ${passou ? `<span style="color:var(--warning-text)">${icon('alert')}O horário já passou</span>` : ''}
          </p>
          ${h.descricao ? `<p class="appt-desc">${esc(h.descricao)}</p>` : ''}
        </div>
        <div class="appt-side">
          ${badge(STATUS_AGENDA, h.status)}
          <div class="appt-actions">
            ${h.status === 'agendado' ? `
              <button class="btn btn-success-soft btn-sm" type="button" data-acao="concluir">${icon('check')}<span>Finalizar</span></button>
              <button class="btn btn-danger-soft btn-sm" type="button" data-acao="cancelar">${icon('ban')}<span>Cancelar</span></button>` : `
              <button class="btn btn-ghost btn-sm" type="button" data-acao="excluir" aria-label="Excluir agendamento ${esc(h.titulo)}">${icon('trash')}<span>Excluir</span></button>`}
          </div>
        </div>
      </article>`;
  }

  /** Ações de cancelar/finalizar/excluir agendamento (com confirmação). */
  async function acaoAgendamento(acao, h, botao) {
    const textos = {
      cancelar: { titulo: 'Cancelar agendamento?', msg: `"${h.titulo}" em ${U.fmtData(h.data)} às ${h.hora_inicio} será cancelado.`, botao: 'Cancelar agendamento', perigo: true, ok: 'Agendamento cancelado' },
      concluir: { titulo: 'Finalizar agendamento?', msg: `Marcar "${h.titulo}" como concluído.`, botao: 'Finalizar', perigo: false, ok: 'Agendamento concluído' },
      excluir: { titulo: 'Excluir agendamento?', msg: `"${h.titulo}" será apagado permanentemente.`, botao: 'Excluir', perigo: true, ok: 'Agendamento excluído' },
    }[acao];
    const ok = await U.confirmar({ titulo: textos.titulo, mensagem: textos.msg, textoConfirmar: textos.botao, perigo: textos.perigo, icone: acao === 'concluir' ? 'checkCircle' : undefined });
    if (!ok) return false;
    U.carregando(botao, true);
    try {
      await DB.horarios[acao](h.id);
      U.toast('success', textos.ok, h.titulo);
      return true;
    } catch (erro) {
      U.carregando(botao, false);
      falha(erro, 'Não foi possível concluir a ação');
      return false;
    }
  }

  async function telaAgendamentos(el, ctx) {
    let filtro = 'todos';
    let lista = [];

    el.innerHTML = `
      <div class="page">
        <div class="page-head anim-in">
          <div><h2>Meus agendamentos</h2><p>Acompanhe, finalize ou cancele seus horários.</p></div>
          <div class="actions"><a class="btn btn-primary" href="#/agendar">${icon('calendarPlus')}<span>Novo agendamento</span></a></div>
        </div>
        <div class="anim-in" style="--i:1"><div class="tabs" role="tablist" id="abas"></div></div>
        <div id="lista-agenda" class="appt-list">${Array.from({ length: 3 }, () => '<div class="card" style="padding:20px"><div class="skeleton" style="height:56px"></div></div>').join('')}</div>
      </div>`;

    function render() {
      const contagem = { todos: lista.length, agendado: 0, concluido: 0, cancelado: 0 };
      lista.forEach((h) => { contagem[h.status]++; });
      const abas = [['todos', 'Todos'], ['agendado', 'Agendados'], ['concluido', 'Concluídos'], ['cancelado', 'Cancelados']];
      U.$('#abas', el).innerHTML = abas.map(([k, t]) => `
        <button class="tab ${filtro === k ? 'is-active' : ''}" role="tab" type="button" aria-selected="${filtro === k}" data-filtro="${k}">${t}<span class="count">${contagem[k]}</span></button>`).join('');

      // Próximos primeiro (ordem crescente), depois o histórico (mais recentes primeiro)
      const chave = (h) => `${h.data} ${h.hora_inicio}`;
      const ativos = lista.filter((h) => h.status === 'agendado').sort((a, b) => chave(a).localeCompare(chave(b)));
      const outros = lista.filter((h) => h.status !== 'agendado').sort((a, b) => chave(b).localeCompare(chave(a)));
      const visiveis = [...ativos, ...outros].filter((h) => filtro === 'todos' || h.status === filtro);

      const alvo = U.$('#lista-agenda', el);
      if (!visiveis.length) {
        const textos = {
          todos: ['Nenhum agendamento ainda', 'Crie seu primeiro agendamento para organizar seus horários.'],
          agendado: ['Nenhum horário agendado', 'Você não tem agendamentos ativos no momento.'],
          concluido: ['Nada concluído ainda', 'Agendamentos finalizados aparecerão aqui.'],
          cancelado: ['Nenhum cancelamento', 'Ótimo! Você não cancelou nenhum horário.'],
        }[filtro];
        alvo.innerHTML = `<div class="card">${U.vazio({
          icone: 'calendar', titulo: textos[0], texto: textos[1],
          acao: filtro === 'todos' || filtro === 'agendado' ? `<a class="btn btn-primary btn-sm" href="#/agendar">${icon('calendarPlus')}<span>Agendar horário</span></a>` : '',
        })}</div>`;
        return;
      }
      alvo.innerHTML = visiveis.map(cardAgendamento).join('');
    }

    U.$('#abas', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-filtro]');
      if (b) { filtro = b.dataset.filtro; render(); }
    });

    U.$('#lista-agenda', el).addEventListener('click', async (e) => {
      const b = e.target.closest('[data-acao]');
      if (!b) return;
      const h = lista.find((x) => x.id === Number(b.closest('[data-id]').dataset.id));
      if (h && await acaoAgendamento(b.dataset.acao, h, b)) {
        lista = await DB.horarios.listar();
        if (ctx.ativa()) render();
      }
    });

    lista = await DB.horarios.listar();
    if (!ctx.ativa()) return;
    render();
  }

  /* ==================================================================
     TELA: CONFIGURAÇÕES
     ================================================================== */
  async function telaConfiguracoes(el) {
    const u = Auth.usuario;
    let foto = u.foto_perfil || '';
    const [nivel, classeNivel] = NIVEIS[u.nivel_acesso];

    el.innerHTML = `
      <div class="page">
        <div class="page-head anim-in"><div><h2>Configurações</h2><p>Gerencie seu perfil, sua senha e sua conta.</p></div></div>
        <div class="grid grid-1-1">
          <div class="stack">
            <section class="card anim-in" style="--i:1">
              <div class="card-header"><div><h3 class="card-title">Perfil</h3><p class="card-subtitle">Como você aparece no sistema.</p></div></div>
              <div class="card-body">
                <form class="form" id="form-perfil" novalidate>
                  <div class="profile-photo">
                    <span id="foto-preview">${U.avatar(u.nome_completo, foto, 'avatar-xl')}</span>
                    <div class="photo-info">
                      <div class="photo-actions">
                        <label class="btn btn-secondary btn-sm" for="foto-arquivo" tabindex="0">${icon('upload')}<span>Enviar foto</span></label>
                        <input type="file" id="foto-arquivo" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
                        <button class="btn btn-ghost btn-sm" type="button" id="foto-url-btn">${icon('link')}<span>Usar URL</span></button>
                        <button class="btn btn-ghost btn-sm" type="button" id="foto-remover" ${foto ? '' : 'hidden'}>${icon('trash')}<span>Remover</span></button>
                      </div>
                      <p class="field-hint">PNG, JPG ou WEBP. A imagem é recortada e reduzida automaticamente.</p>
                    </div>
                  </div>
                  <div id="foto-url-campo" hidden>
                    ${U.campo({ nome: 'foto_perfil', rotulo: 'URL da foto', tipo: 'url', icone: 'link', placeholder: 'https://…', valor: /^https?:/i.test(foto) ? foto : '' })}
                  </div>
                  ${U.campo({ nome: 'nome_completo', rotulo: 'Nome completo', icone: 'user', valor: u.nome_completo, auto: 'name', extra: 'maxlength="120"' })}
                  ${U.campo({ nome: 'email', rotulo: 'E-mail', tipo: 'email', icone: 'mail', valor: u.email, auto: 'email', extra: 'maxlength="160"' })}
                  <div class="form-actions"><button class="btn btn-primary" type="submit">${icon('check')}<span>Salvar Alterações</span></button></div>
                </form>
              </div>
            </section>

            <section class="card anim-in" style="--i:2">
              <div class="card-header"><div><h3 class="card-title">Mudar senha</h3><p class="card-subtitle">Use letras e números, com no mínimo 6 caracteres.</p></div></div>
              <div class="card-body">
                <form class="form" id="form-senha" novalidate>
                  <input type="text" name="username" value="${esc(u.email)}" autocomplete="username" hidden>
                  ${U.campo({ nome: 'senha_atual', rotulo: 'Senha atual', tipo: 'password', icone: 'lock', auto: 'current-password' })}
                  <div class="form-row">
                    <div>
                      ${U.campo({ nome: 'nova_senha', rotulo: 'Nova senha', tipo: 'password', icone: 'key', auto: 'new-password', extra: 'maxlength="72"' })}
                      <div class="strength" id="forca-nova" data-nivel="0" aria-hidden="true" style="margin-top:8px"><span></span><span></span><span></span><span></span></div>
                    </div>
                    ${U.campo({ nome: 'confirmar_senha', rotulo: 'Confirmar nova senha', tipo: 'password', icone: 'key', auto: 'new-password', extra: 'maxlength="72"' })}
                  </div>
                  <div class="form-actions"><button class="btn btn-primary" type="submit">${icon('lock')}<span>Salvar Alterações</span></button></div>
                </form>
              </div>
            </section>
          </div>

          <div class="stack">
            <section class="card anim-in" style="--i:3">
              <div class="card-header"><div><h3 class="card-title">Sua conta</h3><p class="card-subtitle">Informações de acesso.</p></div></div>
              <div class="card-body">
                <dl class="kv">
                  <div><dt>Nível de acesso</dt><dd><span class="badge ${classeNivel}">${esc(nivel)}</span></dd></div>
                  <div><dt>Cadastrado em</dt><dd class="mono">${esc(U.fmtDataHora(u.data_cadastro))}</dd></div>
                  <div><dt>Último login</dt><dd class="mono">${esc(U.fmtDataHora(u.ultima_sessao))}</dd></div>
                  <div><dt>Tema</dt><dd>${U.tema.botao()}</dd></div>
                </dl>
              </div>
            </section>

            <section class="card card-danger anim-in" style="--i:4">
              <div class="card-header"><div><h3 class="card-title">Zona de perigo</h3><p class="card-subtitle">Ações permanentes e irreversíveis.</p></div></div>
              <div class="card-body" style="display:grid;gap:16px">
                <p class="small muted">Ao excluir sua conta, seus agendamentos e o histórico de sessões são apagados. As visitas que você registrou continuam no sistema, sem o seu nome.</p>
                <button class="btn btn-danger" type="button" id="excluir-conta" style="justify-self:start">${icon('trash')}<span>Excluir Conta</span></button>
              </div>
            </section>
          </div>
        </div>
      </div>`;

    U.ligarOlhoSenha(el);
    const formPerfil = U.$('#form-perfil', el);
    const formSenha = U.$('#form-senha', el);
    [formPerfil, formSenha].forEach(U.limparAoDigitar);

    // ---- Foto de perfil ----
    const preview = () => {
      U.$('#foto-preview', el).innerHTML = U.avatar(formPerfil.nome_completo.value || u.nome_completo, foto, 'avatar-xl');
      U.$('#foto-remover', el).hidden = !foto;
    };
    U.$('#foto-arquivo', el).addEventListener('change', async (e) => {
      const arquivo = e.target.files[0];
      e.target.value = '';
      if (!arquivo) return;
      try {
        foto = await U.redimensionarImagem(arquivo);
        formPerfil.foto_perfil.value = '';
        preview();
        U.toast('info', 'Foto carregada', 'Clique em "Salvar Alterações" para confirmar.');
      } catch (erro) { U.toast('error', 'Imagem inválida', erro.message); }
    });
    U.$('label[for="foto-arquivo"]', el).addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); U.$('#foto-arquivo', el).click(); }
    });
    U.$('#foto-url-btn', el).addEventListener('click', () => {
      const campo = U.$('#foto-url-campo', el);
      campo.hidden = !campo.hidden;
      if (!campo.hidden) formPerfil.foto_perfil.focus();
    });
    formPerfil.foto_perfil.addEventListener('input', () => {
      const url = formPerfil.foto_perfil.value.trim();
      if (/^https?:\/\/.+/i.test(url)) { foto = url; preview(); }
      else if (!url) { foto = ''; preview(); }
    });
    U.$('#foto-remover', el).addEventListener('click', () => { foto = ''; formPerfil.foto_perfil.value = ''; preview(); });

    formPerfil.addEventListener('submit', async (e) => {
      e.preventDefault();
      U.limparErros(formPerfil);
      const d = U.dadosForm(formPerfil);
      const erros = {};
      const eNome = U.validarNome(d.nome_completo, 'Nome completo');
      if (eNome) erros.nome_completo = eNome;
      if (!U.EMAIL_RE.test(d.email)) erros.email = 'Informe um e-mail válido.';
      if (d.foto_perfil && !/^https?:\/\/.+/i.test(d.foto_perfil)) { erros.foto_perfil = 'Informe uma URL começando com http:// ou https://'; U.$('#foto-url-campo', el).hidden = false; }
      if (Object.keys(erros).length) { U.mostrarErros(formPerfil, erros); return; }

      const botao = formPerfil.querySelector('[type=submit]');
      U.carregando(botao, true);
      try {
        const atualizado = await DB.usuarios.atualizarPerfil({ nome_completo: d.nome_completo, email: d.email, foto_perfil: foto });
        Auth.atualizarUsuario(atualizado);
        renderUsuario();
        U.toast('success', 'Perfil atualizado', 'Suas alterações foram salvas.');
      } catch (erro) {
        if (erro.campos && erro.campos.foto_perfil) U.$('#foto-url-campo', el).hidden = false;
        falha(erro, 'Não foi possível salvar', formPerfil);
      } finally {
        U.carregando(botao, false);
      }
    });

    // ---- Senha ----
    formSenha.nova_senha.addEventListener('input', () => { U.$('#forca-nova', el).dataset.nivel = U.forcaSenha(formSenha.nova_senha.value); });
    formSenha.addEventListener('submit', async (e) => {
      e.preventDefault();
      U.limparErros(formSenha);
      const d = U.dadosForm(formSenha);
      const erros = {};
      if (!d.senha_atual) erros.senha_atual = 'Informe a senha atual.';
      const eSenha = U.validarSenha(d.nova_senha);
      if (eSenha) erros.nova_senha = eSenha;
      else if (d.nova_senha === d.senha_atual) erros.nova_senha = 'A nova senha deve ser diferente da atual.';
      if (d.confirmar_senha !== d.nova_senha) erros.confirmar_senha = 'As senhas não coincidem.';
      if (Object.keys(erros).length) { U.mostrarErros(formSenha, erros); return; }

      const botao = formSenha.querySelector('[type=submit]');
      U.carregando(botao, true);
      try {
        await DB.usuarios.alterarSenha(d);
        formSenha.reset();
        formSenha.username.value = u.email;
        U.$('#forca-nova', el).dataset.nivel = 0;
        U.toast('success', 'Senha alterada', 'Use a nova senha no próximo login.');
      } catch (erro) {
        falha(erro, 'Não foi possível alterar a senha', formSenha);
      } finally {
        U.carregando(botao, false);
      }
    });

    // ---- Excluir conta (confirmação com senha) ----
    U.$('#excluir-conta', el).addEventListener('click', () => {
      U.modal({
        titulo: 'Excluir sua conta?',
        descricao: 'Essa ação é permanente. Digite sua senha para confirmar.',
        icone: 'alert',
        tipoIcone: 'danger',
        corpo: `<form class="form" id="form-excluir" novalidate>
                  <input type="text" name="username" value="${esc(u.email)}" autocomplete="username" hidden>
                  ${U.campo({ nome: 'senha', rotulo: 'Sua senha', tipo: 'password', icone: 'lock', auto: 'current-password' })}
                </form>`,
        rodape: `<button class="btn btn-secondary" type="button" data-fechar>Cancelar</button>
                 <button class="btn btn-danger" type="submit" form="form-excluir">${icon('trash')}<span>Excluir minha conta</span></button>`,
        aoAbrir: (caixa) => {
          const f = caixa.querySelector('#form-excluir');
          U.ligarOlhoSenha(caixa);
          U.limparAoDigitar(f);
          f.addEventListener('submit', async (e) => {
            e.preventDefault();
            U.limparErros(f);
            if (!f.senha.value) { U.mostrarErros(f, { senha: 'Digite sua senha.' }); return; }
            const botao = caixa.querySelector('.btn-danger');
            U.carregando(botao, true);
            try {
              await DB.usuarios.excluirConta(f.senha.value);
              try { localStorage.removeItem('portaria-sessao'); } catch (err) { /* ignore */ }
              location.replace('index.html?motivo=excluida');
            } catch (erro) {
              U.carregando(botao, false);
              falha(erro, 'Não foi possível excluir', f);
            }
          });
        },
      });
    });
  }

  /* ==================================================================
     TELA: ADMINISTRAÇÃO
     ================================================================== */
  const ABAS_ADMIN = [
    ['usuarios', 'Usuários', 'users', adminUsuarios],
    ['agendamentos', 'Agendamentos', 'calendar', adminAgendamentos],
    ['sessoes', 'Sessões', 'monitor', adminSessoes],
    ['dados', 'Dados e backup', 'database', adminDados],
  ];

  async function telaAdmin(el, ctx) {
    const atual = ABAS_ADMIN.find((a) => a[0] === ctx.param) || ABAS_ADMIN[0];
    el.innerHTML = `
      <div class="page">
        <div class="page-head anim-in"><div><h2>Administração</h2><p>Gerencie usuários, agendamentos, sessões e os dados do sistema.</p></div></div>
        <nav class="tabs anim-in" style="--i:1;justify-self:start" aria-label="Seções da administração">
          ${ABAS_ADMIN.map(([k, t, i]) => `<a class="tab ${k === atual[0] ? 'is-active' : ''}" href="#/admin/${k}" ${k === atual[0] ? 'aria-current="page"' : ''}>${icon(i)}${t}</a>`).join('')}
        </nav>
        <div id="admin-conteudo" class="anim-in" style="--i:2"></div>
      </div>`;
    await atual[3](U.$('#admin-conteudo', el), ctx);
  }

  /* ---------- Admin: usuários ---------- */
  async function adminUsuarios(el, ctx) {
    let todos = [];
    el.innerHTML = `
      <div class="card">
        <div class="toolbar">
          <div class="field grow">
            <label class="field-label" for="u-busca">Pesquisar</label>
            <div class="input-wrap">${icon('search', 'input-icon')}<input class="input" id="u-busca" type="search" placeholder="Nome ou e-mail" autocomplete="off"></div>
          </div>
          <div class="field">
            <label class="field-label" for="u-nivel">Nível</label>
            <select class="select" id="u-nivel"><option value="">Todos</option><option value="admin">Administrador</option><option value="usuario">Usuário</option><option value="visitante">Visitante</option></select>
          </div>
          <div class="toolbar-actions">
            <button class="btn btn-secondary" type="button" id="u-exportar">${icon('download')}<span>CSV</span></button>
            <button class="btn btn-primary" type="button" id="u-novo">${icon('userPlus')}<span>Novo usuário</span></button>
          </div>
        </div>
        <div class="result-bar"><span id="u-contagem">Carregando…</span></div>
        <div id="u-tabela"></div>
      </div>`;

    const tabela = tabelaPaginada(U.$('#u-tabela', el), {
      vazio: () => U.vazio({ icone: 'users', titulo: 'Nenhum usuário encontrado', texto: 'Ajuste a pesquisa ou crie um novo usuário.' }),
      colunas: [
        { titulo: 'Usuário', classe: 'td-main', render: (x) => `<div class="cell-user"><span class="avatar-wrap">${U.avatar(x.nome_completo, x.foto_perfil)}${x.online ? '<span class="online" title="Online"></span>' : ''}</span>
            <div class="cell-text"><strong>${esc(x.nome_completo)}${x.id === Auth.usuario.id ? ' <span class="badge badge-info no-dot" style="height:20px;font-size:11px">você</span>' : ''}</strong><span>${esc(x.email)}</span></div></div>` },
        { titulo: 'Nível', render: (x) => badge(NIVEIS, x.nivel_acesso) },
        { titulo: 'Cadastro', render: (x) => `<span class="nowrap mono">${esc(U.fmtData(x.data_cadastro))}</span>` },
        { titulo: 'Última sessão', render: (x) => `<span class="nowrap" title="${esc(U.fmtDataHora(x.ultima_sessao))}">${x.ultima_sessao ? esc(U.relativo(x.ultima_sessao)) : 'Nunca'}</span>` },
        { titulo: 'Status', render: (x) => (x.online ? '<span class="badge badge-success badge-live">Online</span>' : '<span class="badge">Offline</span>') },
        { titulo: 'Ações', classe: 'col-actions', render: (x) => `<div class="table-actions">
            <button class="btn btn-ghost btn-icon btn-sm" type="button" data-acao="editar" data-id="${x.id}" aria-label="Editar ${esc(x.nome_completo)}">${icon('edit')}</button>
            ${x.id !== Auth.usuario.id ? `<button class="btn btn-ghost btn-icon btn-sm" type="button" data-acao="excluir" data-id="${x.id}" aria-label="Excluir ${esc(x.nome_completo)}">${icon('trash')}</button>` : ''}
          </div>` },
      ],
    });

    const filtrar = () => {
      const termo = U.$('#u-busca', el).value.trim().toLowerCase();
      const nivel = U.$('#u-nivel', el).value;
      const lista = todos.filter((x) => (!nivel || x.nivel_acesso === nivel) &&
        (!termo || x.nome_completo.toLowerCase().includes(termo) || x.email.toLowerCase().includes(termo)));
      U.$('#u-contagem', el).textContent = `${U.plural(lista.length, 'usuário', 'usuários')} · ${todos.filter((x) => x.online).length} online agora`;
      tabela.definir(lista);
    };
    async function carregar() {
      todos = await DB.usuarios.listar();
      if (ctx.ativa()) filtrar();
    }

    U.$('#u-busca', el).addEventListener('input', U.debounce(filtrar, 200));
    U.$('#u-nivel', el).addEventListener('change', filtrar);
    U.$('#u-novo', el).addEventListener('click', () => formUsuario(null, carregar));
    U.$('#u-exportar', el).addEventListener('click', () => exportarTabela('usuarios'));

    U.$('#u-tabela', el).addEventListener('click', async (e) => {
      const b = e.target.closest('[data-acao]');
      if (!b) return;
      const x = todos.find((y) => y.id === Number(b.dataset.id));
      if (!x) return;
      if (b.dataset.acao === 'editar') formUsuario(x, carregar);
      if (b.dataset.acao === 'excluir') {
        const ok = await U.confirmar({
          titulo: `Excluir ${x.nome_completo}?`,
          mensagem: 'A conta, os agendamentos e o histórico de sessões deste usuário serão apagados permanentemente.',
          textoConfirmar: 'Excluir usuário', perigo: true,
        });
        if (!ok) return;
        U.carregando(b, true);
        try {
          await DB.usuarios.excluir(x.id);
          U.toast('success', 'Usuário excluído', x.nome_completo);
          await carregar();
        } catch (erro) { U.carregando(b, false); falha(erro, 'Não foi possível excluir'); }
      }
    });

    tabela.carregando();
    await carregar();
  }

  /** Modal de criar/editar usuário (admin). */
  function formUsuario(x, aoSalvar) {
    const editando = !!x;
    U.modal({
      titulo: editando ? 'Editar usuário' : 'Novo usuário',
      descricao: editando ? x.email : 'Crie uma conta e defina o nível de acesso.',
      icone: editando ? 'edit' : 'userPlus',
      tamanho: 'lg',
      corpo: `
        <form class="form" id="form-usuario" novalidate>
          <div class="form-row">
            ${U.campo({ nome: 'nome_completo', rotulo: 'Nome completo', icone: 'user', valor: editando ? x.nome_completo : '', extra: 'maxlength="120"' })}
            ${U.campo({ nome: 'email', rotulo: 'E-mail', tipo: 'email', icone: 'mail', valor: editando ? x.email : '', extra: 'maxlength="160"' })}
          </div>
          <div class="form-row">
            ${selectHTML({ nome: 'nivel_acesso', rotulo: 'Nível de acesso', valor: editando ? x.nivel_acesso : 'usuario', vazio: null,
                opcoes: [{ valor: 'admin', texto: 'Administrador' }, { valor: 'usuario', texto: 'Usuário' }, { valor: 'visitante', texto: 'Visitante' }] })}
            ${U.campo({ nome: 'senha', rotulo: editando ? 'Nova senha' : 'Senha', tipo: 'password', icone: 'lock', auto: 'new-password', opcional: editando,
                dica: editando ? 'Deixe em branco para manter a senha atual.' : 'Mín. 6 caracteres, com letras e números.', extra: 'maxlength="72"' })}
          </div>
          ${U.campo({ nome: 'foto_perfil', rotulo: 'URL da foto', tipo: 'url', icone: 'link', opcional: true, placeholder: 'https://…',
              valor: editando && /^https?:/i.test(x.foto_perfil || '') ? x.foto_perfil : '',
              dica: editando && /^data:/.test(x.foto_perfil || '') ? 'Este usuário enviou uma foto. Preencha apenas se quiser trocá-la.' : '' })}
        </form>`,
      rodape: `<button class="btn btn-secondary" type="button" data-fechar>Cancelar</button>
               <button class="btn btn-primary" type="submit" form="form-usuario">${icon('check')}<span>${editando ? 'Salvar alterações' : 'Criar usuário'}</span></button>`,
      aoAbrir: (caixa, fechar) => {
        const f = caixa.querySelector('#form-usuario');
        U.ligarOlhoSenha(caixa);
        U.limparAoDigitar(f);
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          U.limparErros(f);
          const d = U.dadosForm(f);
          const erros = {};
          const eNome = U.validarNome(d.nome_completo, 'Nome completo');
          if (eNome) erros.nome_completo = eNome;
          if (!U.EMAIL_RE.test(d.email)) erros.email = 'Informe um e-mail válido.';
          if (!editando || d.senha) { const eS = U.validarSenha(d.senha); if (eS) erros.senha = eS; }
          if (d.foto_perfil && !/^https?:\/\/.+/i.test(d.foto_perfil)) erros.foto_perfil = 'A URL deve começar com http:// ou https://';
          if (Object.keys(erros).length) { U.mostrarErros(f, erros); return; }

          // Mantém a foto enviada (data URL) quando o campo fica vazio na edição
          if (editando && !d.foto_perfil && /^data:/.test(x.foto_perfil || '')) d.foto_perfil = x.foto_perfil;

          const botao = caixa.querySelector('.modal-footer .btn-primary');
          U.carregando(botao, true);
          try {
            const salvo = editando ? await DB.usuarios.editar({ ...d, id: x.id }) : await DB.usuarios.criar(d);
            U.toast('success', editando ? 'Usuário atualizado' : 'Usuário criado', salvo.nome_completo);
            if (salvo.id === Auth.usuario.id) {
              Auth.atualizarUsuario(salvo);
              renderUsuario();
              if (salvo.nivel_acesso !== 'admin') { fechar(); location.reload(); return; }
            }
            fechar();
            aoSalvar();
          } catch (erro) {
            U.carregando(botao, false);
            falha(erro, 'Não foi possível salvar', f);
          }
        });
      },
    });
  }

  /* ---------- Admin: todos os agendamentos ---------- */
  async function adminAgendamentos(el, ctx) {
    let todos = [];
    el.innerHTML = `
      <div class="card">
        <div class="toolbar">
          <div class="field grow">
            <label class="field-label" for="a-busca">Pesquisar</label>
            <div class="input-wrap">${icon('search', 'input-icon')}<input class="input" id="a-busca" type="search" placeholder="Título ou usuário" autocomplete="off"></div>
          </div>
          <div class="field">
            <label class="field-label" for="a-status">Status</label>
            <select class="select" id="a-status"><option value="">Todos</option><option value="agendado">Agendado</option><option value="concluido">Concluído</option><option value="cancelado">Cancelado</option></select>
          </div>
          <div class="toolbar-actions"><button class="btn btn-secondary" type="button" id="a-exportar">${icon('download')}<span>Exportar CSV</span></button></div>
        </div>
        <div class="result-bar"><span id="a-contagem">Carregando…</span></div>
        <div id="a-tabela"></div>
      </div>`;

    const tabela = tabelaPaginada(U.$('#a-tabela', el), {
      vazio: () => U.vazio({ icone: 'calendar', titulo: 'Nenhum agendamento', texto: 'Os agendamentos de todos os usuários aparecem aqui.' }),
      colunas: [
        { titulo: 'Título', classe: 'td-main', render: (h) => `<div class="cell-user"><div class="date-chip"><strong>${U.parseData(h.data).getDate()}</strong><span>${esc(U.mesCurto(h.data))}</span></div><div class="cell-text"><strong>${esc(h.titulo)}</strong><span>${esc(h.descricao || 'Sem descrição')}</span></div></div>` },
        { titulo: 'Usuário', render: (h) => `<div class="cell-user">${U.avatar(h.usuario_nome, '', 'avatar-sm')}<div class="cell-text"><strong>${esc(h.usuario_nome)}</strong><span>${esc(h.usuario_email)}</span></div></div>` },
        { titulo: 'Data', render: (h) => `<span class="nowrap mono">${esc(U.fmtData(h.data))}</span>` },
        { titulo: 'Horário', render: (h) => `<span class="nowrap mono">${esc(h.hora_inicio)}–${esc(h.hora_fim)}</span>` },
        { titulo: 'Status', render: (h) => badge(STATUS_AGENDA, h.status) },
        { titulo: 'Ações', classe: 'col-actions', render: (h) => `<div class="table-actions">
            ${h.status === 'agendado' ? `
              <button class="btn btn-ghost btn-icon btn-sm" type="button" data-acao="concluir" data-id="${h.id}" aria-label="Finalizar">${icon('check')}</button>
              <button class="btn btn-ghost btn-icon btn-sm" type="button" data-acao="cancelar" data-id="${h.id}" aria-label="Cancelar">${icon('ban')}</button>` : ''}
            <button class="btn btn-ghost btn-icon btn-sm" type="button" data-acao="excluir" data-id="${h.id}" aria-label="Excluir">${icon('trash')}</button>
          </div>` },
      ],
    });

    const filtrar = (manter = false) => {
      const termo = U.$('#a-busca', el).value.trim().toLowerCase();
      const status = U.$('#a-status', el).value;
      const lista = todos.filter((h) => (!status || h.status === status) &&
        (!termo || h.titulo.toLowerCase().includes(termo) || h.usuario_nome.toLowerCase().includes(termo) || h.usuario_email.toLowerCase().includes(termo)));
      U.$('#a-contagem', el).textContent = U.plural(lista.length, 'agendamento', 'agendamentos');
      tabela.definir(lista, manter);
    };
    async function carregar(manter = false) {
      todos = await DB.horarios.listar(true);
      if (ctx.ativa()) filtrar(manter);
    }

    U.$('#a-busca', el).addEventListener('input', U.debounce(() => filtrar(), 200));
    U.$('#a-status', el).addEventListener('change', () => filtrar());
    U.$('#a-exportar', el).addEventListener('click', () => exportarTabela('horarios'));
    U.$('#a-tabela', el).addEventListener('click', async (e) => {
      const b = e.target.closest('[data-acao]');
      if (!b) return;
      const h = todos.find((x) => x.id === Number(b.dataset.id));
      if (h && await acaoAgendamento(b.dataset.acao, h, b)) await carregar(true);
    });

    tabela.carregando();
    await carregar();
  }

  /* ---------- Admin: log de sessões ---------- */
  async function adminSessoes(el, ctx) {
    let todas = [];
    el.innerHTML = `
      <div class="card">
        <div class="toolbar">
          <div class="field grow">
            <label class="field-label" for="s-busca">Pesquisar</label>
            <div class="input-wrap">${icon('search', 'input-icon')}<input class="input" id="s-busca" type="search" placeholder="Usuário, IP ou dispositivo" autocomplete="off"></div>
          </div>
          <div class="field">
            <label class="field-label" for="s-status">Status</label>
            <select class="select" id="s-status"><option value="">Todas</option><option value="ativa">Ativas</option><option value="finalizada">Finalizadas</option></select>
          </div>
          <div class="toolbar-actions">
            <button class="btn btn-ghost" type="button" id="s-atualizar">${icon('refresh')}<span>Atualizar</span></button>
            <button class="btn btn-secondary" type="button" id="s-exportar">${icon('download')}<span>Exportar CSV</span></button>
          </div>
        </div>
        <div class="result-bar"><span id="s-contagem">Carregando…</span><span class="small">Sessões sem atividade por 30 min são encerradas automaticamente.</span></div>
        <div id="s-tabela"></div>
      </div>`;

    const duracaoSessao = (s) => {
      const fim = s.data_saida ? U.parseData(s.data_saida) : U.agora();
      return U.fmtDuracao(Math.max(0, Math.floor((fim - U.parseData(s.data_entrada)) / 60000)));
    };

    const tabela = tabelaPaginada(U.$('#s-tabela', el), {
      porPagina: 15,
      vazio: () => U.vazio({ icone: 'monitor', titulo: 'Nenhuma sessão encontrada', texto: 'Os logins e logouts aparecem aqui.' }),
      colunas: [
        { titulo: 'Usuário', classe: 'td-main', render: (s) => `<div class="cell-user">${U.avatar(s.usuario_nome, '', 'avatar-sm')}<div class="cell-text"><strong>${esc(s.usuario_nome)}</strong><span>${esc(s.usuario_email)}</span></div></div>` },
        { titulo: 'Entrada', render: (s) => `<span class="nowrap mono">${esc(U.fmtDataHora(s.data_entrada))}</span>` },
        { titulo: 'Saída', render: (s) => `<span class="nowrap mono">${s.data_saida ? esc(U.fmtDataHora(s.data_saida)) : '—'}</span>` },
        { titulo: 'Duração', render: (s) => `<span class="nowrap mono">${duracaoSessao(s)}</span>` },
        { titulo: 'IP', render: (s) => `<span class="nowrap mono">${esc(s.ip_aproximado || '—')}</span>` },
        { titulo: 'Dispositivo', render: (s) => `<span class="nowrap">${esc(s.dispositivo || '—')}</span>` },
        { titulo: 'Status', render: (s) => badge(STATUS_SESSAO, s.status) },
      ],
    });

    const filtrar = () => {
      const termo = U.$('#s-busca', el).value.trim().toLowerCase();
      const lista = todas.filter((s) => !termo || [s.usuario_nome, s.usuario_email, s.ip_aproximado, s.dispositivo].some((v) => String(v || '').toLowerCase().includes(termo)));
      U.$('#s-contagem', el).textContent = `${U.plural(lista.length, 'sessão', 'sessões')} · ${todas.filter((s) => s.status === 'ativa').length} ativa(s)`;
      tabela.definir(lista);
    };
    async function carregar() {
      tabela.carregando();
      todas = await DB.sessoes.listar(U.$('#s-status', el).value);
      if (ctx.ativa()) filtrar();
    }

    U.$('#s-busca', el).addEventListener('input', U.debounce(filtrar, 200));
    U.$('#s-status', el).addEventListener('change', () => carregar().catch((e) => falha(e)));
    U.$('#s-atualizar', el).addEventListener('click', () => carregar().catch((e) => falha(e)));
    U.$('#s-exportar', el).addEventListener('click', () => exportarTabela('sessoes'));

    await carregar();
  }

  /* ---------- Exportação CSV (admin) ---------- */
  const COLUNAS_CSV = {
    visitas: [['id', 'ID'], ['nome', 'Nome'], ['email', 'E-mail'], ['data_visita', 'Entrada'], ['data_saida', 'Saída'], ['setor_visitado', 'Setor'],
      ['motivo', 'Motivo'], ['tempo_duracao', 'Duração (min)'], ['status', 'Status'], ['registrado_por', 'Registrado por']],
    usuarios: [['id', 'ID'], ['nome_completo', 'Nome completo'], ['email', 'E-mail'], ['nivel_acesso', 'Nível de acesso'], ['data_cadastro', 'Data de cadastro'], ['ultima_sessao', 'Última sessão']],
    horarios: [['id', 'ID'], ['usuario', 'Usuário'], ['usuario_email', 'E-mail'], ['data', 'Data'], ['hora_inicio', 'Início'], ['hora_fim', 'Fim'],
      ['titulo', 'Título'], ['descricao', 'Descrição'], ['status', 'Status'], ['criado_em', 'Criado em']],
    sessoes: [['id', 'ID'], ['usuario', 'Usuário'], ['usuario_email', 'E-mail'], ['data_entrada', 'Entrada'], ['data_saida', 'Saída'],
      ['ip_aproximado', 'IP'], ['dispositivo', 'Dispositivo'], ['status', 'Status']],
  };
  const NOMES_TABELA = { visitas: 'visitas', usuarios: 'usuarios', horarios: 'agendamentos', sessoes: 'sessoes' };

  async function exportarTabela(tabela, botao = null) {
    U.carregando(botao, true);
    try {
      const linhas = await DB.dados.exportar(tabela);
      if (!linhas.length) { U.toast('warning', 'Nada para exportar', 'A tabela está vazia.'); return; }
      const formatar = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(v) ? (v.length > 10 ? U.fmtDataHora(v) : U.fmtData(v)) : v);
      const csv = U.gerarCSV(linhas, COLUNAS_CSV[tabela].map(([chave, titulo]) => ({ titulo, valor: (l) => formatar(l[chave]) })));
      U.baixar(`${NOMES_TABELA[tabela]}_${U.carimbo()}.csv`, csv);
      U.toast('success', 'CSV exportado', U.plural(linhas.length, 'registro', 'registros'));
    } catch (erro) {
      falha(erro, 'Falha ao exportar');
    } finally {
      U.carregando(botao, false);
    }
  }

  /* ---------- Admin: dados, backup e limpeza ---------- */
  async function adminDados(el) {
    el.innerHTML = `
      <div class="action-tiles">
        <section class="card tile">
          <span class="stat-icon">${icon('file')}</span>
          <h3>Exportar dados completos (CSV)</h3>
          <p>Baixe cada tabela em CSV, pronto para abrir no Excel ou Google Planilhas.</p>
          <div class="tile-buttons">
            <button class="btn btn-secondary btn-sm" type="button" data-exportar="visitas">${icon('download')}<span>Visitas</span></button>
            <button class="btn btn-secondary btn-sm" type="button" data-exportar="usuarios">${icon('download')}<span>Usuários</span></button>
            <button class="btn btn-secondary btn-sm" type="button" data-exportar="horarios">${icon('download')}<span>Agendamentos</span></button>
            <button class="btn btn-secondary btn-sm" type="button" data-exportar="sessoes">${icon('download')}<span>Sessões</span></button>
          </div>
        </section>
        <section class="card tile">
          <span class="stat-icon">${icon('database')}</span>
          <h3>Backup completo (JSON)</h3>
          <p>Todas as tabelas em um único arquivo. As senhas nunca são incluídas.</p>
          <button class="btn btn-primary btn-sm" type="button" id="d-backup">${icon('download')}<span>Gerar backup</span></button>
        </section>
        <section class="card tile">
          <span class="stat-icon" style="background:var(--warning-bg);color:var(--warning-text)">${icon('eraser')}</span>
          <h3>Limpar dados antigos</h3>
          <p>Remove visitas, sessões e agendamentos encerrados há mais de 30 dias.</p>
          <button class="btn btn-danger-soft btn-sm" type="button" id="d-limpar">${icon('eraser')}<span>Analisar e limpar</span></button>
        </section>
        <section class="card tile">
          <span class="stat-icon">${icon('sparkles')}</span>
          <h3>Dados de exemplo</h3>
          <p>Cria visitas nos últimos 7 dias e alguns agendamentos para demonstração.</p>
          <button class="btn btn-secondary btn-sm" type="button" id="d-exemplo">${icon('sparkles')}<span>Gerar exemplos</span></button>
        </section>
      </div>`;

    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-exportar]');
      if (b) exportarTabela(b.dataset.exportar, b);
    });

    U.$('#d-backup', el).addEventListener('click', async (e) => {
      const b = e.currentTarget;
      U.carregando(b, true);
      try {
        const backup = await DB.dados.backup();
        U.baixar(`backup_portaria_${U.carimbo()}.json`, JSON.stringify(backup, null, 2), 'application/json');
        U.toast('success', 'Backup gerado', 'O arquivo JSON foi baixado.');
      } catch (erro) { falha(erro, 'Falha no backup'); } finally { U.carregando(b, false); }
    });

    U.$('#d-limpar', el).addEventListener('click', async (e) => {
      const b = e.currentTarget;
      U.carregando(b, true);
      let previa;
      try { previa = await DB.dados.previaLimpeza(); } catch (erro) { falha(erro); return; } finally { U.carregando(b, false); }
      const c = previa.contagem;
      const total = c.visitas + c.sessoes + c.horarios;
      if (!total) { U.toast('info', 'Nada para limpar', `Não há registros encerrados com mais de ${previa.dias} dias.`); return; }
      const ok = await U.confirmar({
        titulo: 'Limpar dados antigos?',
        mensagem: `Serão removidos: ${U.plural(c.visitas, 'visita', 'visitas')}, ${U.plural(c.sessoes, 'sessão', 'sessões')} e ${U.plural(c.horarios, 'agendamento', 'agendamentos')} com mais de ${previa.dias} dias. Faça um backup antes, se precisar.`,
        textoConfirmar: 'Limpar agora', perigo: true,
      });
      if (!ok) return;
      U.carregando(b, true);
      try {
        const r = await DB.dados.limpar();
        const removidos = r.removidos.visitas + r.removidos.sessoes + r.removidos.horarios;
        U.toast('success', 'Limpeza concluída', `${U.plural(removidos, 'registro removido', 'registros removidos')}.`);
      } catch (erro) { falha(erro, 'Falha na limpeza'); } finally { U.carregando(b, false); }
    });

    U.$('#d-exemplo', el).addEventListener('click', async (e) => {
      const b = e.currentTarget;
      const ok = await U.confirmar({ titulo: 'Gerar dados de exemplo?', mensagem: 'Serão criadas visitas fictícias nos últimos 7 dias e 4 agendamentos para você.', textoConfirmar: 'Gerar dados', icone: 'sparkles' });
      if (!ok) return;
      U.carregando(b, true);
      try {
        const r = await DB.dados.gerarExemplo();
        U.toast('success', 'Dados de exemplo criados', `${r.visitas} visitas e ${r.agendamentos} agendamentos. Veja no Dashboard!`);
        DB.visitas.ativas().then((l) => atualizarBadge(l.length)).catch(() => {});
      } catch (erro) { falha(erro, 'Falha ao gerar exemplos'); } finally { U.carregando(b, false); }
    });
  }

  /* ==================================================================
     INICIALIZAÇÃO
     ================================================================== */
  async function iniciar() {
    hidratarIcones(U.$('#boot'));
    let usuario;
    try {
      usuario = await Auth.exigirLogin();
    } catch (erro) {
      const caixa = U.$('#boot-erro');
      caixa.innerHTML = `${icon('alertCircle')}<div><strong>Não foi possível iniciar.</strong> ${esc(erro.message)}
        <div style="margin-top:12px"><button class="btn btn-secondary btn-sm" type="button" onclick="location.reload()">Tentar novamente</button></div></div>`;
      caixa.hidden = false;
      U.$('.boot-bar').hidden = true;
      return;
    }
    if (!usuario) return; // redirecionando para o login

    montarLayout();
    U.$('#app').hidden = false;
    U.$('#boot').classList.add('is-done');
    window.addEventListener('hashchange', navegar);
    await navegar();
  }

  return { iniciar, fecharMenu: null };
})();

App.iniciar();
