/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

const { gerarFichaNegociacao } = require('./ficha-negociacao');
const { preencherTemplate, valoresDoCadastro } = require('./ficha-cadastro');

/** Serviço de fichas injetado nas rotas; `relogio` fixa a data nos testes e exemplos. */
function criarFichas({ relogio = () => new Date() } = {}) {
  return {
    negociacao: (sim) => gerarFichaNegociacao(sim, { geradoEm: relogio() }),
    cadastro: async (payload) => (await preencherTemplate(valoresDoCadastro(payload), { geradoEm: relogio() })).bytes,
  };
}

module.exports = { criarFichas };
