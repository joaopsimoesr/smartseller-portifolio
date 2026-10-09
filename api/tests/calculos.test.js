/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const calc = require('../src/domain/calculos');
const { dividirEmParcelas } = require('../src/domain/dinheiro');
const { parseISO, toISO } = require('../src/domain/datas');
const { ErroDeNegocio } = require('../src/domain/erros');

const padrao = { id: 'a', categoria: 'PADRAO' };
const premium = { id: 'b', categoria: 'PREMIUM', percentualSinal: 6 };
const promo = {
  id: 'c',
  categoria: 'PADRAO',
  promocaoEntrada: { valorPorCota: 1800, inicio: '2026-01-01', fim: '2026-12-31' },
};

describe('dividirEmParcelas', () => {
  test('soma sempre igual ao total, resto nas primeiras', () => {
    const p = dividirEmParcelas(100000, 3);
    assert.deepEqual(p, [33334, 33333, 33333]);
    assert.equal(p.reduce((a, b) => a + b, 0), 100000);
  });
});

describe('valorEntrada', () => {
  test('categoria padrão e premium', () => {
    assert.equal(calc.valorEntrada(padrao, 2, parseISO('2026-05-01')).totalCentavos, 500000);
    assert.equal(calc.valorEntrada(premium, 2, parseISO('2026-05-01')).totalCentavos, 640000);
  });
  test('promoção só vale dentro da vigência', () => {
    const dentro = calc.valorEntrada(promo, 2, parseISO('2026-12-31'));
    const fora = calc.valorEntrada(promo, 2, parseISO('2027-01-01'));
    assert.equal(dentro.regra, 'PROMOCAO');
    assert.equal(dentro.totalCentavos, 360000);
    assert.equal(fora.regra, 'PADRAO');
    assert.equal(fora.totalCentavos, 500000);
  });
  test('cotas fora do limite', () => {
    assert.throws(() => calc.valorEntrada(padrao, 11, parseISO('2026-05-01')), ErroDeNegocio);
  });
});

describe('valorSinal', () => {
  test('percentual padrão e específico do empreendimento', () => {
    assert.equal(calc.valorSinal(padrao, 10000000).totalCentavos, 400000);
    assert.deepEqual(calc.valorSinal(premium, 10000000), { percentual: 6, totalCentavos: 600000 });
  });
});

describe('datasPorMeioDePagamento', () => {
  const venda = parseISO('2026-03-13'); // sexta
  test('PIX: mesmo dia, parcela única', () => {
    assert.deepEqual(calc.datasPorMeioDePagamento('PIX', venda, 1).map(toISO), ['2026-03-13']);
    assert.throws(() => calc.datasPorMeioDePagamento('PIX', venda, 2), /no máximo 1/);
  });
  test('débito: 2 dias úteis depois', () => {
    assert.deepEqual(calc.datasPorMeioDePagamento('CARTAO_DEBITO', venda, 1).map(toISO), ['2026-03-17']);
  });
  test('boleto: a partir do mês seguinte, ignorando fim de semana', () => {
    assert.deepEqual(calc.datasPorMeioDePagamento('BOLETO', venda, 3).map(toISO), [
      '2026-04-13',
      '2026-05-13',
      '2026-06-13', // sábado — boleto não ajusta para dia útil
    ]);
  });
  test('meio inválido', () => {
    assert.throws(() => calc.datasPorMeioDePagamento('CHEQUE', venda, 1), ErroDeNegocio);
  });
});

describe('mesesSemPagamento', () => {
  test('aponta meses vazios entre o último pagamento e a entrada restante', () => {
    const anteriores = [parseISO('2026-03-10')];
    assert.deepEqual(calc.mesesSemPagamento(anteriores, parseISO('2026-07-10')), [
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
  });
  test('sem lacuna quando a restante começa no mês seguinte', () => {
    assert.deepEqual(calc.mesesSemPagamento([parseISO('2026-03-10')], parseISO('2026-04-10')), []);
  });
});

describe('conflitoSinalEntrada', () => {
  const restante = [parseISO('2026-04-10'), parseISO('2026-05-10')];
  test('sinal antes do fim da entrada restante → conflito com sugestão', () => {
    const r = calc.conflitoSinalEntrada(parseISO('2026-05-10'), restante);
    assert.equal(r.conflito, true);
    assert.equal(toISO(r.inicioSugerido), '2026-06-10');
  });
  test('sinal depois → sem conflito', () => {
    assert.equal(calc.conflitoSinalEntrada(parseISO('2026-06-10'), restante).conflito, false);
  });
});

describe('alcadaAprovacaoSinal', () => {
  const venda = parseISO('2026-01-01');
  const casos = [
    ['2026-04-30', null], // 119 dias
    ['2026-05-02', 'GERENCIA'], // 121 dias
    ['2026-06-30', 'GERENCIA'], // 180 dias (limite)
    ['2026-07-01', 'COMITE'], // 181 dias
  ];
  for (const [inicio, nivel] of casos) {
    test(`início do sinal em ${inicio} → ${nivel}`, () => {
      assert.equal(calc.alcadaAprovacaoSinal(venda, parseISO(inicio)).nivel, nivel);
    });
  }
});
