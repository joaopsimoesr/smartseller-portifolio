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
    expect(r.body.data.status).toBe('ok');
  });

  test('/api/empreendimentos lista apenas ativos', async () => {
    const r = await request(app).get('/api/empreendimentos').expect(200);
    const ids = r.body.data.map((e) => e.id);
    expect(ids).toContain('residencial-alfa');
    expect(ids).not.toContain('mirante-epsilon');
  });

  test('/api/datas/dia-util', async () => {
    const r = await request(app).get('/api/datas/dia-util?data=2026-04-20&dias=2').expect(200);
    expect(r.body.data.diaUtil).toBe('2026-04-23');
  });

  test('rota inexistente → 404', async () => {
    await request(app).get('/api/nada').expect(404);
  });
});

describe('POST /api/simulacoes', () => {
  test('plano completo: soma das parcelas = valor da unidade', async () => {
    const r = await request(app).post('/api/simulacoes').send(planoBase()).expect(200);
    const { resumo, cronograma, alertas } = r.body.data;

    expect(resumo.entrada).toMatchObject({ total: 5000, primeira: 1000, restante: 4000 });
    expect(resumo.sinal).toEqual({ total: 3200, percentual: 4 });
    expect(resumo.saldo.total).toBe(71800);
    expect(somaCentavos(cronograma)).toBe(8000000);
    expect(resumo.totalPlano).toBe(80000);
    expect(cronograma).toHaveLength(1 + 2 + 4 + 60);
    expect(alertas).toEqual([]);
  });

  test('saldo começa no mês seguinte ao fim do sinal', async () => {
    const r = await request(app).post('/api/simulacoes').send(planoBase()).expect(200);
    const saldo = r.body.data.cronograma.filter((p) => p.etapa === 'SALDO');
    expect(saldo[0].vencimento).toBe('2026-10-13');
  });

  test('alerta de conflito, meses pulados e alçada', async () => {
    const body = planoBase();
    body.entradaRestante = { parcelas: 4, dataInicio: '2026-06-13' }; // abr e mai vazios
    body.sinal = { parcelas: 4, dataInicio: '2026-08-13' }; // antes do fim da restante (set)
    let r = await request(app).post('/api/simulacoes').send(body).expect(200);
    const codigos = r.body.data.alertas.map((a) => a.codigo);
    expect(codigos).toEqual(expect.arrayContaining(['MESES_SEM_PAGAMENTO', 'CONFLITO_SINAL_ENTRADA']));

    body.entradaRestante = { parcelas: 2, dataInicio: '2026-04-13' };
    body.sinal = { parcelas: 4, dataInicio: '2026-09-30' }; // 201 dias → comitê
    r = await request(app).post('/api/simulacoes').send(body).expect(200);
    expect(r.body.data.alertas).toEqual([
      expect.objectContaining({ codigo: 'APROVACAO_NECESSARIA', nivel: 'COMITE' }),
    ]);
  });

  test('premium com segunda entrada em boleto', async () => {
    const body = {
      ...planoBase(),
      empreendimentoId: 'resort-beta',
      segundaEntrada: { meioPagamento: 'BOLETO', parcelas: 3, valor: 3000 },
      entradaRestante: { parcelas: 2, dataInicio: '2026-07-13' },
    };
    const r = await request(app).post('/api/simulacoes').send(body).expect(200);
    expect(r.body.data.resumo.entrada).toMatchObject({ total: 6400, restante: 2400 });
    expect(r.body.data.resumo.sinal.percentual).toBe(6);
    expect(somaCentavos(r.body.data.cronograma)).toBe(8000000);
  });

  test('entrada excedida → 422', async () => {
    const body = { ...planoBase(), primeiraEntrada: { meioPagamento: 'PIX', parcelas: 1, valor: 9999 } };
    const r = await request(app).post('/api/simulacoes').send(body).expect(422);
    expect(r.body.error.codigo).toBe('ENTRADA_EXCEDIDA');
  });

  test('entrada restante obrigatória quando falta valor', async () => {
    const { entradaRestante, ...body } = planoBase();
    const r = await request(app).post('/api/simulacoes').send(body).expect(422);
    expect(r.body.error.codigo).toBe('ENTRADA_RESTANTE_OBRIGATORIA');
  });

  test('validação de formato → 400 com campos', async () => {
    const r = await request(app)
      .post('/api/simulacoes')
      .send({ ...planoBase(), dataVenda: '13/03/2026', quantidadeCotas: 0 })
      .expect(400);
    const campos = r.body.error.detalhes.map((x) => x.campo);
    expect(campos).toEqual(expect.arrayContaining(['dataVenda', 'quantidadeCotas']));
  });

  test('data inexistente → 400', async () => {
    const r = await request(app)
      .post('/api/simulacoes')
      .send({ ...planoBase(), dataVenda: '2026-02-30' })
      .expect(400);
    expect(r.body.error.codigo).toBe('DATA_INVALIDA');
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
    expect(resumo.valorUnidade).toBe(60000);
    expect(resumo.saldo).toEqual({ total: 54600, parcelas: 70 });
    expect(somaCentavos(cronograma)).toBe(6000000);

    const sinal = cronograma.filter((p) => p.etapa === 'SINAL');
    expect(sinal[0].vencimento).toBe('2027-02-10'); // mês após a 10ª parcela de entrada (jan/27), dia 10
  });

  test('categoria inexistente lista as disponíveis', async () => {
    const r = await request(app)
      .post('/api/simulacoes/linear')
      .send({ empreendimentoId: 'parque-delta', categoriaPreco: 'Diamante', quantidadeCotas: 1, dataVenda: '2026-03-13' })
      .expect(422);
    expect(r.body.error.detalhes.disponiveis).toEqual(['Bronze', 'Prata', 'Ouro']);
  });
});
