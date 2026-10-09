/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

/**
 * Ficha de Negociação em PDF, gerada no servidor a partir de uma simulação.
 *
 * - Desenhada do zero (sem template de terceiros, sem logo de cliente).
 * - Os valores vêm de códigos de campo (campos.js), não do layout.
 * - O cronograma pagina sozinho e repete o cabeçalho da tabela.
 * - Determinística: mesma simulação + mesma data de geração → mesmo PDF.
 */

const { MARGEM, LARGURA_UTIL, COR, criarDocumento, Desenhista, octogono, rodapes, AVISO_RODAPE } = require('./desenho');
const { resolverCampo, totaisDaEtapa, ROTULO_ETAPA, ROTULO_MEIO, brl, dataBR } = require('./campos');

const ETAPAS = ['PRIMEIRA_ENTRADA', 'SEGUNDA_ENTRADA', 'ENTRADA_RESTANTE', 'SINAL', 'SALDO'];

/** Ponto de cada etapa: mesma escala do frontend (diferem em luminosidade). */
const PONTO_ETAPA = Object.freeze({
  PRIMEIRA_ENTRADA: COR.verde600,
  SEGUNDA_ENTRADA: COR.verde800,
  ENTRADA_RESTANTE: COR.royal500,
  SINAL: COR.royal700,
  SALDO: COR.royal950,
});

const ALERTA = Object.freeze({
  info: { rotulo: 'Informação', cor: COR.royal500 },
  aviso: { rotulo: 'Aviso', cor: COR.aviso },
  atencao: { rotulo: 'Aprovação', cor: COR.aviso },
  bloqueante: { rotulo: 'Bloqueante', cor: COR.risco },
});

/** Colunas do cronograma: [título, largura, alinhamento, extrator]. */
const COLUNAS = [
  ['Nº', 34, 'dir', (_p, i) => String(i + 1).padStart(2, '0')],
  ['Etapa', 136, 'esq', (p) => ROTULO_ETAPA[p.etapa]],
  ['Parcela', 66, 'esq', (p) => `${String(p.parcela).padStart(2, '0')}/${String(p.totalParcelas).padStart(2, '0')}`],
  ['Vencimento', 86, 'esq', (p) => dataBR(p.vencimento)],
  ['Meio', 70, 'esq', (p) => (p.meioPagamento ? ROTULO_MEIO[p.meioPagamento] : '—')],
  ['Valor', LARGURA_UTIL - 392, 'dir', (p) => brl(p.valor)],
];

function cabecalhoTabela(d) {
  d.pagina.drawRectangle({ x: MARGEM, y: d.y - 5, width: LARGURA_UTIL, height: 17, color: COR.faixa });
  let x = MARGEM + 6;
  for (const [titulo, largura, alinhar] of COLUNAS) {
    d.rotulo(titulo, x, { alinhar, largura: largura - 12 });
    x += largura;
  }
  d.y -= 19;
}

function cronograma(d, sim) {
  d.reservar(48);
  cabecalhoTabela(d);
  sim.cronograma.forEach((p, i) => {
    if (d.reservar(15)) cabecalhoTabela(d);
    let x = MARGEM + 6;
    COLUNAS.forEach(([, largura, alinhar, extrair], c) => {
      if (c === 1) octogono(d.pagina, x + 3, d.y + 3, 2.6, PONTO_ETAPA[p.etapa]);
      const opcoes = { tamanho: 8.5, alinhar, largura: largura - 12 };
      if (c === 0 || c === 2) Object.assign(opcoes, { fonte: 'mono', tamanho: 7.5, cor: COR.suave });
      if (c === 5) Object.assign(opcoes, { fonte: 'forte', cor: COR.royal900 });
      d.texto(extrair(p, i), c === 1 ? x + 10 : x, opcoes);
      x += largura;
    });
    d.y -= 6;
    d.linha(MARGEM, MARGEM + LARGURA_UTIL);
    d.y -= 9;
  });
}

function resumoPorEtapa(d, sim) {
  const cols = [MARGEM, MARGEM + 180, MARGEM + 260, MARGEM + 370];
  d.reservar(20);
  ['Etapa', 'Parcelas', '1º vencimento', 'Total'].forEach((t, i) =>
    d.rotulo(t, cols[i], i === 3 ? { alinhar: 'dir', largura: LARGURA_UTIL - 370 } : {}),
  );
  d.y -= 15;
  ETAPAS.forEach((etapa) => {
    const t = totaisDaEtapa(sim, etapa);
    if (t.quantidade === 0) return;
    d.reservar(16);
    octogono(d.pagina, cols[0] + 3, d.y + 3, 2.8, PONTO_ETAPA[etapa]);
    d.texto(ROTULO_ETAPA[etapa], cols[0] + 11, { tamanho: 9.5 });
    d.texto(String(t.quantidade), cols[1], { fonte: 'mono', tamanho: 8.5 });
    d.texto(dataBR(t.primeira), cols[2], { tamanho: 9.5 });
    d.texto(brl(t.total), cols[3], { fonte: 'forte', tamanho: 9.5, cor: COR.royal900, alinhar: 'dir', largura: LARGURA_UTIL - 370 });
    d.y -= 16;
  });
}

