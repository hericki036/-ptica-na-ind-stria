/**
 * js/dashboard.js
 * Painel do usuário (dashboard.html) — simulação do app HydroSmart.
 *
 *   1. Carrega usuário, garrafa, histórico, leituras, lembretes e conquistas
 *   2. Progresso do dia (número + barra) e simulação do sensor
 *   3. Status da garrafa: nível, bateria, conexão, status
 *   4. Histórico de 7 dias em SVG puro (com dica, teclado e tabela)
 *   5. Lembretes: CRUD completo + aviso na hora marcada
 *   6. Conquistas (badges) geradas pelo "trigger" do banco
 *   7. Modo claro/escuro (tema.js)
 *
 * Toda leitura/escrita passa por api.js — nada aqui sabe se os dados vêm
 * do localStorage (mock) ou de um backend real.
 */

import { api, sessao, ErroApi, CONFIG } from './api.js';
import {
  validarMeta, validarVolume, validarHora, validarDiasSemana, validarNumeroSerie, validarObjeto,
} from './validacao.js';
import {
  formatarMl, formatarNumero, formatarHora, formatarDataCurta, formatarDataCompleta,
  formatarDataPorExtenso, tempoRelativo, descreverDias, DIAS_SEMANA_CURTOS, DIAS_SEMANA_LONGOS,
  hojeSQL, dataSQL, paraDate, debounce,
} from './utils.js';
import {
  $, $$, criar, icone, mostrarToast, definirErroCampo, aplicarErros, limparErros,
  mostrarErroFormulario, definirCarregando, animarNumero,
} from './ui.js';
import { iniciarTema } from './tema.js';

/* ==================================================================== */
/* Constantes e estado                                                   */
/* ==================================================================== */

/** Catálogo de conquistas (mesmos tipos do ENUM da tabela conquistas) */
const CATALOGO_CONQUISTAS = [
  { tipo: 'boas_vindas', nome: 'Boas-vindas', descricao: 'Criou sua conta HydroSmart', icone: 'sorriso' },
  { tipo: 'primeiro_gole', nome: 'Primeiro gole', descricao: 'Primeira leitura do sensor', icone: 'gota' },
  { tipo: 'meta_diaria', nome: 'Meta batida', descricao: 'Atingiu a meta do dia', icone: 'alvo' },
  { tipo: 'sequencia_3_dias', nome: 'Em ritmo', descricao: 'Meta batida 3 dias seguidos', icone: 'chama' },
  { tipo: 'sequencia_7_dias', nome: 'Semana perfeita', descricao: 'Meta batida 7 dias seguidos', icone: 'estrela' },
  { tipo: 'dez_litros', nome: '10 litros', descricao: '10 L registrados no total', icone: 'ondas' },
];

const NOMES_STATUS = { ativa: 'ativa', inativa: 'inativa', manutencao: 'em manutenção' };
const ALTURA_AGUA_SVG = 195; // altura do corpo da garrafa no SVG (y 52 → 247)
const SVG_NS = 'http://www.w3.org/2000/svg';

const estado = {
  usuario: null,
  garrafa: null,
  historico: [],
  leiturasHoje: [],
  lembretes: [],
  conquistas: [],
  totalExibido: 0,
  lembretesDisparados: new Set(),
};

const idUsuario = () => estado.usuario.id;

/* ==================================================================== */
/* 1. Carregamento                                                        */
/* ==================================================================== */

async function carregarTudo() {
  const id = idUsuario();
  const [usuario, garrafas, historico, leituras, lembretes, conquistas] = await Promise.all([
    api.obterUsuario(id),
    api.listarGarrafas(id),
    api.obterHistorico(id, 7),
    api.listarLeituras(id, { data: hojeSQL() }),
    api.listarLembretes(id),
    api.listarConquistas(id),
  ]);
  Object.assign(estado, { usuario, garrafa: garrafas[0] || null, historico, leiturasHoje: leituras, lembretes, conquistas });
  sessao.atualizarUsuario(usuario);

  preencherCabecalho();
  renderizarProgresso();
  renderizarGarrafa();
  renderizarHistorico();
  renderizarLeituras();
  renderizarLembretes();
  renderizarConquistas();
}

/** Erros comuns: sessão expirada volta para o login; o resto vira aviso */
function tratarErro(erro) {
  if (erro instanceof ErroApi && erro.status === 401) {
    mostrarToast('Sua sessão expirou. Entre novamente.', { tipo: 'erro' });
    setTimeout(() => window.location.replace('./#cadastro'), 1200);
    return;
  }
  console.error(erro);
  mostrarToast(erro instanceof ErroApi ? erro.message : 'Algo deu errado. Tente novamente.', { tipo: 'erro' });
}

function preencherCabecalho() {
  const { nome } = estado.usuario;
  $('#nome-usuario').textContent = nome;
  $('#primeiro-nome').textContent = nome.split(' ')[0];
  $('#data-hoje').textContent = formatarDataPorExtenso(new Date());
}

/* ==================================================================== */
/* 2. Progresso do dia e simulação do sensor                             */
/* ==================================================================== */

