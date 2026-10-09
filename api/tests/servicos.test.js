/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { criarApp } = require('../src/app');
const { converterCSV, numeroBR, EXEMPLO_CSV } = require('../src/services/importacao');
const { criarShadow, legado } = require('../src/services/shadow');
const { criarRepositorioEmpreendimentos } = require('../src/repositories/empreendimentos.repository');
const { parseISO, toISO } = require('../src/domain/datas');

async function token(app, email) {
  const r = await request(app).post('/api/auth/login').send({ email, senha: 'demo' }).expect(200);
  return `Bearer ${r.body.data.token}`;
}

describe('autenticação e perfis', () => {
  const app = criarApp();

  test('login devolve token e usuário, sem dados sensíveis', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: 'ADMIN@exemplo.com ', senha: 'demo' }).expect(200);
    assert.equal(r.body.data.usuario.perfil, 'ADMIN');
    assert.ok(!('hashSenha' in r.body.data.usuario));
    assert.ok(!('sal' in r.body.data.usuario));
  });

  test('credenciais inválidas → 401 com a mesma mensagem para e-mail ou senha', async () => {
    const a = await request(app).post('/api/auth/login').send({ email: 'admin@exemplo.com', senha: 'x' }).expect(401);
    const b = await request(app).post('/api/auth/login').send({ email: 'ninguem@exemplo.com', senha: 'demo' }).expect(401);
    assert.equal(a.body.error.mensagem, b.body.error.mensagem);
  });

  test('área administrativa exige login e perfil ADMIN', async () => {
    await request(app).get('/api/tabelas').expect(401);
    await request(app).get('/api/tabelas').set('Authorization', 'Bearer abc').expect(401);
    await request(app).get('/api/tabelas').set('Authorization', await token(app, 'vendedor@exemplo.com')).expect(403);
    await request(app).get('/api/tabelas').set('Authorization', await token(app, 'admin@exemplo.com')).expect(200);
  });

  test('token de outra instância (outro segredo) é recusado', async () => {
    const outro = criarApp();
    const t = await token(outro, 'admin@exemplo.com');
    await request(app).get('/api/auth/eu').set('Authorization', t).expect(401);
  });

  test('simulação continua pública', async () => {
    await request(app).get('/api/empreendimentos').expect(200);
  });
});

describe('importação de CSV', () => {
  test('números no formato brasileiro', () => {
    assert.equal(numeroBR('1.234,56', 'x'), 1234.56);
    assert.equal(numeroBR('R$ 2.000', 'x'), 2000);
    assert.equal(numeroBR('1.250.000', 'x'), 1250000);
    assert.equal(numeroBR('1234.56', 'x'), 1234.56);
    assert.equal(numeroBR('', 'x'), 0);
    assert.throws(() => numeroBR('abc', 'x'), /Valor inválido/);
  });

  test('exemplos convertem, inclusive com aspas e vírgula como separador', () => {
    assert.equal(converterCSV('LINEAR', EXEMPLO_CSV.LINEAR).linhas, 2);
    const ex = converterCSV('EXCECOES', EXEMPLO_CSV.EXCECOES).dados;
    assert.deepEqual(ex.valoresPorQuantidade, { 1: 1100, 2: 2200 });
    assert.equal(ex.valorCotaAdicional, 1100);
    const virgula = 'cotas,valor_total\n1,"1.000,00"\nadicional,"1.000,00"';
    assert.equal(converterCSV('EXCECOES', virgula).dados.valorCotaAdicional, 1000);
  });

  test('erros de estrutura e de conteúdo', () => {
    assert.throws(() => converterCSV('LINEAR', 'categoria_preco\nBronze'), /Colunas faltando/);
    assert.throws(() => converterCSV('LINEAR', 'só cabeçalho'), /cabeçalho e ao menos uma linha/);
    const dup = EXEMPLO_CSV.LINEAR + '\nBronze;32.000,00;10;1.600,00;5;1.280,00;70;416,00';
    assert.throws(() => converterCSV('LINEAR', dup), /duplicada/);
    const incoerente = EXEMPLO_CSV.LINEAR.split('\n')[0] + '\nX;1.000,00;10;800,00;5;300,00;70;1,00';
    assert.throws(() => converterCSV('LINEAR', incoerente), /não podem igualar ou exceder/);
    assert.throws(() => converterCSV('EXCECOES', 'cotas;valor_total\n1;100'), /adicional/);
  });
});

