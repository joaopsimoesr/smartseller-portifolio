// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Licença: ver LICENSE na raiz do repositório.

/**
 * Mapeamento de campos da ficha por CÓDIGO.
 *
 * O layout do PDF (ficha.js) só conhece códigos como "NEG.EMPREENDIMENTO";
 * este arquivo diz de onde cada código tira o valor na simulação. Trocar o
 * modelo visual da ficha não toca nos dados, e vice-versa. É a mesma técnica
 * usada no MVP para preencher os templates PDF com campos codificados.
 */

const ROTULO_ETAPA = Object.freeze({
  PRIMEIRA_ENTRADA: '1ª entrada',
  SEGUNDA_ENTRADA: '2ª entrada',
  ENTRADA_RESTANTE: 'Entrada restante',
  SINAL: 'Sinal',
  SALDO: 'Saldo',
});

const brl = (valor) =>
  Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');

const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '-');

/** Soma e conta as parcelas de uma etapa do cronograma. */
function totaisDaEtapa(sim, etapa) {
  const parcelas = sim.cronograma.filter((p) => p.etapa === etapa);
  const centavos = parcelas.reduce((s, p) => s + Math.round(p.valor * 100), 0);
  return { quantidade: parcelas.length, total: centavos / 100, primeira: parcelas[0]?.vencimento };
}

/** @type {Record<string, (sim: object) => string>} */
const CAMPOS = Object.freeze({
  'NEG.EMPREENDIMENTO': (s) => s.empreendimento.nome,
  'NEG.CATEGORIA': (s) => s.empreendimento.categoria,
  'NEG.MODELO': (s) => (s.modelo === 'LINEAR' ? `Linear (${s.categoriaPreco ?? '-'})` : 'Padrão'),
  'NEG.COTAS': (s) => String(s.quantidadeCotas),
  'NEG.DATA_VENDA': (s) => dataBR(s.dataVenda),
  'NEG.VALOR_UNIDADE': (s) => brl(s.resumo.valorUnidade),
  'NEG.REGRAS_VERSAO': (s) => s.regrasVersao,
  'RES.ENTRADA': (s) => brl(s.resumo.entrada.total),
  'RES.SINAL': (s) => brl(s.resumo.sinal.total),
  'RES.SALDO': (s) => brl(s.resumo.saldo.total),
  'RES.TOTAL': (s) => brl(s.resumo.totalPlano),
  'RES.PARCELAS': (s) => String(s.resumo.quantidadeParcelas),
  'RES.PERIODO': (s) => `${dataBR(s.resumo.primeiroVencimento)} a ${dataBR(s.resumo.ultimoVencimento)}`,
});

/**
 * Resolve um código para texto. Código desconhecido é erro de programação,
 * não de dado: falha alto em vez de imprimir uma ficha incompleta.
 */
function resolverCampo(codigo, sim) {
  const extrator = CAMPOS[codigo];
  if (!extrator) throw new Error(`Campo de ficha desconhecido: ${codigo}`);
  return extrator(sim);
}

module.exports = { CAMPOS, ROTULO_ETAPA, resolverCampo, totaisDaEtapa, brl, dataBR };