function renderizarProgresso() {
  const hoje = estado.historico.at(-1) || { total_ml: 0, meta_ml: estado.usuario.meta_diaria_ml };
  const { total_ml: total, meta_ml: meta } = hoje;
  const percentual = Math.round((total * 100) / meta);
  const completo = total >= meta;

  animarNumero($('#total-hoje'), estado.totalExibido, total, formatarNumero);
  estado.totalExibido = total;
  $('#meta-hoje').textContent = formatarMl(meta);
  $('#percentual-hoje').textContent = `${percentual}%`;

  const medidor = $('#medidor-hoje');
  medidor.setAttribute('aria-valuenow', String(Math.min(100, percentual)));
  medidor.setAttribute('aria-valuetext', `${formatarMl(total)} de ${formatarMl(meta)} (${percentual}%)`);
  medidor.classList.toggle('medidor--completo', completo);
  $('#medidor-preenchimento').style.width = `${Math.min(100, percentual)}%`;

  const status = $('#status-hoje');
  status.classList.toggle('progresso__status--ok', completo);
  status.replaceChildren(
    icone(completo ? 'check' : 'gota'),
    completo
      ? `Meta atingida! Você já bebeu ${formatarMl(total)} hoje.`
      : `Faltam ${formatarMl(meta - total)} para a sua meta.`,
  );

  const campoMeta = $('#nova-meta');
  if (document.activeElement !== campoMeta) campoMeta.value = estado.usuario.meta_diaria_ml;
}

/** Desabilita os controles da garrafa enquanto uma ação está em andamento */
function bloquearControles(ocupado) {
  const semGarrafa = !estado.garrafa;
  $$('[data-volume], #form-volume button, .garrafa__acoes button, #garrafa-status')
    .forEach((controle) => { controle.disabled = ocupado || semGarrafa; });
}

/**
 * Simula o sensor: a garrafa detecta o gole e o app envia a leitura
 * (POST /leituras) com a telemetria (bateria). O servidor desconta o
 * volume do nível e o "trigger" pode gerar conquistas novas.
 */
async function registrarConsumo(volumeDesejado) {
  const garrafa = estado.garrafa;
  if (!garrafa) return;

  if (garrafa.status !== 'ativa') {
    mostrarToast(`A garrafa está ${NOMES_STATUS[garrafa.status]}. Mude o status para "Ativa" para registrar.`, { tipo: 'alerta' });
    return;
  }
  if (!garrafa.conectada) {
    mostrarToast('Conecte a garrafa por Bluetooth para sincronizar a leitura.', { tipo: 'alerta', titulo: 'Garrafa desconectada' });
    return;
  }
  if (garrafa.bateria_pct <= 0) {
    mostrarToast('A bateria acabou. Recarregue a garrafa para continuar.', { tipo: 'alerta', titulo: 'Sem bateria' });
    return;
  }
  if (garrafa.nivel_ml <= 0) {
    mostrarToast('Encha a garrafa para continuar registrando.', { tipo: 'alerta', titulo: 'Garrafa vazia' });
    return;
  }

  const volume = Math.min(volumeDesejado, garrafa.nivel_ml);
  bloquearControles(true);
  try {
    const resultado = await api.registrarLeitura({
      garrafa_id: garrafa.id,
      volume_ml: volume,
      bateria_pct: Math.max(0, garrafa.bateria_pct - 1),
    });
    estado.garrafa = resultado.garrafa;
    estado.leiturasHoje.unshift(resultado.leitura);
    // O histórico é recalculado pelo servidor (view) — fonte única de verdade
    estado.historico = await api.obterHistorico(idUsuario(), 7);
    if (resultado.conquistas_novas.length) estado.conquistas = await api.listarConquistas(idUsuario());

    renderizarProgresso();
    renderizarGarrafa();
    renderizarHistorico();
    renderizarLeituras(resultado.leitura.id);
    renderizarConquistas(resultado.conquistas_novas.map((c) => c.id));
    piscarLeds();

    const aviso = volume < volumeDesejado ? ` Só havia ${formatarMl(volume)} na garrafa.` : '';
    mostrarToast(`${formatarMl(volume)} registrados pelo sensor.${aviso}`, { tipo: 'sucesso', duracao: 2500 });
    for (const conquista of resultado.conquistas_novas) {
      const item = CATALOGO_CONQUISTAS.find((c) => c.tipo === conquista.tipo);
      mostrarToast(conquista.descricao || item.descricao, { tipo: 'conquista', titulo: `Nova conquista: ${item.nome}`, duracao: 7000 });
    }
  } catch (erro) {
    tratarErro(erro);
  } finally {
    bloquearControles(false);
  }
}

function piscarLeds() {
  const leds = $('#garrafa-leds');
  leds.classList.remove('garrafa__leds--piscando');
  void leds.getBoundingClientRect(); // reinicia a animação
  leds.classList.add('garrafa__leds--piscando');
}

function ligarProgresso() {
  $$('[data-volume]').forEach((botao) => {
    botao.addEventListener('click', () => registrarConsumo(Number(botao.dataset.volume)));
  });

  // Volume personalizado
  const formVolume = $('#form-volume');
  formVolume.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const campo = formVolume.elements.volume_ml;
    const volume = campo.value === '' ? NaN : Number(campo.value);
    const capacidade = estado.garrafa?.capacidade_ml ?? 600;
    const erro = validarVolume(volume) || (volume > capacidade ? `A garrafa comporta no máximo ${formatarMl(capacidade)}.` : '');
    definirErroCampo(campo, erro);
    if (erro) {
      campo.focus();
      return;
    }
    await registrarConsumo(volume);
    campo.value = '';
  });

  // Alterar meta diária (PATCH /usuarios/:id → nova linha em `metas`)
  const formMeta = $('#form-meta');
  formMeta.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const campo = formMeta.elements.meta_diaria_ml;
    const erro = validarMeta(campo.value);
    definirErroCampo(campo, erro);
    if (erro) {
      campo.focus();
      return;
    }
    const botao = $('button[type="submit"]', formMeta);
    definirCarregando(botao, true, 'Salvando…');
    try {
      estado.usuario = await api.atualizarUsuario(idUsuario(), { meta_diaria_ml: Number(campo.value) });
      estado.historico = await api.obterHistorico(idUsuario(), 7);
      renderizarProgresso();
      renderizarHistorico();
      $('.editar-meta').open = false;
      mostrarToast(`Nova meta: ${formatarMl(estado.usuario.meta_diaria_ml)} por dia, a partir de hoje.`, { tipo: 'sucesso' });
    } catch (falha) {
      if (falha instanceof ErroApi && falha.campos?.meta_diaria_ml) definirErroCampo(campo, falha.campos.meta_diaria_ml);
      else tratarErro(falha);
    } finally {
      definirCarregando(botao, false);
    }
  });
}

