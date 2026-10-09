// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

const request = require('supertest');
const { criarApp } = require('../src/app');
const { EXEMPLO_CSV } = require('../src/servicos/importacao');

const binario = (res, cb) => {
  const partes = [];
  res.on('data', (c) => partes.push(c));
  res.on('end', () => cb(null, Buffer.concat(partes)));
};

const plano = () => ({
  empreendimentoId: 'residencial-alfa',
  quantidadeCotas: 2,
  valorUnidade: 80000,
  dataVenda: '2026-03-13',
  primeiraEntrada: { meioPagamento: 'PIX', parcelas: 1, valor: 1000 },
  entradaRestante: { parcelas: 3, dataInicio: '2026-04-13' },
  sinal: { parcelas: 4, dataInicio: '2026-07-13' },
  saldo: { parcelas: 60 },
});

let app;
let vendedor;
let admin;

beforeAll(async () => {
  app = criarApp();
  const login = async (email) => (await request(app).post('/api/auth/login').send({ email, senha: 'demo' })).body.data.token;
  vendedor = `Bearer ${await login('vendedor@exemplo.com')}`;
  admin = `Bearer ${await login('admin@exemplo.com')}`;
});

describe('público', () => {
  test('health e regras', async () => {
    expect((await request(app).get('/api/health').expect(200)).body.data.status).toBe('ok');
    expect((await request(app).get('/api/regras').expect(200)).body.data.sinal.percentualPadrao).toBe(4);
  });
  test('login inválido → 401', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: 'admin@exemplo.com', senha: 'x' }).expect(401);
    expect(r.body.error.codigo).toBe('CREDENCIAIS_INVALIDAS');
  });
  test('rota inexistente → 404', async () => {
    await request(app).get('/api/nada').expect(404);
  });
});

describe('autenticação e perfis', () => {
  test('sem token → 401; token inválido → 401', async () => {
    await request(app).get('/api/empreendimentos').expect(401);
    await request(app).get('/api/empreendimentos').set('Authorization', 'Bearer abc').expect(401);
  });
  test('vendedor não acessa rotas de admin → 403', async () => {
    await request(app).get('/api/tabelas').set('Authorization', vendedor).expect(403);
  });
  test('/auth/eu devolve o usuário do token', async () => {
    expect((await request(app).get('/api/auth/eu').set('Authorization', vendedor).expect(200)).body.data.perfil).toBe('VENDEDOR');
  });
});

