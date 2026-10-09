/**
 * Utilitários de data — tudo em UTC e com datas "civis" (sem hora).
 *
 * A API troca datas como strings ISO `YYYY-MM-DD`. Internamente usamos
 * `Date` em UTC 00:00 para que fuso horário do servidor nunca desloque um
 * vencimento de dia (bug clássico de `getDate()` vs `getUTCDate()`).
 */

const { REGRAS } = require('../config/regras');

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseISO(str) {
  if (typeof str !== 'string' || !ISO_RE.test(str)) {
    throw new TypeError(`Data inválida (esperado YYYY-MM-DD): ${str}`);
  }
  const d = new Date(`${str}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || toISO(d) !== str) {
    throw new TypeError(`Data inexistente: ${str}`);
  }
  return d;
}

function toISO(date) {
  return date.toISOString().slice(0, 10);
}

function utc(ano, mesIndex0, dia) {
  return new Date(Date.UTC(ano, mesIndex0, dia));
}

function ultimoDiaDoMes(ano, mesIndex0) {
  return utc(ano, mesIndex0 + 1, 0).getUTCDate();
}

/**
 * Soma meses preservando o dia; se o dia não existir no mês de destino,
 * usa o último dia (31/01 + 1 mês = 28/02 ou 29/02).
 * `diaPreferido` permite ancorar uma série inteira no dia original,
 * evitando o "arrasto" 31/01 → 28/02 → 28/03.
 */
function addMeses(date, meses, diaPreferido = date.getUTCDate()) {
  const totalMeses = date.getUTCFullYear() * 12 + date.getUTCMonth() + meses;
  const ano = Math.floor(totalMeses / 12);
  const mes = totalMeses % 12;
  return utc(ano, mes, Math.min(diaPreferido, ultimoDiaDoMes(ano, mes)));
}

function addDias(date, dias) {
  return new Date(date.getTime() + dias * 86_400_000);
}

function diffDias(fim, inicio) {
  return Math.round((fim.getTime() - inicio.getTime()) / 86_400_000);
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function pascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(ano, mes - 1, dia);
}

const OFFSET_MOVEIS = {
  CARNAVAL: -47,
  SEXTA_FEIRA_SANTA: -2,
  CORPUS_CHRISTI: 60,
};

const cacheFeriados = new Map();

function feriadosDoAno(ano) {
  if (!cacheFeriados.has(ano)) {
    const set = new Set(REGRAS.feriados.fixos.map((mmdd) => `${ano}-${mmdd}`));
    const p = pascoa(ano);
    REGRAS.feriados.moveis.forEach((nome) => {
      set.add(toISO(addDias(p, OFFSET_MOVEIS[nome])));
    });
    cacheFeriados.set(ano, set);
  }
  return cacheFeriados.get(ano);
}

function isFeriado(date) {
  return feriadosDoAno(date.getUTCFullYear()).has(toISO(date));
}

function isFimDeSemana(date) {
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

function isDiaUtil(date) {
  return !isFimDeSemana(date) && !isFeriado(date);
}

/** N-ésimo dia útil estritamente APÓS a data (n >= 1). */
function diasUteisApos(date, n = 1) {
  let atual = date;
  let restantes = n;
  while (restantes > 0) {
    atual = addDias(atual, 1);
    if (isDiaUtil(atual)) restantes -= 1;
  }
  return atual;
}

/** Série mensal de `n` datas a partir de `inicio`, ancorada no dia de `inicio`. */
function serieMensal(inicio, n, diaPreferido = inicio.getUTCDate()) {
  return Array.from({ length: n }, (_, i) => addMeses(inicio, i, diaPreferido));
}

function chaveMes(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

module.exports = {
  parseISO,
  toISO,
  addMeses,
  addDias,
  diffDias,
  pascoa,
  isFeriado,
  isFimDeSemana,
  isDiaUtil,
  diasUteisApos,
  serieMensal,
  chaveMes,
};
