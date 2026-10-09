/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

/**
 * Regras de cálculo do plano (R10–R22, R24) — funções puras, sem I/O.
 * Valores monetários em centavos inteiros; datas como Date UTC.
 *
 * Cada função traz no comentário o número da regra e o degrau da pirâmide
 * normativa a que pertence (ver REGRAS.md e o README):
 *   [invariante]  vale para qualquer venda, nada sobrescreve
 *   [política]    regra geral, vem de config/regras.js
 *   [específica]  norma do empreendimento, prevalece sobre a geral
 *   [competência] remete a decisão a uma instância (alçada)
 */

const { REGRAS } = require('../config/regras');
const { ErroDeNegocio } = require('./erros');
const datas = require('./datas');
const { paraCentavos, dividirEmParcelas } = require('./dinheiro');

function validarCotas(cotas) {
  const { cotasMin, cotasMax } = REGRAS.limites;
  if (!Number.isInteger(cotas) || cotas < cotasMin || cotas > cotasMax) {
    throw new ErroDeNegocio(
      'COTAS_FORA_DO_LIMITE',
      `Quantidade de cotas deve estar entre ${cotasMin} e ${cotasMax}`,
    );
  }
}

function validarParcelas(n) {
  if (!Number.isInteger(n) || n < 1 || n > REGRAS.limites.parcelasMax) {
    throw new ErroDeNegocio(
      'PARCELAS_INVALIDAS',
      `Número de parcelas deve estar entre 1 e ${REGRAS.limites.parcelasMax}`,
    );
  }
}

/** Valor da tabela de exceções: quantidades listadas valem como estão; acima, soma-se a cota adicional. */
function valorDaTabelaDeExcecoes(tabela, cotas) {
  const listadas = Object.keys(tabela.valoresPorQuantidade).map(Number).sort((a, b) => a - b);
  if (tabela.valoresPorQuantidade[cotas] !== undefined) {
    return paraCentavos(tabela.valoresPorQuantidade[cotas]);
  }
  const maior = listadas[listadas.length - 1];
  return (
    paraCentavos(tabela.valoresPorQuantidade[maior]) +
    (cotas - maior) * paraCentavos(tabela.valorCotaAdicional)
  );
}

/**
 * R10 — valor total da entrada. [específica > política]
 * Prioridade: (1) tabela de exceções do empreendimento; (2) promoção vigente
 * na data da venda; (3) valor fixo por cota da categoria.
 */
function valorEntrada(empreendimento, cotas, dataVenda) {
  validarCotas(cotas);

  if (empreendimento.excecoesEntrada) {
    const total = valorDaTabelaDeExcecoes(empreendimento.excecoesEntrada, cotas);
    return { totalCentavos: total, porCotaCentavos: Math.round(total / cotas), regra: 'EXCECAO' };
  }

  const promo = empreendimento.promocaoEntrada;
  const iso = datas.toISO(dataVenda);
  if (promo && iso >= promo.inicio && iso <= promo.fim) {
    const porCota = paraCentavos(promo.valorPorCota);
    return { totalCentavos: porCota * cotas, porCotaCentavos: porCota, regra: 'PROMOCAO' };
  }

  const valorPorCota = REGRAS.entrada.valorPorCota[empreendimento.categoria];
  if (valorPorCota === undefined) {
    throw new ErroDeNegocio(
      'CATEGORIA_DESCONHECIDA',
      `Categoria sem valor de entrada: ${empreendimento.categoria}`,
    );
  }
  const porCota = paraCentavos(valorPorCota);
  return { totalCentavos: porCota * cotas, porCotaCentavos: porCota, regra: empreendimento.categoria };
}

/**
 * R11 — valor do sinal = unidade × percentual. [específica > política]
 * Percentual: cache de regras (R23) → empreendimento → padrão.
 */
function valorSinal(empreendimento, valorUnidadeCentavos, { regrasEmCache = null } = {}) {
  if (!Number.isInteger(valorUnidadeCentavos) || valorUnidadeCentavos <= 0) {
    throw new ErroDeNegocio('VALOR_UNIDADE_INVALIDO', 'Valor da unidade deve ser positivo');
  }
  let percentual = REGRAS.sinal.percentualPadrao;
  let origem = 'PADRAO';
  if (regrasEmCache?.percentualSinal) {
    percentual = regrasEmCache.percentualSinal;
    origem = 'CACHE';
  } else if (empreendimento?.percentualSinal) {
    percentual = empreendimento.percentualSinal;
    origem = 'EMPREENDIMENTO';
  }
  return {
    percentual,
    origem,
    totalCentavos: Math.round((valorUnidadeCentavos * percentual) / 100),
  };
}

