/**
 * js/ui.js
 * Utilitários de interface compartilhados pela landing page e pelo painel:
 * seletores, criação segura de elementos (sempre textContent, nunca
 * innerHTML com dados), ícones, avisos (toasts) e erros de formulário.
 */

export const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
export const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];

export const prefereMenosMovimento = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const SVG_NS = 'http://www.w3.org/2000/svg';
const SPRITE = 'assets/icones.svg';

/**
 * Cria um elemento HTML.
 * @param {string} tag
 * @param {Object} props  { classe, texto, atributos: {...}, dados: {...} }
 * @param {Array<Node|string>} filhos
 */
export function criar(tag, { classe, texto, atributos = {}, dados = {} } = {}, filhos = []) {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto !== undefined && texto !== null) elemento.textContent = texto;
  for (const [nome, valor] of Object.entries(atributos)) {
    if (valor === false || valor === null || valor === undefined) continue;
    elemento.setAttribute(nome, valor === true ? '' : String(valor));
  }
  for (const [nome, valor] of Object.entries(dados)) elemento.dataset[nome] = valor;
  for (const filho of filhos) {
    if (filho !== null && filho !== undefined && filho !== false) {
      elemento.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
    }
  }
  return elemento;
}

/** Ícone do sprite (decorativo: aria-hidden) */
export function icone(nome, classe = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `icone ${classe}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const uso = document.createElementNS(SVG_NS, 'use');
  uso.setAttribute('href', `${SPRITE}#i-${nome}`);
  svg.append(uso);
  return svg;
}

/* ------------------------------------------------------------------ */
/* Toasts (avisos rápidos)                                             */
/* ------------------------------------------------------------------ */

const ICONES_TOAST = { info: 'info', sucesso: 'check', erro: 'alerta', alerta: 'sino', conquista: 'trofeu' };

/**
 * Mostra um aviso no canto da tela. Leitores de tela anunciam o texto
 * pela região aria-live do container (#toasts).
 * @param {string} mensagem
 * @param {{tipo?: 'info'|'sucesso'|'erro'|'alerta'|'conquista', titulo?: string, duracao?: number}} opcoes
 */
export function mostrarToast(mensagem, { tipo = 'info', titulo = '', duracao = 4500 } = {}) {
  let container = $('#toasts');
  if (!container) {
    container = criar('div', { classe: 'toasts', atributos: { id: 'toasts', 'aria-live': 'polite' } });
    document.body.append(container);
  }

  const toast = criar('div', { classe: `toast toast--${tipo}`, atributos: { role: tipo === 'erro' ? 'alert' : 'status' } }, [
    criar('span', { classe: 'toast__icone' }, [icone(ICONES_TOAST[tipo] || 'info')]),
    criar('div', { classe: 'toast__texto' }, [
      titulo ? criar('strong', { texto: titulo }) : null,
      criar('span', { texto: mensagem }),
    ]),
    criar('button', { classe: 'toast__fechar', atributos: { type: 'button', 'aria-label': 'Fechar aviso' } }, [icone('fechar')]),
  ]);

  const remover = () => {
    toast.classList.add('toast--saindo');
    setTimeout(() => toast.remove(), prefereMenosMovimento() ? 0 : 250);
  };
  $('.toast__fechar', toast).addEventListener('click', remover);
  container.append(toast);
  if (duracao > 0) setTimeout(remover, duracao);
  return toast;
}

/* ------------------------------------------------------------------ */
/* Formulários                                                         */
/* ------------------------------------------------------------------ */

/**
 * Mostra (ou limpa, se mensagem vazia) o erro de um campo.
 * Espera um elemento irmão com id `${campo.id}-erro` dentro do .campo.
 */
export function definirErroCampo(campo, mensagem = '') {
  const alvo = campo.id ? document.getElementById(`${campo.id}-erro`) : null;
  campo.setAttribute('aria-invalid', mensagem ? 'true' : 'false');
  campo.closest('.campo')?.classList.toggle('campo--erro', Boolean(mensagem));
  if (alvo) {
    alvo.textContent = mensagem;
    alvo.hidden = !mensagem;
  }
}

/** Aplica um objeto { nomeDoCampo: mensagem } a um formulário */
export function aplicarErros(formulario, erros = {}) {
  let primeiro = null;
  for (const campo of formulario.elements) {
    if (!campo.name) continue;
    const mensagem = erros[campo.name] || '';
    if (campo.type !== 'checkbox' && campo.type !== 'radio') definirErroCampo(campo, mensagem);
    if (mensagem && !primeiro) primeiro = campo;
  }
  return primeiro; // útil para levar o foco ao primeiro campo com erro
}

export function limparErros(formulario) {
  aplicarErros(formulario, {});
  const resumo = $('.form__resumo-erro', formulario);
  if (resumo) {
    resumo.textContent = '';
    resumo.hidden = true;
  }
}

/** Mensagem geral do formulário (role="alert" no HTML) */
export function mostrarErroFormulario(formulario, mensagem) {
  const resumo = $('.form__resumo-erro', formulario);
  if (!resumo) return;
  resumo.textContent = mensagem;
  resumo.hidden = !mensagem;
}

/** Desabilita o botão e troca o texto enquanto uma ação está em andamento */
export function definirCarregando(botao, carregando, textoCarregando = 'Aguarde…') {
  if (!botao) return;
  if (carregando) {
    botao.dataset.textoOriginal = botao.textContent.trim();
    botao.textContent = textoCarregando;
    botao.disabled = true;
    botao.setAttribute('aria-busy', 'true');
  } else {
    if (botao.dataset.textoOriginal) botao.textContent = botao.dataset.textoOriginal;
    botao.disabled = false;
    botao.removeAttribute('aria-busy');
  }
}

/** Anima um número de `de` até `para` (respeita prefers-reduced-motion) */
export function animarNumero(elemento, de, para, formatar = String, duracao = 700) {
  if (prefereMenosMovimento() || de === para) {
    elemento.textContent = formatar(para);
    return;
  }
  const inicio = performance.now();
  const passo = (agora) => {
    const t = Math.min(1, (agora - inicio) / duracao);
    const suave = 1 - (1 - t) ** 3;
    elemento.textContent = formatar(Math.round(de + (para - de) * suave));
    if (t < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}