describe('vendedor', () => {
  test('empreendimentos ativos com metadados de tabela', async () => {
    const { data } = (await request(app).get('/api/empreendimentos').set('Authorization', vendedor).expect(200)).body;
    expect(data.map((e) => e.id)).not.toContain('mirante-epsilon');
    expect(data.find((e) => e.id === 'parque-delta').categoriasLinear).toEqual(['Bronze', 'Prata', 'Ouro']);
    expect(data.find((e) => e.id === 'vila-gama').temExcecoes).toBe(true);
  });

  test('simulação padrão e linear', async () => {
    const p = (await request(app).post('/api/simulacoes').set('Authorization', vendedor).send(plano()).expect(200)).body.data;
    expect(p.resumo.totalPlano).toBe(80000);
    const l = (
      await request(app)
        .post('/api/simulacoes/linear')
        .set('Authorization', vendedor)
        .send({ empreendimentoId: 'parque-delta', categoriaPreco: 'Bronze', quantidadeCotas: 1, dataVenda: '2026-03-13' })
        .expect(200)
    ).body.data;
    expect(l.modelo).toBe('LINEAR');
  });

  test('validação 400 e regra 422', async () => {
    const r400 = await request(app).post('/api/simulacoes').set('Authorization', vendedor).send({}).expect(400);
    expect(r400.body.error.detalhes.length).toBeGreaterThan(0);
    const ruim = plano();
    ruim.primeiraEntrada.valor = 99999;
    expect((await request(app).post('/api/simulacoes').set('Authorization', vendedor).send(ruim).expect(422)).body.error.codigo).toBe('ENTRADA_EXCEDIDA');
  });

  test('dia útil', async () => {
    const r = await request(app).get('/api/datas/dia-util?data=2026-04-21').set('Authorization', vendedor).expect(200);
    expect(r.body.data).toMatchObject({ diaUtil: '2026-04-22', feriado: true });
  });

  test.each([
    ['/api/fichas/negociacao', plano()],
    ['/api/fichas/negociacao/linear', { empreendimentoId: 'parque-delta', categoriaPreco: 'Prata', quantidadeCotas: 1, dataVenda: '2026-03-13' }],
    ['/api/fichas/cadastro', { cliente: { nome: 'Cliente Exemplo', cpf: '529.982.247-25', uf: 'sp' }, negociacao: { empreendimento: 'Residencial Alfa', cotas: 2 } }],
  ])('PDF %s', async (rota, corpo) => {
    const r = await request(app).post(rota).set('Authorization', vendedor).send(corpo).buffer(true).parse(binario).expect(200);
    expect(r.headers['content-type']).toMatch(/application\/pdf/);
    expect(r.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('ficha de cadastro recusa CPF inválido', async () => {
    const r = await request(app)
      .post('/api/fichas/cadastro')
      .set('Authorization', vendedor)
      .send({ cliente: { nome: 'Cliente Exemplo', cpf: '123' } })
      .expect(400);
    expect(r.body.error.detalhes[0].mensagem).toBe('CPF inválido');
  });

  test('template de cadastro em branco', async () => {
    const r = await request(app).get('/api/fichas/cadastro/template').set('Authorization', vendedor).buffer(true).parse(binario).expect(200);
    expect(r.body.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('admin', () => {
  test('importa CSV e a simulação passa a usar a nova versão', async () => {
    const r = await request(app)
      .post('/api/tabelas/importar')
      .set('Authorization', admin)
      .send({ empreendimentoId: 'parque-delta', tipo: 'LINEAR', vigenteDesde: '2026-02-01', csv: EXEMPLO_CSV.LINEAR })
      .expect(201);
    expect(r.body.data).toMatchObject({ versao: 2, linhas: 2, origem: 'csv:admin@exemplo.com' });

    const sim = await request(app)
      .post('/api/simulacoes/linear')
      .set('Authorization', vendedor)
      .send({ empreendimentoId: 'parque-delta', categoriaPreco: 'Bronze', quantidadeCotas: 1, dataVenda: '2026-03-13' })
      .expect(200);
    expect(sim.body.data).toMatchObject({ tabelaVersao: 2, resumo: { valorUnidade: 32000 } });

    const lista = await request(app).get('/api/tabelas?empreendimentoId=parque-delta').set('Authorization', admin).expect(200);
    expect(lista.body.data.versoes).toHaveLength(2);
  });

  test('CSV com colunas faltando → 422', async () => {
    const r = await request(app)
      .post('/api/tabelas/importar')
      .set('Authorization', admin)
      .send({ empreendimentoId: 'parque-delta', tipo: 'LINEAR', vigenteDesde: '2026-02-01', csv: 'a;b\n1;2' })
      .expect(422);
    expect(r.body.error.codigo).toBe('CSV_COLUNAS_FALTANDO');
  });

  test('shadow mode: comparar e estatísticas', async () => {
    await request(app)
      .post('/api/shadow/comparar')
      .set('Authorization', admin)
      .send({ valorUnidade: 80000, saldo: 1000, parcelasSaldo: 3, dataBase: '2026-01-31', meses: 1 })
      .expect(200);
    const est = (await request(app).get('/api/shadow/estatisticas').set('Authorization', admin).expect(200)).body.data;
    expect(est.total).toBe(3);
    expect(est.porFuncao.addMonths.divergentes).toBe(1);
  });
});