/**
 * R12 — parcelas do sinal. [invariante: soma exata]
 * Divide o total calculado pela R11 (o original recalculava sobre o percentual
 * padrão e ignorava o do empreendimento — diferença deliberada).
 */
function parcelasDoSinal(totalCentavos, n) {
  validarParcelas(n);
  return dividirEmParcelas(totalCentavos, n);
}

/** R13 — vencimentos da 1ª (ou 2ª) entrada conforme o meio de pagamento. [política] */
function datasPorMeioDePagamento(meio, dataBase, parcelas) {
  const cfg = REGRAS.meiosPagamento[meio];
  if (!cfg) {
    throw new ErroDeNegocio('MEIO_INVALIDO', `Meio de pagamento inválido: ${meio}`);
  }
  validarParcelas(parcelas);
  if (parcelas > cfg.parcelasMax) {
    throw new ErroDeNegocio(
      'PARCELAS_ACIMA_DO_PERMITIDO',
      `${cfg.rotulo} permite no máximo ${cfg.parcelasMax} parcela(s)`,
    );
  }

  switch (cfg.regra) {
    case 'MESMO_DIA':
      return [dataBase];
    case 'DIAS_UTEIS_APOS':
      return [datas.diasUteisApos(dataBase, cfg.diasUteis)];
    case 'MESES_APOS':
      return datas.serieMensal(
        datas.addMeses(dataBase, cfg.meses),
        parcelas,
        dataBase.getUTCDate(),
      );
    default:
      throw new Error(`Regra de meio de pagamento não implementada: ${cfg.regra}`);
  }
}

/** R14 — parcelas da 1ª (ou 2ª) entrada. [invariante: soma exata] */
function parcelasDaEntrada(totalCentavos, n) {
  if (!Number.isInteger(totalCentavos) || totalCentavos <= 0) {
    throw new ErroDeNegocio('VALOR_INVALIDO', 'Valor da entrada deve ser positivo');
  }
  validarParcelas(n);
  return dividirEmParcelas(totalCentavos, n);
}

/**
 * R15 — entrada restante = entrada total − 1ª − 2ª. [invariante]
 * Não lança: sinaliza `negativo` para o chamador decidir (a simulação recusa).
 */
function entradaRestante(totalCentavos, primeiraCentavos, segundaCentavos = 0) {
  const restante = totalCentavos - primeiraCentavos - segundaCentavos;
  return { restanteCentavos: restante, negativo: restante < 0 };
}

/**
 * R16 — vencimentos da entrada restante: série mensal ancorada no dia do 1º
 * vencimento (o original encadeava e "derivava" no fim do mês — diferença deliberada).
 */
function datasEntradaRestante(inicio, n) {
  validarParcelas(n);
  return datas.serieMensal(inicio, n);
}

/** R17 — o sinal não pode começar até o último vencimento da entrada restante. [invariante] */
function conflitoSinalEntrada(inicioSinal, datasRestante) {
  if (datasRestante.length === 0) return { conflito: false };
  const ultima = new Date(Math.max(...datasRestante.map((d) => d.getTime())));
  if (inicioSinal > ultima) return { conflito: false };
  return {
    conflito: true,
    ultimaParcelaRestante: ultima,
    inicioSugerido: datas.addMeses(ultima, 1),
  };
}

/**
 * R18 — o saldo começa no mês seguinte à última parcela do sinal, no dia do
 * sinal (com ajuste de fim de mês). [política]
 */
function inicioSaldo(inicioSinal, parcelasSinal, diaDoSinal = inicioSinal.getUTCDate()) {
  const ultima = datas.ultimaParcela(inicioSinal, parcelasSinal);
  return datas.addMeses(ultima, 1, diaDoSinal);
}

/** R19 — saldo = unidade − entrada − sinal. [invariante] */
function valorSaldo(unidadeCentavos, entradaCentavos, sinalCentavos) {
  return unidadeCentavos - entradaCentavos - sinalCentavos;
}

/** R20 — parcelas do saldo. [invariante: soma exata] */
function parcelasDoSaldo(saldoCentavos, n) {
  if (!Number.isInteger(saldoCentavos) || saldoCentavos <= 0) {
    throw new ErroDeNegocio(
      'VALOR_UNIDADE_INSUFICIENTE',
      'Valor da unidade não cobre entrada + sinal; não há saldo a parcelar',
    );
  }
  validarParcelas(n);
  return dividirEmParcelas(saldoCentavos, n);
}

