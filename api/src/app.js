/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { criarRotas } = require('./http/rotas');
const { tratadorDeErros } = require('./http/erros');
const { criarRepositorioEmpreendimentos } = require('./repositories/empreendimentos.repository');
const { criarCacheDeRegras } = require('./repositories/cache-regras');
const { criarAuth } = require('./services/auth');
const { criarShadow } = require('./services/shadow');

/** Fábrica do app: dependências injetáveis facilitam teste e troca de persistência. */
function criarApp({
  repoEmpreendimentos = criarRepositorioEmpreendimentos(),
  cacheRegras = criarCacheDeRegras(),
  auth = criarAuth(),
  shadow = criarShadow(),
  fichas = null,
} = {}) {
  // R23: o cache guarda as regras vigentes de cada empreendimento ativo.
  cacheRegras.sincronizar(repoEmpreendimentos.listar().map((e) => repoEmpreendimentos.buscarPorId(e.id)));
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
  app.use(express.json({ limit: '300kb' })); // CSV de tabela cabe folgado

  app.use('/api', criarRotas({ repoEmpreendimentos, cacheRegras, auth, shadow, fichas }));
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: { codigo: 'ROTA_NAO_ENCONTRADA', mensagem: 'Rota não encontrada' } });
  });
  app.use(tratadorDeErros);
  return app;
}

module.exports = { criarApp };
