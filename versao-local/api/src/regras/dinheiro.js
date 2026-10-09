// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

/**
 * Aritmética monetária em centavos inteiros.
 *
 * O original dividia valores em ponto flutuante (total / parcelas); aqui a
 * divisão devolve parcelas em centavos que somam exatamente o total, com o
 * resto distribuído nas primeiras parcelas.
 */

const paraCentavos = (reais) => Math.round(Number(reais) * 100);
const paraReais = (centavos) => centavos / 100;

function dividirEmParcelas(totalCentavos, n) {
  const base = Math.floor(totalCentavos / n);
  const resto = totalCentavos - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

/** Divide um valor em reais em N parcelas exatas; devolve reais. */
function parcelar(totalReais, n) {
  return dividirEmParcelas(paraCentavos(totalReais), n).map(paraReais);
}

const formatarBRL = (reais) =>
  Number(reais).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');

module.exports = { paraCentavos, paraReais, dividirEmParcelas, parcelar, formatarBRL };
