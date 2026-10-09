/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

/**
 * R23 — cache de regras por empreendimento.
 *
 * No MVP original, as regras de cada empreendimento vinham do banco e eram
 * guardadas num cache global com validade, para não consultar o banco a cada
 * cálculo. Aqui o cache é um objeto explícito (nada de `global`), com relógio
 * injetável para teste. Leitura fora da validade devolve `null`: quem chama
 * cai na regra do próprio empreendimento ou na geral.
 */

const { REGRAS } = require('../config/regras');

function criarCacheDeRegras({ validadeMs = REGRAS.cacheRegras.validadeMs, relogio = Date.now } = {}) {
  let itens = new Map();
  let sincronizadoEm = null;

  return {
    /** Monta o cache a partir dos empreendimentos ativos. */
    sincronizar(empreendimentos) {
      itens = new Map(
        empreendimentos
          .filter((e) => e.ativo)
          .map((e) => [
            e.id,
            Object.freeze({
              categoria: e.categoria,
              percentualSinal: e.percentualSinal ?? REGRAS.sinal.percentualPadrao,
              temExcecoesEntrada: Boolean(e.excecoesEntrada),
              temPromocao: Boolean(e.promocaoEntrada),
            }),
          ]),
      );
      sincronizadoEm = relogio();
      return itens.size;
    },
    /** Regras em cache do empreendimento, ou null se o cache expirou ou não o conhece. */
    ler(id) {
      if (sincronizadoEm === null || relogio() - sincronizadoEm >= validadeMs) return null;
      return itens.get(id) ?? null;
    },
  };
}

module.exports = { criarCacheDeRegras };
