// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

/**
 * Regras 10 a 24 — cálculo do plano (origem: calculation.service.js do backend).
 *
 * Os nomes das funções são os do original, para facilitar a comparação.
 * Diferenças deliberadas em relação ao original:
 *  - funções puras: o que vinha do banco (tabelas, cache) entra por parâmetro;
 *  - erros lançam ErroDeRegra em vez de devolver { success: false };
 *  - parcelas em centavos exatos (ver dinheiro.js);
 *  - valores numéricos vêm de config/regras.js (fictícios).
 */

const { CONFIG } = require('../config/regras');
const { ErroDeRegra } = require('./erros');
const datas = require('./datas');
const { paraCentavos, paraReais, parcelar } = require('./dinheiro');

function exigirPositivo(valor, codigo, mensagem) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) throw new ErroDeRegra(codigo, mensagem);
  return n;
}

function exigirParcelas(n) {
  const v = Number(n);
  if (!Number.isInteger(v) || v <= 0) throw new ErroDeRegra('PARCELAS_INVALIDAS', 'Número de parcelas deve ser um inteiro positivo');
  return v;
}

function exigirCotas(cotas) {
  const c = Number(cotas);
  const { cotasMin, cotasMax } = CONFIG.limites;
  if (!Number.isInteger(c) || c < cotasMin || c > cotasMax) {
    throw new ErroDeRegra('COTAS_INVALIDAS', `Quantidade de cotas deve estar entre ${cotasMin} e ${cotasMax}`);
  }
  return c;
}

// ---------------------------------------------------------------------------
// Regra 10 — valor total da entrada
// ---------------------------------------------------------------------------

/**
 * Prioridade 1: tabela de exceções do empreendimento (1 cota = X; 2 cotas = 2X;
 * cada cota adicional soma X). Prioridade 2: valor fixo por cota da categoria.
 * @param {{nome: string, categoria: 'PADRAO'|'PREMIUM'}} empreendimento
 * @param {number} quantCotas
 * @param {{valorPorCota: number}|null} tabelaExcecoes
 */
function calculateEntryAmount(empreendimento, quantCotas, tabelaExcecoes = null) {
  if (!empreendimento || !empreendimento.nome) throw new ErroDeRegra('EMPREENDIMENTO_INVALIDO', 'Empreendimento é obrigatório');
  const cotas = exigirCotas(quantCotas);

  if (tabelaExcecoes && Number(tabelaExcecoes.valorPorCota) > 0) {
    const x = Number(tabelaExcecoes.valorPorCota);
    const valor = cotas === 1 ? x : 2 * x + (cotas - 2) * x;
    return { valorTotalEntrada: valor, regraAplicada: 'TABELA_EXCECOES', categoria: 'EXCECAO' };
  }

  const premium = empreendimento.categoria === 'PREMIUM';
  const porCota = premium ? CONFIG.entrada.porCota.PREMIUM : CONFIG.entrada.porCota.PADRAO;
  return {
    valorTotalEntrada: porCota * cotas,
    regraAplicada: premium ? 'VALOR_FIXO_PREMIUM' : 'VALOR_FIXO_PADRAO',
    categoria: premium ? 'PREMIUM' : 'PADRAO',
  };
}

// ---------------------------------------------------------------------------
// Regra 23 — cache de regras por empreendimento (antes da 11, que o consome)
// ---------------------------------------------------------------------------

/**
 * Monta o cache {nome → regras} a partir dos empreendimentos ativos.
 * @param {Array<object>} empreendimentos
 * @param {number} agora timestamp em ms (injetável para teste)
 */
function syncVentureRules(empreendimentos, agora = Date.now()) {
  const itens = new Map();
  empreendimentos
    .filter((e) => e.ativo !== false)
    .forEach((e) => {
      itens.set(e.nome.toUpperCase(), {
        categoria: e.categoria,
        valorBasePorCota: CONFIG.entrada.porCota[e.categoria],
        temPromocaoTemporaria: Boolean(e.promocaoTemporaria),
        percentualSinal: e.percentualSinal ?? CONFIG.sinal.percentualPadrao,
      });
    });
  return { itens, sincronizadoEm: agora };
}

/** Lê do cache só se ele ainda estiver dentro da validade. */
function getVentureFromCache(cache, nome, agora = Date.now()) {
  if (!cache || agora - cache.sincronizadoEm >= CONFIG.cacheRegras.validadeMs) return null;
  return cache.itens.get(String(nome).toUpperCase()) ?? null;
}

// ---------------------------------------------------------------------------
// Regras 11 e 12 — sinal
// ---------------------------------------------------------------------------

