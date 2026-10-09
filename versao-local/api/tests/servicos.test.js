// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

const { PDFDocument } = require('pdf-lib');
const { CONFIG } = require('../src/config/regras');
const { criarRepositorio } = require('../src/servicos/repositorio');
const { criarSimulador } = require('../src/servicos/simulacao');
const { converterCSV, EXEMPLO_CSV, numeroBR } = require('../src/servicos/importacao');
const { criarShadow, compareResults } = require('../src/servicos/shadow');
const { criarAuth } = require('../src/servicos/auth');
const { gerarFichaNegociacao } = require('../src/pdf/ficha-negociacao');
const { gerarTemplateCadastro, preencherTemplate, CODIGOS } = require('../src/pdf/ficha-cadastro');
const { cpfValido } = require('../src/http/validacao');

const centavos = (cron) => cron.reduce((s, p) => s + Math.round(p.valor * 100), 0);

const plano = (over = {}) => ({
  empreendimentoId: 'residencial-alfa',
  quantidadeCotas: 2,
  valorUnidade: 80000,
  dataVenda: '2026-03-13',
  primeiraEntrada: { meioPagamento: 'PIX', parcelas: 1, valor: 1000 },
  entradaRestante: { parcelas: 3, dataInicio: '2026-04-13' },
  sinal: { parcelas: 4, dataInicio: '2026-07-10' },
  saldo: { parcelas: 60 },
  ...over,
});

describe('simulação padrão', () => {
  const sim = criarSimulador(criarRepositorio());

  test('soma do cronograma = valor da unidade, ao centavo', () => {
    const r = sim.simularPadrao(plano());
    expect(centavos(r.cronograma)).toBe(8000000);
    expect(r.resumo.entrada).toMatchObject({ total: 4000, restante: 3000 });
    expect(r.resumo.sinal).toMatchObject({ total: 3200, percentual: 4 });
    expect(r.alertas).toEqual([]);
  });

  test('cobre as regras de cálculo usadas no fluxo', () => {
    const r = sim.simularPadrao(plano({ primeiraEntrada: { meioPagamento: 'CARTAO_DEBITO', parcelas: 1, valor: 1000 } }));
    expect(r.regrasAplicadas).toEqual(expect.arrayContaining([1, 2, 3, 5, 6, 8, 9, 10, 11, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23]));
  });

  test('alertas: meses sem pagamento, conflito de sinal e alçada', () => {
    const r = sim.simularPadrao(
      plano({ entradaRestante: { parcelas: 3, dataInicio: '2026-06-13' }, sinal: { parcelas: 4, dataInicio: '2026-07-13' } }),
    );
    const codigos = r.alertas.map((a) => a.codigo);
    expect(codigos).toEqual(expect.arrayContaining(['MESES_SEM_PAGAMENTO', 'CONFLITO_SINAL_ENTRADA', 'APROVACAO_NECESSARIA']));
  });

  test('exceções de entrada e percentual de sinal por empreendimento', () => {
    expect(sim.simularPadrao(plano({ empreendimentoId: 'vila-gama' })).resumo.entrada).toMatchObject({ total: 2000, regra: 'TABELA_EXCECOES' });
    expect(sim.simularPadrao(plano({ empreendimentoId: 'resort-beta', primeiraEntrada: { meioPagamento: 'PIX', parcelas: 1, valor: 6000 } })).resumo.sinal.percentual).toBe(6);
  });

  test('erros de negócio', () => {
    expect(() => sim.simularPadrao(plano({ primeiraEntrada: { meioPagamento: 'PIX', parcelas: 1, valor: 99999 } }))).toThrow(
      expect.objectContaining({ codigo: 'ENTRADA_EXCEDIDA' }),
    );
    expect(() => sim.simularPadrao(plano({ entradaRestante: undefined }))).toThrow(expect.objectContaining({ codigo: 'ENTRADA_RESTANTE_OBRIGATORIA' }));
    expect(() => sim.simularPadrao(plano({ empreendimentoId: 'mirante-epsilon' }))).toThrow(expect.objectContaining({ codigo: 'EMPREENDIMENTO_NAO_ENCONTRADO' }));
  });

  test('cache de regras é ressincronizado depois de expirar (R23)', () => {
    let agora = 0;
    const repo = criarRepositorio();
    const s = criarSimulador(repo, { relogio: () => agora });
    const antes = s.cacheAtual().sincronizadoEm;
    agora = CONFIG.cacheRegras.validadeMs + 1;
    expect(s.cacheAtual().sincronizadoEm).toBeGreaterThan(antes);
  });
});

describe('simulação linear', () => {
  test('usa a versão vigente da tabela e alerta divergência', () => {
    const r = criarSimulador(criarRepositorio()).simularLinear({ empreendimentoId: 'parque-delta', categoriaPreco: 'Prata', quantidadeCotas: 1, dataVenda: '2026-03-13' });
    expect(centavos(r.cronograma)).toBe(4000000);
    expect(r.alertas[0].codigo).toBe('DIVERGENCIA_TABELA_LINEAR');
  });
});

