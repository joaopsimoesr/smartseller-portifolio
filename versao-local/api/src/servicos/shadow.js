// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

/**
 * Shadow mode: roda a implementação LEGADA (como era no frontend, antes da
 * migração para o servidor) lado a lado com a NOVA, compara campo a campo
 * com tolerâncias e registra as divergências.
 *
 * Origem: shadow-mode.service.js (backend) + shadow-mode.js (frontend). No
 * MVP isso sustentou a migração cliente → servidor sem trocar números às cegas.
 */

const { CONFIG } = require('../config/regras');
const datas = require('../regras/datas');
const calc = require('../regras/calculo');

/**
 * Implementação legada simplificada, com os dois defeitos clássicos que o
 * shadow mode existia para pegar: ponto flutuante e Date.setMonth sem ajuste
 * de fim de mês (31/01 + 1 mês = 03/03).
 */
const legado = {
  calculateSignalAmount: (valorUnidade, percentual) => valorUnidade * (percentual / 100),
  calculateBalanceInstallmentValue: (saldo, n) => Array.from({ length: n }, () => saldo / n),
  addMonths: (date, months) => {
    const d = new Date(date);
    d.setUTCMonth(d.getUTCMonth() + months);
    return d;
  },
};

function comparar(legadoVal, novoVal, campo, diferencas) {
  if (legadoVal instanceof Date || novoVal instanceof Date) {
    const dias = Math.round(Math.abs(new Date(legadoVal) - new Date(novoVal)) / 86400000);
    if (dias > CONFIG.shadow.toleranciaDias) {
      diferencas.push({ campo, legado: datas.toISO(new Date(legadoVal)), novo: datas.toISO(new Date(novoVal)), delta: `${dias} dia(s)` });
    }
    return;
  }
  if (Array.isArray(legadoVal)) {
    if (legadoVal.length !== novoVal.length) {
      diferencas.push({ campo: `${campo}.length`, legado: legadoVal.length, novo: novoVal.length });
      return;
    }
    legadoVal.forEach((v, i) => comparar(v, novoVal[i], `${campo}[${i}]`, diferencas));
    return;
  }
  const delta = Math.abs(Number(legadoVal) - Number(novoVal));
  if (delta > CONFIG.shadow.toleranciaMonetaria + 1e-9) {
    diferencas.push({ campo, legado: legadoVal, novo: novoVal, delta: Number(delta.toFixed(6)) });
  }
}

/** Compara dois resultados e devolve as diferenças acima da tolerância. */
function compareResults(resultadoLegado, resultadoNovo, nomeFuncao) {
  const diferencas = [];
  comparar(resultadoLegado, resultadoNovo, nomeFuncao, diferencas);
  return { funcao: nomeFuncao, equivalente: diferencas.length === 0, diferencas };
}

function criarShadow() {
  const registros = [];

  function registrar(comparacao, entrada) {
    const r = { id: registros.length + 1, em: new Date().toISOString(), entrada, ...comparacao };
    registros.push(r);
    return r;
  }

  /**
   * Executa as funções sob observação para uma entrada de simulação.
   * @param {{valorUnidade: number, percentualSinal?: number, saldo: number, parcelasSaldo: number, dataBase: string, meses: number}} e
   */
  function executar(e) {
    const base = datas.parseInputDate(e.dataBase);
    const pct = e.percentualSinal ?? CONFIG.sinal.percentualPadrao;
    const comparacoes = [
      compareResults(
        legado.calculateSignalAmount(e.valorUnidade, pct),
        calc.calculateSignalAmount(e.valorUnidade, { empreendimento: { nome: 'shadow', percentualSinal: pct } }).valorSinal,
        'calculateSignalAmount',
      ),
      compareResults(
        legado.calculateBalanceInstallmentValue(e.saldo, e.parcelasSaldo),
        calc.calculateBalanceInstallmentValue(e.saldo, e.parcelasSaldo).parcelas,
        'calculateBalanceInstallmentValue',
      ),
      compareResults(legado.addMonths(base, e.meses), datas.addMonths(base, e.meses), 'addMonths'),
    ];
    return comparacoes.map((c) => registrar(c, e));
  }

  function estatisticas() {
    const porFuncao = {};
    for (const r of registros) {
      porFuncao[r.funcao] = porFuncao[r.funcao] || { total: 0, divergentes: 0 };
      porFuncao[r.funcao].total += 1;
      if (!r.equivalente) porFuncao[r.funcao].divergentes += 1;
    }
    const divergentes = registros.filter((r) => !r.equivalente).length;
    return {
      total: registros.length,
      equivalentes: registros.length - divergentes,
      divergentes,
      taxaEquivalencia: registros.length ? Number(((registros.length - divergentes) / registros.length).toFixed(4)) : null,
      porFuncao,
      ultimas: registros.slice(-10).reverse(),
    };
  }

  return { executar, estatisticas };
}

module.exports = { criarShadow, compareResults, legado };
