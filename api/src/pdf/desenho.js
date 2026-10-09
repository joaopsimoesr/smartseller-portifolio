/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

/**
 * Base visual das fichas: a mesma linguagem do frontend (design system
 * Leginova com paleta azul royal e verde), aplicada ao PDF.
 *
 * - Fontes TTF embutidas (Inter, EB Garamond, JetBrains Mono; SIL OFL 1.1, em
 *   ./fontes/licencas). Com fonte própria, acentos e "ª", "º", "—" saem
 *   corretos, sem a sanitização que a Helvetica padrão (WinAnsi) exigiria.
 * - Paginação automática com reserva de espaço e rodapé em todas as páginas.
 */

const fs = require('node:fs');
const path = require('node:path');
const fontkit = require('@pdf-lib/fontkit');
const { PDFDocument, rgb } = require('pdf-lib');

const A4 = Object.freeze({ largura: 595.28, altura: 841.89 });
const MARGEM = 48;
const LARGURA_UTIL = A4.largura - 2 * MARGEM;
const ALTURA_RODAPE = 36;

const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

/** Mesmos tokens de web/src/index.css. */
const COR = Object.freeze({
  papel: hex('#faf8f3'),
  faixa: hex('#eef1f7'),
  royal950: hex('#0b1a4a'),
  royal900: hex('#13246b'),
  royal700: hex('#2342b0'),
  royal500: hex('#4c6fe0'),
  verde800: hex('#0f5a3f'),
  verde600: hex('#1e8a5e'),
  tinta: hex('#171b26'),
  suave: hex('#5b6072'),
  linha: hex('#dfdfe4'),
  controle: hex('#868c9e'),
  aviso: hex('#b7791f'),
  risco: hex('#a8321f'),
});

const ARQUIVOS_FONTE = Object.freeze({
  texto: 'inter-latin-400-normal.ttf',
  forte: 'inter-latin-500-normal.ttf',
  titulo: 'eb-garamond-latin-500-normal.ttf',
  mono: 'jetbrains-mono-latin-500-normal.ttf',
});

const bytesDasFontes = Object.fromEntries(
  Object.entries(ARQUIVOS_FONTE).map(([k, arq]) => [k, fs.readFileSync(path.join(__dirname, 'fontes', arq))]),
);

/** Novo documento com metadados e fontes TTF embutidas (sem subsetting: o subset do fontkit falha com estas fontes). */
async function criarDocumento({ titulo, criadoEm }) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(titulo);
  doc.setAuthor('João Pedro Simões Rodrigues');
  doc.setCreator('SmartSeller (versão de portfólio)');
  doc.setProducer('SmartSeller');
  doc.setCreationDate(criadoEm);
  doc.setModificationDate(criadoEm);
  const fontes = {};
  for (const [k, bytes] of Object.entries(bytesDasFontes)) {
    fontes[k] = await doc.embedFont(bytes, { subset: false });
  }
  return { doc, fontes };
}

