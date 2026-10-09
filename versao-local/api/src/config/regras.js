// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

/**
 * Valores das 24 regras — TODOS FICTÍCIOS.
 *
 * A lógica de cada regra (src/regras) é a do MVP original; os números aqui
 * foram trocados por valores redondos inventados. Nenhum deles reflete a
 * política comercial de qualquer empresa.
 */

const CONFIG = Object.freeze({
  versao: 'versao-local-1.0 (simulação)',

  limites: Object.freeze({
    cotasMin: 1,
    cotasMax: 10,
    parcelasMax: 120,
  }),

  /** Regra 10: entrada fixa por cota, conforme a categoria do empreendimento. */
  entrada: Object.freeze({
    porCota: Object.freeze({ PADRAO: 2000, PREMIUM: 3000 }),
  }),

  /** Regras 11 e 12: sinal como percentual da unidade (empreendimento pode sobrescrever na 11). */
  sinal: Object.freeze({
    percentualPadrao: 4,
  }),

  /** Regra 13: como cada meio de pagamento define os vencimentos da 1ª entrada. */
  meiosPagamento: Object.freeze({
    PIX: 'MESMO_DIA',
    DINHEIRO: 'MESMO_DIA',
    TED: 'MESMO_DIA',
    CARTAO_DEBITO: 'PROXIMO_DIA_UTIL',
    CARTAO_CREDITO: 'MES_SEGUINTE',
    BOLETO: 'MES_SEGUINTE',
  }),

  /** Regra 21: alçada de aprovação pela distância (dias) entre venda e início do sinal. */
  autorizacaoSinal: Object.freeze({
    gerenciaAcimaDe: 120,
    diretoriaAcimaDe: 180,
  }),

  /** Regras 7 e 8: limite de dias corridos para achar um dia útil. */
  diaUtil: Object.freeze({
    maxIteracoes: 10,
  }),

  /** Regra 9: feriados nacionais fixos (MM-DD). Calendário público, não regra comercial. */
  feriadosFixos: Object.freeze(['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25']),

  /** Regra 23: validade do cache de regras por empreendimento. */
  cacheRegras: Object.freeze({
    validadeMs: 10 * 60 * 1000,
  }),

  /** Regra 24: modelo linear. */
  modeloLinear: Object.freeze({
    diaVencimentoSinal: 10,
    parcelasPadrao: Object.freeze({ entrada: 10, sinal: 5, saldo: 50 }),
    meioPagamentoEntrada: 'BOLETO',
  }),

  /** Shadow mode: tolerâncias de equivalência entre implementações. */
  shadow: Object.freeze({
    toleranciaMonetaria: 0.01,
    toleranciaDias: 0,
  }),
});

module.exports = { CONFIG };
