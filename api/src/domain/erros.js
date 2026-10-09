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
