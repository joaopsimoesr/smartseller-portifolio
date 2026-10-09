// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

/** Violação de regra ou entrada inválida para uma regra. Vira HTTP 422 na API. */
class ErroDeRegra extends Error {
  constructor(codigo, mensagem, detalhes) {
    super(mensagem);
    this.name = 'ErroDeRegra';
    this.codigo = codigo;
    this.detalhes = detalhes;
  }
}

module.exports = { ErroDeRegra };
