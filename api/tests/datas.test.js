/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const d = require('../src/domain/datas');

const iso = (s) => d.parseISO(s);

describe('parseISO / toISO', () => {
  test('ida e volta preservam a data', () => {
    assert.equal(d.toISO(iso('2026-03-15')), '2026-03-15');
  });
  test('rejeita formato e data inexistente', () => {
    assert.throws(() => iso('15/03/2026'), TypeError);
    assert.throws(() => iso('2026-02-30'), TypeError);
  });
});

describe('addMeses', () => {
  test('ajusta para o último dia em mês mais curto', () => {
    assert.equal(d.toISO(d.addMeses(iso('2026-01-31'), 1)), '2026-02-28');
    assert.equal(d.toISO(d.addMeses(iso('2028-01-31'), 1)), '2028-02-29');
  });
  test('vira o ano', () => {
    assert.equal(d.toISO(d.addMeses(iso('2026-11-10'), 3)), '2027-02-10');
  });
  test('série mensal não "arrasta" o dia após fevereiro', () => {
    const serie = d.serieMensal(iso('2026-01-31'), 3).map(d.toISO);
    assert.deepEqual(serie, ['2026-01-31', '2026-02-28', '2026-03-31']);
  });
});

describe('feriados e dias úteis', () => {
  test('Páscoa calculada corretamente', () => {
    assert.equal(d.toISO(d.pascoa(2026)), '2026-04-05');
    assert.equal(d.toISO(d.pascoa(2027)), '2027-03-28');
  });
  test('feriados móveis derivados da Páscoa', () => {
    assert.ok(d.isFeriado(iso('2026-02-17'))); // Carnaval
    assert.ok(d.isFeriado(iso('2026-04-03'))); // Sexta-feira Santa
    assert.ok(d.isFeriado(iso('2026-06-04'))); // Corpus Christi
  });
  test('2 dias úteis após sexta pulam o fim de semana', () => {
    // 2026-03-13 é sexta → seg 16, ter 17
    assert.equal(d.toISO(d.diasUteisApos(iso('2026-03-13'), 2)), '2026-03-17');
  });
  test('dias úteis pulam feriado', () => {
    // 2026-04-20 (seg) → 21 é Tiradentes → 22, 23
    assert.equal(d.toISO(d.diasUteisApos(iso('2026-04-20'), 2)), '2026-04-23');
  });
  test('independe do fuso do processo', () => {
    // Datas são UTC; getUTCDay de 2026-03-14 (sábado) é sempre 6
    assert.ok(d.isFimDeSemana(iso('2026-03-14')));
  });
});
