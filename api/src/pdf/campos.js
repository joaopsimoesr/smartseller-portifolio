/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

/**
 * Mapeamento de campos das fichas por CÓDIGO.
 *
 * O layout do PDF só conhece códigos como "NEG.EMPREENDIMENTO"; este arquivo
 * diz de onde cada código tira o valor. Trocar o modelo visual da ficha não
 * toca nos dados, e vice-versa — a mesma técnica usada no MVP para preencher
 * os templates com campos codificados.
 */

const ROTULO_ETAPA = Object.freeze({
  PRIMEIRA_ENTRADA: '1ª entrada',
  SEGUNDA_ENTRADA: '2ª entrada',
  ENTRADA_RESTANTE: 'Entrada restante',
  SINAL: 'Sinal',
  SALDO: 'Saldo',
});

const ROTULO_MEIO = Object.freeze({
  PIX: 'PIX',
  DINHEIRO: 'Dinheiro',
  TED: 'TED',
  CARTAO_DEBITO: 'Débito',
  CARTAO_CREDITO: 'Crédito',
  BOLETO: 'Boleto',
});

const ROTULO_REGRA_ENTRADA = Object.freeze({
  PADRAO: 'valor padrão',
  PREMIUM: 'valor premium',
  PROMOCAO: 'promoção vigente',
  EXCECAO: 'tabela de exceções',
});

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = (valor) => BRL.format(valor).replace(/ /g, ' ');
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');

/** Soma e conta as parcelas de uma etapa do cronograma. */
function totaisDaEtapa(sim, etapa) {
  const parcelas = sim.cronograma.filter((p) => p.etapa === etapa);
  const centavos = parcelas.reduce((s, p) => s + Math.round(p.valor * 100), 0);
  return { quantidade: parcelas.length, total: centavos / 100, primeira: parcelas[0]?.vencimento };
}

/** @type {Record<string, (sim: object) => string>} */
const CAMPOS_NEGOCIACAO = Object.freeze({
  'NEG.EMPREENDIMENTO': (s) => s.empreendimento.nome,
  'NEG.CATEGORIA': (s) => (s.empreendimento.categoria === 'PREMIUM' ? 'Premium' : 'Padrão'),
  'NEG.MODELO': (s) => (s.modelo === 'LINEAR' ? `Linear · ${s.categoriaPreco}` : 'Plano padrão'),
  'NEG.COTAS': (s) => String(s.quantidadeCotas),
  'NEG.DATA_VENDA': (s) => dataBR(s.dataVenda),
  'NEG.VALOR_UNIDADE': (s) => brl(s.resumo.valorUnidade),
  'NEG.REGRAS_VERSAO': (s) => s.regrasVersao,
  'RES.ENTRADA': (s) => brl(s.resumo.entrada.total),
  'RES.ENTRADA_REGRA': (s) => ROTULO_REGRA_ENTRADA[s.resumo.entrada.regra] ?? `${s.resumo.entrada.parcelas} parcelas`,
  'RES.SINAL': (s) => brl(s.resumo.sinal.total),
  'RES.SINAL_PERCENTUAL': (s) => (s.resumo.sinal.percentual ? `${s.resumo.sinal.percentual}% da unidade` : `${s.resumo.sinal.parcelas} parcelas`),
  'RES.SALDO': (s) => brl(s.resumo.saldo.total),
  'RES.TOTAL': (s) => brl(s.resumo.totalPlano),
  'RES.PARCELAS': (s) => String(s.resumo.quantidadeParcelas),
  'RES.PERIODO': (s) => `${dataBR(s.resumo.primeiroVencimento)} a ${dataBR(s.resumo.ultimoVencimento)}`,
  'RES.REGRAS_APLICADAS': (s) => (s.regrasAplicadas || []).join(' · '),
});

/**
 * Resolve um código para texto. Código desconhecido é erro de programação,
 * não de dado: falha alto em vez de imprimir uma ficha incompleta.
 */
function resolverCampo(codigo, sim) {
  const extrator = CAMPOS_NEGOCIACAO[codigo];
  if (!extrator) throw new Error(`Campo de ficha desconhecido: ${codigo}`);
  return extrator(sim);
}

module.exports = { CAMPOS_NEGOCIACAO, ROTULO_ETAPA, ROTULO_MEIO, resolverCampo, totaisDaEtapa, brl, dataBR };
