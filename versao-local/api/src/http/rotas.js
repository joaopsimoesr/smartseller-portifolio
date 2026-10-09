// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

const express = require('express');
const { CONFIG } = require('../config/regras');
const datas = require('../regras/datas');
const { converterCSV, EXEMPLO_CSV, COLUNAS } = require('../servicos/importacao');
const { gerarFichaNegociacao } = require('../pdf/ficha-negociacao');
const { gerarTemplateCadastro, preencherTemplate } = require('../pdf/ficha-cadastro');
const v = require('./validacao');

/** Async-safe: encaminha rejeições para o tratador de erros. */
const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function validar(esquema, origem = 'body') {
  return (req, _res, next) => {
    const { error, value } = esquema.validate(req[origem], { abortEarly: false, stripUnknown: true });
    if (error) return next(error);
    req.validado = value;
    return next();
  };
}

function enviarPDF(res, bytes, nome) {
  res.type('application/pdf').set('Content-Disposition', `attachment; filename="${nome}"`).send(Buffer.from(bytes));
}

const brData = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const brl = (n) => (n === undefined ? '' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

function criarRotas({ repo, simulador, shadow, auth }) {
  const r = express.Router();
  const logado = auth.exigir();
  const admin = auth.exigir('ADMIN');
  const ok = (res, data) => res.json({ success: true, data });

  // --- Público ---------------------------------------------------------------
  r.get('/health', (_req, res) => ok(res, { status: 'ok', regrasVersao: CONFIG.versao }));
  r.get('/regras', (_req, res) => ok(res, CONFIG));
  r.post('/auth/login', validar(v.esquemaLogin), (req, res) => ok(res, auth.login(req.validado.email, req.validado.senha)));

  // --- Vendedor ---------------------------------------------------------------
  r.get('/auth/eu', logado, (req, res) => ok(res, req.usuario));

  r.get('/empreendimentos', logado, (_req, res) => {
    ok(
      res,
      repo.listarEmpreendimentos().map((e) => {
        const linear = repo.buscarTabelaVigente(e.id, 'LINEAR');
        return {
          id: e.id,
          nome: e.nome,
          categoria: e.categoria,
          percentualSinal: e.percentualSinal ?? CONFIG.sinal.percentualPadrao,
          temExcecoes: Boolean(repo.buscarTabelaVigente(e.id, 'EXCECOES')),
          categoriasLinear: linear ? linear.dados.linhas.map((l) => l.categoriaPreco) : [],
        };
      }),
    );
  });

  r.post('/simulacoes', logado, validar(v.esquemaPlanoPadrao), (req, res) => ok(res, simulador.simularPadrao(req.validado)));
  r.post('/simulacoes/linear', logado, validar(v.esquemaModeloLinear), (req, res) => ok(res, simulador.simularLinear(req.validado)));

  r.post(
    '/fichas/negociacao',
    logado,
    validar(v.esquemaPlanoPadrao),
    rota(async (req, res) => {
      const sim = simulador.simularPadrao(req.validado);
      enviarPDF(res, await gerarFichaNegociacao(sim), `ficha-negociacao-${sim.empreendimento.id}.pdf`);
    }),
  );

  r.post(
    '/fichas/negociacao/linear',
    logado,
    validar(v.esquemaModeloLinear),
    rota(async (req, res) => {
      const sim = simulador.simularLinear(req.validado);
      enviarPDF(res, await gerarFichaNegociacao(sim), `ficha-negociacao-${sim.empreendimento.id}.pdf`);
    }),
  );

  r.get('/fichas/cadastro/template', logado, rota(async (_req, res) => enviarPDF(res, await gerarTemplateCadastro(), 'ficha-cadastro-template.pdf')));

  r.post(
    '/fichas/cadastro',
    logado,
    validar(v.esquemaFichaCadastro),
    rota(async (req, res) => {
      const { cliente: c, negociacao: n } = req.validado;
      const { bytes } = await preencherTemplate(await gerarTemplateCadastro(), {
        'CAD.NOME': c.nome,
        'CAD.CPF': c.cpf,
        'CAD.NASCIMENTO': brData(c.nascimento),
        'CAD.EMAIL': c.email,
        'CAD.TELEFONE': c.telefone,
        'CAD.ENDERECO': c.endereco,
        'CAD.CIDADE': c.cidade,
        'CAD.UF': c.uf,
        'CAD.CEP': c.cep,
        'NEG.EMPREENDIMENTO': n.empreendimento,
        'NEG.COTAS': n.cotas === undefined ? '' : String(n.cotas),
        'NEG.VALOR_UNIDADE': brl(n.valorUnidade),
        'NEG.DATA_VENDA': brData(n.dataVenda),
      });
      enviarPDF(res, bytes, 'ficha-cadastro.pdf');
    }),
  );

  r.get('/datas/dia-util', logado, validar(v.esquemaDiaUtil, 'query'), (req, res) => {
    const base = datas.parseInputDate(req.validado.data);
    const dia = req.validado.depois ? datas.getNextBusinessDayAfter(base) : datas.getNextBusinessDay(base);
    ok(res, { data: req.validado.data, diaUtil: datas.toISO(dia), feriado: datas.isHoliday(base) });
  });

  // --- Admin: tabelas e shadow mode ------------------------------------------
  r.get('/tabelas', admin, (req, res) => ok(res, { versoes: repo.listarVersoes(req.query.empreendimentoId), colunas: COLUNAS, exemplos: EXEMPLO_CSV }));

  r.post('/tabelas/importar', admin, validar(v.esquemaImportacao), (req, res) => {
    const { empreendimentoId, tipo, vigenteDesde, csv } = req.validado;
    const { dados, linhas } = converterCSV(tipo, csv);
    const registro = repo.salvarTabela({ empreendimentoId, tipo, vigenteDesde, dados, origem: `csv:${req.usuario.email}` });
    const { dados: _omit, ...meta } = registro;
    res.status(201).json({ success: true, data: { ...meta, linhas } });
  });

  r.post('/shadow/comparar', admin, validar(v.esquemaShadow), (req, res) => ok(res, shadow.executar(req.validado)));
  r.get('/shadow/estatisticas', admin, (_req, res) => ok(res, shadow.estatisticas()));

  return r;
}

module.exports = { criarRotas };
