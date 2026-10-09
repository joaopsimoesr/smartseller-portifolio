// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

const { criarApp } = require('./app');

const porta = Number(process.env.PORT) || 3101;

criarApp().listen(porta, () => {
  console.log(`SmartSeller (versão local) — API em http://localhost:${porta}/api`);
  console.log('Login de demonstração: vendedor@exemplo.com ou admin@exemplo.com, senha "demo"');
});
