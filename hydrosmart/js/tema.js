/**
 * js/tema.js
 * Modo claro/escuro compartilhado pela landing page e pelo painel.
 *
 * - O tema fica no atributo data-tema do <html> ("claro" | "escuro"); o CSS
 *   troca as variáveis de cor em :root[data-tema="escuro"].
 * - Um script curto no <head> de cada página aplica o tema ANTES de desenhar
 *   a tela (evita piscar claro → escuro). Este módulo cuida dos botões.
 * - A escolha fica salva no localStorage (chave 'hydrosmart_tema'). Sem
 *   escolha salva, o site acompanha o tema do sistema operacional.
 */

const CHAVE_TEMA = 'hydrosmart_tema';
const COR_BARRA_NAVEGADOR = { claro: '#0B2A6F', escuro: '#0A1228' };
const sistemaEscuro = window.matchMedia('(prefers-color-scheme: dark)');

const temaValido = (tema) => tema === 'claro' || tema === 'escuro';

function lerEscolha() {
  try {
    const tema = localStorage.getItem(CHAVE_TEMA);
    return temaValido(tema) ? tema : null;
  } catch {
    return null;
  }
}

export const temaAtual = () => (document.documentElement.dataset.tema === 'escuro' ? 'escuro' : 'claro');

/** Aplica o tema na página e atualiza o estado dos botões */
export function aplicarTema(tema, { salvar = false } = {}) {
  const escuro = tema === 'escuro';
  document.documentElement.dataset.tema = escuro ? 'escuro' : 'claro';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COR_BARRA_NAVEGADOR[escuro ? 'escuro' : 'claro']);

  document.querySelectorAll('[data-alternar-tema]').forEach((botao) => {
    botao.setAttribute('aria-pressed', String(escuro)); // "Modo escuro" ligado/desligado
    botao.title = escuro ? 'Mudar para o modo claro' : 'Mudar para o modo escuro';
  });

  if (salvar) {
    try {
      localStorage.setItem(CHAVE_TEMA, escuro ? 'escuro' : 'claro');
    } catch {
      /* sem storage: o tema vale só nesta página */
    }
  }
}

export function iniciarTema() {
  aplicarTema(lerEscolha() ?? (sistemaEscuro.matches ? 'escuro' : 'claro'));

  document.querySelectorAll('[data-alternar-tema]').forEach((botao) => {
    botao.addEventListener('click', () => {
      aplicarTema(temaAtual() === 'escuro' ? 'claro' : 'escuro', { salvar: true });
    });
  });

  // Sem escolha salva, acompanha a mudança de tema do sistema
  sistemaEscuro.addEventListener('change', (evento) => {
    if (!lerEscolha()) aplicarTema(evento.matches ? 'escuro' : 'claro');
  });

  // Outra aba (ex.: o painel) trocou o tema → esta acompanha
  window.addEventListener('storage', (evento) => {
    if (evento.key === CHAVE_TEMA && temaValido(evento.newValue)) aplicarTema(evento.newValue);
  });
}
