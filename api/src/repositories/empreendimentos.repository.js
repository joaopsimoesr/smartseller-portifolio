/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

/**
 * Repositório em memória de empreendimentos e tabelas de preço versionadas.
 *
 * No MVP original esta camada era MongoDB + importação de planilhas; aqui foi
 * substituída para que o projeto rode com um único `npm install`, mantendo a
 * mesma ideia: cada tabela (LINEAR, EXCECOES) tem versões com data de
 * vigência, e a simulação usa a versão vigente NA DATA DA VENDA — critério
 * da temporalidade: a norma posterior só rege fatos posteriores à sua vigência.
 */

const { empreendimentos: seed } = require('../data/empreendimentos.json');
const { ErroDeNegocio } = require('../domain/erros');

const TIPOS = Object.freeze({
  LINEAR: 'tabelaLinear',
  EXCECOES: 'excecoesEntrada',
});
const VIGENCIA_SEED = '2026-01-01';

function criarRepositorioEmpreendimentos(dados = seed, { relogio = () => new Date() } = {}) {
  // Cadastro base, sem as tabelas: elas vivem no histórico de versões.
  const porId = new Map(
    dados.map((e) => {
      const { tabelaLinear, excecoesEntrada, ...base } = e;
      return [e.id, Object.freeze(base)];
    }),
  );
  const versoes = [];

  function salvarTabela({ empreendimentoId, tipo, vigenteDesde, dados: conteudo, origem }) {
    if (!porId.has(empreendimentoId)) {
      throw new ErroDeNegocio('EMPREENDIMENTO_NAO_ENCONTRADO', `Empreendimento não encontrado: ${empreendimentoId}`);
    }
    if (!TIPOS[tipo]) {
      throw new ErroDeNegocio('TIPO_TABELA_INVALIDO', `Tipo de tabela inválido: ${tipo}`);
    }
    const anteriores = versoes.filter((v) => v.empreendimentoId === empreendimentoId && v.tipo === tipo);
    const registro = Object.freeze({
      id: versoes.length + 1,
      empreendimentoId,
      tipo,
      versao: anteriores.length + 1,
      vigenteDesde,
      importadoEm: relogio().toISOString(),
      origem,
      dados: conteudo,
    });
    versoes.push(registro);
    return registro;
  }

  // Seed: as tabelas do JSON viram a versão 1 de cada tipo.
  dados.forEach((e) => {
    if (e.tabelaLinear) {
      salvarTabela({ empreendimentoId: e.id, tipo: 'LINEAR', vigenteDesde: VIGENCIA_SEED, dados: e.tabelaLinear, origem: 'seed' });
    }
    if (e.excecoesEntrada) {
      salvarTabela({ empreendimentoId: e.id, tipo: 'EXCECOES', vigenteDesde: VIGENCIA_SEED, dados: e.excecoesEntrada, origem: 'seed' });
    }
  });

  /** Versão vigente em `data` (maior vigenteDesde ≤ data; empate → versão mais nova). */
  function tabelaVigente(empreendimentoId, tipo, data) {
    return (
      versoes
        .filter((v) => v.empreendimentoId === empreendimentoId && v.tipo === tipo && v.vigenteDesde <= data)
        .sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde) || b.versao - a.versao)[0] ?? null
    );
  }

  return {
    listar({ incluirInativos = false } = {}) {
      return [...porId.values()].filter((e) => incluirInativos || e.ativo);
    },

    /**
     * Empreendimento com as tabelas vigentes em `data` (AAAA-MM-DD; padrão: hoje).
     * Sem tabela vigente, o campo correspondente fica ausente.
     */
    buscarPorId(id, { data = relogio().toISOString().slice(0, 10) } = {}) {
      const base = porId.get(id);
      if (!base) return null;
      const comTabelas = { ...base };
      Object.entries(TIPOS).forEach(([tipo, campo]) => {
        const v = tabelaVigente(id, tipo, data);
        if (v) {
          comTabelas[campo] = v.dados;
          comTabelas.versoesTabelas = { ...comTabelas.versoesTabelas, [tipo]: v.versao };
        }
      });
      return Object.freeze(comTabelas);
    },

    listarVersoes(empreendimentoId) {
      return versoes
        .filter((v) => !empreendimentoId || v.empreendimentoId === empreendimentoId)
        .map(({ dados: _omit, ...meta }) => meta);
    },

    salvarTabela,
  };
}

module.exports = { criarRepositorioEmpreendimentos, TIPOS };
