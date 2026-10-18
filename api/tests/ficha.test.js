// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Licença: ver LICENSE na raiz do repositório.

const request = require('supertest');
const { PDFDocument } = require('pdf-lib');
const { criarApp } = require('../src/app');
const { criarRepositorioEmpreendimentos } = require('../src/repositories/empreendimentos.repository');
const { simularPlanoPadrao, simularModeloLinear } = require('../src/domain/simulacao');
const { CAMPOS, resolverCampo } = require('../src/pdf/campos');
const { gerarFichaNegociacao, seguro } = require('../src/pdf/ficha');

const app = criarApp();
const repo = criarRepositorioEmpreendimentos();

const planoBase = (saldoParcelas = 60) => ({
  empreendimentoId: 'residencial-alfa',
  quantidadeCotas: 2,
  valorUnidade: 80000,
  dataVenda: '2026-03-13',
  primeiraEntrada: { meioPagamento: 'PIX', parcelas: 1, valor: 1000 },
  entradaRestante: { parcelas: 2, dataInicio: '2026-04-13' },
  sinal: { parcelas: 4, dataInicio: '2026-06-13' },
  saldo: { parcelas: saldoParcelas },
});

const linearBase = () => ({
  empreendimentoId: 'parque-delta',
  categoriaPreco: 'Prata',
  quantidadeCotas: 1,
  dataVenda: '2026-03-13',
});

// Supertest não acumula corpo binário por padrão.
const binario = (res, cb) => {
  const partes = [];
  res.on('data', (c) => partes.push(c));
  res.on('end', () => cb(null, Buffer.concat(partes)));
};

describe('campos da ficha', () => {
  test.each([
    ['padrão', () => simularPlanoPadrao(planoBase(), repo)],
    ['linear', () => simularModeloLinear(linearBase(), repo)],
  ])('todo código resolve para texto não vazio (%s)', (_nome, simular) => {
    const sim = simular();
    for (const codigo of Object.keys(CAMPOS)) {
      expect(resolverCampo(codigo, sim)).toEqual(expect.any(String));
      expect(resolverCampo(codigo, sim).length).toBeGreaterThan(0);
    }
  });

  test('código desconhecido falha alto', () => {
    expect(() => resolverCampo('NEG.INEXISTENTE', {})).toThrow(/desconhecido/);
  });

  test('sanitização mantém acentos e troca o que a WinAnsi não codifica', () => {
    expect(seguro('Negociação · 1ª entrada — R$ 1.000,00')).toBe('Negociação · 1ª entrada — R$ 1.000,00');
    expect(seguro('Resort → Beta ✓')).toBe('Resort ? Beta ?');
  });
});

describe('gerarFichaNegociacao', () => {
  test('gera PDF válido com metadados de autoria', async () => {
    const bytes = await gerarFichaNegociacao(simularPlanoPadrao(planoBase(), repo), { geradoEm: '2026-03-13' });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');

    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe('Ficha de Negociação - Residencial Alfa');
    expect(doc.getAuthor()).toBe('João Pedro Simões Rodrigues');
  });

  test('cronograma longo pagina em várias folhas', async () => {
    const curto = await PDFDocument.load(await gerarFichaNegociacao(simularPlanoPadrao(planoBase(12), repo)));
    const longo = await PDFDocument.load(await gerarFichaNegociacao(simularPlanoPadrao(planoBase(84), repo)));
    expect(curto.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(longo.getPageCount()).toBeGreaterThan(curto.getPageCount());
  });

  test('mesma simulação e mesma data geram o mesmo arquivo', async () => {
    const sim = simularPlanoPadrao(planoBase(), repo);
    const a = await gerarFichaNegociacao(sim, { geradoEm: '2026-03-13' });
    const b = await gerarFichaNegociacao(sim, { geradoEm: '2026-03-13' });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

describe('POST /api/simulacoes/ficha', () => {
  test('devolve PDF para download', async () => {
    const r = await request(app)
      .post('/api/simulacoes/ficha')
      .send(planoBase())
      .buffer(true)
      .parse(binario)
      .expect(200);
    expect(r.headers['content-type']).toMatch(/application\/pdf/);
    expect(r.headers['content-disposition']).toBe('attachment; filename="ficha-residencial-alfa.pdf"');
    expect(r.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('modelo linear também gera ficha', async () => {
    const r = await request(app)
      .post('/api/simulacoes/linear/ficha')
      .send(linearBase())
      .buffer(true)
      .parse(binario)
      .expect(200);
    expect(r.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('entrada inválida responde JSON 400, não PDF', async () => {
    const r = await request(app).post('/api/simulacoes/ficha').send({}).expect(400);
    expect(r.body.error.codigo).toBe('ENTRADA_INVALIDA');
  });

  test('regra de negócio violada responde 422', async () => {
    const plano = planoBase();
    plano.primeiraEntrada.valor = 999999;
    const r = await request(app).post('/api/simulacoes/ficha').send(plano).expect(422);
    expect(r.body.error.codigo).toBe('ENTRADA_EXCEDIDA');
  });
});
