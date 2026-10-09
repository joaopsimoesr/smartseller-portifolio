// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

/**
 * Repositório em memória de empreendimentos e tabelas de preço versionadas.
 *
 * Origem: venture.model + venture-table.service do backend (MongoDB). Aqui a
 * interface é a mesma (buscar a versão mais recente por tipo, listar
 * versões), mas sem banco, para o projeto rodar com um único npm install.
 */

const empreendimentosSeed = require('../dados/empreendimentos');
const tabelasSeed = require('../dados/tabelas');
const { ErroDeRegra } = require('../regras/erros');

const TIPOS = ['LINEAR', 'EXCECOES'];

function criarRepositorio({ empreendimentos = empreendimentosSeed, tabelas = tabelasSeed } = {}) {
  const porId = new Map(empreendimentos.map((e) => [e.id, { ...e }]));
  /** @type {Array<{id: number, empreendimentoId: string, tipo: string, versao: number, vigenteDesde: string, importadoEm: string, origem: string, dados: object}>} */
  const versoes = [];
  let proximoId = 1;

  function salvarTabela({ empreendimentoId, tipo, vigenteDesde, dados, origem = 'seed' }) {
    if (!porId.has(empreendimentoId)) throw new ErroDeRegra('EMPREENDIMENTO_NAO_ENCONTRADO', `Empreendimento não encontrado: ${empreendimentoId}`);
    if (!TIPOS.includes(tipo)) throw new ErroDeRegra('TIPO_TABELA_INVALIDO', `Tipo de tabela inválido: ${tipo}`);
    const anteriores = versoes.filter((t) => t.empreendimentoId === empreendimentoId && t.tipo === tipo);
    const registro = {
      id: proximoId++,
      empreendimentoId,
      tipo,
      versao: anteriores.length + 1,
      vigenteDesde,
      importadoEm: new Date().toISOString(),
      origem,
      dados,
    };
    versoes.push(registro);
    return registro;
  }

  tabelas.forEach((t) => salvarTabela(t));

  return {
    listarEmpreendimentos: ({ incluirInativos = false } = {}) =>
      [...porId.values()].filter((e) => incluirInativos || e.ativo !== false),

    buscarEmpreendimento: (id) => porId.get(id) ?? null,

    /** Versão vigente mais recente (maior vigenteDesde ≤ data; empate → maior versão). */
    buscarTabelaVigente(empreendimentoId, tipo, data = new Date().toISOString().slice(0, 10)) {
      const candidatas = versoes
        .filter((t) => t.empreendimentoId === empreendimentoId && t.tipo === tipo && t.vigenteDesde <= data)
        .sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde) || b.versao - a.versao);
      return candidatas[0] ?? null;
    },

    listarVersoes: (empreendimentoId) =>
      versoes
        .filter((t) => !empreendimentoId || t.empreendimentoId === empreendimentoId)
        .map(({ dados, ...meta }) => meta),

    salvarTabela,
  };
}

module.exports = { criarRepositorio, TIPOS };
