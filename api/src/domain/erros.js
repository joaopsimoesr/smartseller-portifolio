/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

/** Erro de regra de negócio: entrada válida no formato, mas inviável pela política comercial. */
class ErroDeNegocio extends Error {
  constructor(codigo, mensagem, detalhes) {
    super(mensagem);
    this.name = 'ErroDeNegocio';
    this.codigo = codigo;
    this.detalhes = detalhes;
  }
}

module.exports = { ErroDeNegocio };
