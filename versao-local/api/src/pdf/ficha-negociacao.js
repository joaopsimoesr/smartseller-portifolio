// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

/**
 * Gera a Ficha de Negociação em PDF a partir de uma simulação.
 *
 * - O PDF é desenhado do zero com pdf-lib (sem template de terceiros).
 * - O layout referencia campos por código (ver campos.js).
 * - O cronograma pagina sozinho, repetindo o cabeçalho da tabela.
 * - Fontes padrão do PDF (Helvetica) usam WinAnsi: o texto é sanitizado
 *   para nunca quebrar a geração com um caractere fora da codificação.
 */

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { resolverCampo, totaisDaEtapa, ROTULO_ETAPA, brl, dataBR } = require('./campos');

const A4 = { largura: 595.28, altura: 841.89 };
const MARGEM = 48;
const LARGURA_UTIL = A4.largura - 2 * MARGEM;
const RODAPE = 40;

const COR = {
  texto: rgb(0.12, 0.16, 0.22),
  suave: rgb(0.42, 0.45, 0.5),
  linha: rgb(0.85, 0.87, 0.9),
  faixa: rgb(0.96, 0.97, 0.98),
  marca: rgb(0.16, 0.32, 0.6),
  alerta: {
    info: rgb(0.42, 0.45, 0.5),
    aviso: rgb(0.7, 0.45, 0.05),
    atencao: rgb(0.8, 0.35, 0.05),
    bloqueante: rgb(0.75, 0.1, 0.1),
  },
};

const CP1252_EXTRAS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

/** Troca caracteres que a Helvetica padrão (WinAnsi) não codifica. */
function seguro(texto) {
  return [...String(texto)]
    .map((c) => (c.charCodeAt(0) <= 0xff || CP1252_EXTRAS.has(c) ? c : '?'))
    .join('');
}

const ETAPAS = ['PRIMEIRA_ENTRADA', 'SEGUNDA_ENTRADA', 'ENTRADA_RESTANTE', 'SINAL', 'SALDO'];

const BLOCO_NEGOCIACAO = [
  ['Empreendimento', 'NEG.EMPREENDIMENTO'],
  ['Categoria', 'NEG.CATEGORIA'],
  ['Modelo', 'NEG.MODELO'],
  ['Cotas', 'NEG.COTAS'],
  ['Data da venda', 'NEG.DATA_VENDA'],
  ['Valor da unidade', 'NEG.VALOR_UNIDADE'],
];

const BLOCO_TOTAIS = [
  ['Entrada', 'RES.ENTRADA'],
  ['Sinal', 'RES.SINAL'],
  ['Saldo', 'RES.SALDO'],
  ['Total do plano', 'RES.TOTAL'],
  ['Parcelas', 'RES.PARCELAS'],
  ['Período', 'RES.PERIODO'],
];

/** Colunas do cronograma: [título, largura, alinhamento, extrator]. */
const COLUNAS_CRONOGRAMA = [
  ['#', 30, 'dir', (p, i) => String(i + 1)],
  ['Etapa', 130, 'esq', (p) => ROTULO_ETAPA[p.etapa] ?? p.etapa],
  ['Parcela', 70, 'esq', (p) => `${p.parcela}/${p.totalParcelas}`],
  ['Vencimento', 90, 'esq', (p) => dataBR(p.vencimento)],
  ['Meio', 80, 'esq', (p) => p.meioPagamento ?? ''],
  ['Valor', LARGURA_UTIL - 400, 'dir', (p) => brl(p.valor)],
];

class Desenhista {
  constructor(doc, fontes) {
    this.doc = doc;
    this.fontes = fontes;
    this.pagina = null;
    this.y = 0;
  }

  novaPagina() {
    this.pagina = this.doc.addPage([A4.largura, A4.altura]);
    this.y = A4.altura - MARGEM;
  }

  /** Garante espaço vertical; abre página nova se faltar. Retorna true se abriu. */
  reservar(altura) {
    if (this.y - altura < MARGEM + RODAPE) {
      this.novaPagina();
      return true;
    }
    return false;
  }

  texto(t, x, { tamanho = 10, negrito = false, cor = COR.texto, alinhar = 'esq', largura = 0 } = {}) {
    const fonte = negrito ? this.fontes.negrito : this.fontes.normal;
    const s = seguro(t);
    const w = fonte.widthOfTextAtSize(s, tamanho);
    const xFinal = alinhar === 'dir' ? x + largura - w : x;
    this.pagina.drawText(s, { x: xFinal, y: this.y, size: tamanho, font: fonte, color: cor });
  }

