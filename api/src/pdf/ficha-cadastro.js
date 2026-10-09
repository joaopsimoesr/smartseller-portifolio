/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

/**
 * Ficha de Cadastro: template PDF com campos de formulário (AcroForm)
 * nomeados por código, e o preenchimento desses campos.
 *
 * Técnica do MVP: templates com campos codificados, preenchidos por um mapa
 * código → valor, com verificação do mapeamento. Aqui o template é gerado
 * pelo próprio código (sem arquivo binário, sem logo nem nome de cliente).
 *
 * LGPD: os dados pessoais entram, viram PDF e saem na resposta. Nada é
 * gravado, registrado em log ou mantido em memória depois da requisição.
 */

const fs = require('node:fs');
const path = require('node:path');
const fontkit = require('@pdf-lib/fontkit');
const { PDFDocument, PDFName } = require('pdf-lib');
const { MARGEM, LARGURA_UTIL, COR, criarDocumento, Desenhista, rodapes, AVISO_RODAPE } = require('./desenho');

/** Seções com campos [código, rótulo, fração da largura]. */
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
const DATA_TEMPLATE = new Date('2026-01-01T00:00:00Z');

/** Gera o template em branco, com um campo de texto por código. */
async function gerarTemplateCadastro() {
  const { doc, fontes } = await criarDocumento({ titulo: 'Ficha de Cadastro (template)', criadoEm: DATA_TEMPLATE });
  const d = new Desenhista(doc, fontes);
  const pagina = d.novaPagina();
  const form = doc.getForm();

  d.cabecalho('Ficha de Cadastro', 'Modelo genérico de demonstração · campos identificados por código', 'Template v1');

  for (const secao of LAYOUT) {
    d.secao(secao.titulo);
    for (const linha of secao.linhas) {
      d.y -= 8;
      let x = MARGEM;
      for (const [codigo, rotulo, fracao] of linha) {
        const w = LARGURA_UTIL * fracao - (linha.length > 1 ? 10 : 0);
        d.rotulo(rotulo, x);
        const campo = form.createTextField(codigo);
        campo.addToPage(pagina, {
          x,
          y: d.y - 26,
          width: w,
          height: 20,
          font: fontes.texto,
          textColor: COR.royal900,
          backgroundColor: COR.papel,
          borderColor: COR.controle,
          borderWidth: 0.6,
        });
        x += LARGURA_UTIL * fracao;
      }
      d.y -= 34;
    }
  }

  d.assinaturas(['Vendedor(a)', 'Cliente']);
  rodapes(doc, fontes, AVISO_RODAPE);
  return { bytes: await doc.save() };
}

/**
 * Preenche o template por código de campo.
 * - Código enviado que não existe no template → erro (mapeamento quebrado).
 * - Campos do template sem valor → listados em `faltando`.
 * - Com `achatar` (padrão), o resultado não tem formulário: as páginas do
 *   template são copiadas SEM as anotações dos campos para um documento novo,
 *   e cada valor é desenhado na posição do seu campo. (O `form.flatten()` do
 *   pdf-lib deixava referências órfãs na tabela xref, acusadas por leitores
 *   como arquivo corrompido.)
 */
async function preencherTemplate(valores, { achatar = true, geradoEm = new Date() } = {}) {
  const { bytes } = await gerarTemplateCadastro();
  const template = await PDFDocument.load(bytes);
  const form = template.getForm();
  const campos = new Map(form.getFields().map((f) => [f.getName(), f]));

  const desconhecidos = Object.keys(valores).filter((c) => !campos.has(c));
  if (desconhecidos.length) {
    const err = new Error(`Códigos sem campo no template: ${desconhecidos.join(', ')}`);
    err.codigo = 'MAPEAMENTO_INVALIDO';
    throw err;
  }
  const preenchidos = Object.entries(valores).filter(([, v]) => v !== undefined && v !== null && v !== '');
  const faltando = [...campos.keys()].filter((c) => !preenchidos.some(([k]) => k === c));

  if (!achatar) {
    preenchidos.forEach(([codigo, valor]) => form.getTextField(codigo).setText(String(valor)));
    return { bytes: await template.save(), preenchidos: preenchidos.map(([k]) => k), faltando };
  }

  const final = await PDFDocument.create();
  final.registerFontkit(fontkit);
  final.setTitle('Ficha de Cadastro');
  final.setAuthor('João Pedro Simões Rodrigues');
  final.setCreator('SmartSeller (versão de portfólio)');
  final.setProducer('SmartSeller');
  final.setCreationDate(geradoEm);
  final.setModificationDate(geradoEm);
  const fonte = await final.embedFont(fs.readFileSync(path.join(__dirname, 'fontes', 'inter-latin-500-normal.ttf')), { subset: false });

  const indices = template.getPageIndices();
  const paginas = await final.copyPages(template, indices);
  paginas.forEach((p) => {
    p.node.delete(PDFName.of('Annots'));
    final.addPage(p);
  });

  for (const [codigo, valor] of preenchidos) {
    const widget = campos.get(codigo).acroField.getWidgets()[0];
    const { x, y, width, height } = widget.getRectangle();
    const indice = template.getPages().findIndex((p) => p.ref === widget.P());
    const pagina = final.getPage(Math.max(indice, 0));
    let tamanho = 11;
    const texto = String(valor);
    while (tamanho > 6 && fonte.widthOfTextAtSize(texto, tamanho) > width - 10) tamanho -= 0.5;
    pagina.drawText(texto, { x: x + 5, y: y + (height - tamanho) / 2 + 2, size: tamanho, font: fonte, color: COR.royal900 });
  }
  return { bytes: await final.save(), preenchidos: preenchidos.map(([k]) => k), faltando };
}

/** Monta o mapa código → valor a partir do payload validado da API. */
function valoresDoCadastro({ cliente: c, negociacao: n }) {
  const brData = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
  const brl = (v) =>
    v === undefined ? '' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v).replace(/ /g, ' ');
  return {
    'CAD.NOME': c.nome,
    'CAD.CPF': c.cpf,
    'CAD.NASCIMENTO': brData(c.nascimento),
    'CAD.EMAIL': c.email,
    'CAD.TELEFONE': c.telefone,
    'CAD.ENDERECO': c.endereco,
    'CAD.CIDADE': c.cidade,
    'CAD.UF': c.uf,
    'CAD.CEP': c.cep,
    'NEG.EMPREENDIMENTO': n?.empreendimento,
    'NEG.COTAS': n?.cotas === undefined ? '' : String(n.cotas),
    'NEG.VALOR_UNIDADE': brl(n?.valorUnidade),
    'NEG.DATA_VENDA': brData(n?.dataVenda),
  };
}

module.exports = { gerarTemplateCadastro, preencherTemplate, valoresDoCadastro, CODIGOS, LAYOUT };
