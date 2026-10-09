/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

/**
 * Regras de negócio SIMULADAS.
 *
 * Todos os valores, percentuais, prazos e faixas abaixo são fictícios e
 * existem apenas para demonstrar o motor de cálculo. Nenhum deles reflete
 * a política comercial de qualquer empresa real.
 *
 * Centralizar as regras num único objeto declarativo é proposital: o motor
 * (src/domain) não conhece números mágicos — trocar a política comercial é
 * editar este arquivo, não o código.
 */

const REGRAS = Object.freeze({
  versao: 'simulacao-1.0',

  limites: Object.freeze({
    cotasMin: 1,
    cotasMax: 10,
    parcelasMax: 84,
  }),

  /** R10 — entrada: valor fixo por cota, por categoria de empreendimento. */
  entrada: Object.freeze({
    valorPorCota: Object.freeze({
      PADRAO: 2500,
      PREMIUM: 3200,
    }),
  }),

  /** R11/R12 — sinal: percentual sobre o valor da unidade (empreendimento pode sobrescrever). */
  sinal: Object.freeze({
    percentualPadrao: 4,
  }),

  /**
   * R13 — meios de pagamento da entrada.
   * - MESMO_DIA:       primeira parcela na data-base.
   * - DIAS_UTEIS_APOS: primeira parcela N dias úteis após a data-base
   *                    (único meio que respeita fim de semana e feriado).
   * - MESES_APOS:      primeira parcela N meses após a data-base, mesmo dia do mês.
   */
  meiosPagamento: Object.freeze({
    PIX: { rotulo: 'PIX', regra: 'MESMO_DIA', parcelasMax: 1 },
    DINHEIRO: { rotulo: 'Dinheiro', regra: 'MESMO_DIA', parcelasMax: 1 },
    TED: { rotulo: 'TED', regra: 'MESMO_DIA', parcelasMax: 1 },
    CARTAO_DEBITO: {
      rotulo: 'Cartão de débito',
      regra: 'DIAS_UTEIS_APOS',
      diasUteis: 2,
      parcelasMax: 1,
    },
    CARTAO_CREDITO: {
      rotulo: 'Cartão de crédito',
      regra: 'MESES_APOS',
      meses: 1,
      parcelasMax: 12,
    },
    BOLETO: { rotulo: 'Boleto', regra: 'MESES_APOS', meses: 1, parcelasMax: 24 },
  }),

  /** R21 — alçada de aprovação conforme a distância (em dias) entre venda e início do sinal. */
  autorizacaoSinal: Object.freeze([
    { acimaDeDias: 180, nivel: 'COMITE', rotulo: 'Comitê comercial' },
    { acimaDeDias: 120, nivel: 'GERENCIA', rotulo: 'Gerência' },
  ]),

  /** R24 — modelo linear: a tabela define quantidades; estes são os padrões de fallback. */
  modeloLinear: Object.freeze({
    diaVencimentoSinal: 10,
    meioPagamentoEntrada: 'BOLETO',
    parcelasPadrao: Object.freeze({ entrada: 10, sinal: 5, saldo: 72 }),
  }),

  /** R07/R08 — limite de dias corridos ao procurar um dia útil. */
  diaUtil: Object.freeze({
    maxDias: 10,
  }),

  /** R23 — validade do cache de regras por empreendimento. */
  cacheRegras: Object.freeze({
    validadeMs: 10 * 60 * 1000,
  }),

  /** Shadow mode — tolerâncias ao comparar duas implementações do motor. */
  shadow: Object.freeze({
    toleranciaCentavos: 1,
    toleranciaDias: 0,
  }),

  /**
   * R09 — feriados considerados para "dia útil" (nacionais fixos + móveis derivados da Páscoa).
   * Formato MM-DD para fixos.
   */
  feriados: Object.freeze({
    fixos: Object.freeze([
      '01-01',
      '04-21',
      '05-01',
      '09-07',
      '10-12',
      '11-02',
      '11-15',
      '11-20',
      '12-25',
    ]),
    moveis: Object.freeze(['CARNAVAL', 'SEXTA_FEIRA_SANTA', 'CORPUS_CHRISTI']),
  }),
});

module.exports = { REGRAS };