/** Octógono (marcador do sistema) centrado em (cx, cy). */
function octogono(pagina, cx, cy, raio, cor) {
  const k = raio * 0.4142;
  const pts = [
    [-k, raio], [k, raio], [raio, k], [raio, -k], [k, -raio], [-k, -raio], [-raio, -k], [-raio, k],
  ];
  const d = `M ${pts.map(([x, y]) => `${x} ${-y}`).join(' L ')} Z`;
  pagina.drawSvgPath(d, { x: cx, y: cy, color: cor, borderWidth: 0 });
}

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
    return this.pagina;
  }

  /** Garante espaço vertical; abre página nova se faltar. Retorna true se abriu. */
  reservar(altura) {
    if (this.y - altura < MARGEM + ALTURA_RODAPE) {
      this.novaPagina();
      return true;
    }
    return false;
  }

  largura(t, { fonte = 'texto', tamanho = 10 } = {}) {
    return this.fontes[fonte].widthOfTextAtSize(String(t), tamanho);
  }

  texto(t, x, { fonte = 'texto', tamanho = 10, cor = COR.tinta, alinhar = 'esq', largura = 0, espacamento = 0 } = {}) {
    const s = String(t);
    let w = this.largura(s, { fonte, tamanho });
    if (espacamento) w += espacamento * (s.length - 1);
    const xFinal = alinhar === 'dir' ? x + largura - w : x;
    if (!espacamento) {
      this.pagina.drawText(s, { x: xFinal, y: this.y, size: tamanho, font: this.fontes[fonte], color: cor });
      return;
    }
    // Tracking manual para os rótulos em mono caixa alta (eyebrow).
    let cx = xFinal;
    for (const c of s) {
      this.pagina.drawText(c, { x: cx, y: this.y, size: tamanho, font: this.fontes[fonte], color: cor });
      cx += this.largura(c, { fonte, tamanho }) + espacamento;
    }
  }

  /** Rótulo em mono, caixa alta, com tracking: o "eyebrow" do design system. */
  rotulo(t, x, { cor = COR.suave, tamanho = 7, alinhar = 'esq', largura = 0 } = {}) {
    this.texto(String(t).toUpperCase(), x, { fonte: 'mono', tamanho, cor, espacamento: tamanho * 0.1, alinhar, largura });
  }

  /** Quebra o texto em linhas que cabem em `largura`. */
  quebrar(t, largura, { fonte = 'texto', tamanho = 10 } = {}) {
    const linhas = [];
    let atual = '';
    for (const p of String(t).split(/\s+/)) {
      const tentativa = atual ? `${atual} ${p}` : p;
      if (this.largura(tentativa, { fonte, tamanho }) > largura && atual) {
        linhas.push(atual);
        atual = p;
      } else atual = tentativa;
    }
    if (atual) linhas.push(atual);
    return linhas;
  }

  linha(x1, x2, { cor = COR.linha, espessura = 0.6 } = {}) {
    this.pagina.drawLine({ start: { x: x1, y: this.y }, end: { x: x2, y: this.y }, thickness: espessura, color: cor });
  }

  /** Título de seção: eyebrow mono + linha fina. */
  secao(t) {
    this.reservar(44);
    this.y -= 26;
    this.rotulo(t, MARGEM, { cor: COR.royal700, tamanho: 7.5 });
    this.y -= 7;
    this.linha(MARGEM, MARGEM + LARGURA_UTIL, { cor: COR.linha });
    this.y -= 16;
  }

  /** Cabeçalho de documento: marca, título em Garamond, subtítulo. */
  cabecalho(titulo, subtitulo, direita) {
    const p = this.pagina;
    p.drawRectangle({ x: 0, y: A4.altura - 5, width: A4.largura, height: 5, color: COR.royal900 });
    octogono(p, MARGEM + 4, this.y + 4, 4, COR.verde600);
    this.texto('SmartSeller', MARGEM + 14, { fonte: 'titulo', tamanho: 11, cor: COR.royal900 });
    if (direita) this.rotulo(direita, MARGEM, { alinhar: 'dir', largura: LARGURA_UTIL });
    this.y -= 34;
    this.texto(titulo, MARGEM, { fonte: 'titulo', tamanho: 24, cor: COR.royal900 });
    this.y -= 16;
    this.texto(subtitulo, MARGEM, { tamanho: 9, cor: COR.suave });
    this.y -= 4;
  }

  /** Grade de pares rótulo/valor em `colunas` colunas. */
  grade(pares, { colunas = 2 } = {}) {
    const w = LARGURA_UTIL / colunas;
    for (let i = 0; i < pares.length; i += colunas) {
      this.reservar(30);
      const grupo = pares.slice(i, i + colunas);
      grupo.forEach(([rotulo], j) => this.rotulo(rotulo, MARGEM + j * w));
      this.y -= 13;
      grupo.forEach(([, valor, opcoes = {}], j) =>
        this.texto(valor, MARGEM + j * w, { fonte: 'forte', tamanho: opcoes.tamanho ?? 11, cor: opcoes.cor ?? COR.royal900 }),
      );
      this.y -= 16;
    }
  }

  /** Linhas de assinatura. */
  assinaturas(rotulos) {
    this.reservar(80);
    this.y -= 56;
    const larg = (LARGURA_UTIL - 40) / rotulos.length;
    rotulos.forEach((r, i) => {
      const x = MARGEM + i * (larg + 40);
      this.pagina.drawLine({ start: { x, y: this.y }, end: { x: x + larg - (rotulos.length > 1 ? 0 : 40), y: this.y }, thickness: 0.6, color: COR.tinta });
    });
    this.y -= 12;
    rotulos.forEach((r, i) => this.rotulo(r, MARGEM + i * (larg + 40)));
  }
}

/** Rodapé em todas as páginas: aviso, autoria e "Página X de N". */
function rodapes(doc, fontes, texto) {
  const paginas = doc.getPages();
  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: MARGEM, y: MARGEM }, end: { x: A4.largura - MARGEM, y: MARGEM }, thickness: 0.5, color: COR.linha });
    p.drawText(texto, { x: MARGEM, y: MARGEM - 14, size: 7, font: fontes.texto, color: COR.suave });
    const pag = `Página ${i + 1} de ${paginas.length}`;
    const w = fontes.mono.widthOfTextAtSize(pag, 7);
    p.drawText(pag, { x: A4.largura - MARGEM - w, y: MARGEM - 14, size: 7, font: fontes.mono, color: COR.suave });
  });
}

const AVISO_RODAPE = 'Documento de demonstração, sem valor comercial · regras e dados fictícios · © 2025–2026 João Pedro Simões Rodrigues';

module.exports = { A4, MARGEM, LARGURA_UTIL, COR, criarDocumento, Desenhista, octogono, rodapes, AVISO_RODAPE };
