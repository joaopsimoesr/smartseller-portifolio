/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { criarApp } = require('../src/app');

const app = criarApp();

const planoBase = () => ({
  empreendimentoId: 'residencial-alfa',
  quantidadeCotas: 2,
  valorUnidade: 80000,
  dataVenda: '2026-03-13',
  primeiraEntrada: { meioPagamento: 'PIX', parcelas: 1, valor: 1000 },
  entradaRestante: { parcelas: 2, dataInicio: '2026-04-13' },
  sinal: { parcelas: 4, dataInicio: '2026-06-13' },
  saldo: { parcelas: 60 },
});

const somaCentavos = (cronograma) =>
  cronograma.reduce((s, p) => s + Math.round(p.valor * 100), 0);

describe('GET', () => {
  test('/api/health', async () => {
    const r = await request(app).get('/api/health').expect(200);
    assert.equal(r.body.data.status, 'ok');
  });

  test('/api/empreendimentos lista apenas ativos', async () => {
    const r = await request(app).get('/api/empreendimentos').expect(200);
    const ids = r.body.data.map((e) => e.id);
    assert.ok(ids.includes('residencial-alfa'));
    assert.ok(!ids.includes('mirante-epsilon'));
  });

  test('/api/datas/dia-util', async () => {
    const r = await request(app).get('/api/datas/dia-util?data=2026-04-20&dias=2').expect(200);
    assert.equal(r.body.data.diaUtil, '2026-04-23');
  });

  test('rota inexistente → 404', async () => {
    await request(app).get('/api/nada').expect(404);
  });
});

describe('POST /api/simulacoes', () => {
  test('plano completo: soma das parcelas = valor da unidade', async () => {
    const r = await request(app).post('/api/simulacoes').send(planoBase()).expect(200);
    const { resumo, cronograma, alertas } = r.body.data;

    assert.equal(resumo.entrada.total, 5000);
    assert.equal(resumo.entrada.primeira, 1000);
    assert.equal(resumo.entrada.restante, 4000);
    assert.deepEqual(resumo.sinal, { total: 3200, percentual: 4, origemPercentual: 'CACHE' });
    assert.equal(resumo.saldo.total, 71800);
    assert.equal(somaCentavos(cronograma), 8000000);
    assert.equal(resumo.totalPlano, 80000);
    assert.equal(cronograma.length, 1 + 2 + 4 + 60);
    assert.deepEqual(alertas, []);
  });

  test('saldo começa no mês seguinte ao fim do sinal', async () => {
    const r = await request(app).post('/api/simulacoes').send(planoBase()).expect(200);
    const saldo = r.body.data.cronograma.filter((p) => p.etapa === 'SALDO');
    assert.equal(saldo[0].vencimento, '2026-10-13');
  });

  test('alerta de conflito, meses pulados e alçada', async () => {
    const body = planoBase();
    body.entradaRestante = { parcelas: 4, dataInicio: '2026-06-13' }; // abr e mai vazios
    body.sinal = { parcelas: 4, dataInicio: '2026-08-13' }; // antes do fim da restante (set)
    let r = await request(app).post('/api/simulacoes').send(body).expect(200);
    const codigos = r.body.data.alertas.map((a) => a.codigo);
    assert.ok(codigos.includes('MESES_SEM_PAGAMENTO'));
    assert.ok(codigos.includes('CONFLITO_SINAL_ENTRADA'));

    body.entradaRestante = { parcelas: 2, dataInicio: '2026-04-13' };
    body.sinal = { parcelas: 4, dataInicio: '2026-09-30' }; // 201 dias → comitê
    r = await request(app).post('/api/simulacoes').send(body).expect(200);
    assert.equal(r.body.data.alertas.length, 1);
    assert.equal(r.body.data.alertas[0].codigo, 'APROVACAO_NECESSARIA');
    assert.equal(r.body.data.alertas[0].nivel, 'COMITE');
  });

  test('premium com segunda entrada em boleto', async () => {
    const body = {
      ...planoBase(),
      empreendimentoId: 'resort-beta',
      segundaEntrada: { meioPagamento: 'BOLETO', parcelas: 3, valor: 3000 },
      entradaRestante: { parcelas: 2, dataInicio: '2026-07-13' },
    };
    const r = await request(app).post('/api/simulacoes').send(body).expect(200);
    assert.equal(r.body.data.resumo.entrada.total, 6400);
    assert.equal(r.body.data.resumo.entrada.restante, 2400);
    assert.equal(r.body.data.resumo.sinal.percentual, 6);
    assert.equal(somaCentavos(r.body.data.cronograma), 8000000);
  });

  test('exceções de entrada do empreendimento prevalecem (R10)', async () => {
    const body = { ...planoBase(), empreendimentoId: 'parque-delta', quantidadeCotas: 3 };
    const r = await request(app).post('/api/simulacoes').send(body).expect(200);
    assert.equal(r.body.data.resumo.entrada.regra, 'EXCECAO');
    assert.equal(r.body.data.resumo.entrada.total, 3750);
    assert.equal(somaCentavos(r.body.data.cronograma), 8000000);
  });

  test('a resposta lista as regras aplicadas', async () => {
    const r = await request(app).post('/api/simulacoes').send(planoBase()).expect(200);
    const aplicadas = r.body.data.regrasAplicadas;
    ['R05', 'R10', 'R11', 'R13', 'R15', 'R17', 'R19', 'R20', 'R21', 'R22'].forEach((x) => assert.ok(aplicadas.includes(x), x));
    assert.equal(r.body.data.resumo.sinal.origemPercentual, 'CACHE');
  });

  test('entrada excedida → 422 com valores em reais', async () => {
    const body = { ...planoBase(), primeiraEntrada: { meioPagamento: 'PIX', parcelas: 1, valor: 9999 } };
    const r = await request(app).post('/api/simulacoes').send(body).expect(422);
    assert.equal(r.body.error.codigo, 'ENTRADA_EXCEDIDA');
    assert.match(r.body.error.mensagem, /R\$ 9\.999,00/);
  });

  test('entrada restante obrigatória quando falta valor', async () => {
    const { entradaRestante, ...body } = planoBase();
    const r = await request(app).post('/api/simulacoes').send(body).expect(422);
    assert.equal(r.body.error.codigo, 'ENTRADA_RESTANTE_OBRIGATORIA');
  });

  test('validação de formato → 400 com campos', async () => {
    const r = await request(app)
      .post('/api/simulacoes')
      .send({ ...planoBase(), dataVenda: '13/03/2026', quantidadeCotas: 0 })
      .expect(400);
    const campos = r.body.error.detalhes.map((x) => x.campo);
    assert.ok(campos.includes('dataVenda'));
    assert.ok(campos.includes('quantidadeCotas'));
  });

  test('data inexistente → 400', async () => {
    const r = await request(app)
      .post('/api/simulacoes')
      .send({ ...planoBase(), dataVenda: '2026-02-30' })
      .expect(400);
    assert.equal(r.body.error.codigo, 'DATA_INVALIDA');
  });

  test('empreendimento inativo → 404', async () => {
    await request(app)
      .post('/api/simulacoes')
      .send({ ...planoBase(), empreendimentoId: 'mirante-epsilon' })
      .expect(404);
  });
});