/**
 * Regra 11 — sinal = unidade × percentual, arredondado ao real (como no original).
 * Percentual: cache (regra 23) → empreendimento → padrão.
 */
function calculateSignalAmount(valorUnidade, { empreendimento = null, cache = null, agora } = {}) {
  const valor = Number(valorUnidade);
  if (!Number.isFinite(valor) || valor < 0) throw new ErroDeRegra('VALOR_UNIDADE_INVALIDO', 'Valor da unidade inválido');

  let percentual = CONFIG.sinal.percentualPadrao;
  let origem = 'PADRAO';
  if (empreendimento) {
    const doCache = getVentureFromCache(cache, empreendimento.nome, agora);
    if (doCache?.percentualSinal) {
      percentual = doCache.percentualSinal;
      origem = 'CACHE';
    } else if (empreendimento.percentualSinal) {
      percentual = empreendimento.percentualSinal;
      origem = 'EMPREENDIMENTO';
    }
  }
  return { valorSinal: Math.round((valor * percentual) / 100), percentualSinal: percentual, origemPercentual: origem };
}

/**
 * Regra 12 — valor de cada parcela do sinal sobre o percentual PADRÃO.
 * Comportamento do original preservado: ignora o percentual do empreendimento.
 */
function calculateSignalInstallmentValue(valorUnidade, numParcelas) {
  const valor = exigirPositivo(valorUnidade, 'VALOR_UNIDADE_INVALIDO', 'Valor da unidade deve ser positivo');
  const n = exigirParcelas(numParcelas);
  const total = paraReais(Math.round((paraCentavos(valor) * CONFIG.sinal.percentualPadrao) / 100));
  const parcelas = parcelar(total, n);
  return { valorTotalSinal: total, valorParcela: parcelas[n - 1], parcelas };
}

// ---------------------------------------------------------------------------
// Regras 13 e 14 — primeira entrada
// ---------------------------------------------------------------------------

/**
 * Regra 13 — vencimentos da 1ª entrada pelo meio de pagamento.
 *  MESMO_DIA:        todas as parcelas na data da venda (comportamento original)
 *  PROXIMO_DIA_UTIL: 1ª no próximo dia útil após a venda; demais = venda + i meses
 *  MES_SEGUINTE:     parcela i = venda + (i+1) meses, sem considerar dia útil
 */
function calculateFirstEntryDates(saleDate, numParcelas, paymentMethod) {
  const n = exigirParcelas(numParcelas);
  const regra = CONFIG.meiosPagamento[paymentMethod];
  if (!regra) throw new ErroDeRegra('MEIO_PAGAMENTO_INVALIDO', `Meio de pagamento não suportado: ${paymentMethod}`);

  let datasVenc;
  if (regra === 'MESMO_DIA') {
    datasVenc = Array.from({ length: n }, () => new Date(saleDate));
  } else if (regra === 'PROXIMO_DIA_UTIL') {
    datasVenc = [datas.getNextBusinessDayAfter(saleDate)];
    for (let i = 1; i < n; i += 1) datasVenc.push(datas.addMonths(saleDate, i));
  } else {
    datasVenc = Array.from({ length: n }, (_, i) => datas.addMonths(saleDate, i + 1));
  }
  return { datas: datasVenc, regraAplicada: regra };
}

/** Regra 14 — valor de cada parcela da 1ª entrada. */
function calculateFirstEntryParcelValue(totalValue, numParcelas) {
  const total = exigirPositivo(totalValue, 'VALOR_INVALIDO', 'Valor da 1ª entrada deve ser positivo');
  const n = exigirParcelas(numParcelas);
  const parcelas = parcelar(total, n);
  return { valorParcela: parcelas[n - 1], parcelas };
}

// ---------------------------------------------------------------------------
// Regras 15 e 16 — entrada restante
// ---------------------------------------------------------------------------

/** Regra 15 — (entrada total − 1ª − 2ª) ÷ parcelas; sinaliza quando fica negativo. */
function calculateRemainingEntryValue(totalEntrada, firstEntryTotal, secondEntryTotal, numParcelas) {
  const total = exigirPositivo(totalEntrada, 'VALOR_INVALIDO', 'Entrada total deve ser positiva');
  const n = exigirParcelas(numParcelas);
  const restanteCent = paraCentavos(total) - paraCentavos(firstEntryTotal || 0) - paraCentavos(secondEntryTotal || 0);
  if (restanteCent < 0) {
    return { valorRestante: paraReais(restanteCent), valorParcela: paraReais(Math.round(restanteCent / n)), parcelas: [], negativo: true };
  }
  const parcelas = parcelar(paraReais(restanteCent), n);
  return { valorRestante: paraReais(restanteCent), valorParcela: parcelas[n - 1], parcelas, negativo: false };
}

