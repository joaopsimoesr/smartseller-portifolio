/**
 * Dinheiro em centavos inteiros. Divisões em parcelas distribuem o resto
 * nas primeiras parcelas, para que a soma das parcelas seja SEMPRE igual
 * ao total (sem perda de centavo por ponto flutuante).
 */

function paraCentavos(valor) {
  return Math.round(Number(valor) * 100);
}

function paraReais(centavos) {
  return centavos / 100;
}

function dividirEmParcelas(totalCentavos, n) {
  if (!Number.isInteger(n) || n <= 0) {
    throw new RangeError('Número de parcelas deve ser inteiro positivo');
  }
  const base = Math.trunc(totalCentavos / n);
  const resto = totalCentavos - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

module.exports = { paraCentavos, paraReais, dividirEmParcelas };
