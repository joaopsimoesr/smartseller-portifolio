const d = require('../src/domain/datas');

const iso = (s) => d.parseISO(s);

describe('parseISO / toISO', () => {
  test('ida e volta preservam a data', () => {
    expect(d.toISO(iso('2026-03-15'))).toBe('2026-03-15');
  });
  test('rejeita formato e data inexistente', () => {
    expect(() => iso('15/03/2026')).toThrow(TypeError);
    expect(() => iso('2026-02-30')).toThrow(TypeError);
  });
});

describe('addMeses', () => {
  test('ajusta para o último dia em mês mais curto', () => {
    expect(d.toISO(d.addMeses(iso('2026-01-31'), 1))).toBe('2026-02-28');
    expect(d.toISO(d.addMeses(iso('2028-01-31'), 1))).toBe('2028-02-29');
  });
  test('vira o ano', () => {
    expect(d.toISO(d.addMeses(iso('2026-11-10'), 3))).toBe('2027-02-10');
  });
  test('série mensal não "arrasta" o dia após fevereiro', () => {
    const serie = d.serieMensal(iso('2026-01-31'), 3).map(d.toISO);
    expect(serie).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });
});

describe('feriados e dias úteis', () => {
  test('Páscoa calculada corretamente', () => {
    expect(d.toISO(d.pascoa(2026))).toBe('2026-04-05');
    expect(d.toISO(d.pascoa(2027))).toBe('2027-03-28');
  });
  test('feriados móveis derivados da Páscoa', () => {
    expect(d.isFeriado(iso('2026-02-17'))).toBe(true); // Carnaval
    expect(d.isFeriado(iso('2026-04-03'))).toBe(true); // Sexta-feira Santa
    expect(d.isFeriado(iso('2026-06-04'))).toBe(true); // Corpus Christi
  });
  test('2 dias úteis após sexta pulam o fim de semana', () => {
    // 2026-03-13 é sexta → seg 16, ter 17
    expect(d.toISO(d.diasUteisApos(iso('2026-03-13'), 2))).toBe('2026-03-17');
  });
  test('dias úteis pulam feriado', () => {
    // 2026-04-20 (seg) → 21 é Tiradentes → 22, 23
    expect(d.toISO(d.diasUteisApos(iso('2026-04-20'), 2))).toBe('2026-04-23');
  });
  test('independe do fuso do processo', () => {
    // Datas são UTC; getUTCDay de 2026-03-14 (sábado) é sempre 6
    expect(d.isFimDeSemana(iso('2026-03-14'))).toBe(true);
  });
});
