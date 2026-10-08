/**
 * js/app.js
 * Comportamento da landing page (index.html):
 *   1. Menu responsivo (gaveta no celular) e destaque da seção atual
 *   2. Animações de revelação ao rolar (IntersectionObserver)
 *   3. Abas "Criar conta" / "Entrar" acessíveis (setas do teclado)
 *   4. Validação e envio do cadastro e do login (api.js)
 *   5. Sugestão de meta pelo peso, mostrar/ocultar senha
 *   6. Modo claro/escuro (tema.js)
 */

import { api, sessao, ErroApi, CONTA_DEMO } from './api.js';
import {
  validarNome, validarEmail, validarSenha, validarMeta, validarPeso,
  validarObjeto, sugerirMetaPorPeso,
} from './validacao.js';
import { formatarMl } from './utils.js';
import { iniciarTema } from './tema.js';
import {
  $, $$, prefereMenosMovimento, mostrarToast, definirErroCampo, aplicarErros,
  limparErros, mostrarErroFormulario, definirCarregando, animarNumero,
} from './ui.js';

/* ------------------------------------------------------------------ */
/* 1. Menu e navegação                                                 */
/* ------------------------------------------------------------------ */

function iniciarMenu() {
  const topo = $('#topo');
  const botao = $('.topo__menu-botao');
  const menu = $('#menu-principal');
  const usoBotao = $('use', botao);

  const definirAberto = (aberto) => {
    menu.classList.toggle('menu--aberto', aberto);
    botao.setAttribute('aria-expanded', String(aberto));
    botao.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
    usoBotao.setAttribute('href', `assets/icones.svg#i-${aberto ? 'fechar' : 'menu'}`);
  };

  botao.addEventListener('click', () => definirAberto(botao.getAttribute('aria-expanded') !== 'true'));

  // Fecha ao escolher um link ou apertar Esc
  menu.addEventListener('click', (evento) => {
    if (evento.target.closest('a')) definirAberto(false);
  });
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && botao.getAttribute('aria-expanded') === 'true') {
      definirAberto(false);
      botao.focus();
    }
  });

  // Sombra no topo depois de rolar um pouco
  const aoRolar = () => topo.classList.toggle('topo--rolado', window.scrollY > 8);
  window.addEventListener('scroll', aoRolar, { passive: true });
  aoRolar();

  // Marca no menu a seção visível (aria-current)
  const links = $$('.menu__lista a');
  const secoes = links.map((link) => $(link.getAttribute('href'))).filter(Boolean);
  const observador = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;
      links.forEach((link) => {
        const ativo = link.getAttribute('href') === `#${entrada.target.id}`;
        if (ativo) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  secoes.forEach((secao) => observador.observe(secao));
}

/** Mostra "Meu painel" no lugar de "Entrar/Criar conta" se já houver sessão */
function atualizarAcoesDeSessao() {
  const logado = Boolean(sessao.obter()?.token);
  $$('[data-sessao="anonimo"]').forEach((el) => { el.hidden = logado; });
  $$('[data-sessao="logado"]').forEach((el) => { el.hidden = !logado; });
}

/* ------------------------------------------------------------------ */
/* 2. Revelação ao rolar                                               */
/* ------------------------------------------------------------------ */

function iniciarRevelacao() {
  const elementos = $$('[data-revelar]');
  if (prefereMenosMovimento() || !('IntersectionObserver' in window)) return;

  // Atraso escalonado para itens irmãos (cartões aparecem em sequência)
  elementos.forEach((el) => {
    const irmaos = [...el.parentElement.children].filter((filho) => filho.hasAttribute('data-revelar'));
    const indice = irmaos.indexOf(el);
    if (irmaos.length > 1) el.style.setProperty('--atraso', `${Math.min(indice, 5) * 90}ms`);
  });

  document.documentElement.classList.add('revelacao-ativa');
  const observador = new IntersectionObserver((entradas, obs) => {
    for (const entrada of entradas) {
      if (entrada.isIntersecting) {
        entrada.target.classList.add('revelado');
        obs.unobserve(entrada.target);
      }
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  elementos.forEach((el) => observador.observe(el));
}

/** Anima o número do cartão do app no hero (0 → 1,8 L) */
function animarHero() {
  const alvo = $('[data-contador]');
  if (!alvo) return;
  const final = Number(alvo.dataset.contador);
  animarNumero(alvo, 0, final, (ml) => (ml / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), 1400);
}

/* ------------------------------------------------------------------ */
/* 3. Abas acessíveis (padrão WAI-ARIA Tabs)                           */
/* ------------------------------------------------------------------ */

function iniciarAbas() {
  const abas = $$('.abas [role="tab"]');

  const selecionar = (aba, focar = true) => {
    abas.forEach((outra) => {
      const ativa = outra === aba;
      outra.setAttribute('aria-selected', String(ativa));
      outra.tabIndex = ativa ? 0 : -1;
      document.getElementById(outra.getAttribute('aria-controls')).hidden = !ativa;
    });
    if (focar) aba.focus();
  };

  abas.forEach((aba, indice) => {
    aba.addEventListener('click', () => selecionar(aba));
    aba.addEventListener('keydown', (evento) => {
      const mapa = { ArrowRight: 1, ArrowLeft: -1, Home: -indice, End: abas.length - 1 - indice };
      if (!(evento.key in mapa)) return;
      evento.preventDefault();
      selecionar(abas[(indice + mapa[evento.key] + abas.length) % abas.length]);
    });
  });

  // Links com data-aba (ex.: "Entrar" no topo) abrem a aba correta
  $$('a[data-aba]').forEach((link) => {
    link.addEventListener('click', () => {
      const aba = document.getElementById(`aba-${link.dataset.aba}`);
      if (aba) selecionar(aba, false);
      setTimeout(() => $(`#painel-${link.dataset.aba} input`)?.focus({ preventScroll: true }), 500);
    });
  });
}

/* ------------------------------------------------------------------ */
/* 4. Formulários                                                      */
/* ------------------------------------------------------------------ */

/** Botões de mostrar/ocultar senha */
function iniciarMostrarSenha() {
  $$('.campo__mostrar').forEach((botao) => {
    botao.addEventListener('click', () => {
      const campo = document.getElementById(botao.getAttribute('aria-controls'));
      const mostrar = campo.type === 'password';
      campo.type = mostrar ? 'text' : 'password';
      botao.setAttribute('aria-pressed', String(mostrar));
      botao.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
      $('use', botao).setAttribute('href', `assets/icones.svg#i-${mostrar ? 'olho-fechado' : 'olho'}`);
    });
  });
}

const REGRAS_CADASTRO = {
  nome: validarNome,
  email: validarEmail,
  senha: validarSenha,
  meta_diaria_ml: validarMeta,
  peso_kg: validarPeso,
};

/** Lê os campos do cadastro já no formato esperado pela API */
function lerCadastro(formulario) {
  const dados = Object.fromEntries(new FormData(formulario));
  return {
    nome: dados.nome.trim(),
    email: dados.email.trim(),
    senha: dados.senha,
    meta_diaria_ml: dados.meta_diaria_ml === '' ? '' : Number(dados.meta_diaria_ml),
    peso_kg: dados.peso_kg === '' ? '' : Number(dados.peso_kg),
  };
}

/** Valida um campo quando o usuário sai dele (e ao digitar, se já havia erro) */
function validarAoSair(formulario, regras) {
  for (const campo of formulario.elements) {
    const regra = regras[campo.name];
    if (!regra) continue;
    const verificar = () => definirErroCampo(campo, regra(campo.value.trim ? campo.value.trim() : campo.value));
    campo.addEventListener('blur', () => { if (campo.value !== '' || campo.required) verificar(); });
    campo.addEventListener('input', () => { if (campo.getAttribute('aria-invalid') === 'true') verificar(); });
  }
}

function iniciarCadastro() {
  const formulario = $('#form-cadastro');
  validarAoSair(formulario, REGRAS_CADASTRO);

  // Sugestão de meta a partir do peso
  $('#botao-sugerir-meta').addEventListener('click', () => {
    const peso = formulario.elements.peso_kg;
    const aviso = $('#sugestao-meta');
    const erro = validarPeso(peso.value) || (peso.value === '' ? 'Informe seu peso para calcular a sugestão.' : '');
    definirErroCampo(peso, erro);
    if (erro) {
      aviso.textContent = '';
      peso.focus();
      return;
    }
    const sugestao = sugerirMetaPorPeso(peso.value);
    formulario.elements.meta_diaria_ml.value = sugestao;
    definirErroCampo(formulario.elements.meta_diaria_ml, '');
    aviso.textContent = `Sugestão aplicada: ${formatarMl(sugestao)} por dia (cerca de 35 ml por kg). Ajuste se quiser.`;
  });

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    limparErros(formulario);

    const dados = lerCadastro(formulario);
    const erros = validarObjeto(dados, REGRAS_CADASTRO);
    if (Object.keys(erros).length) {
      mostrarErroFormulario(formulario, 'Confira os campos destacados antes de continuar.');
      aplicarErros(formulario, erros)?.focus();
      return;
    }

    const botao = $('button[type="submit"]', formulario);
    definirCarregando(botao, true, 'Criando sua conta…');
    try {
      const usuario = await api.cadastrar(dados);
      mostrarToast(`Bem-vindo(a), ${usuario.nome.split(' ')[0]}! Abrindo seu painel…`, { tipo: 'sucesso', titulo: 'Conta criada' });
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 900);
    } catch (erro) {
      definirCarregando(botao, false);
      tratarErroFormulario(formulario, erro);
    }
  });
}

function iniciarLogin() {
  const formulario = $('#form-login');
  const regras = { email: validarEmail, senha: (v) => (v ? '' : 'Informe sua senha.') };
  validarAoSair(formulario, regras);

  const entrar = async (email, senha) => {
    const botao = $('button[type="submit"]', formulario);
    definirCarregando(botao, true, 'Entrando…');
    try {
      const usuario = await api.login(email, senha);
      mostrarToast(`Olá de novo, ${usuario.nome.split(' ')[0]}!`, { tipo: 'sucesso' });
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 600);
    } catch (erro) {
      definirCarregando(botao, false);
      tratarErroFormulario(formulario, erro);
    }
  };

  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    limparErros(formulario);
    const dados = Object.fromEntries(new FormData(formulario));
    const erros = validarObjeto({ email: dados.email.trim(), senha: dados.senha }, regras);
    if (Object.keys(erros).length) {
      aplicarErros(formulario, erros)?.focus();
      return;
    }
    entrar(dados.email.trim(), dados.senha);
  });

  // Conta de demonstração: preenche e entra
  $('#botao-demo').addEventListener('click', () => {
    formulario.elements.email.value = CONTA_DEMO.email;
    formulario.elements.senha.value = CONTA_DEMO.senha;
    limparErros(formulario);
    entrar(CONTA_DEMO.email, CONTA_DEMO.senha);
  });
}

/** Mostra o erro vindo da API no formulário (geral + por campo) */
function tratarErroFormulario(formulario, erro) {
  if (erro instanceof ErroApi) {
    mostrarErroFormulario(formulario, erro.message);
    aplicarErros(formulario, erro.campos)?.focus();
  } else {
    console.error(erro);
    mostrarErroFormulario(formulario, 'Algo deu errado. Tente novamente.');
  }
}

/* ------------------------------------------------------------------ */
/* Inicialização                                                       */
/* ------------------------------------------------------------------ */

function iniciar() {
  $('#ano-atual').textContent = new Date().getFullYear();
  iniciarTema();
  iniciarMenu();
  atualizarAcoesDeSessao();
  iniciarRevelacao();
  animarHero();
  iniciarAbas();
  iniciarMostrarSenha();
  iniciarCadastro();
  iniciarLogin();
}

iniciar();
