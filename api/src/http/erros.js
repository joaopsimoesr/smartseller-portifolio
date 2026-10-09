/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

const { ErroDeNegocio } = require('../domain/erros');

const STATUS_POR_CODIGO = {
  EMPREENDIMENTO_NAO_ENCONTRADO: 404,
  CREDENCIAIS_INVALIDAS: 401,
};

// eslint-disable-next-line no-unused-vars
function tratadorDeErros(err, _req, res, _next) {
  if (err.isJoi) {
    return res.status(400).json({
      success: false,
      error: {
        codigo: 'ENTRADA_INVALIDA',
        mensagem: 'Dados de entrada inválidos',
        detalhes: err.details.map((d) => ({ campo: d.path.join('.'), mensagem: d.message })),
      },
    });
  }
  if (err instanceof ErroDeNegocio) {
    return res.status(STATUS_POR_CODIGO[err.codigo] || 422).json({
      success: false,
      error: { codigo: err.codigo, mensagem: err.message, detalhes: err.detalhes },
    });
  }
  if (err instanceof TypeError && /^Data /.test(err.message)) {
    return res.status(400).json({
      success: false,
      error: { codigo: 'DATA_INVALIDA', mensagem: err.message },
    });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: { codigo: 'CORPO_GRANDE_DEMAIS', mensagem: 'Requisição grande demais' },
    });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: { codigo: 'JSON_INVALIDO', mensagem: 'Corpo da requisição não é JSON válido' },
    });
  }
  if (process.env.NODE_ENV !== 'test') console.error(err);
  return res.status(500).json({
    success: false,
    error: { codigo: 'ERRO_INTERNO', mensagem: 'Erro interno' },
  });
}

module.exports = { tratadorDeErros };