/** R21 — alçada de aprovação pela distância entre venda e início do sinal. [competência] */
function alcadaAprovacaoSinal(dataVenda, inicioSinal) {
  const dias = datas.diffDias(inicioSinal, dataVenda);
  const faixa = REGRAS.autorizacaoSinal.find((f) => dias > f.acimaDeDias);
  return {
    dias,
    exigeAprovacao: Boolean(faixa),
    nivel: faixa ? faixa.nivel : null,
    rotulo: faixa ? faixa.rotulo : null,
  };
}

/** R22 — meses sem parcela antes da entrada restante, somando 1ª e 2ª entradas. [política: alerta] */
function mesesPuladosAntesDaRestante(inicioRestante, datasPrimeira, datasSegunda = []) {
  return datas.mesesSemPagamento([...datasPrimeira, ...datasSegunda], inicioRestante);
}

/**
 * R24 — modelo linear: tudo vem de uma linha da tabela do empreendimento.
 * [específica] Entrada segue o meio configurado (boleto); sinal vence num dia
 * fixo do mês seguinte; saldo na sequência. Quantidades zeradas caem nos
 * padrões. Se a parcela de saldo da tabela não fecha com o saldo calculado,
 * a divergência é reportada (o saldo calculado prevalece: invariante).
 */
function modeloLinear(empreendimento, categoriaPreco, cotas, dataVenda) {
  validarCotas(cotas);
  if (!empreendimento.tabelaLinear) {
    throw new ErroDeNegocio('SEM_TABELA_LINEAR', `${empreendimento.nome} não possui tabela do modelo linear`);
  }
  const linha = empreendimento.tabelaLinear.find(
    (l) => l.categoriaPreco.toLowerCase() === String(categoriaPreco).trim().toLowerCase(),
  );
  if (!linha) {
    throw new ErroDeNegocio(
      'CATEGORIA_PRECO_NAO_ENCONTRADA',
      `Categoria "${categoriaPreco}" não existe na tabela de ${empreendimento.nome}`,
      { disponiveis: empreendimento.tabelaLinear.map((l) => l.categoriaPreco) },
    );
  }

  const cfg = REGRAS.modeloLinear;
  const qtd = {
    entrada: linha.entrada.parcelas || cfg.parcelasPadrao.entrada,
    sinal: linha.sinal.parcelas || cfg.parcelasPadrao.sinal,
    saldo: linha.saldo.parcelas || cfg.parcelasPadrao.saldo,
  };
  const usouPadrao = !linha.entrada.parcelas || !linha.sinal.parcelas || !linha.saldo.parcelas;

  const totalCentavos = paraCentavos(linha.valorCota) * cotas;
  const entradaCentavos = paraCentavos(linha.entrada.valorPorCota) * cotas;
  const sinalCentavos = paraCentavos(linha.sinal.valorPorCota) * cotas;
  const saldoCentavos = valorSaldo(totalCentavos, entradaCentavos, sinalCentavos);
  if (saldoCentavos <= 0) {
    throw new ErroDeNegocio('TABELA_INVALIDA', 'Tabela inconsistente: entrada + sinal excedem o valor da cota');
  }

  const datasEntrada = datasPorMeioDePagamento(cfg.meioPagamentoEntrada, dataVenda, qtd.entrada);
  const inicioSinal = datas.addMeses(datasEntrada[datasEntrada.length - 1], 1, cfg.diaVencimentoSinal);
  const datasSinal = datas.serieMensal(inicioSinal, qtd.sinal);
  const datasSaldo = datas.serieMensal(inicioSaldo(inicioSinal, qtd.sinal), qtd.saldo);

  let divergenciaCentavos = 0;
  if (linha.saldo.valorParcelaPorCota) {
    const pelaTabela = paraCentavos(linha.saldo.valorParcelaPorCota) * cotas * qtd.saldo;
    divergenciaCentavos = pelaTabela - saldoCentavos;
  }

  return {
    linha,
    qtd,
    usouPadrao,
    totalCentavos,
    entrada: { totalCentavos: entradaCentavos, datas: datasEntrada },
    sinal: { totalCentavos: sinalCentavos, datas: datasSinal },
    saldo: { totalCentavos: saldoCentavos, datas: datasSaldo },
    divergenciaCentavos,
  };
}

module.exports = {
  validarCotas,
  valorEntrada,
  valorSinal,
  parcelasDoSinal,
  datasPorMeioDePagamento,
  parcelasDaEntrada,
  entradaRestante,
  datasEntradaRestante,
  conflitoSinalEntrada,
  inicioSaldo,
  valorSaldo,
  parcelasDoSaldo,
  alcadaAprovacaoSinal,
  mesesPuladosAntesDaRestante,
  modeloLinear,
};
