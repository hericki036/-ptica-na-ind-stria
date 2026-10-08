/**
 * js/validacao.js
 * Regras de validação compartilhadas entre a interface (app.js, dashboard.js)
 * e o servidor simulado (mock-servidor.js) — assim o "backend" e o front
 * aplicam exatamente as mesmas regras, como aconteceria com um backend real
 * que reaproveitasse este módulo.
 *
 * Convenção: cada função recebe o valor e devolve uma string com a mensagem
 * de erro, ou '' (string vazia) quando o valor é válido.
 */

/** Limites de negócio (espelham os CHECKs do banco) */
export const LIMITES = Object.freeze({
  META_MIN: 1000,
  META_MAX: 5000,
  SENHA_MIN: 8,
  VOLUME_MIN: 1,
  VOLUME_MAX: 2000,
  PESO_MIN: 20,
  PESO_MAX: 300,
});

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REGEX_HORA = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const REGEX_DIAS = /^[0-6](,[0-6]){0,6}$/;
const REGEX_SERIE = /^HS\d{3}-\d{4}-\d{6}$/;

export function validarNome(nome) {
  const valor = String(nome ?? '').trim();
  if (!valor) return 'Informe seu nome.';
  if (valor.length < 2) return 'O nome precisa ter pelo menos 2 letras.';
  if (valor.length > 100) return 'O nome pode ter no máximo 100 caracteres.';
  return '';
}

export function validarEmail(email) {
  const valor = String(email ?? '').trim();
  if (!valor) return 'Informe seu e-mail.';
  if (valor.length > 160 || !REGEX_EMAIL.test(valor)) {
    return 'Digite um e-mail válido, como nome@exemplo.com.';
  }
  return '';
}

export function validarSenha(senha) {
  const valor = String(senha ?? '');
  if (!valor) return 'Crie uma senha.';
  if (valor.length < LIMITES.SENHA_MIN) {
    return `A senha precisa ter pelo menos ${LIMITES.SENHA_MIN} caracteres.`;
  }
  if (!/[A-Za-zÀ-ÿ]/.test(valor) || !/\d/.test(valor)) {
    return 'Use letras e números na senha.';
  }
  return '';
}

export function validarMeta(meta) {
  if (meta === '' || meta === null || meta === undefined) return 'Informe sua meta diária.';
  const valor = Number(meta);
  if (!Number.isInteger(valor)) return 'A meta deve ser um número inteiro de mililitros.';
  if (valor < LIMITES.META_MIN || valor > LIMITES.META_MAX) {
    return `A meta deve ficar entre ${LIMITES.META_MIN.toLocaleString('pt-BR')} e ${LIMITES.META_MAX.toLocaleString('pt-BR')} ml.`;
  }
  return '';
}

/** Peso é opcional: vazio é válido */
export function validarPeso(peso) {
  if (peso === '' || peso === null || peso === undefined) return '';
  const valor = Number(peso);
  if (!Number.isFinite(valor) || valor < LIMITES.PESO_MIN || valor > LIMITES.PESO_MAX) {
    return `Informe um peso entre ${LIMITES.PESO_MIN} e ${LIMITES.PESO_MAX} kg (ou deixe em branco).`;
  }
  return '';
}

export function validarVolume(volume) {
  const valor = Number(volume);
  if (!Number.isInteger(valor) || valor < LIMITES.VOLUME_MIN || valor > LIMITES.VOLUME_MAX) {
    return `O volume deve ser um número inteiro entre ${LIMITES.VOLUME_MIN} e ${LIMITES.VOLUME_MAX.toLocaleString('pt-BR')} ml.`;
  }
  return '';
}

export function validarHora(hora) {
  if (!REGEX_HORA.test(String(hora ?? ''))) return 'Escolha um horário válido (HH:MM).';
  return '';
}

/** dias_semana no formato do banco: "1,2,3" (0 = domingo ... 6 = sábado) */
export function validarDiasSemana(dias) {
  const valor = String(dias ?? '');
  if (!valor) return 'Selecione pelo menos um dia da semana.';
  if (!REGEX_DIAS.test(valor)) return 'Dias da semana inválidos.';
  return '';
}

export function validarNumeroSerie(serie) {
  const valor = String(serie ?? '').trim().toUpperCase();
  if (!REGEX_SERIE.test(valor)) {
    return 'Use o formato impresso na base da garrafa: HS600-2026-000123.';
  }
  return '';
}

/**
 * Sugestão de meta a partir do peso (referência comum de ~35 ml por kg),
 * arredondada para 100 ml e limitada à faixa permitida.
 * Não substitui orientação de um profissional de saúde.
 */
export function sugerirMetaPorPeso(pesoKg) {
  const peso = Number(pesoKg);
  if (!Number.isFinite(peso) || peso <= 0) return null;
  const bruto = Math.round((peso * 35) / 100) * 100;
  return Math.min(LIMITES.META_MAX, Math.max(LIMITES.META_MIN, bruto));
}

/**
 * Executa um conjunto de validadores sobre um objeto.
 * @param {Object} dados  ex.: { email: 'a@b.com', senha: '...' }
 * @param {Object} regras ex.: { email: validarEmail, senha: validarSenha }
 * @returns {Object} erros por campo (vazio = tudo válido)
 */
export function validarObjeto(dados, regras) {
  const erros = {};
  for (const [campo, validador] of Object.entries(regras)) {
    const mensagem = validador(dados[campo]);
    if (mensagem) erros[campo] = mensagem;
  }
  return erros;
}
