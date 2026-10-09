/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

/**
 * Importação de tabelas de preço a partir de CSV (texto), sem dependências.
 *
 * No MVP, a área comercial mantinha as tabelas em planilhas; um importador as
 * convertia e versionava no banco. Aqui o formato é próprio e fictício:
 * separador ";" ou ",", valores no formato brasileiro ("1.234,56").
 * Toda validação acontece antes de gravar: uma tabela inválida nunca vira
 * versão vigente.
 */

const { ErroDeNegocio } = require('../domain/erros');

const COLUNAS = Object.freeze({
  LINEAR: [
    'categoria_preco',
    'valor_cota',
    'entrada_parcelas',
    'entrada_valor_cota',
    'sinal_parcelas',
    'sinal_valor_cota',
    'saldo_parcelas',
    'saldo_parcela_cota',
  ],
  EXCECOES: ['cotas', 'valor_total'],
});

/** Divide uma linha CSV respeitando aspas ("a;b";c). */
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

/** "1.234,56" → 1234.56 · "2.000" → 2000 · "1234.56" → 1234.56 · "" → 0 */
function numeroBR(texto, onde) {
  const limpo = String(texto).replace(/R\$|\s/g, '');
  if (limpo === '') return 0;
  let normal = limpo;
  if (limpo.includes(',')) normal = limpo.replace(/\./g, '').replace(',', '.');
  // Sem vírgula, "2.000" e "1.250.000" são milhares (formato brasileiro), não decimais.
  else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) normal = limpo.replace(/\./g, '');
  const n = Number(normal);
  if (!Number.isFinite(n) || n < 0) {
    throw new ErroDeNegocio('CSV_VALOR_INVALIDO', `Valor inválido em ${onde}: "${texto}"`);
  }
  return n;
}

function inteiro(texto, onde) {
  const n = numeroBR(texto, onde);
  if (!Number.isInteger(n)) throw new ErroDeNegocio('CSV_VALOR_INVALIDO', `Esperado número inteiro em ${onde}: "${texto}"`);
  return n;
}

function lerCSV(texto) {
  const linhas = String(texto)
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');
  if (linhas.length < 2) throw new ErroDeNegocio('CSV_VAZIO', 'O CSV precisa de cabeçalho e ao menos uma linha');
  const pontoVirgula = (linhas[0].match(/;/g) || []).length;
  const virgula = (linhas[0].match(/,/g) || []).length;
  const sep = pontoVirgula >= virgula ? ';' : ',';
  const cabecalho = dividirLinha(linhas[0], sep).map((c) => c.toLowerCase());
  const registros = linhas.slice(1).map((l) => {
    const campos = dividirLinha(l, sep);
    return Object.fromEntries(cabecalho.map((c, j) => [c, campos[j] ?? '']));
  });
  return { cabecalho, registros };
}

function converterLinear(registros) {
  const vistos = new Set();
  return registros.map((r, i) => {
    const onde = (col) => `linha ${i + 2}, coluna ${col}`;
    const categoria = r.categoria_preco;
    if (!categoria) throw new ErroDeNegocio('CSV_CATEGORIA_VAZIA', `Categoria vazia na linha ${i + 2}`);
    if (vistos.has(categoria.toLowerCase())) {
      throw new ErroDeNegocio('CSV_CATEGORIA_DUPLICADA', `Categoria duplicada: ${categoria}`);
    }
    vistos.add(categoria.toLowerCase());
    const linha = {
      categoriaPreco: categoria,
      valorCota: numeroBR(r.valor_cota, onde('valor_cota')),
      entrada: { parcelas: inteiro(r.entrada_parcelas, onde('entrada_parcelas')), valorPorCota: numeroBR(r.entrada_valor_cota, onde('entrada_valor_cota')) },
      sinal: { parcelas: inteiro(r.sinal_parcelas, onde('sinal_parcelas')), valorPorCota: numeroBR(r.sinal_valor_cota, onde('sinal_valor_cota')) },
      saldo: { parcelas: inteiro(r.saldo_parcelas, onde('saldo_parcelas')), valorParcelaPorCota: numeroBR(r.saldo_parcela_cota, onde('saldo_parcela_cota')) },
    };
    // Invariante: a tabela não pode prometer entrada + sinal acima do valor da cota.
    if (linha.valorCota <= linha.entrada.valorPorCota + linha.sinal.valorPorCota) {
      throw new ErroDeNegocio('CSV_TABELA_INCONSISTENTE', `${categoria}: entrada + sinal não podem igualar ou exceder o valor da cota`);
    }
    return linha;
  });
}

/** Linhas "1;1.250,00", "2;2.500,00" e "adicional;1.250,00" (valor por cota acima da maior quantidade). */
function converterExcecoes(registros) {
  const valoresPorQuantidade = {};
  let valorCotaAdicional = null;
  registros.forEach((r, i) => {
    const onde = (col) => `linha ${i + 2}, coluna ${col}`;
    const valor = numeroBR(r.valor_total, onde('valor_total'));
    if (String(r.cotas).toLowerCase() === 'adicional') valorCotaAdicional = valor;
    else valoresPorQuantidade[inteiro(r.cotas, onde('cotas'))] = valor;
  });
  if (Object.keys(valoresPorQuantidade).length === 0 || valorCotaAdicional === null) {
    throw new ErroDeNegocio('CSV_EXCECOES_INCOMPLETO', 'Informe ao menos uma quantidade de cotas e a linha "adicional"');
  }
  return { descricao: 'Tabela de exceções importada', valoresPorQuantidade, valorCotaAdicional };
}

/** Converte o CSV no conteúdo da tabela do tipo informado. */
function converterCSV(tipo, texto) {
  const esperadas = COLUNAS[tipo];
  if (!esperadas) throw new ErroDeNegocio('TIPO_TABELA_INVALIDO', `Tipo de tabela inválido: ${tipo}`);
  const { cabecalho, registros } = lerCSV(texto);
  const faltando = esperadas.filter((c) => !cabecalho.includes(c));
  if (faltando.length) {
    throw new ErroDeNegocio('CSV_COLUNAS_FALTANDO', `Colunas faltando: ${faltando.join(', ')}`, { esperadas });
  }
  const dados = tipo === 'LINEAR' ? converterLinear(registros) : converterExcecoes(registros);
  return { dados, linhas: registros.length };
}

/** Exemplos prontos (fictícios) para a interface e para os testes. */
const EXEMPLO_CSV = Object.freeze({
  LINEAR: [
    COLUNAS.LINEAR.join(';'),
    'Bronze;32.000,00;10;1.600,00;5;1.280,00;70;416,00',
    'Prata;44.000,00;10;2.200,00;6;1.760,00;72;556,11',
  ].join('\n'),
  EXCECOES: [COLUNAS.EXCECOES.join(';'), '1;1.100,00', '2;2.200,00', 'adicional;1.100,00'].join('\n'),
});

module.exports = { converterCSV, numeroBR, COLUNAS, EXEMPLO_CSV };
