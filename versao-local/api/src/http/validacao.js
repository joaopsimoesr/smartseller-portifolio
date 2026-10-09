// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

/**
 * Esquemas Joi das rotas (origem: validation.service.js do backend).
 */

const Joi = require('joi');
const { CONFIG } = require('../config/regras');
const { TIPOS } = require('../servicos/repositorio');

const dataISO = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).messages({ 'string.pattern.base': '{{#label}} deve estar no formato AAAA-MM-DD' });
const parcelas = Joi.number().integer().min(1).max(CONFIG.limites.parcelasMax);
const cotas = Joi.number().integer().min(CONFIG.limites.cotasMin).max(CONFIG.limites.cotasMax);
const dinheiro = Joi.number().positive().precision(2);
const meio = Joi.string().valid(...Object.keys(CONFIG.meiosPagamento));

/** CPF com dígitos verificadores válidos (validação de formato, não de existência). */
function cpfValido(valor) {
  const d = String(valor).replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i += 1) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

const esquemaPlanoPadrao = Joi.object({
  empreendimentoId: Joi.string().required(),
  quantidadeCotas: cotas.required(),
  valorUnidade: dinheiro.required(),
  dataVenda: dataISO.required(),
  primeiraEntrada: Joi.object({ meioPagamento: meio.required(), parcelas: parcelas.required(), valor: dinheiro.required() }).required(),
  segundaEntrada: Joi.object({ meioPagamento: meio.required(), parcelas: parcelas.required(), valor: dinheiro.required(), dataBase: dataISO }),
  entradaRestante: Joi.object({ parcelas: parcelas.required(), dataInicio: dataISO.required() }),
  sinal: Joi.object({ parcelas: parcelas.required(), dataInicio: dataISO.required(), dia: Joi.number().integer().min(1).max(31) }).required(),
  saldo: Joi.object({ parcelas: parcelas.required() }).required(),
});

const esquemaModeloLinear = Joi.object({
  empreendimentoId: Joi.string().required(),
  categoriaPreco: Joi.string().trim().required(),
  quantidadeCotas: cotas.required(),
  dataVenda: dataISO.required(),
});

const esquemaCliente = Joi.object({
  nome: Joi.string().trim().min(3).max(120).required(),
  cpf: Joi.string()
    .required()
    .custom((v, h) => (cpfValido(v) ? v : h.error('any.invalid')))
    .messages({ 'any.invalid': 'CPF inválido' }),
  nascimento: dataISO,
  email: Joi.string().email({ tlds: false }),
  telefone: Joi.string().max(20),
  endereco: Joi.string().max(160),
  cidade: Joi.string().max(80),
  uf: Joi.string().length(2).uppercase(),
  cep: Joi.string().pattern(/^\d{5}-?\d{3}$/),
});

const esquemaFichaCadastro = Joi.object({
  cliente: esquemaCliente.required(),
  negociacao: Joi.object({
    empreendimento: Joi.string().max(80),
    cotas: cotas,
    valorUnidade: dinheiro,
    dataVenda: dataISO,
  }).default({}),
});

const esquemaLogin = Joi.object({ email: Joi.string().required(), senha: Joi.string().required() });

const esquemaImportacao = Joi.object({
  empreendimentoId: Joi.string().required(),
  tipo: Joi.string().valid(...TIPOS).required(),
  vigenteDesde: dataISO.required(),
  csv: Joi.string().max(200000).required(),
});

const esquemaShadow = Joi.object({
  valorUnidade: dinheiro.required(),
  percentualSinal: Joi.number().positive().max(100),
  saldo: dinheiro.required(),
  parcelasSaldo: parcelas.required(),
  dataBase: dataISO.required(),
  meses: Joi.number().integer().min(1).max(120).required(),
});

const esquemaDiaUtil = Joi.object({ data: dataISO.required(), depois: Joi.boolean().default(false) });

module.exports = {
  cpfValido,
  esquemaPlanoPadrao,
  esquemaModeloLinear,
  esquemaFichaCadastro,
  esquemaLogin,
  esquemaImportacao,
  esquemaShadow,
  esquemaDiaUtil,
};