describe('POST /api/simulacoes/linear', () => {
  test('tabela Bronze, 2 cotas', async () => {
    const r = await request(app)
      .post('/api/simulacoes/linear')
      .send({ empreendimentoId: 'parque-delta', categoriaPreco: 'bronze', quantidadeCotas: 2, dataVenda: '2026-03-13' })
      .expect(200);
    const { resumo, cronograma } = r.body.data;
    assert.equal(resumo.valorUnidade, 60000);
    assert.deepEqual(resumo.saldo, { total: 54600, parcelas: 70 });
    assert.equal(somaCentavos(cronograma), 6000000);

    const sinal = cronograma.filter((p) => p.etapa === 'SINAL');
    assert.equal(sinal[0].vencimento, '2027-02-10'); // mês após a 10ª parcela de entrada (jan/27), dia 10
  });

  test('quantidades padrão e divergência da tabela geram alertas', async () => {
    const r = await request(app)
      .post('/api/simulacoes/linear')
      .send({ empreendimentoId: 'parque-delta', categoriaPreco: 'Esmeralda', quantidadeCotas: 1, dataVenda: '2026-03-13' })
      .expect(200);
    const codigos = r.body.data.alertas.map((a) => a.codigo);
    assert.deepEqual(codigos, ['PARCELAS_PADRAO', 'DIVERGENCIA_TABELA_LINEAR']);
    assert.equal(somaCentavos(r.body.data.cronograma), 6600000);
  });

  test('arredondamento da tabela não gera alerta de divergência', async () => {
    const r = await request(app)
      .post('/api/simulacoes/linear')
      .send({ empreendimentoId: 'parque-delta', categoriaPreco: 'Prata', quantidadeCotas: 3, dataVenda: '2026-03-13' })
      .expect(200);
    assert.deepEqual(r.body.data.alertas, []);
  });

  test('categoria inexistente lista as disponíveis', async () => {
    const r = await request(app)
      .post('/api/simulacoes/linear')
      .send({ empreendimentoId: 'parque-delta', categoriaPreco: 'Diamante', quantidadeCotas: 1, dataVenda: '2026-03-13' })
      .expect(422);
    assert.deepEqual(r.body.error.detalhes.disponiveis, ['Bronze', 'Prata', 'Ouro', 'Esmeralda']);
  });
});