/* ==================================================================== */
/* 3. Garrafa                                                             */
/* ==================================================================== */

function renderizarGarrafa() {
  const garrafa = estado.garrafa;
  $('#secao-parear').hidden = Boolean(garrafa);
  bloquearControles(false);

  if (!garrafa) {
    $('#garrafa-modelo').textContent = 'Nenhuma garrafa pareada';
    ['#garrafa-nivel', '#garrafa-bateria', '#garrafa-conexao', '#garrafa-sincronizacao']
      .forEach((seletor) => { $(seletor).textContent = '—'; });
    $('#agua').style.transform = `translateY(${ALTURA_AGUA_SVG}px)`;
    $('.garrafa').classList.add('garrafa--desligada');
    return;
  }

  const fracao = garrafa.nivel_ml / garrafa.capacidade_ml;
  $('#garrafa-modelo').textContent = `${garrafa.modelo} · Nº ${garrafa.numero_serie}`;
  $('#agua').style.transform = `translateY(${(1 - fracao) * ALTURA_AGUA_SVG}px)`;
  $('#garrafa-figura-titulo').textContent =
    `Nível da garrafa: ${formatarMl(garrafa.nivel_ml)} de ${formatarMl(garrafa.capacidade_ml)}`;
  $('#garrafa-nivel').textContent = `${formatarMl(garrafa.nivel_ml)} de ${formatarMl(garrafa.capacidade_ml)}`;

  const bateriaBaixa = garrafa.bateria_pct <= 20;
  $('#garrafa-bateria').textContent = `${garrafa.bateria_pct}%`;
  $('#garrafa-bateria-alerta').hidden = !bateriaBaixa;
  const barra = $('#garrafa-bateria-barra');
  barra.style.width = `${garrafa.bateria_pct}%`;
  barra.parentElement.classList.toggle('mini-medidor--baixo', bateriaBaixa);

  $('#garrafa-conexao').textContent = garrafa.conectada ? 'Conectada via Bluetooth' : 'Desconectada';
  $('#garrafa-conexao-indicador').classList.toggle('indicador--ligado', garrafa.conectada);
  $('#garrafa-sincronizacao').textContent = tempoRelativo(garrafa.ultima_sincronizacao);
  $('#garrafa-status').value = garrafa.status;
  $('#botao-conexao span').textContent = garrafa.conectada ? 'Desconectar' : 'Conectar';
  $('.garrafa').classList.toggle('garrafa--desligada', !garrafa.conectada || garrafa.status !== 'ativa');
}

/** PATCH /garrafas/:id com telemetria ou status */
async function atualizarGarrafa(dados, mensagem) {
  bloquearControles(true);
  try {
    estado.garrafa = await api.atualizarGarrafa(estado.garrafa.id, dados);
    renderizarGarrafa();
    if (mensagem) mostrarToast(mensagem, { tipo: 'sucesso', duracao: 2500 });
  } catch (erro) {
    tratarErro(erro);
    renderizarGarrafa();
  } finally {
    bloquearControles(false);
  }
}

function ligarGarrafa() {
  $('#botao-encher').addEventListener('click', () => {
    atualizarGarrafa({ nivel_ml: estado.garrafa.capacidade_ml }, 'Garrafa cheia: 600 ml prontos para beber.');
  });

  $('#botao-recarregar').addEventListener('click', () => {
    atualizarGarrafa({ bateria_pct: 100 }, 'Bateria recarregada: 100%.');
  });

  $('#botao-conexao').addEventListener('click', async (evento) => {
    const conectar = !estado.garrafa.conectada;
    const rotulo = $('span', evento.currentTarget);
    if (conectar) {
      rotulo.textContent = 'Conectando…';
      bloquearControles(true);
      await new Promise((resolver) => setTimeout(resolver, 800)); // simula o pareamento BLE
    }
    atualizarGarrafa({ conectada: conectar }, conectar ? 'Garrafa conectada via Bluetooth.' : 'Garrafa desconectada.');
  });

  $('#garrafa-status').addEventListener('change', (evento) => {
    const status = evento.target.value;
    atualizarGarrafa({ status }, `Status da garrafa: ${NOMES_STATUS[status]}.`);
  });

  // Pareamento de uma garrafa nova (POST /garrafas)
  const formParear = $('#form-parear');
  $('#botao-serie-demo').addEventListener('click', () => {
    const sufixo = String(Math.floor(100000 + Math.random() * 900000));
    formParear.elements.numero_serie.value = `HS600-${new Date().getFullYear()}-${sufixo}`;
    definirErroCampo(formParear.elements.numero_serie, '');
  });
  formParear.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    limparErros(formParear);
    const campo = formParear.elements.numero_serie;
    const erro = validarNumeroSerie(campo.value);
    definirErroCampo(campo, erro);
    if (erro) {
      campo.focus();
      return;
    }
    const botao = $('button[type="submit"]', formParear);
    definirCarregando(botao, true, 'Pareando…');
    try {
      estado.garrafa = await api.parearGarrafa(campo.value.trim().toUpperCase());
      renderizarGarrafa();
      mostrarToast('Sua HydroSmart está pareada, cheia e conectada.', { tipo: 'sucesso', titulo: 'Garrafa pareada!' });
    } catch (falha) {
      if (falha instanceof ErroApi) {
        mostrarErroFormulario(formParear, falha.message);
        aplicarErros(formParear, falha.campos);
      } else {
        tratarErro(falha);
      }
    } finally {
      definirCarregando(botao, false);
    }
  });
}

