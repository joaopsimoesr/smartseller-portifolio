/**
 * Repositório em memória, carregado de um JSON de dados fictícios.
 *
 * A interface (listar / buscarPorId) é a mesma que uma implementação com
 * banco teria; o motor de cálculo depende só dela. No MVP original esta
 * camada era MongoDB + importação de planilhas; aqui foi substituída para
 * que o projeto rode com um único `npm install`.
 */

const seed = require('../data/empreendimentos.json');

function criarRepositorioEmpreendimentos(dados = seed) {
  const porId = new Map(dados.map((e) => [e.id, Object.freeze({ ...e })]));

  return {
    listar({ incluirInativos = false } = {}) {
      return [...porId.values()].filter((e) => incluirInativos || e.ativo);
    },
    buscarPorId(id) {
      return porId.get(id) || null;
    },
  };
}

module.exports = { criarRepositorioEmpreendimentos };
