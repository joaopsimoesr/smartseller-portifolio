// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

/**
 * Ficha de Cadastro: template PDF genérico com campos de formulário
 * (AcroForm) nomeados por código, e o preenchimento desses campos.
 *
 * Origem da técnica: pdf-service.js / PDFMappingModule do piloto, que
 * preenchia templates PDF com campos codificados e validava o mapeamento.
 * Aqui o template é gerado pelo próprio código (sem arquivo binário, sem logo
 * nem nome de cliente), então qualquer pessoa reproduz o mesmo resultado.
 */

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { seguro } = require('./ficha-negociacao');

const A4 = { largura: 595.28, altura: 841.89 };
const MARGEM = 48;

/** Layout do template: seções com campos [código, rótulo, largura relativa]. */
const LAYOUT = Object.freeze([
  {
    titulo: 'Dados pessoais',
    linhas: [
      [['CAD.NOME', 'Nome completo', 1]],
      [['CAD.CPF', 'CPF', 0.5], ['CAD.NASCIMENTO', 'Data de nascimento', 0.5]],
      [['CAD.EMAIL', 'E-mail', 0.6], ['CAD.TELEFONE', 'Telefone', 0.4]],
    ],
  },
  {
    titulo: 'Endereço',
    linhas: [
      [['CAD.ENDERECO', 'Logradouro e número', 1]],
      [['CAD.CIDADE', 'Cidade', 0.6], ['CAD.UF', 'UF', 0.15], ['CAD.CEP', 'CEP', 0.25]],
    ],
  },
  {
    titulo: 'Negociação',
    linhas: [
      [['NEG.EMPREENDIMENTO', 'Empreendimento', 0.6], ['NEG.COTAS', 'Cotas', 0.4]],
      [['NEG.VALOR_UNIDADE', 'Valor da unidade', 0.5], ['NEG.DATA_VENDA', 'Data da venda', 0.5]],
    ],
  },
]);

const CODIGOS = Object.freeze(LAYOUT.flatMap((s) => s.linhas.flat().map(([codigo]) => codigo)));

/** Gera o template em branco, com um campo de texto por código. */
async function gerarTemplateCadastro() {
  const doc = await PDFDocument.create();
  doc.setTitle('Ficha de Cadastro (template)');
  doc.setAuthor('João Pedro Simões Rodrigues');
  doc.setCreationDate(new Date('2026-01-01T00:00:00Z'));
  doc.setModificationDate(new Date('2026-01-01T00:00:00Z'));
  const pagina = doc.addPage([A4.largura, A4.altura]);
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const form = doc.getForm();
  const largura = A4.largura - 2 * MARGEM;
  const cinza = rgb(0.42, 0.45, 0.5);
  const azul = rgb(0.16, 0.32, 0.6);

  pagina.drawRectangle({ x: 0, y: A4.altura - 6, width: A4.largura, height: 6, color: azul });
  let y = A4.altura - MARGEM;
  pagina.drawText('Ficha de Cadastro', { x: MARGEM, y, size: 18, font: negrito });
  y -= 16;
  pagina.drawText(seguro('SmartSeller · modelo genérico de demonstração'), { x: MARGEM, y, size: 9, font: fonte, color: cinza });
  y -= 10;

  for (const secao of LAYOUT) {
    y -= 26;
    pagina.drawText(secao.titulo.toUpperCase(), { x: MARGEM, y, size: 9, font: negrito, color: azul });
    y -= 6;
    pagina.drawLine({ start: { x: MARGEM, y }, end: { x: MARGEM + largura, y }, thickness: 0.6, color: azul });
    for (const linha of secao.linhas) {
      y -= 40;
      let x = MARGEM;
      for (const [codigo, rotulo, fracao] of linha) {
        const w = largura * fracao - (linha.length > 1 ? 8 : 0);
        pagina.drawText(seguro(rotulo), { x, y: y + 24, size: 8, font: fonte, color: cinza });
        const campo = form.createTextField(codigo);
        campo.addToPage(pagina, { x, y, width: w, height: 20, font: fonte, borderColor: rgb(0.8, 0.82, 0.86), borderWidth: 0.6 });
        x += largura * fracao;
      }
    }
  }

  y -= 70;
  const metade = (largura - 40) / 2;
  ['Vendedor(a)', 'Cliente'].forEach((rotulo, i) => {
    const x = MARGEM + i * (metade + 40);
    pagina.drawLine({ start: { x, y }, end: { x: x + metade, y }, thickness: 0.6, color: rgb(0.12, 0.16, 0.22) });
    pagina.drawText(rotulo, { x, y: y - 12, size: 8, font: fonte, color: cinza });
  });
  pagina.drawText(seguro('Documento de demonstração, sem valor comercial · © João Pedro Simões Rodrigues'), {
    x: MARGEM,
    y: MARGEM - 14,
    size: 7.5,
    font: fonte,
    color: cinza,
  });

  return doc.save();
}

/**
 * Preenche um template por código de campo.
 * - Código enviado que não existe no template → erro (mapeamento quebrado).
 * - Campos do template sem valor → listados em `faltando`.
 * @param {Uint8Array} template
 * @param {Record<string, string>} valores
 * @param {{achatar?: boolean}} [opcoes] achatar = campos viram texto fixo
 */
async function preencherTemplate(template, valores, { achatar = true } = {}) {
  const doc = await PDFDocument.load(template);
  const form = doc.getForm();
  const existentes = new Set(form.getFields().map((f) => f.getName()));

  const desconhecidos = Object.keys(valores).filter((c) => !existentes.has(c));
  if (desconhecidos.length) {
    const err = new Error(`Códigos sem campo no template: ${desconhecidos.join(', ')}`);
    err.codigo = 'MAPEAMENTO_INVALIDO';
    throw err;
  }

  const preenchidos = [];
  for (const [codigo, valor] of Object.entries(valores)) {
    if (valor === undefined || valor === null || valor === '') continue;
    form.getTextField(codigo).setText(seguro(valor));
    preenchidos.push(codigo);
  }
  const faltando = [...existentes].filter((c) => !preenchidos.includes(c));
  if (achatar) form.flatten();
  return { bytes: await doc.save(), preenchidos, faltando };
}

module.exports = { gerarTemplateCadastro, preencherTemplate, CODIGOS, LAYOUT };
