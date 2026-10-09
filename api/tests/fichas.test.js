/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { PDFDocument } = require('pdf-lib');
const { criarApp } = require('../src/app');
const { cpfValido } = require('../src/domain/documentos');
const { preencherTemplate, CODIGOS } = require('../src/pdf/ficha-cadastro');

const app = criarApp();
const binario = (res, cb) => {
  const partes = [];
  res.on('data', (c) => partes.push(c));
  res.on('end', () => cb(null, Buffer.concat(partes)));
};

const plano = {
  empreendimentoId: 'residencial-alfa',
  quantidadeCotas: 2,
  valorUnidade: 80000,
  dataVenda: '2026-03-13',
  primeiraEntrada: { meioPagamento: 'PIX', parcelas: 1, valor: 1000 },
  entradaRestante: { parcelas: 2, dataInicio: '2026-04-13' },
  sinal: { parcelas: 4, dataInicio: '2026-06-13' },
  saldo: { parcelas: 60 },
};

describe('fichas em PDF', () => {
  test('ficha de negociação: PDF válido, paginado', async () => {
    const r = await request(app).post('/api/fichas/negociacao').send(plano).buffer(true).parse(binario).expect(200);
    assert.equal(r.headers['content-type'], 'application/pdf');
    assert.equal(r.body.subarray(0, 5).toString(), '%PDF-');
    const doc = await PDFDocument.load(r.body);
    assert.ok(doc.getPageCount() >= 2); // 67 parcelas não cabem numa página
  });

  test('ficha do modelo linear', async () => {
    const r = await request(app)
      .post('/api/fichas/negociacao/linear')
      .send({ empreendimentoId: 'parque-delta', categoriaPreco: 'Bronze', quantidadeCotas: 1, dataVenda: '2026-03-13' })
      .buffer(true)
      .parse(binario)
      .expect(200);
    assert.equal(r.body.subarray(0, 5).toString(), '%PDF-');
  });

  test('regra violada não gera PDF: devolve o erro de negócio', async () => {
    const r = await request(app)
      .post('/api/fichas/negociacao')
      .send({ ...plano, primeiraEntrada: { meioPagamento: 'PIX', parcelas: 1, valor: 9999 } })
      .expect(422);
    assert.equal(r.body.error.codigo, 'ENTRADA_EXCEDIDA');
  });

  test('ficha de cadastro: CPF validado pelo dígito verificador', async () => {
    await request(app).post('/api/fichas/cadastro').send({ cliente: { nome: 'Cliente Exemplo', cpf: '000.000.001-92' } }).expect(400);
    const r = await request(app)
      .post('/api/fichas/cadastro')
      .send({ cliente: { nome: 'Cliente Exemplo', cpf: '00000000191' }, negociacao: { empreendimento: 'Resort Beta', cotas: 2 } })
      .buffer(true)
      .parse(binario)
      .expect(200);
    assert.equal(r.body.subarray(0, 5).toString(), '%PDF-');
  });

  test('mapeamento por código: código inexistente é erro; ausentes são listados', async () => {
    await assert.rejects(() => preencherTemplate({ 'CAD.INEXISTENTE': 'x' }), /Códigos sem campo/);
    const r = await preencherTemplate({ 'CAD.NOME': 'Cliente Exemplo' }, { achatar: false });
    assert.deepEqual(r.preenchidos, ['CAD.NOME']);
    assert.equal(r.faltando.length, CODIGOS.length - 1);
  });

  test('CPF: dígitos verificadores e sequências repetidas', () => {
    assert.equal(cpfValido('000.000.001-91'), true);
    assert.equal(cpfValido('000.000.001-92'), false);
    assert.equal(cpfValido('111.111.111-11'), false);
    assert.equal(cpfValido('123'), false);
  });
});
