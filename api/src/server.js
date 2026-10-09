const { criarApp } = require('./app');

const PORT = Number(process.env.PORT) || 3001;

criarApp().listen(PORT, () => {
  console.log(`SmartSeller (simulação) ouvindo em http://localhost:${PORT}/api`);
});