/* ==================================================================== */
/* 4. Histórico de 7 dias (SVG puro)                                      */
/* ==================================================================== */

const rotuloDia = (dia, ehHoje) => (ehHoje ? 'Hoje' : DIAS_SEMANA_CURTOS[paraDate(dia).getDay()]);

function renderizarHistorico() {
  const dados = estado.historico;
  if (!dados.length) return;

  // Resumo da semana
  const total = dados.reduce((soma, d) => soma + d.total_ml, 0);
  const diasNaMeta = dados.filter((d) => d.meta_atingida).length;
  const melhor = dados.reduce((a, b) => (b.total_ml > a.total_ml ? b : a));
  const itens = [
    ['Média diária', formatarMl(Math.round(total / dados.length))],
    ['Dias na meta', `${diasNaMeta} de ${dados.length}`],
    ['Melhor dia', melhor.total_ml ? `${formatarMl(melhor.total_ml)} (${rotuloDia(melhor.dia, melhor.dia === hojeSQL())})` : '—'],
  ];
  $('#resumo-historico').replaceChildren(...itens.map(([rotulo, valor]) => criar('li', {}, [
    criar('span', { classe: 'resumo__rotulo', texto: rotulo }),
    criar('span', { classe: 'resumo__valor', texto: valor }),
  ])));

  // Tabela (alternativa acessível ao gráfico)
  $('#tabela-historico').replaceChildren(...dados.map((d, i) => criar('tr', {}, [
    criar('th', { texto: `${rotuloDia(d.dia, i === dados.length - 1)} ${formatarDataCurta(d.dia)}`, atributos: { scope: 'row' } }),
    criar('td', { classe: 'numero', texto: formatarMl(d.total_ml) }),
    criar('td', { classe: 'numero', texto: formatarMl(d.meta_ml) }),
    criar('td', { classe: 'numero', texto: `${formatarNumero(Math.round(d.percentual))}%` }),
    criar('td', {}, [d.meta_atingida
      ? criar('span', { classe: 'situacao situacao--ok' }, [icone('check'), 'Meta atingida'])
      : criar('span', { classe: 'situacao', texto: 'Abaixo da meta' })]),
  ])));

  desenharGrafico();
}

/** Cria um elemento SVG com atributos */
function svg(tag, atributos = {}) {
  const elemento = document.createElementNS(SVG_NS, tag);
  for (const [nome, valor] of Object.entries(atributos)) elemento.setAttribute(nome, String(valor));
  return elemento;
}

/** Barra com topo arredondado (4px) e base reta, crescendo da linha zero */
function caminhoBarra(x, y, largura, altura, raio = 4) {
  const r = Math.min(raio, altura, largura / 2);
  return `M${x},${y + altura} V${y + r} Q${x},${y} ${x + r},${y} H${x + largura - r} Q${x + largura},${y} ${x + largura},${y + r} V${y + altura} Z`;
}

/**
 * Desenha o gráfico de barras na largura real do container (as barras
 * mantêm no máximo 24px). Redesenhado pelo ResizeObserver.
 */