/**
 * Regra 16 — série mensal a partir da data inicial, encadeando addMonths.
 * Comportamento original preservado: o encadeamento "deriva" no fim do mês
 * (31/01 → 28/02 → 28/03). A versão do repositório ancora no dia original.
 */
function calculateRemainingEntryDates(startDate, numParcelas) {
  const n = exigirParcelas(numParcelas);
  const resultado = [new Date(startDate)];
  for (let i = 1; i < n; i += 1) resultado.push(datas.addMonths(resultado[i - 1], 1));
  return resultado;
}

// ---------------------------------------------------------------------------
// Regras 17 e 18 — sinal × entrada e início do saldo
// ---------------------------------------------------------------------------

/** Regra 17 — conflito se o sinal começa até o último vencimento da entrada restante. */
function checkSignalConflict(signalStartDate, remainingEntryDates) {
  const validas = (remainingEntryDates || []).filter((d) => d instanceof Date && !Number.isNaN(d.getTime()));
  if (validas.length === 0) throw new ErroDeRegra('SEM_DATAS', 'Não há datas de entrada restante para verificar');
  const ultima = new Date(Math.max(...validas.map((d) => d.getTime())));
  const conflito = signalStartDate <= ultima;
  return {
    conflito,
    ultimaParcelaRestante: ultima,
    inicioSugerido: conflito ? datas.addMonths(ultima, 1) : null,
  };
}

/** Regra 18 — saldo começa no mês seguinte à última parcela do sinal, no dia do sinal. */
function calculateBalanceStartDate(signalStartDate, signalInstallments, signalDay) {
  const ultima = datas.getLastInstallmentDate(signalStartDate, signalInstallments);
  return datas.setDayOfMonth(datas.addMonths(ultima, 1), signalDay);
}

// ---------------------------------------------------------------------------
// Regras 19 e 20 — saldo
// ---------------------------------------------------------------------------

/** Regra 19 — saldo = unidade − entrada − sinal. */
function calculateBalanceAmount(valorUnidade, valorEntrada, valorSinal) {
  const unidade = exigirPositivo(valorUnidade, 'VALOR_UNIDADE_INVALIDO', 'Valor da unidade deve ser positivo');
  return paraReais(paraCentavos(unidade) - paraCentavos(valorEntrada || 0) - paraCentavos(valorSinal || 0));
}

/** Regra 20 — valor de cada parcela do saldo. */
function calculateBalanceInstallmentValue(valorSaldo, numParcelas) {
  const saldo = exigirPositivo(valorSaldo, 'SALDO_INVALIDO', 'Saldo deve ser positivo');
  const n = exigirParcelas(numParcelas);
  const parcelas = parcelar(saldo, n);
  return { valorParcela: parcelas[n - 1], parcelas };
}

// ---------------------------------------------------------------------------
// Regras 21 e 22 — alçada e meses sem pagamento
// ---------------------------------------------------------------------------

/** Regra 21 — alçada pela distância em dias entre venda e início do sinal. */
function checkSignalAuthorizationRequired(signalStartDate, saleDate) {
  const dias = Math.floor((signalStartDate - saleDate) / (24 * 60 * 60 * 1000));
  const { gerenciaAcimaDe, diretoriaAcimaDe } = CONFIG.autorizacaoSinal;
  if (dias > diretoriaAcimaDe) {
    return { exigida: true, nivel: 'DIRETORIA', dias, mensagem: `Sinal ${dias} dias após a venda (> ${diretoriaAcimaDe}): requer Diretoria` };
  }
  if (dias > gerenciaAcimaDe) {
    return { exigida: true, nivel: 'GERENCIA', dias, mensagem: `Sinal ${dias} dias após a venda (${gerenciaAcimaDe + 1}–${diretoriaAcimaDe}): requer Gerência` };
  }
  return { exigida: false, nivel: null, dias, mensagem: '' };
}

/** Regra 22 — meses sem pagamento antes da entrada restante, considerando 1ª e 2ª entradas. */
function identifySkippedMonths(remainingStartDate, firstEntryDates, secondEntryDates) {
  if (!Array.isArray(firstEntryDates) || !Array.isArray(secondEntryDates)) {
    throw new ErroDeRegra('DATAS_INVALIDAS', 'Datas da 1ª e 2ª entrada devem ser listas');
  }
  return datas.checkAllMonthGaps(remainingStartDate, [...firstEntryDates, ...secondEntryDates]);
}

// ---------------------------------------------------------------------------
// Regra 24 — modelo linear
// ---------------------------------------------------------------------------

/**
 * Tudo vem de uma linha da tabela LINEAR do empreendimento. Quantidades
 * zeradas caem nos padrões de config. A parcela do saldo vem da tabela (como
 * no original), e o total do saldo é derivado; a diferença é reportada.
 */
