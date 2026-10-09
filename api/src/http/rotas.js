const express = require('express');
const { REGRAS } = require('../config/regras');
const datas = require('../domain/datas');
const { simularPlanoPadrao, simularModeloLinear } = require('../domain/simulacao');
const { gerarFichaNegociacao } = require('../pdf/ficha');
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

  // Ficha PDF: recalcula a simulação no servidor (fonte da verdade) e devolve o arquivo.
  const enviarFicha = (simular) => async (req, res, next) => {
    try {
      const sim = simular(req.validado, repoEmpreendimentos);
      const pdf = await gerarFichaNegociacao(sim);
      res
        .type('application/pdf')
        .set('Content-Disposition', `attachment; filename="ficha-${sim.empreendimento.id}.pdf"`)
        .send(Buffer.from(pdf));
    } catch (err) {
      next(err);
    }
  };

  r.post('/simulacoes/ficha', validar(esquemaPlanoPadrao), enviarFicha(simularPlanoPadrao));

  r.post('/simulacoes/linear/ficha', validar(esquemaModeloLinear), enviarFicha(simularModeloLinear));

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