function alertas(d, sim) {
  if (sim.alertas.length === 0) {
    d.reservar(16);
    d.texto('Nenhum alerta de política comercial.', MARGEM, { tamanho: 9.5, cor: COR.suave });
    d.y -= 14;
    return;
  }
  sim.alertas.forEach((a) => {
    const est = ALERTA[a.severidade] ?? ALERTA.info;
    const linhas = d.quebrar(a.mensagem, LARGURA_UTIL - 110, { tamanho: 9.5 });
    d.reservar(14 * linhas.length + 8);
    octogono(d.pagina, MARGEM + 4, d.y + 3, 3.2, est.cor);
    d.rotulo(`${est.rotulo}${a.regra ? ` · ${a.regra}` : ''}`, MARGEM + 14, { cor: est.cor === COR.aviso ? COR.tinta : est.cor });
    linhas.forEach((l, i) => {
      if (i > 0) d.y -= 13;
      d.texto(l, MARGEM + 110, { tamanho: 9.5 });
    });
    d.y -= 18;
  });
}

/**
 * @param {object} sim resultado de simularPlanoPadrao ou simularModeloLinear
 * @param {{geradoEm?: Date}} [opcoes] data de geração (fixa nos exemplos e testes)
 * @returns {Promise<Uint8Array>}
 */
async function gerarFichaNegociacao(sim, { geradoEm = new Date() } = {}) {
  const { doc, fontes } = await criarDocumento({ titulo: `Ficha de Negociação — ${sim.empreendimento.nome}`, criadoEm: geradoEm });
  const d = new Desenhista(doc, fontes);
  d.novaPagina();

  d.cabecalho(
    'Ficha de Negociação',
    `Plano de pagamento simulado · regras ${resolverCampo('NEG.REGRAS_VERSAO', sim)} (fictícias)`,
    `Gerada em ${dataBR(geradoEm.toISOString().slice(0, 10))}`,
  );

  d.secao('Negociação');
  d.grade(
    [
      ['Empreendimento', resolverCampo('NEG.EMPREENDIMENTO', sim)],
      ['Categoria', resolverCampo('NEG.CATEGORIA', sim)],
      ['Modelo', resolverCampo('NEG.MODELO', sim)],
      ['Cotas', resolverCampo('NEG.COTAS', sim)],
      ['Data da venda', resolverCampo('NEG.DATA_VENDA', sim)],
      ['Valor da unidade', resolverCampo('NEG.VALOR_UNIDADE', sim)],
    ],
    { colunas: 3 },
  );

  d.secao('Totais');
  d.grade(
    [
      ['Entrada', resolverCampo('RES.ENTRADA', sim)],
      ['Sinal', resolverCampo('RES.SINAL', sim)],
      ['Saldo', resolverCampo('RES.SALDO', sim)],
      ['Total do plano', resolverCampo('RES.TOTAL', sim), { cor: COR.verde800 }],
      ['Parcelas', resolverCampo('RES.PARCELAS', sim)],
      ['Período', resolverCampo('RES.PERIODO', sim)],
    ],
    { colunas: 3 },
  );
  d.y += 4;
  d.texto(`Entrada: ${resolverCampo('RES.ENTRADA_REGRA', sim)} · Sinal: ${resolverCampo('RES.SINAL_PERCENTUAL', sim)}`, MARGEM, {
    tamanho: 8.5,
    cor: COR.suave,
  });
  d.y -= 6;

  d.secao('Resumo por etapa');
  resumoPorEtapa(d, sim);

  d.secao('Alertas da política comercial');
  alertas(d, sim);

  d.secao('Cronograma de parcelas');
  cronograma(d, sim);

  d.reservar(30);
  d.y -= 10;
  d.rotulo(`Regras aplicadas: ${resolverCampo('RES.REGRAS_APLICADAS', sim)}`, MARGEM);

  d.assinaturas(['Vendedor(a)', 'Cliente']);
  rodapes(doc, fontes, AVISO_RODAPE);
  return doc.save();
}

module.exports = { gerarFichaNegociacao, COLUNAS };