describe('importação de tabelas (CSV)', () => {
  test('converte o exemplo LINEAR e EXCECOES', () => {
    const linear = converterCSV('LINEAR', EXEMPLO_CSV.LINEAR);
    expect(linear.linhas).toBe(2);
    expect(linear.dados.linhas[0]).toMatchObject({ categoriaPreco: 'Bronze', valorCota: 32000, entrada: { parcelas: 10, valorPorCota: 1600 } });
    expect(converterCSV('EXCECOES', EXEMPLO_CSV.EXCECOES).dados).toEqual({ valorPorCota: 1200 });
  });

  test('aceita vírgula como separador e campos entre aspas', () => {
    const csv = 'valor_por_cota,obs\n"1.500,00","texto, com vírgula"';
    expect(converterCSV('EXCECOES', csv).dados.valorPorCota).toBe(1500);
  });

  test('erros de formato', () => {
    expect(() => converterCSV('LINEAR', 'categoria_preco;valor_cota\nA;1')).toThrow(expect.objectContaining({ codigo: 'CSV_COLUNAS_FALTANDO' }));
    expect(() => converterCSV('EXCECOES', 'valor_por_cota')).toThrow(expect.objectContaining({ codigo: 'CSV_VAZIO' }));
    expect(() => numeroBR('abc', 'x')).toThrow(/inválido/);
    const dup = EXEMPLO_CSV.LINEAR.replace('Prata', 'Bronze');
    expect(() => converterCSV('LINEAR', dup)).toThrow(expect.objectContaining({ codigo: 'CSV_CATEGORIA_DUPLICADA' }));
  });

  test('nova versão passa a valer a partir da vigência', () => {
    const repo = criarRepositorio();
    repo.salvarTabela({ empreendimentoId: 'vila-gama', tipo: 'EXCECOES', vigenteDesde: '2026-07-01', dados: { valorPorCota: 1500 } });
    expect(repo.buscarTabelaVigente('vila-gama', 'EXCECOES', '2026-06-30').dados.valorPorCota).toBe(1000);
    expect(repo.buscarTabelaVigente('vila-gama', 'EXCECOES', '2026-07-01')).toMatchObject({ versao: 2, dados: { valorPorCota: 1500 } });
  });
});

describe('shadow mode', () => {
  test('detecta os defeitos do legado e registra estatísticas', () => {
    const shadow = criarShadow();
    const r = shadow.executar({ valorUnidade: 12345.67, saldo: 1000, parcelasSaldo: 3, dataBase: '2026-01-31', meses: 1 });
    const porFuncao = Object.fromEntries(r.map((x) => [x.funcao, x]));
    expect(porFuncao.calculateSignalAmount.equivalente).toBe(false);
    expect(porFuncao.addMonths.diferencas[0]).toMatchObject({ legado: '2026-03-03', novo: '2026-02-28' });
    const est = shadow.estatisticas();
    expect(est).toMatchObject({ total: 3, divergentes: expect.any(Number) });
  });

  test('valores dentro da tolerância são equivalentes', () => {
    expect(compareResults(10.004, 10, 'x').equivalente).toBe(true);
    expect(compareResults(10.02, 10, 'x').equivalente).toBe(false);
  });
});

describe('login demo', () => {
  const auth = criarAuth({ segredo: 'segredo-de-teste' });
  test('credenciais corretas geram token com perfil', () => {
    const { token, usuario } = auth.login('admin@exemplo.com', 'demo');
    expect(token.split('.')).toHaveLength(3);
    expect(usuario.perfil).toBe('ADMIN');
  });
  test('senha errada é recusada', () => {
    expect(() => auth.login('admin@exemplo.com', 'errada')).toThrow(expect.objectContaining({ codigo: 'CREDENCIAIS_INVALIDAS' }));
  });
});

describe('fichas PDF', () => {
  test('ficha de negociação válida, com autoria', async () => {
    const r = criarSimulador(criarRepositorio()).simularPadrao(plano());
    const doc = await PDFDocument.load(await gerarFichaNegociacao(r, { geradoEm: '2026-03-13' }));
    expect(doc.getAuthor()).toBe('João Pedro Simões Rodrigues');
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
  });

  test('template de cadastro tem um campo por código', async () => {
    const doc = await PDFDocument.load(await gerarTemplateCadastro());
    expect(doc.getForm().getFields().map((f) => f.getName()).sort()).toEqual([...CODIGOS].sort());
  });

  test('preenche por código e lista o que faltou', async () => {
    const r = await preencherTemplate(await gerarTemplateCadastro(), { 'CAD.NOME': 'Cliente Exemplo', 'CAD.UF': 'SP' }, { achatar: false });
    expect(r.preenchidos).toEqual(['CAD.NOME', 'CAD.UF']);
    expect(r.faltando).toContain('CAD.CPF');
    const doc = await PDFDocument.load(r.bytes);
    expect(doc.getForm().getTextField('CAD.NOME').getText()).toBe('Cliente Exemplo');
  });

  test('código sem campo no template quebra o mapeamento', async () => {
    await expect(preencherTemplate(await gerarTemplateCadastro(), { 'CAD.INEXISTENTE': 'x' })).rejects.toMatchObject({ codigo: 'MAPEAMENTO_INVALIDO' });
  });
});

describe('validação de CPF', () => {
  test('dígitos verificadores', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
  });
});
