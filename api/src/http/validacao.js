/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

const Joi = require('joi');
const { REGRAS } = require('../config/regras');

const dataISO = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .message('{{#label}} deve estar no formato YYYY-MM-DD');

const parcelas = Joi.number().integer().min(1).max(REGRAS.limites.parcelasMax);
const dinheiro = Joi.number().positive().precision(2);
const meio = Joi.string().valid(...Object.keys(REGRAS.meiosPagamento));
const cotas = Joi.number()
  .integer()
  .min(REGRAS.limites.cotasMin)
  .max(REGRAS.limites.cotasMax)
  .required();

const esquemaPlanoPadrao = Joi.object({
  empreendimentoId: Joi.string().required(),
  quantidadeCotas: cotas,
  valorUnidade: dinheiro.required(),
  dataVenda: dataISO.required(),
  primeiraEntrada: Joi.object({
    meioPagamento: meio.required(),
    parcelas: parcelas.required(),
    valor: dinheiro.required(),
  }).required(),
  segundaEntrada: Joi.object({
    meioPagamento: meio.required(),
    parcelas: parcelas.required(),
    valor: dinheiro.required(),
    dataBase: dataISO,
  }),
  entradaRestante: Joi.object({
    parcelas: parcelas.required(),
    dataInicio: dataISO.required(),
  }),
  sinal: Joi.object({
    parcelas: parcelas.required(),
    dataInicio: dataISO.required(),
  }).required(),
  saldo: Joi.object({
    parcelas: parcelas.required(),
  }).required(),
});

const esquemaModeloLinear = Joi.object({
  empreendimentoId: Joi.string().required(),
  categoriaPreco: Joi.string().required(),
  quantidadeCotas: cotas,
  dataVenda: dataISO.required(),
});

const esquemaDiaUtil = Joi.object({
  data: dataISO.required(),
  dias: Joi.number().integer().min(1).max(30).default(1),
});

const esquemaLogin = Joi.object({
  email: Joi.string().max(200).required(),
  senha: Joi.string().max(200).required(),
});

const esquemaImportacao = Joi.object({
  empreendimentoId: Joi.string().required(),
  tipo: Joi.string().valid('LINEAR', 'EXCECOES').required(),
  vigenteDesde: dataISO.required(),
  csv: Joi.string().max(200_000).required(),
});

const esquemaShadow = Joi.object({
  valorUnidade: dinheiro.required(),
  percentualSinal: Joi.number().positive().max(100),
  saldo: dinheiro.required(),
  parcelasSaldo: parcelas.required(),
  dataBase: dataISO.required(),
  meses: Joi.number().integer().min(-120).max(120).required(),
});

module.exports = {
  esquemaPlanoPadrao,
  esquemaModeloLinear,
  esquemaDiaUtil,
  esquemaLogin,
  esquemaImportacao,
  esquemaShadow,
};