function desenharGrafico() {
  const container = $('#grafico-historico');
  const dica = $('#grafico-dica');
  const dados = estado.historico;
  container.querySelector('svg')?.remove();
  dica.hidden = true;
  if (!dados.length) return;

  const largura = Math.max(280, Math.floor(container.clientWidth));
  const altura = 260;
  const margem = { topo: 28, direita: 8, base: 46, esquerda: 48 };
  const larguraPlot = largura - margem.esquerda - margem.direita;
  const alturaPlot = altura - margem.topo - margem.base;

  // Escala Y com números redondos (0 / 500 / 1.000 ... ou 0 / 1.000 / 2.000 ...)
  const maior = Math.max(...dados.map((d) => Math.max(d.total_ml, d.meta_ml)));
  const passo = maior > 3000 ? 1000 : 500;
  const topoEscala = Math.ceil((maior * 1.08) / passo) * passo;
  const y = (valor) => margem.topo + alturaPlot - (valor / topoEscala) * alturaPlot;
  const banda = larguraPlot / dados.length;
  const larguraBarra = Math.min(24, banda * 0.5);
  // Em telas estreitas a data (dd/mm) não cabe: fica só o dia da semana
  // (a data continua na dica e na tabela)
  const mostrarData = banda >= 48;

  const raiz = svg('svg', {
    viewBox: `0 0 ${largura} ${altura}`,
    width: largura,
    height: altura,
    role: 'group',
    'aria-label': 'Gráfico de barras: consumo diário de água nos últimos 7 dias, com a linha da meta diária',
  });

  // Linhas de grade e valores do eixo Y
  const grade = svg('g', { class: 'grafico__grade', 'aria-hidden': 'true' });
  for (let valor = 0; valor <= topoEscala; valor += passo) {
    grade.append(svg('line', { x1: margem.esquerda, x2: largura - margem.direita, y1: y(valor), y2: y(valor) }));
    const texto = svg('text', { x: margem.esquerda - 8, y: y(valor) + 4, 'text-anchor': 'end' });
    texto.textContent = formatarNumero(valor);
    grade.append(texto);
  }
  raiz.append(grade);

  // Uma coluna focável por dia (a área de toque é a faixa inteira do dia)
  dados.forEach((d, i) => {
    const ehHoje = i === dados.length - 1;
    const inicio = margem.esquerda + i * banda;
    const centro = inicio + banda / 2;
    const percentual = Math.round(d.percentual);

    const coluna = svg('g', {
      class: 'grafico__coluna',
      tabindex: 0,
      role: 'img',
      'aria-label': `${ehHoje ? 'Hoje' : DIAS_SEMANA_LONGOS[paraDate(d.dia).getDay()]}, ${formatarDataCurta(d.dia)}: `
        + `${formatarMl(d.total_ml)} de ${formatarMl(d.meta_ml)}, ${percentual}% da meta${d.meta_atingida ? ', meta atingida' : ''}`,
    });
    coluna.append(svg('rect', { class: 'grafico__alvo', x: inicio, y: margem.topo, width: banda, height: alturaPlot + margem.base }));
    coluna.append(svg('rect', { class: 'grafico__foco', x: inicio + 2, y: margem.topo - 6, width: banda - 4, height: alturaPlot + margem.base, rx: 8 }));

    if (d.total_ml > 0) {
      coluna.append(svg('path', {
        class: 'grafico__barra',
        d: caminhoBarra(centro - larguraBarra / 2, y(d.total_ml), larguraBarra, y(0) - y(d.total_ml)),
      }));
    }

    const dia = svg('text', { x: centro, y: altura - margem.base + 20, 'text-anchor': 'middle', class: ehHoje ? 'grafico__rotulo-hoje' : '' });
    dia.textContent = rotuloDia(d.dia, ehHoje);
    coluna.append(dia);
    if (mostrarData) {
      const data = svg('text', { x: centro, y: altura - margem.base + 36, 'text-anchor': 'middle' });
      data.textContent = formatarDataCurta(d.dia);
      coluna.append(data);
    }

    // Rótulo direto só no dia de hoje (os demais ficam na dica e na tabela)
    if (ehHoje) {
      const valor = svg('text', { class: 'grafico__valor', x: centro, y: y(d.total_ml) - 8, 'text-anchor': 'middle' });
      valor.textContent = formatarNumero(d.total_ml);
      coluna.append(valor);
    }

    const mostrar = () => mostrarDica(d, ehHoje, centro, Math.min(y(d.total_ml), y(d.meta_ml)), largura);
    coluna.addEventListener('pointerenter', mostrar);
    coluna.addEventListener('focus', mostrar);
    coluna.addEventListener('pointerleave', () => { dica.hidden = true; });
    coluna.addEventListener('blur', () => { dica.hidden = true; });
    raiz.append(coluna);
  });

  // Linha zero
  raiz.append(svg('line', {
    class: 'grafico__base', x1: margem.esquerda, x2: largura - margem.direita, y1: y(0), y2: y(0), 'aria-hidden': 'true',
  }));

  // Linha da meta em degraus (a meta pode mudar ao longo da semana)
  let caminho = `M${margem.esquerda},${y(dados[0].meta_ml)}`;
  dados.forEach((d, i) => {
    caminho += ` H${margem.esquerda + (i + 1) * banda}`;
    if (i < dados.length - 1 && dados[i + 1].meta_ml !== d.meta_ml) caminho += ` V${y(dados[i + 1].meta_ml)}`;
  });
  raiz.append(svg('path', { class: 'grafico__meta', d: caminho, 'aria-hidden': 'true', 'pointer-events': 'none' }));

  container.prepend(raiz);
}

function mostrarDica(d, ehHoje, x, yTopo, larguraTotal) {
  const dica = $('#grafico-dica');
  const nomeDia = ehHoje ? 'Hoje' : DIAS_SEMANA_LONGOS[paraDate(d.dia).getDay()];
  dica.replaceChildren(
    criar('strong', { texto: formatarMl(d.total_ml) }),
    criar('span', { texto: `${nomeDia}, ${formatarDataCurta(d.dia)}` }),
    criar('span', { texto: `Meta ${formatarMl(d.meta_ml)} · ${Math.round(d.percentual)}%${d.meta_atingida ? ' ✓' : ''}` }),
  );
  dica.hidden = false;
  const meia = dica.offsetWidth / 2;
  dica.style.left = `${Math.min(larguraTotal - meia, Math.max(meia, x))}px`;
  dica.style.top = `${yTopo}px`;
}

/* ==================================================================== */
/* Leituras de hoje                                                       */
/* ==================================================================== */

function renderizarLeituras(idNova = null) {
  $('#lista-leituras').replaceChildren(...estado.leiturasHoje.map((leitura) => criar('li', {
    classe: `leitura${leitura.id === idNova ? ' leitura--nova' : ''}`,
  }, [
    criar('span', { classe: 'leitura__icone' }, [icone('gota')]),
    criar('span', { classe: 'leitura__volume', texto: formatarMl(leitura.volume_ml) }),
    criar('time', { classe: 'leitura__hora', texto: formatarHora(leitura.lido_em), atributos: { datetime: leitura.lido_em.replace(' ', 'T') } }),
  ])));
  $('#leituras-vazio').hidden = estado.leiturasHoje.length > 0;
}

/* ==================================================================== */
/* 5. Lembretes (CRUD)                                                    */
/* ==================================================================== */

const diasDoLembrete = (lembrete) => lembrete.dias_semana.split(',').map(Number);