  /** Quebra o texto em linhas que cabem em `largura`. */
  quebrar(t, largura, tamanho) {
    const palavras = seguro(t).split(/\s+/);
    const linhas = [];
    let atual = '';
    for (const p of palavras) {
      const tentativa = atual ? `${atual} ${p}` : p;
      if (this.fontes.normal.widthOfTextAtSize(tentativa, tamanho) > largura && atual) {
        linhas.push(atual);
        atual = p;
      } else {
        atual = tentativa;
      }
    }
    if (atual) linhas.push(atual);
    return linhas;
  }

  linhaHorizontal(cor = COR.linha) {
    this.pagina.drawLine({
      start: { x: MARGEM, y: this.y },
      end: { x: A4.largura - MARGEM, y: this.y },
      thickness: 0.6,
      color: cor,
    });
  }

  tituloSecao(t) {
    this.reservar(36);
    this.y -= 22;
    this.texto(t.toUpperCase(), MARGEM, { tamanho: 9, negrito: true, cor: COR.marca });
    this.y -= 6;
    this.linhaHorizontal(COR.marca);
    this.y -= 14;
  }

  /** Grade rótulo/valor em duas colunas, valores vindos de códigos de campo. */
  grade(pares, sim) {
    const meia = LARGURA_UTIL / 2;
    for (let i = 0; i < pares.length; i += 2) {
      this.reservar(18);
      pares.slice(i, i + 2).forEach(([rotulo, codigo], j) => {
        const x = MARGEM + j * meia;
        this.texto(rotulo, x, { tamanho: 8, cor: COR.suave });
        this.texto(resolverCampo(codigo, sim), x + 95, { tamanho: 10, negrito: true });
      });
      this.y -= 16;
    }
  }
}

function desenharCabecalho(d, sim, geradoEm) {
  d.pagina.drawRectangle({ x: 0, y: A4.altura - 6, width: A4.largura, height: 6, color: COR.marca });
  d.texto('Ficha de Negociação', MARGEM, { tamanho: 18, negrito: true });
  d.texto(`Gerada em ${dataBR(geradoEm)}`, MARGEM, {
    tamanho: 9,
    cor: COR.suave,
    alinhar: 'dir',
    largura: LARGURA_UTIL,
  });
  d.y -= 16;
  d.texto(`SmartSeller · simulação com regras e dados fictícios · regras ${sim.regrasVersao}`, MARGEM, {
    tamanho: 9,
    cor: COR.suave,
  });
  d.y -= 4;
}

function desenharResumoPorEtapa(d, sim) {
  const cols = [MARGEM, MARGEM + 170, MARGEM + 260, MARGEM + 370];
  d.reservar(18);
  ['Etapa', 'Parcelas', '1º vencimento', 'Total'].forEach((t, i) =>
    d.texto(t, cols[i], {
      tamanho: 8,
      negrito: true,
      cor: COR.suave,
      alinhar: i === 3 ? 'dir' : 'esq',
      largura: i === 3 ? LARGURA_UTIL - 370 : 0,
    }),
  );
  d.y -= 14;
  for (const etapa of ETAPAS) {
    const t = totaisDaEtapa(sim, etapa);
    if (t.quantidade === 0) continue;
    d.reservar(16);
    d.texto(ROTULO_ETAPA[etapa], cols[0]);
    d.texto(String(t.quantidade), cols[1]);
    d.texto(dataBR(t.primeira), cols[2]);
    d.texto(brl(t.total), cols[3], { alinhar: 'dir', largura: LARGURA_UTIL - 370 });
    d.y -= 15;
  }
}

function desenharAlertas(d, sim) {
  if (sim.alertas.length === 0) {
    d.reservar(16);
    d.texto('Nenhum alerta de política comercial.', MARGEM, { cor: COR.suave });
    d.y -= 14;
    return;
  }
  for (const a of sim.alertas) {
    const linhas = d.quebrar(a.mensagem, LARGURA_UTIL - 90, 9);
    d.reservar(14 * linhas.length + 4);
    d.texto(a.severidade.toUpperCase(), MARGEM, { tamanho: 8, negrito: true, cor: COR.alerta[a.severidade] ?? COR.suave });
    linhas.forEach((l, i) => {
      if (i > 0) d.y -= 12;
      d.texto(l, MARGEM + 90, { tamanho: 9 });
    });
    d.y -= 16;
  }
}

