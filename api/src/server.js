/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

const { criarApp } = require('./app');

const PORT = Number(process.env.PORT) || 3001;

criarApp().listen(PORT, () => {
  console.log(`SmartSeller (simulação) ouvindo em http://localhost:${PORT}/api`);
});