/** Próximo lembrete ativo a partir de agora (procura até 7 dias à frente) */
function proximoLembrete(agora = new Date()) {
  const horaAgora = agora.toTimeString().slice(0, 8);
  for (let deslocamento = 0; deslocamento <= 7; deslocamento += 1) {
    const diaSemana = (agora.getDay() + deslocamento) % 7;
    const candidato = estado.lembretes
      .filter((l) => l.ativo && diasDoLembrete(l).includes(diaSemana) && (deslocamento > 0 || l.hora > horaAgora))
      .sort((a, b) => a.hora.localeCompare(b.hora))[0];
    if (candidato) return { lembrete: candidato, deslocamento, diaSemana };
  }
  return null;
}

function atualizarProximoLembrete() {
  const proximo = proximoLembrete();
  const alvo = $('#proximo-lembrete');
  $$('.lembrete--proximo').forEach((item) => item.classList.remove('lembrete--proximo'));
  if (!proximo) {
    alvo.textContent = 'Nenhum lembrete ativo';
    return;
  }
  const { lembrete, deslocamento, diaSemana } = proximo;
  const quando = deslocamento === 0 ? 'hoje' : deslocamento === 1 ? 'amanhã' : DIAS_SEMANA_LONGOS[diaSemana].toLowerCase();
  alvo.textContent = `Próximo: ${quando} às ${formatarHora(lembrete.hora)}${lembrete.rotulo ? ` · ${lembrete.rotulo}` : ''}`;
  $(`.lembrete[data-id="${lembrete.id}"]`)?.classList.add('lembrete--proximo');
}

function renderizarLembretes(focarId = null, focarAcao = null) {
  $('#lista-lembretes').replaceChildren(...estado.lembretes.map((lembrete) => {
    const hora = formatarHora(lembrete.hora);
    const nome = lembrete.rotulo || 'Hora de beber água';
    return criar('li', { classe: `lembrete${lembrete.ativo ? '' : ' lembrete--inativo'}`, dados: { id: lembrete.id } }, [
      criar('time', { classe: 'lembrete__hora', texto: hora, atributos: { datetime: hora } }),
      criar('div', { classe: 'lembrete__info' }, [
        criar('p', { classe: 'lembrete__rotulo', texto: nome }),
        criar('p', { classe: 'lembrete__dias', texto: `${descreverDias(lembrete.dias_semana)}${lembrete.ativo ? '' : ' · pausado'}` }),
      ]),
      criar('div', { classe: 'lembrete__acoes' }, [
        criar('button', {
          classe: 'interruptor',
          atributos: { type: 'button', role: 'switch', 'aria-checked': String(Boolean(lembrete.ativo)), 'aria-label': `Lembrete das ${hora} (${nome}) ativo` },
          dados: { acao: 'alternar' },
        }),
        criar('button', {
          classe: 'botao-icone',
          atributos: { type: 'button', 'aria-label': `Editar lembrete das ${hora}` },
          dados: { acao: 'editar' },
        }, [icone('editar')]),
        criar('button', {
          classe: 'botao-icone botao-icone--perigo',
          atributos: { type: 'button', 'aria-label': `Excluir lembrete das ${hora}` },
          dados: { acao: 'excluir' },
        }, [icone('lixeira')]),
      ]),
    ]);
  }));
  $('#lembretes-vazio').hidden = estado.lembretes.length > 0;
  atualizarProximoLembrete();

  // Mantém o foco do teclado no mesmo controle depois de redesenhar a lista
  if (focarId) $(`.lembrete[data-id="${focarId}"] [data-acao="${focarAcao}"]`)?.focus();
}

/** Diálogo de criar/editar */
function abrirDialogoLembrete(lembrete = null) {
  const dialogo = $('#dialogo-lembrete');
  const formulario = $('#form-lembrete');
  formulario.reset();
  limparErros(formulario);
  mostrarErroDias('');

  $('#dialogo-lembrete-titulo').textContent = lembrete ? 'Editar lembrete' : 'Novo lembrete';
  formulario.elements.lembrete_id.value = lembrete?.id ?? '';
  formulario.elements.hora.value = lembrete ? formatarHora(lembrete.hora) : sugerirHorario();
  formulario.elements.rotulo.value = lembrete?.rotulo ?? '';
  formulario.elements.ativo.checked = lembrete ? Boolean(lembrete.ativo) : true;
  const dias = lembrete ? diasDoLembrete(lembrete) : [0, 1, 2, 3, 4, 5, 6];
  $$('input[name="dia"]', formulario).forEach((caixa) => { caixa.checked = dias.includes(Number(caixa.value)); });

  dialogo.showModal();
  formulario.elements.hora.focus();
}

/** Sugere a próxima hora cheia livre para um novo lembrete */
function sugerirHorario() {
  const ocupados = new Set(estado.lembretes.map((l) => formatarHora(l.hora)));
  for (let h = new Date().getHours() + 1; h < new Date().getHours() + 25; h += 1) {
    const hora = `${String(h % 24).padStart(2, '0')}:00`;
    if (!ocupados.has(hora)) return hora;
  }
  return '08:00';
}

function mostrarErroDias(mensagem) {
  const erro = $('#lembrete-dias-erro');
  erro.textContent = mensagem;
  erro.hidden = !mensagem;
  $('.dias').classList.toggle('campo--erro', Boolean(mensagem));
}

