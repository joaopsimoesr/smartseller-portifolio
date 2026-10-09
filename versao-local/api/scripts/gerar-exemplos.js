// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

/**
 * Gera as fichas de exemplo em docs/exemplos/, preenchidas apenas com dados
 * FICTÍCIOS (cliente, CPF, endereço e empreendimento inventados).
 *
 *   npm run exemplos -w api
 *
 * As datas são fixas para que o arquivo gerado seja sempre o mesmo.
 */

const fs = require('fs');
const path = require('path');
const { criarRepositorio } = require('../src/servicos/repositorio');
const { criarSimulador } = require('../src/servicos/simulacao');
const { gerarFichaNegociacao } = require('../src/pdf/ficha-negociacao');
const { gerarTemplateCadastro, preencherTemplate } = require('../src/pdf/ficha-cadastro');

const DESTINO = path.join(__dirname, '..', '..', 'docs', 'exemplos');

const NEGOCIACAO = {
  empreendimentoId: 'resort-beta',
  quantidadeCotas: 2,
  valorUnidade: 120000,
  dataVenda: '2026-03-13',
  primeiraEntrada: { meioPagamento: 'CARTAO_DEBITO', parcelas: 1, valor: 2000 },
  segundaEntrada: { meioPagamento: 'BOLETO', parcelas: 2, valor: 1000 },
  entradaRestante: { parcelas: 3, dataInicio: '2026-06-13' },
  sinal: { parcelas: 6, dataInicio: '2026-09-10', dia: 10 },
  saldo: { parcelas: 36 },
};

const CLIENTE_FICTICIO = {
  'CAD.NOME': 'Cliente Exemplo da Silva',
  'CAD.CPF': '000.000.001-91',
  'CAD.NASCIMENTO': '01/01/1990',
  'CAD.EMAIL': 'cliente@exemplo.com',
  'CAD.TELEFONE': '(00) 0000-0000',
  'CAD.ENDERECO': 'Rua Exemplo, 100',
  'CAD.CIDADE': 'Cidade Exemplo',
  'CAD.UF': 'SP',
  'CAD.CEP': '00000-000',
};

async function main() {
  fs.mkdirSync(DESTINO, { recursive: true });
  const sim = criarSimulador(criarRepositorio(), { relogio: () => Date.parse('2026-03-13T12:00:00Z') }).simularPadrao(NEGOCIACAO);

  const negociacao = await gerarFichaNegociacao(sim, { geradoEm: '2026-03-13' });
  fs.writeFileSync(path.join(DESTINO, 'ficha-negociacao-exemplo.pdf'), negociacao);

  const { bytes, faltando } = await preencherTemplate(await gerarTemplateCadastro(), {
    ...CLIENTE_FICTICIO,
    'NEG.EMPREENDIMENTO': sim.empreendimento.nome,
    'NEG.COTAS': String(sim.quantidadeCotas),
    'NEG.VALOR_UNIDADE': 'R$ 120.000,00',
    'NEG.DATA_VENDA': '13/03/2026',
  });
  if (faltando.length) throw new Error(`Campos sem valor no exemplo: ${faltando.join(', ')}`);
  fs.writeFileSync(path.join(DESTINO, 'ficha-cadastro-exemplo.pdf'), bytes);

  console.log(`Exemplos gerados em ${path.relative(process.cwd(), DESTINO)}`);
  console.log(`  ficha-negociacao-exemplo.pdf  (${sim.cronograma.length} parcelas, alertas: ${sim.alertas.map((a) => a.codigo).join(', ') || 'nenhum'})`);
  console.log('  ficha-cadastro-exemplo.pdf');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
