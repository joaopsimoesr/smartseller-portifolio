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

  /** Entrada: valor fixo por cota, por categoria de empreendimento. */
  entrada: Object.freeze({
    valorPorCota: Object.freeze({
      PADRAO: 2500,
      PREMIUM: 3200,
    }),
  }),

  /** Sinal: percentual sobre o valor da unidade (empreendimento pode sobrescrever). */
  sinal: Object.freeze({
    percentualPadrao: 4,
  }),

  /**
   * Meios de pagamento da entrada.
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

  /** Alçada de aprovação conforme a distância (em dias) entre venda e início do sinal. */
  autorizacaoSinal: Object.freeze([
    { acimaDeDias: 180, nivel: 'COMITE', rotulo: 'Comitê comercial' },
    { acimaDeDias: 120, nivel: 'GERENCIA', rotulo: 'Gerência' },
  ]),

  /** Modelo linear: tabela define quantidades; estes são os padrões de fallback. */
  modeloLinear: Object.freeze({
    diaVencimentoSinal: 10,
    parcelasPadrao: Object.freeze({ entrada: 10, sinal: 5, saldo: 72 }),
  }),

  /**
   * Feriados considerados para "dia útil" (nacionais fixos + móveis derivados da Páscoa).
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
