// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

const { ErroDeRegra } = require('../regras/erros');

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
  if (err instanceof ErroDeRegra) {
    return res.status(STATUS_POR_CODIGO[err.codigo] || 422).json({
      success: false,
      error: { codigo: err.codigo, mensagem: err.message, detalhes: err.detalhes },
    });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: { codigo: 'JSON_INVALIDO', mensagem: 'Corpo da requisição não é JSON válido' } });
  }
  if (process.env.NODE_ENV !== 'test') console.error(err);
  return res.status(500).json({ success: false, error: { codigo: 'ERRO_INTERNO', mensagem: 'Erro interno' } });
}

function naoEncontrado(req, res) {
  res.status(404).json({ success: false, error: { codigo: 'ROTA_NAO_ENCONTRADA', mensagem: `${req.method} ${req.path}` } });
}

module.exports = { tratadorDeErros, naoEncontrado };