/** Diálogo de confirmação reutilizável → Promise<boolean> */
function confirmar(mensagem, textoBotao = 'Excluir') {
  return new Promise((resolver) => {
    const dialogo = $('#dialogo-confirmar');
    $('#confirmar-texto').textContent = mensagem;
    $('#confirmar-botao').textContent = textoBotao;
    dialogo.returnValue = '';
    dialogo.addEventListener('close', () => resolver(dialogo.returnValue === 'confirmar'), { once: true });
    dialogo.showModal();
  });
}

function ligarLembretes() {
  const dialogo = $('#dialogo-lembrete');
  const formulario = $('#form-lembrete');

  $('#botao-novo-lembrete').addEventListener('click', () => abrirDialogoLembrete());
  $$('[data-fechar]', dialogo).forEach((botao) => botao.addEventListener('click', () => dialogo.close()));
  // Clique fora (no fundo escurecido) fecha os diálogos
  $$('dialog').forEach((d) => d.addEventListener('click', (evento) => { if (evento.target === d) d.close(); }));

  // Atalhos de dias (Todos / Seg a Sex / Fim de semana)
  $$('[data-dias]', formulario).forEach((botao) => {
    botao.addEventListener('click', () => {
      const dias = botao.dataset.dias.split(',');
      $$('input[name="dia"]', formulario).forEach((caixa) => { caixa.checked = dias.includes(caixa.value); });
      mostrarErroDias('');
    });
  });

  // Criar (POST) ou editar (PUT)
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    limparErros(formulario);
    mostrarErroDias('');

    const dados = {
      hora: formulario.elements.hora.value,
      dias_semana: $$('input[name="dia"]:checked', formulario).map((caixa) => caixa.value).join(','),
      rotulo: formulario.elements.rotulo.value.trim(),
      ativo: formulario.elements.ativo.checked,
    };
    const erros = validarObjeto(dados, { hora: validarHora, dias_semana: validarDiasSemana });
    if (dados.rotulo.length > 60) erros.rotulo = 'Use até 60 caracteres.';
    if (Object.keys(erros).length) {
      mostrarErroDias(erros.dias_semana || '');
      (aplicarErros(formulario, erros) || $('input[name="dia"]', formulario)).focus();
      return;
    }

    const id = formulario.elements.lembrete_id.value;
    const botao = $('#botao-salvar-lembrete');
    definirCarregando(botao, true, 'Salvando…');
    try {
      const salvo = id ? await api.atualizarLembrete(id, dados) : await api.criarLembrete(dados);
      estado.lembretes = await api.listarLembretes(idUsuario());
      dialogo.close();
      renderizarLembretes(salvo.id, 'editar');
      mostrarToast(`Lembrete das ${formatarHora(salvo.hora)} ${id ? 'atualizado' : 'criado'}.`, { tipo: 'sucesso' });
    } catch (falha) {
      if (falha instanceof ErroApi && falha.status !== 401) {
        mostrarErroFormulario(formulario, falha.message);
        mostrarErroDias(falha.campos?.dias_semana || '');
        aplicarErros(formulario, falha.campos)?.focus();
      } else {
        tratarErro(falha);
      }
    } finally {
      definirCarregando(botao, false);
    }
  });

  // Ações de cada item (delegação de eventos)
  $('#lista-lembretes').addEventListener('click', async (evento) => {
    const botao = evento.target.closest('[data-acao]');
    if (!botao) return;
    const id = Number(botao.closest('.lembrete').dataset.id);
    const lembrete = estado.lembretes.find((l) => l.id === id);

    if (botao.dataset.acao === 'editar') {
      abrirDialogoLembrete(lembrete);
      return;
    }

    if (botao.dataset.acao === 'alternar') {
      botao.disabled = true;
      try {
        const atualizado = await api.alternarLembrete(id, !lembrete.ativo);
        Object.assign(lembrete, atualizado);
        renderizarLembretes(id, 'alternar');
        mostrarToast(`Lembrete das ${formatarHora(lembrete.hora)} ${lembrete.ativo ? 'ativado' : 'pausado'}.`, { duracao: 2500 });
      } catch (falha) {
        tratarErro(falha);
        botao.disabled = false;
      }
      return;
    }

    if (botao.dataset.acao === 'excluir') {
      const ok = await confirmar(`O lembrete das ${formatarHora(lembrete.hora)} (${lembrete.rotulo || 'sem nome'}) será excluído.`);
      if (!ok) {
        botao.focus();
        return;
      }
      try {
        await api.excluirLembrete(id);
        estado.lembretes = estado.lembretes.filter((l) => l.id !== id);
        renderizarLembretes();
        $('#botao-novo-lembrete').focus();
        mostrarToast('Lembrete excluído.', { duracao: 2500 });
      } catch (falha) {
        tratarErro(falha);
      }
    }
  });
}

/* Avisos na hora marcada (com a página aberta) ------------------------ */

function dispararLembrete(lembrete) {
  const titulo = lembrete.rotulo ? `${lembrete.rotulo}: hora de beber água!` : 'Hora de beber água!';
  mostrarToast(`Lembrete das ${formatarHora(lembrete.hora)}. Sua HydroSmart também vibra e pisca.`, { tipo: 'alerta', titulo, duracao: 10000 });
  piscarLeds();
  const item = $(`.lembrete[data-id="${lembrete.id}"]`);
  item?.classList.add('lembrete--tocando');
  setTimeout(() => item?.classList.remove('lembrete--tocando'), 2000);

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('HydroSmart', { body: titulo, icon: 'assets/favicon.svg', tag: `lembrete-${lembrete.id}` });
  }
}

