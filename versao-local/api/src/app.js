// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { criarRepositorio } = require('./servicos/repositorio');
const { criarSimulador } = require('./servicos/simulacao');
const { criarShadow } = require('./servicos/shadow');
const { criarAuth } = require('./servicos/auth');
const { criarRotas } = require('./http/rotas');
const { tratadorDeErros, naoEncontrado } = require('./http/erros');

/** Monta o app com dependências injetáveis (os testes passam as suas). */
function criarApp({ repo = criarRepositorio(), relogio, auth = criarAuth() } = {}) {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '300kb' }));
  app.use('/api', criarRotas({ repo, simulador: criarSimulador(repo, { relogio }), shadow: criarShadow(), auth }));
  app.use(naoEncontrado);
  app.use(tratadorDeErros);
  return app;
}

module.exports = { criarApp };
