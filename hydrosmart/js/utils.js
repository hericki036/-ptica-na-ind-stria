/**
 * js/utils.js
 * Funções puras (sem DOM) de datas e formatação, usadas pela interface
 * e pelo servidor simulado. Datas seguem o formato do banco SQL:
 *   DATE     → 'AAAA-MM-DD'
 *   DATETIME → 'AAAA-MM-DD HH:MM:SS' (horário local)
 */

const doisDigitos = (n) => String(n).padStart(2, '0');

export const DIAS_SEMANA_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const DIAS_SEMANA_LONGOS = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado',
];

/* ------------------------------------------------------------------ */
/* Datas                                                               */
/* ------------------------------------------------------------------ */

/** Date → 'AAAA-MM-DD' (local) */
export function dataSQL(data = new Date()) {
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
}

/** Date → 'AAAA-MM-DD HH:MM:SS' (local) */
export function dataHoraSQL(data = new Date()) {
  return `${dataSQL(data)} ${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}:${doisDigitos(data.getSeconds())}`;
}

/** 'AAAA-MM-DD' ou 'AAAA-MM-DD HH:MM[:SS]' → Date (local) */
export function paraDate(texto) {
  const [data, hora = '00:00:00'] = String(texto).split(/[ T]/);
  const [ano, mes, dia] = data.split('-').map(Number);
  const [h = 0, m = 0, s = 0] = hora.split(':').map(Number);
  return new Date(ano, mes - 1, dia, h, m, s);
}

/** Soma (ou subtrai) dias a uma data 'AAAA-MM-DD' */
export function adicionarDias(dataTexto, dias) {
  const data = paraDate(dataTexto);
  data.setDate(data.getDate() + dias);
  return dataSQL(data);
}

export const hojeSQL = () => dataSQL(new Date());

/** 'HH:MM' ou 'HH:MM:SS' → 'HH:MM:SS' */
export function normalizarHora(hora) {
  const [h, m, s = '00'] = String(hora).split(':');
  return `${doisDigitos(Number(h))}:${doisDigitos(Number(m))}:${doisDigitos(Number(s))}`;
}

/* ------------------------------------------------------------------ */
/* Formatação (pt-BR)                                                  */
/* ------------------------------------------------------------------ */

const formatoInteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const formatoLitros = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

export const formatarNumero = (n) => formatoInteiro.format(n);

/** 1250 → '1.250 ml' */
export const formatarMl = (ml) => `${formatoInteiro.format(ml)} ml`;

/** 1800 → '1,8 L' */
export const formatarLitros = (ml) => `${formatoLitros.format(ml / 1000)} L`;

/** 'AAAA-MM-DD HH:MM:SS' ou 'HH:MM:SS' → 'HH:MM' */
export function formatarHora(texto) {
  const hora = String(texto).includes(' ') ? String(texto).split(' ')[1] : String(texto);
  return hora.slice(0, 5);
}

/** 'AAAA-MM-DD' → '06/10' */
export function formatarDataCurta(texto) {
  const [, mes, dia] = String(texto).slice(0, 10).split('-');
  return `${dia}/${mes}`;
}

/** 'AAAA-MM-DD' → '06/10/2026' */
export function formatarDataCompleta(texto) {
  const [ano, mes, dia] = String(texto).slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Date → 'quarta-feira, 8 de outubro' */
export function formatarDataPorExtenso(data = new Date()) {
  return data.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** 'AAAA-MM-DD HH:MM:SS' → 'agora', 'há 5 min', 'há 2 h', 'ontem', '06/10' */
export function tempoRelativo(texto, agora = new Date()) {
  if (!texto) return 'nunca';
  const diferencaMin = Math.round((agora - paraDate(texto)) / 60000);
  if (diferencaMin < 1) return 'agora';
  if (diferencaMin < 60) return `há ${diferencaMin} min`;
  const horas = Math.floor(diferencaMin / 60);
  if (horas < 24 && dataSQL(agora) === String(texto).slice(0, 10)) return `há ${horas} h`;
  if (adicionarDias(dataSQL(agora), -1) === String(texto).slice(0, 10)) return `ontem às ${formatarHora(texto)}`;
  return `${formatarDataCurta(texto)} às ${formatarHora(texto)}`;
}

/**
 * Descreve dias da semana do banco ('1,2,3,4,5') em texto amigável.
 * '0,1,2,3,4,5,6' → 'Todos os dias' | '1,2,3,4,5' → 'Seg a Sex'
 * '0,6' → 'Fins de semana' | '1,3,5' → 'Seg, Qua, Sex'
 */
export function descreverDias(diasTexto) {
  const dias = String(diasTexto).split(',').map(Number).sort((a, b) => a - b);
  const chave = dias.join(',');
  if (chave === '0,1,2,3,4,5,6') return 'Todos os dias';
  if (chave === '1,2,3,4,5') return 'Seg a Sex';
  if (chave === '0,6') return 'Fins de semana';
  return dias.map((d) => DIAS_SEMANA_CURTOS[d]).join(', ');
}

/** Executa `funcao` só depois de `espera` ms sem novas chamadas */
export function debounce(funcao, espera = 150) {
  let temporizador;
  return (...args) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => funcao(...args), espera);
  };
}

/** Promise que resolve após `ms` milissegundos */
export const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
