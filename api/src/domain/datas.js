/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

/**
 * Regras de calendário (R01–R09) — tudo em UTC e com datas "civis" (sem hora).
 *
 * A API troca datas como strings ISO `YYYY-MM-DD`. Internamente usamos
 * `Date` em UTC 00:00 para que fuso horário do servidor nunca desloque um
 * vencimento de dia (bug clássico de `getDate()` vs `getUTCDate()`, presente
 * no MVP original e corrigido aqui).
 *
 * Numeração das regras: ver REGRAS.md na raiz do repositório.
 */

const { REGRAS } = require('../config/regras');
const { ErroDeNegocio } = require('./erros');

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 86_400_000;

function utc(ano, mesIndex0, dia) {
  return new Date(Date.UTC(ano, mesIndex0, dia));
}

function ultimoDiaDoMes(ano, mesIndex0) {
  return utc(ano, mesIndex0 + 1, 0).getUTCDate();
}

function exigirData(date, rotulo = 'Data') {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError(`${rotulo} inválida`);
  }
}

/** R05 — lê `AAAA-MM-DD` como meia-noite UTC; rejeita formato errado e data inexistente. */
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

/** R04 — DD/MM/AAAA, para mensagens e documentos. */
function toBR(date) {
  exigirData(date);
  return toISO(date).split('-').reverse().join('/');
}

/**
 * R01 — soma meses preservando o dia; se o dia não existir no mês de destino,
 * usa o último dia (31/01 + 1 mês = 28/02 ou 29/02). Aceita meses negativos.
 * `diaPreferido` ancora uma série inteira no dia original, evitando o
 * "arrasto" 31/01 → 28/02 → 28/03 do encadeamento ingênuo.
 */
function addMeses(date, meses, diaPreferido = date.getUTCDate()) {
  exigirData(date);
  if (!Number.isInteger(meses)) throw new TypeError('Data inválida: número de meses deve ser inteiro');
  const totalMeses = date.getUTCFullYear() * 12 + date.getUTCMonth() + meses;
  const ano = Math.floor(totalMeses / 12);
  const mes = ((totalMeses % 12) + 12) % 12;
  return utc(ano, mes, Math.min(diaPreferido, ultimoDiaDoMes(ano, mes)));
}

/** R06 — fixa o dia do mês; se o dia não existir no mês, usa o último dia. */
function fixarDiaDoMes(date, dia) {
  exigirData(date);
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
    throw new ErroDeNegocio('DIA_INVALIDO', 'Dia do mês deve estar entre 1 e 31');
  }
  const ano = date.getUTCFullYear();
  const mes = date.getUTCMonth();
  return utc(ano, mes, Math.min(dia, ultimoDiaDoMes(ano, mes)));
}

/** R03 — data da última parcela de uma série mensal (a data inicial é a 1ª). */
function ultimaParcela(inicio, parcelas) {
  if (!Number.isInteger(parcelas) || parcelas < 1) {
    throw new ErroDeNegocio('PARCELAS_INVALIDAS', 'Número de parcelas deve ser inteiro positivo');
  }
  return addMeses(inicio, parcelas - 1);
}

function addDias(date, dias) {
  return new Date(date.getTime() + dias * DIA_MS);
}

function diffDias(fim, inicio) {
  return Math.round((fim.getTime() - inicio.getTime()) / DIA_MS);
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

/**
 * R09 — feriado nacional? Fixos da configuração + móveis derivados da Páscoa.
 * (O original considerava só os fixos; a lista caducava todo ano.)
 */
function isFeriado(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  return feriadosDoAno(date.getUTCFullYear()).has(toISO(date));
}

function isFimDeSemana(date) {
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

function isDiaUtil(date) {
  return !isFimDeSemana(date) && !isFeriado(date);
}

/**
 * R07 (inclusivo) e R08 (estrito) — próximo dia útil.
 * Inclusivo devolve a própria data se ela já for útil; estrito sempre avança.
 * Um limite de dias corridos impede laço infinito com calendário mal configurado.
 */
function proximoDiaUtil(date, { inclusivo = false, maxDias = REGRAS.diaUtil.maxDias } = {}) {
  exigirData(date);
  if (inclusivo && isDiaUtil(date)) return date;
  let atual = date;
  for (let i = 0; i < maxDias; i += 1) {
    atual = addDias(atual, 1);
    if (isDiaUtil(atual)) return atual;
  }
  throw new ErroDeNegocio('SEM_DIA_UTIL', `Nenhum dia útil em ${maxDias} dias a partir de ${toBR(date)}`);
}

/** N-ésimo dia útil estritamente APÓS a data (n >= 1): R08 aplicada n vezes. */
function diasUteisApos(date, n = 1) {
  let atual = date;
  for (let i = 0; i < n; i += 1) atual = proximoDiaUtil(atual);
  return atual;
}

/** Série mensal de `n` datas a partir de `inicio`, ancorada no dia de `inicio`. */
function serieMensal(inicio, n, diaPreferido = inicio.getUTCDate()) {
  return Array.from({ length: n }, (_, i) => addMeses(inicio, i, diaPreferido));
}

function chaveMes(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * R02 — meses sem pagamento: entre o último pagamento anterior a `inicio` e o
 * mês de `inicio`, quais meses ficam sem nenhuma parcela. Retorna chaves `AAAA-MM`.
 */
function mesesSemPagamento(datasAnteriores, inicio) {
  exigirData(inicio, 'Data de início');
  const anteriores = datasAnteriores.filter((d) => d instanceof Date && d < inicio);
  if (anteriores.length === 0) return [];

  const comPagamento = new Set(anteriores.map(chaveMes));
  const ultima = new Date(Math.max(...anteriores.map((d) => d.getTime())));
  const alvo = chaveMes(inicio);

  const pulados = [];
  for (let m = addMeses(ultima, 1, 1); chaveMes(m) < alvo; m = addMeses(m, 1, 1)) {
    if (!comPagamento.has(chaveMes(m))) pulados.push(chaveMes(m));
  }
  return pulados;
}

module.exports = {
  parseISO,
  toISO,
  toBR,
  addMeses,
  fixarDiaDoMes,
  ultimaParcela,
  addDias,
  diffDias,
  pascoa,
  isFeriado,
  isFimDeSemana,
  isDiaUtil,
  proximoDiaUtil,
  diasUteisApos,
  serieMensal,
  chaveMes,
  mesesSemPagamento,
};
