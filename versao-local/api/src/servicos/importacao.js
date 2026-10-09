// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

/**
 * Importação de tabelas de preço a partir de CSV (texto).
 *
 * Origem: tools/venture-table-importer.js + scripts de seed do backend, que
 * liam as planilhas comerciais. Aqui o formato é próprio e fictício, sem
 * dependências: separador ";" ou ",", valores no formato brasileiro.
 */

const { ErroDeRegra } = require('../regras/erros');

const COLUNAS = {
  LINEAR: [
    'categoria_preco',
    'valor_cota',
    'total_meses',
    'entrada_parcelas',
    'entrada_valor_cota',
    'sinal_parcelas',
    'sinal_valor_cota',
    'saldo_parcelas',
    'saldo_parcela_cota',
  ],
  EXCECOES: ['valor_por_cota'],
};

/** Divide uma linha CSV respeitando aspas. */
function dividirLinha(linha, sep) {
  const campos = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i];
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') {
        atual += '"';
        i += 1;
      } else aspas = !aspas;
    } else if (c === sep && !aspas) {
      campos.push(atual.trim());
      atual = '';
    } else atual += c;
  }
  campos.push(atual.trim());
  return campos;
}

/** "1.234,56" → 1234.56 ; "1234.56" → 1234.56 ; "" → 0 */
function numeroBR(texto, onde) {
  const limpo = String(texto).replace(/R\$|\s/g, '');
  if (limpo === '') return 0;
  const normal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const n = Number(normal);
  if (!Number.isFinite(n) || n < 0) throw new ErroDeRegra('CSV_VALOR_INVALIDO', `Valor inválido em ${onde}: "${texto}"`);
  return n;
}

function lerCSV(texto) {
  const linhas = String(texto)
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');
  if (linhas.length < 2) throw new ErroDeRegra('CSV_VAZIO', 'CSV precisa de cabeçalho e ao menos uma linha');
  const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ',';
  const cabecalho = dividirLinha(linhas[0], sep).map((c) => c.toLowerCase());
  return { cabecalho, linhas: linhas.slice(1).map((l) => dividirLinha(l, sep)) };
}

/**
 * Converte CSV no objeto `dados` da tabela do tipo informado.
 * @returns {{dados: object, linhas: number}}
 */
function converterCSV(tipo, texto) {
  const esperadas = COLUNAS[tipo];
  if (!esperadas) throw new ErroDeRegra('TIPO_TABELA_INVALIDO', `Tipo de tabela inválido: ${tipo}`);
  const { cabecalho, linhas } = lerCSV(texto);
  const faltando = esperadas.filter((c) => !cabecalho.includes(c));
  if (faltando.length) throw new ErroDeRegra('CSV_COLUNAS_FALTANDO', `Colunas faltando: ${faltando.join(', ')}`, { esperadas });

  const registros = linhas.map((campos, i) =>
    Object.fromEntries(cabecalho.map((c, j) => [c, campos[j] ?? ''])),
  );
  const num = (r, c, i) => numeroBR(r[c], `linha ${i + 2}, coluna ${c}`);

  if (tipo === 'EXCECOES') {
    return { dados: { valorPorCota: num(registros[0], 'valor_por_cota', 0) }, linhas: 1 };
  }

  const vistos = new Set();
  const linhasTabela = registros.map((r, i) => {
    const categoria = r.categoria_preco;
    if (!categoria) throw new ErroDeRegra('CSV_CATEGORIA_VAZIA', `Categoria vazia na linha ${i + 2}`);
    if (vistos.has(categoria.toLowerCase())) throw new ErroDeRegra('CSV_CATEGORIA_DUPLICADA', `Categoria duplicada: ${categoria}`);
    vistos.add(categoria.toLowerCase());
    return {
      categoriaPreco: categoria,
      valorCota: num(r, 'valor_cota', i),
      totalMeses: num(r, 'total_meses', i),
      entrada: { parcelas: num(r, 'entrada_parcelas', i), valorPorCota: num(r, 'entrada_valor_cota', i) },
      sinal: { parcelas: num(r, 'sinal_parcelas', i), valorPorCota: num(r, 'sinal_valor_cota', i) },
      saldo: { parcelas: num(r, 'saldo_parcelas', i), valorParcelaPorCota: num(r, 'saldo_parcela_cota', i) },
    };
  });
  return { dados: { linhas: linhasTabela }, linhas: linhasTabela.length };
}

/** Exemplo pronto (fictício) para a interface e para os testes. */
const EXEMPLO_CSV = {
  LINEAR: [
    COLUNAS.LINEAR.join(';'),
    'Bronze;32.000,00;60;10;1.600,00;5;1.000,00;45;650,00',
    'Prata;42.000,00;70;10;2.100,00;5;1.500,00;55;690,00',
  ].join('\n'),
  EXCECOES: ['valor_por_cota', '1.200,00'].join('\n'),
};

module.exports = { converterCSV, lerCSV, numeroBR, COLUNAS, EXEMPLO_CSV };