function desenharCabecalhoTabela(d) {
  d.pagina.drawRectangle({ x: MARGEM, y: d.y - 4, width: LARGURA_UTIL, height: 16, color: COR.faixa });
  let x = MARGEM + 4;
  for (const [titulo, largura, alinhar] of COLUNAS_CRONOGRAMA) {
    d.texto(titulo, x, { tamanho: 8, negrito: true, cor: COR.suave, alinhar, largura: largura - 8 });
    x += largura;
  }
  d.y -= 18;
}

function desenharCronograma(d, sim) {
  d.reservar(40);
  desenharCabecalhoTabela(d);
  sim.cronograma.forEach((p, i) => {
    if (d.reservar(14)) desenharCabecalhoTabela(d);
    let x = MARGEM + 4;
    for (const [, largura, alinhar, extrair] of COLUNAS_CRONOGRAMA) {
      d.texto(extrair(p, i), x, { tamanho: 9, alinhar, largura: largura - 8 });
      x += largura;
    }
    d.y -= 13;
  });
}

function desenharAssinaturas(d) {
  d.reservar(90);
  d.y -= 60;
  const largura = (LARGURA_UTIL - 40) / 2;
  ['Vendedor(a)', 'Cliente'].forEach((rotulo, i) => {
    const x = MARGEM + i * (largura + 40);
    d.pagina.drawLine({ start: { x, y: d.y }, end: { x: x + largura, y: d.y }, thickness: 0.6, color: COR.texto });
    d.y -= 12;
    d.texto(rotulo, x, { tamanho: 8, cor: COR.suave });
    d.y += 12;
  });
  d.y -= 12;
}

function desenharRodapes(doc, fontes) {
  const paginas = doc.getPages();
  paginas.forEach((pag, i) => {
    const tamanho = 7.5;
    const esquerda = seguro('Documento de demonstração, sem valor comercial · © João Pedro Simões Rodrigues');
    const direita = `Página ${i + 1} de ${paginas.length}`;
    pag.drawText(esquerda, { x: MARGEM, y: MARGEM - 14, size: tamanho, font: fontes.normal, color: COR.suave });
    pag.drawText(direita, {
      x: A4.largura - MARGEM - fontes.normal.widthOfTextAtSize(direita, tamanho),
      y: MARGEM - 14,
      size: tamanho,
      font: fontes.normal,
      color: COR.suave,
    });
  });
}

/**
 * @param {object} sim    resultado de simularPlanoPadrao/simularModeloLinear
 * @param {object} [opcoes]
 * @param {string} [opcoes.geradoEm]  data ISO (AAAA-MM-DD); padrão: hoje (UTC)
 * @returns {Promise<Uint8Array>}
 */
async function gerarFichaNegociacao(sim, { geradoEm = new Date().toISOString().slice(0, 10) } = {}) {
  const doc = await PDFDocument.create();
  doc.setTitle(seguro(`Ficha de Negociação - ${sim.empreendimento.nome}`));
  doc.setAuthor('João Pedro Simões Rodrigues');
  doc.setSubject('Simulação de plano de pagamento (dados fictícios)');
  doc.setCreator('SmartSeller (portfólio)');
  // Datas fixas tornam o arquivo reprodutível para a mesma simulação.
  const instante = new Date(`${geradoEm}T00:00:00Z`);
  doc.setCreationDate(instante);
  doc.setModificationDate(instante);

  const fontes = {
    normal: await doc.embedFont(StandardFonts.Helvetica),
    negrito: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const d = new Desenhista(doc, fontes);
  d.novaPagina();

  desenharCabecalho(d, sim, geradoEm);
  d.tituloSecao('Negociação');
  d.grade(BLOCO_NEGOCIACAO, sim);
  d.tituloSecao('Totais');
  d.grade(BLOCO_TOTAIS, sim);
  d.tituloSecao('Resumo por etapa');
  desenharResumoPorEtapa(d, sim);
  d.tituloSecao('Alertas');
  desenharAlertas(d, sim);
  d.tituloSecao('Cronograma de parcelas');
  desenharCronograma(d, sim);
  desenharAssinaturas(d);
  desenharRodapes(doc, fontes);

  return doc.save();
}

module.exports = { gerarFichaNegociacao, seguro };
