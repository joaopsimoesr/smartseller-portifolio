/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

const express = require('express');
const { REGRAS } = require('../config/regras');
const datas = require('../domain/datas');
const { simularPlanoPadrao, simularModeloLinear } = require('../domain/simulacao');
const {
  esquemaPlanoPadrao,
  esquemaModeloLinear,
  esquemaDiaUtil,
} = require('./validacao');

function validar(esquema, origem = 'body') {
  return (req, _res, next) => {
    const { error, value } = esquema.validate(req[origem], {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) return next(error);
    req.validado = value;
    return next();
  };
}

function criarRotas({ repoEmpreendimentos }) {
  const r = express.Router();

  r.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', regrasVersao: REGRAS.versao } });
  });

  r.get('/regras', (_req, res) => {
    res.json({ success: true, data: REGRAS });
  });

  r.get('/empreendimentos', (_req, res) => {
    const data = repoEmpreendimentos.listar().map((e) => ({
      id: e.id,
      nome: e.nome,
      categoria: e.categoria,
      percentualSinal: e.percentualSinal ?? REGRAS.sinal.percentualPadrao,
      promocaoEntrada: e.promocaoEntrada ?? null,
      categoriasLinear: e.tabelaLinear ? e.tabelaLinear.map((l) => l.categoriaPreco) : [],
    }));
    res.json({ success: true, data });
  });

  r.post('/simulacoes', validar(esquemaPlanoPadrao), (req, res) => {
    res.json({ success: true, data: simularPlanoPadrao(req.validado, repoEmpreendimentos) });
  });

  r.post('/simulacoes/linear', validar(esquemaModeloLinear), (req, res) => {
    res.json({ success: true, data: simularModeloLinear(req.validado, repoEmpreendimentos) });
  });

  r.get('/datas/dia-util', validar(esquemaDiaUtil, 'query'), (req, res) => {
    const base = datas.parseISO(req.validado.data);
    const resultado = datas.diasUteisApos(base, req.validado.dias);
    res.json({
      success: true,
      data: {
        data: req.validado.data,
        dias: req.validado.dias,
        diaUtil: datas.toISO(resultado),
        dataEhDiaUtil: datas.isDiaUtil(base),
      },
    });
  });

  return r;
}

module.exports = { criarRotas };
