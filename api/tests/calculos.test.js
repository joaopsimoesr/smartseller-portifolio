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
    expect(p).toEqual([33334, 33333, 33333]);
    expect(p.reduce((a, b) => a + b, 0)).toBe(100000);
  });
});

describe('valorEntrada', () => {
  test('categoria padrão e premium', () => {
    expect(calc.valorEntrada(padrao, 2, parseISO('2026-05-01')).totalCentavos).toBe(500000);
    expect(calc.valorEntrada(premium, 2, parseISO('2026-05-01')).totalCentavos).toBe(640000);
  });
  test('promoção só vale dentro da vigência', () => {
    const dentro = calc.valorEntrada(promo, 2, parseISO('2026-12-31'));
    const fora = calc.valorEntrada(promo, 2, parseISO('2027-01-01'));
    expect(dentro).toMatchObject({ regra: 'PROMOCAO', totalCentavos: 360000 });
    expect(fora).toMatchObject({ regra: 'PADRAO', totalCentavos: 500000 });
  });
  test('cotas fora do limite', () => {
    expect(() => calc.valorEntrada(padrao, 11, parseISO('2026-05-01'))).toThrow(ErroDeNegocio);
  });
});

describe('valorSinal', () => {
  test('percentual padrão e específico do empreendimento', () => {
    expect(calc.valorSinal(padrao, 10000000).totalCentavos).toBe(400000);
    expect(calc.valorSinal(premium, 10000000)).toEqual({ percentual: 6, totalCentavos: 600000 });
  });
});

describe('datasPorMeioDePagamento', () => {
  const venda = parseISO('2026-03-13'); // sexta
  test('PIX: mesmo dia, parcela única', () => {
    expect(calc.datasPorMeioDePagamento('PIX', venda, 1).map(toISO)).toEqual(['2026-03-13']);
    expect(() => calc.datasPorMeioDePagamento('PIX', venda, 2)).toThrow(/no máximo 1/);
  });
  test('débito: 2 dias úteis depois', () => {
    expect(calc.datasPorMeioDePagamento('CARTAO_DEBITO', venda, 1).map(toISO)).toEqual(['2026-03-17']);
  });
  test('boleto: a partir do mês seguinte, ignorando fim de semana', () => {
    expect(calc.datasPorMeioDePagamento('BOLETO', venda, 3).map(toISO)).toEqual([
      '2026-04-13',
      '2026-05-13',
      '2026-06-13', // sábado — boleto não ajusta para dia útil
    ]);
  });
  test('meio inválido', () => {
    expect(() => calc.datasPorMeioDePagamento('CHEQUE', venda, 1)).toThrow(ErroDeNegocio);
  });
});

describe('mesesSemPagamento', () => {
  test('aponta meses vazios entre o último pagamento e a entrada restante', () => {
    const anteriores = [parseISO('2026-03-10')];
    expect(calc.mesesSemPagamento(anteriores, parseISO('2026-07-10'))).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
  });
  test('sem lacuna quando a restante começa no mês seguinte', () => {
    expect(calc.mesesSemPagamento([parseISO('2026-03-10')], parseISO('2026-04-10'))).toEqual([]);
  });
});

describe('conflitoSinalEntrada', () => {
  const restante = [parseISO('2026-04-10'), parseISO('2026-05-10')];
  test('sinal antes do fim da entrada restante → conflito com sugestão', () => {
    const r = calc.conflitoSinalEntrada(parseISO('2026-05-10'), restante);
    expect(r.conflito).toBe(true);
    expect(toISO(r.inicioSugerido)).toBe('2026-06-10');
  });
  test('sinal depois → sem conflito', () => {
    expect(calc.conflitoSinalEntrada(parseISO('2026-06-10'), restante).conflito).toBe(false);
  });
});

describe('alcadaAprovacaoSinal', () => {
  const venda = parseISO('2026-01-01');
  test.each([
    ['2026-04-30', null], // 119 dias
    ['2026-05-02', 'GERENCIA'], // 121 dias
    ['2026-06-30', 'GERENCIA'], // 180 dias (limite)
    ['2026-07-01', 'COMITE'], // 181 dias
  ])('início do sinal em %s → %s', (inicio, nivel) => {
    expect(calc.alcadaAprovacaoSinal(venda, parseISO(inicio)).nivel).toBe(nivel);
  });
});
