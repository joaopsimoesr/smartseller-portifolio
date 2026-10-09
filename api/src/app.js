const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { criarRotas } = require('./http/rotas');
const { tratadorDeErros } = require('./http/erros');
const { criarRepositorioEmpreendimentos } = require('./repositories/empreendimentos.repository');

/** Fábrica do app: dependências injetáveis facilitam teste e troca de persistência. */
function criarApp({ repoEmpreendimentos = criarRepositorioEmpreendimentos() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
  app.use(express.json({ limit: '50kb' }));

  app.use('/api', criarRotas({ repoEmpreendimentos }));
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: { codigo: 'ROTA_NAO_ENCONTRADA', mensagem: 'Rota não encontrada' } });
  });
  app.use(tratadorDeErros);
  return app;
}

module.exports = { criarApp };