function iniciarAgendador() {
  const verificar = () => {
    const agora = new Date();
    const hora = agora.toTimeString().slice(0, 5);
    for (const lembrete of estado.lembretes) {
      if (!lembrete.ativo || formatarHora(lembrete.hora) !== hora || !diasDoLembrete(lembrete).includes(agora.getDay())) continue;
      const chave = `${lembrete.id}-${dataSQL(agora)}-${hora}`;
      if (estado.lembretesDisparados.has(chave)) continue;
      estado.lembretesDisparados.add(chave);
      dispararLembrete(lembrete);
    }
    if (estado.garrafa) $('#garrafa-sincronizacao').textContent = tempoRelativo(estado.garrafa.ultima_sincronizacao);
    atualizarProximoLembrete();
  };
  verificar();
  setInterval(verificar, 20000);
}

function atualizarStatusNotificacoes() {
  const status = $('#notificacoes-status');
  const botao = $('#botao-notificacoes');
  if (!('Notification' in window)) {
    status.textContent = 'Este navegador não oferece notificações. Os lembretes aparecem nesta página.';
    botao.hidden = true;
    return;
  }
  const textos = {
    granted: 'Notificações ativadas: com o painel aberto, você recebe o aviso mesmo em outra aba.',
    denied: 'Notificações bloqueadas no navegador. Os lembretes aparecem só nesta página.',
    default: 'Com o painel aberto, os lembretes aparecem aqui na hora marcada.',
  };
  status.textContent = textos[Notification.permission];
  botao.hidden = Notification.permission !== 'default';
}

function ligarNotificacoes() {
  atualizarStatusNotificacoes();
  $('#botao-notificacoes').addEventListener('click', async () => {
    if (!window.isSecureContext) {
      $('#notificacoes-status').textContent = 'Notificações exigem https:// ou http://localhost.';
      return;
    }
    await Notification.requestPermission();
    atualizarStatusNotificacoes();
  });
}

/* ==================================================================== */
/* 6. Conquistas                                                          */
/* ==================================================================== */

function renderizarConquistas(idsNovas = []) {
  const porTipo = new Map();
  for (const conquista of estado.conquistas) {
    if (!porTipo.has(conquista.tipo)) porTipo.set(conquista.tipo, []);
    porTipo.get(conquista.tipo).push(conquista); // já vêm da mais recente para a mais antiga
  }

  $('#lista-conquistas').replaceChildren(...CATALOGO_CONQUISTAS.map((item) => {
    const obtidas = porTipo.get(item.tipo) || [];
    const temConquista = obtidas.length > 0;
    const nova = obtidas.some((c) => idsNovas.includes(c.id));
    let data = 'Ainda não conquistada';
    if (temConquista) {
      const prefixo = item.tipo === 'meta_diaria' ? 'Última em' : 'Obtida em';
      data = `${prefixo} ${formatarDataCompleta(obtidas[0].obtida_em)}`;
    }
    return criar('li', {}, [
      criar('article', {
        classe: `conquista${temConquista ? '' : ' conquista--bloqueada'}${nova ? ' conquista--nova' : ''}`,
      }, [
        criar('span', { classe: 'conquista__icone' }, [icone(temConquista ? item.icone : 'cadeado')]),
        criar('h3', { classe: 'conquista__nome', texto: item.nome }),
        criar('p', { classe: 'conquista__descricao', texto: item.descricao }),
        criar('p', { classe: 'conquista__data', texto: data }),
        item.tipo === 'meta_diaria' && obtidas.length > 1
          ? criar('span', { classe: 'conquista__contador' }, [
            `×${obtidas.length}`,
            criar('span', { classe: 'visualmente-oculto', texto: ' vezes' }),
          ])
          : null,
      ]),
    ]);
  }));

  const desbloqueadas = CATALOGO_CONQUISTAS.filter((item) => porTipo.has(item.tipo)).length;
  $('#conquistas-resumo').textContent = `${desbloqueadas} de ${CATALOGO_CONQUISTAS.length} desbloqueadas`;
}

/* ==================================================================== */
/* Conta: sair e restaurar demonstração                                   */
/* ==================================================================== */

function ligarConta() {
  $('#botao-sair').addEventListener('click', async () => {
    await api.logout().catch(() => {});
    window.location.href = './';
  });

  const resetar = $('#botao-resetar');
  resetar.hidden = !CONFIG.usarMock;
  resetar.addEventListener('click', async () => {
    const ok = await confirmar('Todas as contas, leituras e lembretes criados neste navegador serão apagados e os dados de exemplo voltarão ao estado inicial.', 'Restaurar');
    if (!ok) return;
    await api.resetarDemo();
    window.location.href = './#cadastro';
  });

  // Outra aba saiu da conta ou mudou os dados → mantém esta aba em dia
  window.addEventListener('storage', (evento) => {
    if (evento.key === 'hydrosmart_sessao' && !sessao.obter()) window.location.replace('./');
    if (evento.key === 'hydrosmart_db') carregarTudo().catch(tratarErro);
  });
}

/* ==================================================================== */
/* Inicialização                                                          */
/* ==================================================================== */

async function iniciar() {
  iniciarTema();
  const atual = sessao.obter();
  if (!atual?.token) {
    window.location.replace('./#cadastro');
    return;
  }
  estado.usuario = atual.usuario;
  preencherCabecalho();

  ligarProgresso();
  ligarGarrafa();
  ligarLembretes();
  ligarNotificacoes();
  ligarConta();

  try {
    await carregarTudo();
  } catch (erro) {
    tratarErro(erro);
  } finally {
    $('#conteudo').setAttribute('aria-busy', 'false');
  }

  iniciarAgendador();
  new ResizeObserver(debounce(desenharGrafico, 120)).observe($('#grafico-historico'));
}

iniciar();
