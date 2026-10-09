/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

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
const { converterCSV, EXEMPLO_CSV, COLUNAS } = require('../services/importacao');
const v = require('./validacao');

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

/** Encaminha rejeições de handlers assíncronos ao tratador de erros. */
const assincrono = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function criarRotas({ repoEmpreendimentos: repo, cacheRegras, auth, shadow, fichas }) {
  const r = express.Router();
  const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
  const admin = auth.exigir('ADMIN');

  const sincronizarCache = () => cacheRegras.sincronizar(repo.listar().map((e) => repo.buscarPorId(e.id)));

  // --- Público: simulação ------------------------------------------------------
  r.get('/health', (_req, res) => ok(res, { status: 'ok', regrasVersao: REGRAS.versao }));

  r.get('/regras', (_req, res) => ok(res, REGRAS));

  r.get('/empreendimentos', (_req, res) => {
    ok(
      res,
      repo.listar().map(({ id }) => {
        const e = repo.buscarPorId(id);
        return {
          id: e.id,
          nome: e.nome,
          categoria: e.categoria,
          percentualSinal: e.percentualSinal ?? REGRAS.sinal.percentualPadrao,
          promocaoEntrada: e.promocaoEntrada ?? null,
          excecoesEntrada: e.excecoesEntrada ?? null,
          categoriasLinear: e.tabelaLinear ? e.tabelaLinear.map((l) => l.categoriaPreco) : [],
        };
      }),
    );
  });

  r.post('/simulacoes', validar(v.esquemaPlanoPadrao), (req, res) => {
    ok(res, simularPlanoPadrao(req.validado, repo, { cacheRegras }));
  });

  r.post('/simulacoes/linear', validar(v.esquemaModeloLinear), (req, res) => {
    ok(res, simularModeloLinear(req.validado, repo));
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
  r.get('/datas/dia-util', validar(v.esquemaDiaUtil, 'query'), (req, res) => {
    const base = datas.parseISO(req.validado.data);
    const resultado = datas.diasUteisApos(base, req.validado.dias);
    ok(res, {
      data: req.validado.data,
      dias: req.validado.dias,
      diaUtil: datas.toISO(resultado),
      dataEhDiaUtil: datas.isDiaUtil(base),
    });
  });

  // --- Fichas em PDF (geradas no servidor a partir da simulação) ---------------
  if (fichas) {
    const enviarPDF = (res, bytes, nome) =>
      res.type('application/pdf').set('Content-Disposition', `attachment; filename="${nome}"`).send(Buffer.from(bytes));

    r.post(
      '/fichas/negociacao',
      validar(v.esquemaPlanoPadrao),
      assincrono(async (req, res) => {
        const sim = simularPlanoPadrao(req.validado, repo, { cacheRegras });
        enviarPDF(res, await fichas.negociacao(sim), `ficha-negociacao-${sim.empreendimento.id}.pdf`);
      }),
    );
    r.post(
      '/fichas/negociacao/linear',
      validar(v.esquemaModeloLinear),
      assincrono(async (req, res) => {
        const sim = simularModeloLinear(req.validado, repo);
        enviarPDF(res, await fichas.negociacao(sim), `ficha-negociacao-${sim.empreendimento.id}.pdf`);
      }),
    );
    r.post(
      '/fichas/cadastro',
      validar(v.esquemaFichaCadastro),
      assincrono(async (req, res) => {
        enviarPDF(res, await fichas.cadastro(req.validado), 'ficha-cadastro.pdf');
      }),
    );
  }

  // --- Autenticação ------------------------------------------------------------
  r.post('/auth/login', validar(v.esquemaLogin), (req, res) => {
    ok(res, auth.login(req.validado.email, req.validado.senha));
  });
  r.get('/auth/eu', auth.exigir(), (req, res) => ok(res, req.usuario));

  // --- Administração: tabelas versionadas e shadow mode -----------------------
  r.get('/tabelas', admin, (req, res) => {
    ok(res, { versoes: repo.listarVersoes(req.query.empreendimentoId), colunas: COLUNAS, exemplos: EXEMPLO_CSV });
  });

  r.post('/tabelas/importar', admin, validar(v.esquemaImportacao), (req, res) => {
    const { empreendimentoId, tipo, vigenteDesde, csv } = req.validado;
    const { dados, linhas } = converterCSV(tipo, csv);
    const { dados: _omit, ...registro } = repo.salvarTabela({
      empreendimentoId,
      tipo,
      vigenteDesde,
      dados,
      origem: `csv:${req.usuario.email}`,
    });
    sincronizarCache(); // R23: regras novas valem a partir da próxima simulação
    ok(res, { ...registro, linhas }, 201);
  });

  r.post('/shadow/comparar', admin, validar(v.esquemaShadow), (req, res) => ok(res, shadow.executar(req.validado)));
  r.get('/shadow/estatisticas', admin, (_req, res) => ok(res, shadow.estatisticas()));

  return r;
}

module.exports = { criarRotas };