function calculateLinearModelPayments(empreendimento, categoriaPreco, quantCotas, dataVenda, tabelaLinear) {
  if (!tabelaLinear || !Array.isArray(tabelaLinear.linhas)) {
    throw new ErroDeRegra('SEM_TABELA_LINEAR', `Tabela LINEAR não encontrada para ${empreendimento?.nome}`);
  }
  if (!categoriaPreco) throw new ErroDeRegra('CATEGORIA_OBRIGATORIA', 'Categoria de preço é obrigatória');
  const cotas = exigirCotas(quantCotas);

  const linha = tabelaLinear.linhas.find((l) => l.categoriaPreco.toLowerCase().trim() === categoriaPreco.toLowerCase().trim());
  if (!linha) {
    throw new ErroDeRegra('CATEGORIA_NAO_ENCONTRADA', `Categoria "${categoriaPreco}" não existe na tabela LINEAR de ${empreendimento.nome}`, {
      disponiveis: tabelaLinear.linhas.map((l) => l.categoriaPreco),
    });
  }
  if (!(linha.valorCota > 0)) throw new ErroDeRegra('TABELA_INVALIDA', 'Valor da cota zerado na tabela LINEAR');

  const padrao = CONFIG.modeloLinear.parcelasPadrao;
  const qtd = {
    entrada: linha.entrada.parcelas > 0 ? linha.entrada.parcelas : padrao.entrada,
    sinal: linha.sinal.parcelas > 0 ? linha.sinal.parcelas : padrao.sinal,
    saldo: linha.saldo.parcelas > 0 ? linha.saldo.parcelas : padrao.saldo,
  };

  const totalCent = paraCentavos(linha.valorCota) * cotas;
  const entradaCent = paraCentavos(linha.entrada.valorPorCota) * cotas;
  const sinalCent = paraCentavos(linha.sinal.valorPorCota) * cotas;
  const saldoCent = totalCent - entradaCent - sinalCent;
  if (saldoCent <= 0) throw new ErroDeRegra('TABELA_INVALIDA', 'Tabela LINEAR inconsistente: saldo não positivo');

  const { datas: datasEntrada } = calculateFirstEntryDates(dataVenda, qtd.entrada, CONFIG.modeloLinear.meioPagamentoEntrada);
  const inicioSinal = datas.setDayOfMonth(datas.addMonths(datasEntrada[datasEntrada.length - 1], 1), CONFIG.modeloLinear.diaVencimentoSinal);
  const datasSinal = Array.from({ length: qtd.sinal }, (_, i) => datas.addMonths(inicioSinal, i));
  const inicioSaldo = datas.addMonths(datasSinal[datasSinal.length - 1], 1);
  const datasSaldo = Array.from({ length: qtd.saldo }, (_, i) => datas.addMonths(inicioSaldo, i));

  const parcelaSaldoTabelaCent = paraCentavos(linha.saldo.valorParcelaPorCota) * cotas;
  return {
    categoriaPreco: linha.categoriaPreco,
    quantCotas: cotas,
    valorTotal: paraReais(totalCent),
    totalParcelasPlano: linha.totalMeses ?? qtd.entrada + qtd.sinal + qtd.saldo,
    entrada: { qtdParcelas: qtd.entrada, valorTotal: paraReais(entradaCent), parcelas: parcelar(paraReais(entradaCent), qtd.entrada), datas: datasEntrada },
    sinal: { qtdParcelas: qtd.sinal, valorTotal: paraReais(sinalCent), parcelas: parcelar(paraReais(sinalCent), qtd.sinal), datas: datasSinal },
    saldo: {
      qtdParcelas: qtd.saldo,
      valorTotal: paraReais(saldoCent),
      parcelas: parcelar(paraReais(saldoCent), qtd.saldo),
      valorParcelaTabela: paraReais(parcelaSaldoTabelaCent),
      divergenciaTabela: paraReais(parcelaSaldoTabelaCent * qtd.saldo - saldoCent),
      datas: datasSaldo,
    },
  };
}

module.exports = {
  calculateEntryAmount,
  calculateSignalAmount,
  calculateSignalInstallmentValue,
  calculateFirstEntryDates,
  calculateFirstEntryParcelValue,
  calculateRemainingEntryValue,
  calculateRemainingEntryDates,
  checkSignalConflict,
  calculateBalanceStartDate,
  calculateBalanceAmount,
  calculateBalanceInstallmentValue,
  checkSignalAuthorizationRequired,
  identifySkippedMonths,
  syncVentureRules,
  getVentureFromCache,
  calculateLinearModelPayments,
};
