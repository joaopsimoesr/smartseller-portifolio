/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

/**
 * Shadow mode: roda a implementação LEGADA (como era no navegador, antes da
 * migração do cálculo para o servidor) lado a lado com a NOVA, compara campo
 * a campo com tolerância e registra as divergências.
 *
 * No MVP, foi isso que permitiu migrar o cálculo sem trocar números às cegas:
 * a versão nova só substituiu a antiga depois de provar equivalência, e as
 * divergências encontradas eram defeitos da antiga.
 */

const { REGRAS } = require('../config/regras');
const datas = require('../domain/datas');
const r = require('../domain/regras');
const { paraCentavos, paraReais } = require('../domain/dinheiro');

/**
 * Implementação legada reconstruída com os defeitos clássicos que o shadow
 * mode existia para pegar: ponto flutuante sem arredondamento e
 * `setMonth` sem ajuste de fim de mês (31/01 + 1 mês = 03/03).
 */
const legado = {
  valorSinal: (valorUnidade, percentual) => valorUnidade * (percentual / 100),
  parcelasDoSaldo: (saldo, n) => Array.from({ length: n }, () => saldo / n),
  addMeses: (date, meses) => {
    const d = new Date(date);
    d.setUTCMonth(d.getUTCMonth() + meses);
    return d;
  },
};

const novo = {
  valorSinal: (valorUnidade, percentual) =>
    paraReais(r.valorSinal({ percentualSinal: percentual }, paraCentavos(valorUnidade)).totalCentavos),
  parcelasDoSaldo: (saldo, n) => r.parcelasDoSaldo(paraCentavos(saldo), n).map(paraReais),
  addMeses: (date, meses) => datas.addMeses(date, meses),
};

function comparar(antigo, atual, campo, diferencas) {
  if (antigo instanceof Date) {
    const dias = Math.abs(datas.diffDias(antigo, atual));
    if (dias > REGRAS.shadow.toleranciaDias) {
      diferencas.push({ campo, legado: datas.toISO(antigo), novo: datas.toISO(atual), delta: `${dias} dia(s)` });
    }
    return;
  }
  if (Array.isArray(antigo)) {
    if (antigo.length !== atual.length) {
      diferencas.push({ campo: `${campo}.length`, legado: antigo.length, novo: atual.length });
      return;
    }
    antigo.forEach((v, i) => comparar(v, atual[i], `${campo}[${i}]`, diferencas));
    return;
  }
  const deltaCentavos = Math.abs(antigo - atual) * 100;
  if (deltaCentavos > REGRAS.shadow.toleranciaCentavos + 1e-9) {
    diferencas.push({ campo, legado: antigo, novo: atual, delta: Number(Math.abs(antigo - atual).toFixed(6)) });
  }
}

function compararResultados(antigo, atual, funcao) {
  const diferencas = [];
  comparar(antigo, atual, funcao, diferencas);
  return { funcao, equivalente: diferencas.length === 0, diferencas };
}

function criarShadow({ relogio = () => new Date() } = {}) {
  const registros = [];

  /**
   * Executa as funções observadas para uma entrada.
   * @param {{valorUnidade: number, percentualSinal?: number, saldo: number, parcelasSaldo: number, dataBase: string, meses: number}} e
   */
  function executar(e) {
    const base = datas.parseISO(e.dataBase);
    const pct = e.percentualSinal ?? REGRAS.sinal.percentualPadrao;
    const casos = [
      ['valorSinal', [e.valorUnidade, pct]],
      ['parcelasDoSaldo', [e.saldo, e.parcelasSaldo]],
      ['addMeses', [base, e.meses]],
    ];
    return casos.map(([funcao, args]) => {
      const c = compararResultados(legado[funcao](...args), novo[funcao](...args), funcao);
      const registro = { id: registros.length + 1, em: relogio().toISOString(), entrada: e, ...c };
      registros.push(registro);
      return registro;
    });
  }

  function estatisticas() {
    const porFuncao = {};
    registros.forEach((x) => {
      porFuncao[x.funcao] = porFuncao[x.funcao] || { total: 0, divergentes: 0 };
      porFuncao[x.funcao].total += 1;
      if (!x.equivalente) porFuncao[x.funcao].divergentes += 1;
    });
    const divergentes = registros.filter((x) => !x.equivalente).length;
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

module.exports = { criarShadow, compararResultados, legado, novo };
