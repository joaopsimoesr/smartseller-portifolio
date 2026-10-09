/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

// Gera as fichas de exemplo em docs/exemplos, com data fixa: o resultado é
// sempre o mesmo arquivo. Uso: npm run exemplos -w api

const fs = require('node:fs');
const path = require('node:path');
const { criarRepositorioEmpreendimentos } = require('../src/repositories/empreendimentos.repository');
const { simularPlanoPadrao, simularModeloLinear } = require('../src/domain/simulacao');
const { gerarFichaNegociacao } = require('../src/pdf/ficha-negociacao');
const { preencherTemplate, valoresDoCadastro } = require('../src/pdf/ficha-cadastro');

const GERADO_EM = new Date('2026-03-13T12:00:00Z');
const destino = path.join(__dirname, '..', '..', 'docs', 'exemplos');

async function main() {
  fs.mkdirSync(destino, { recursive: true });
  const repo = criarRepositorioEmpreendimentos();

  const padrao = simularPlanoPadrao(
    {
      empreendimentoId: 'resort-beta',
      quantidadeCotas: 2,
      valorUnidade: 120000,
      dataVenda: '2026-03-13',
      primeiraEntrada: { meioPagamento: 'CARTAO_DEBITO', parcelas: 1, valor: 2000 },
      segundaEntrada: { meioPagamento: 'BOLETO', parcelas: 2, valor: 1400 },
      entradaRestante: { parcelas: 3, dataInicio: '2026-06-13' },
      sinal: { parcelas: 6, dataInicio: '2026-09-10' },
      saldo: { parcelas: 36 },
    },
    repo,
  );
  const linear = simularModeloLinear(
    { empreendimentoId: 'parque-delta', categoriaPreco: 'Prata', quantidadeCotas: 1, dataVenda: '2026-03-13' },
    repo,
  );
  const cadastro = await preencherTemplate(
    valoresDoCadastro({
      cliente: {
        nome: 'Cliente Exemplo da Silva',
        cpf: '000.000.001-91',
        nascimento: '1990-01-01',
        email: 'cliente@exemplo.com',
        telefone: '(00) 0000-0000',
        endereco: 'Rua Exemplo, 100',
        cidade: 'Cidade Exemplo',
        uf: 'GO',
        cep: '00000-000',
      },
      negociacao: { empreendimento: 'Resort Beta', cotas: 2, valorUnidade: 120000, dataVenda: '2026-03-13' },
    }),
    { geradoEm: GERADO_EM },
  );

  const arquivos = {
    'ficha-negociacao-exemplo.pdf': await gerarFichaNegociacao(padrao, { geradoEm: GERADO_EM }),
    'ficha-negociacao-linear-exemplo.pdf': await gerarFichaNegociacao(linear, { geradoEm: GERADO_EM }),
    'ficha-cadastro-exemplo.pdf': cadastro.bytes,
  };
  for (const [nome, bytes] of Object.entries(arquivos)) {
    fs.writeFileSync(path.join(destino, nome), bytes);
    console.log(`${nome}: ${bytes.length} bytes`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
