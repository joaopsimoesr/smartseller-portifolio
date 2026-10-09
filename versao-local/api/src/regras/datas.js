// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

/**
 * Regras 1 a 9 — utilitários de data (origem: date-utils.js do backend).
 *
 * Lógica preservada do original, com uma correção deliberada: tudo em UTC.
 * O original misturava getDay() local com getUTCDay(), o que podia deslocar
 * um vencimento em um dia dependendo do fuso do servidor.
 */

const { CONFIG } = require('../config/regras');
const { ErroDeRegra } = require('./erros');

const DIA_MS = 24 * 60 * 60 * 1000;

function exigirData(d, nome = 'data') {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new ErroDeRegra('DATA_INVALIDA', `${nome} inválida`);
  }
}

function ultimoDiaDoMes(ano, mes) {
  return new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
}

/** Regra 1 — soma meses; se o dia não existe no mês de destino, usa o último dia. */
function addMonths(date, months) {
  exigirData(date);
  if (!Number.isInteger(Number(months))) throw new ErroDeRegra('MESES_INVALIDOS', 'Número de meses inválido');
  const total = date.getUTCMonth() + Number(months);
  const ano = date.getUTCFullYear() + Math.floor(total / 12);
  const mes = ((total % 12) + 12) % 12;
  const dia = Math.min(date.getUTCDate(), ultimoDiaDoMes(ano, mes));
  return new Date(Date.UTC(ano, mes, dia));
}

const chaveMes = (d) => `${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
const antesDoMes = (a, b) =>
  a.getUTCFullYear() < b.getUTCFullYear() ||
  (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() < b.getUTCMonth());

/**
 * Regra 2 — meses sem nenhum pagamento entre o último pagamento anterior a
 * `remainingStartDate` e o mês de `remainingStartDate`. Formato "M/AAAA".
 */
function checkAllMonthGaps(remainingStartDate, previousDates) {
  exigirData(remainingStartDate, 'Data inicial');
  if (!Array.isArray(previousDates)) throw new ErroDeRegra('DATAS_INVALIDAS', 'Datas anteriores devem ser uma lista');

  const validas = previousDates.filter(
    (d) => d instanceof Date && !Number.isNaN(d.getTime()) && d < remainingStartDate,
  );
  if (validas.length === 0) return [];

  const comPagamento = new Set(validas.map(chaveMes));
  const ultima = new Date(Math.max(...validas.map((d) => d.getTime())));
  const pulados = [];
  for (let c = addMonths(ultima, 1); antesDoMes(c, remainingStartDate); c = addMonths(c, 1)) {
    if (!comPagamento.has(chaveMes(c))) pulados.push(chaveMes(c));
  }
  return pulados;
}

/** Regra 3 — data da última parcela (a data inicial é a 1ª parcela). */
function getLastInstallmentDate(startDate, numInstallments) {
  exigirData(startDate, 'Data inicial');
  const n = Number(numInstallments);
  if (!Number.isInteger(n) || n <= 0) throw new ErroDeRegra('PARCELAS_INVALIDAS', 'Número de parcelas inválido');
  return addMonths(startDate, n - 1);
}

/** Regra 4 — formata como DD/MM/AAAA. */
function formatDate(date) {
  exigirData(date);
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

/** Regra 5 — lê "AAAA-MM-DD" como meia-noite UTC; rejeita formato ou data inexistente. */
function parseInputDate(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new ErroDeRegra('DATA_INVALIDA', `Data deve estar no formato AAAA-MM-DD: "${dateStr}"`);
  }
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dateStr) {
    throw new ErroDeRegra('DATA_INVALIDA', `Data inexistente: "${dateStr}"`);
  }
  return d;
}

/** Regra 6 — fixa o dia do mês; se não existir (ex.: 31 em abril), usa o último dia. */
function setDayOfMonth(date, day) {
  exigirData(date);
  const dia = Number(day);
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) throw new ErroDeRegra('DIA_INVALIDO', 'Dia deve estar entre 1 e 31');
  const ano = date.getUTCFullYear();
  const mes = date.getUTCMonth();
  return new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDiaDoMes(ano, mes))));
}

/** Regra 9 — feriado nacional fixo (lista em config). */
function isHoliday(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  const mmdd = date.toISOString().slice(5, 10);
  return CONFIG.feriadosFixos.includes(mmdd);
}

function ehDiaUtil(d) {
  const dow = d.getUTCDay();
  return dow !== 0 && dow !== 6 && !isHoliday(d);
}

function procurarDiaUtil(inicio, maxIterations) {
  let d = inicio;
  for (let i = 0; i < maxIterations; i += 1) {
    d = new Date(d.getTime() + DIA_MS);
    if (ehDiaUtil(d)) return d;
  }
  throw new ErroDeRegra('DIA_UTIL_NAO_ENCONTRADO', `Nenhum dia útil em ${maxIterations} dias`);
}

/** Regra 7 — a própria data, se for dia útil; senão o próximo dia útil. */
function getNextBusinessDay(date, maxIterations = CONFIG.diaUtil.maxIteracoes) {
  exigirData(date);
  return ehDiaUtil(date) ? new Date(date) : procurarDiaUtil(date, maxIterations);
}

/** Regra 8 — primeiro dia útil estritamente depois da data. */
function getNextBusinessDayAfter(date, maxIterations = CONFIG.diaUtil.maxIteracoes) {
  exigirData(date);
  return procurarDiaUtil(date, maxIterations);
}

const toISO = (d) => d.toISOString().slice(0, 10);

module.exports = {
  addMonths,
  checkAllMonthGaps,
  getLastInstallmentDate,
  formatDate,
  parseInputDate,
  setDayOfMonth,
  getNextBusinessDay,
  getNextBusinessDayAfter,
  isHoliday,
  toISO,
};