describe('tabelas versionadas por vigência', () => {
  test('a simulação usa a tabela vigente na data da venda, não a mais nova', () => {
    const repo = criarRepositorioEmpreendimentos();
    repo.salvarTabela({
      empreendimentoId: 'parque-delta',
      tipo: 'EXCECOES',
      vigenteDesde: '2027-01-01',
      dados: { valoresPorQuantidade: { 1: 900 }, valorCotaAdicional: 900 },
      origem: 'teste',
    });
    assert.equal(repo.buscarPorId('parque-delta', { data: '2026-06-01' }).excecoesEntrada.valorCotaAdicional, 1250);
    assert.equal(repo.buscarPorId('parque-delta', { data: '2027-01-01' }).excecoesEntrada.valorCotaAdicional, 900);
    assert.deepEqual(repo.buscarPorId('parque-delta', { data: '2027-01-01' }).versoesTabelas, { LINEAR: 1, EXCECOES: 2 });
  });

  test('antes de qualquer vigência, o empreendimento fica sem a tabela', () => {
    const repo = criarRepositorioEmpreendimentos();
    assert.equal(repo.buscarPorId('parque-delta', { data: '2025-12-31' }).tabelaLinear, undefined);
  });

  test('importação via API cria nova versão e passa a valer para vendas na vigência', async () => {
    const app = criarApp();
    const auth = await token(app, 'admin@exemplo.com');
    const imp = await request(app)
      .post('/api/tabelas/importar')
      .set('Authorization', auth)
      .send({ empreendimentoId: 'parque-delta', tipo: 'EXCECOES', vigenteDesde: '2026-07-01', csv: EXEMPLO_CSV.EXCECOES })
      .expect(201);
    assert.equal(imp.body.data.versao, 2);
    assert.equal(imp.body.data.origem, 'csv:admin@exemplo.com');

    const plano = (dataVenda, inicioRestante, inicioSinal) => ({
      empreendimentoId: 'parque-delta',
      quantidadeCotas: 3,
      valorUnidade: 80000,
      dataVenda,
      primeiraEntrada: { meioPagamento: 'PIX', parcelas: 1, valor: 1000 },
      entradaRestante: { parcelas: 2, dataInicio: inicioRestante },
      sinal: { parcelas: 2, dataInicio: inicioSinal },
      saldo: { parcelas: 24 },
    });
    const antes = await request(app).post('/api/simulacoes').send(plano('2026-06-15', '2026-07-15', '2026-09-15')).expect(200);
    const depois = await request(app).post('/api/simulacoes').send(plano('2026-07-15', '2026-08-15', '2026-10-15')).expect(200);
    assert.equal(antes.body.data.resumo.entrada.total, 3750); // tabela v1: 2.500 + 1.250
    assert.equal(depois.body.data.resumo.entrada.total, 3300); // tabela v2: 2.200 + 1.100
  });

  test('importação inválida não grava versão', async () => {
    const app = criarApp();
    const auth = await token(app, 'admin@exemplo.com');
    await request(app)
      .post('/api/tabelas/importar')
      .set('Authorization', auth)
      .send({ empreendimentoId: 'parque-delta', tipo: 'LINEAR', vigenteDesde: '2026-07-01', csv: 'categoria_preco\nX' })
      .expect(422);
    const t = await request(app).get('/api/tabelas?empreendimentoId=parque-delta').set('Authorization', auth).expect(200);
    assert.equal(t.body.data.versoes.length, 2); // só as do seed
  });
});

describe('shadow mode', () => {
  test('o legado reproduz os defeitos que o shadow existia para pegar', () => {
    assert.equal(toISO(legado.addMeses(parseISO('2026-01-31'), 1)), '2026-03-03');
    assert.notEqual(legado.parcelasDoSaldo(100, 3)[0] * 3, 100.00000000000001);
  });

  test('divergências: fim de mês e centavos; equivalência no caso simples', () => {
    const shadow = criarShadow({ relogio: () => new Date('2026-10-09T12:00:00Z') });
    const comFimDeMes = shadow.executar({ valorUnidade: 100000, saldo: 1000, parcelasSaldo: 3, dataBase: '2026-01-31', meses: 1 });
    const porFuncao = Object.fromEntries(comFimDeMes.map((x) => [x.funcao, x]));
    assert.equal(porFuncao.valorSinal.equivalente, true);
    assert.equal(porFuncao.addMeses.equivalente, false);
    assert.equal(porFuncao.addMeses.diferencas[0].novo, '2026-02-28');
    assert.equal(porFuncao.parcelasDoSaldo.equivalente, true); // 333,33… vs 333,34/333,33: dentro de 1 centavo

    shadow.executar({ valorUnidade: 100000, saldo: 1000, parcelasSaldo: 3, dataBase: '2026-01-15', meses: 1 });
    const est = shadow.estatisticas();
    assert.equal(est.total, 6);
    assert.equal(est.divergentes, 1);
    assert.equal(est.porFuncao.addMeses.divergentes, 1);
    assert.equal(est.taxaEquivalencia, 0.8333);
  });

  test('rotas do shadow exigem ADMIN e acumulam estatísticas', async () => {
    const app = criarApp();
    const auth = await token(app, 'admin@exemplo.com');
    await request(app).post('/api/shadow/comparar').send({}).expect(401);
    const r = await request(app)
      .post('/api/shadow/comparar')
      .set('Authorization', auth)
      .send({ valorUnidade: 80000, saldo: 71800, parcelasSaldo: 60, dataBase: '2026-03-31', meses: 1 })
      .expect(200);
    assert.equal(r.body.data.length, 3);
    const est = await request(app).get('/api/shadow/estatisticas').set('Authorization', auth).expect(200);
    assert.equal(est.body.data.total, 3);
  });
});
