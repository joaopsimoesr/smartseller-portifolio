// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

/**
 * Um bloco por regra (R01–R24), na numeração do REGRAS.md.
 */

const { CONFIG } = require('../src/config/regras');
const d = require('../src/regras/datas');
const c = require('../src/regras/calculo');
const { ErroDeRegra } = require('../src/regras/erros');

const D = (iso) => d.parseInputDate(iso);
const iso = (x) => d.toISO(x);
const isos = (xs) => xs.map(iso);
const soma = (xs) => Math.round(xs.reduce((s, v) => s + v * 100, 0)) / 100;
const maisDias = (data, n) => new Date(data.getTime() + n * 86400000);

const ALFA = { id: 'residencial-alfa', nome: 'Residencial Alfa', categoria: 'PADRAO', ativo: true };
const BETA = { id: 'resort-beta', nome: 'Resort Beta', categoria: 'PREMIUM', percentualSinal: 6, ativo: true };
const EPSILON = { id: 'mirante-epsilon', nome: 'Mirante Epsilon', categoria: 'PREMIUM', ativo: false };

describe('R01 addMonths', () => {
  test('ajusta para o último dia quando o mês é mais curto', () => {
    expect(iso(d.addMonths(D('2026-01-31'), 1))).toBe('2026-02-28');
    expect(iso(d.addMonths(D('2024-01-31'), 1))).toBe('2024-02-29');
  });
  test('atravessa o ano e aceita meses negativos', () => {
    expect(iso(d.addMonths(D('2026-11-15'), 3))).toBe('2027-02-15');
    expect(iso(d.addMonths(D('2026-03-31'), -1))).toBe('2026-02-28');
  });
  test('rejeita data inválida', () => {
    expect(() => d.addMonths(new Date('x'), 1)).toThrow(ErroDeRegra);
  });
});

describe('R02 checkAllMonthGaps', () => {
  test('lista os meses sem pagamento antes do início', () => {
    expect(d.checkAllMonthGaps(D('2026-06-10'), [D('2026-01-10'), D('2026-02-10')])).toEqual(['3/2026', '4/2026', '5/2026']);
  });
  test('sem datas anteriores não há meses pulados', () => {
    expect(d.checkAllMonthGaps(D('2026-06-10'), [])).toEqual([]);
    expect(d.checkAllMonthGaps(D('2026-06-10'), [D('2026-07-10')])).toEqual([]);
  });
});

describe('R03 getLastInstallmentDate', () => {
  test('a data inicial é a 1ª parcela', () => {
    expect(iso(d.getLastInstallmentDate(D('2026-01-15'), 12))).toBe('2026-12-15');
    expect(iso(d.getLastInstallmentDate(D('2026-01-15'), 1))).toBe('2026-01-15');
  });
  test('parcelas inválidas', () => {
    expect(() => d.getLastInstallmentDate(D('2026-01-15'), 0)).toThrow(/parcelas/);
  });
});

describe('R04 formatDate', () => {
  test('DD/MM/AAAA com zeros à esquerda', () => {
    expect(d.formatDate(D('2026-03-05'))).toBe('05/03/2026');
  });
});

describe('R05 parseInputDate', () => {
  test('lê AAAA-MM-DD como meia-noite UTC', () => {
    expect(D('2026-02-28').toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });
  test('rejeita formato errado e data inexistente', () => {
    expect(() => D('28/02/2026')).toThrow(/formato/);
    expect(() => D('2026-02-30')).toThrow(/inexistente/);
  });
});

describe('R06 setDayOfMonth', () => {
  test('usa o último dia quando o dia não existe no mês', () => {
    expect(iso(d.setDayOfMonth(D('2026-04-10'), 31))).toBe('2026-04-30');
    expect(iso(d.setDayOfMonth(D('2026-04-10'), 15))).toBe('2026-04-15');
  });
  test('dia fora de 1..31', () => {
    expect(() => d.setDayOfMonth(D('2026-04-10'), 0)).toThrow(/Dia/);
  });
});

describe('R07 getNextBusinessDay', () => {
  test('dia útil devolve a própria data', () => {
    expect(iso(d.getNextBusinessDay(D('2026-04-20')))).toBe('2026-04-20');
  });
  test('feriado e fim de semana avançam', () => {
    expect(iso(d.getNextBusinessDay(D('2026-04-21')))).toBe('2026-04-22');
    expect(iso(d.getNextBusinessDay(D('2026-04-18')))).toBe('2026-04-20');
  });
  test('respeita o limite de iterações', () => {
    expect(() => d.getNextBusinessDay(D('2026-04-18'), 1)).toThrow(/dia útil/);
  });
});

describe('R08 getNextBusinessDayAfter', () => {
  test('sempre estritamente depois', () => {
    expect(iso(d.getNextBusinessDayAfter(D('2026-04-17')))).toBe('2026-04-20');
    expect(iso(d.getNextBusinessDayAfter(D('2026-04-20')))).toBe('2026-04-22');
  });
});

describe('R09 isHoliday', () => {
  test('feriados fixos da configuração', () => {
    expect(d.isHoliday(D('2026-12-25'))).toBe(true);
    expect(d.isHoliday(D('2026-12-24'))).toBe(false);
  });
  test('feriados móveis não entram (lógica original preservada)', () => {
    expect(d.isHoliday(D('2026-02-17'))).toBe(false);
  });
  test('entrada inválida não é feriado', () => {
    expect(d.isHoliday(null)).toBe(false);
  });
});

describe('R10 calculateEntryAmount', () => {
  test('valor fixo por cota conforme a categoria', () => {
    expect(c.calculateEntryAmount(ALFA, 3)).toMatchObject({ valorTotalEntrada: 3 * CONFIG.entrada.porCota.PADRAO, regraAplicada: 'VALOR_FIXO_PADRAO' });
    expect(c.calculateEntryAmount(BETA, 2)).toMatchObject({ valorTotalEntrada: 2 * CONFIG.entrada.porCota.PREMIUM, regraAplicada: 'VALOR_FIXO_PREMIUM' });
  });
  test('tabela de exceções tem prioridade', () => {
    expect(c.calculateEntryAmount(ALFA, 1, { valorPorCota: 1000 })).toMatchObject({ valorTotalEntrada: 1000, regraAplicada: 'TABELA_EXCECOES' });
    expect(c.calculateEntryAmount(ALFA, 3, { valorPorCota: 1000 }).valorTotalEntrada).toBe(3000);
  });
  test('limite de cotas', () => {
    expect(() => c.calculateEntryAmount(ALFA, CONFIG.limites.cotasMax + 1)).toThrow(/cotas/);
  });
});

describe('R11 calculateSignalAmount', () => {
  test('percentual padrão, arredondado ao real', () => {
    expect(c.calculateSignalAmount(100000)).toMatchObject({ valorSinal: 4000, percentualSinal: 4, origemPercentual: 'PADRAO' });
    expect(c.calculateSignalAmount(12345.67).valorSinal).toBe(494);
  });
  test('percentual do empreendimento e do cache', () => {
    expect(c.calculateSignalAmount(100000, { empreendimento: BETA })).toMatchObject({ valorSinal: 6000, origemPercentual: 'EMPREENDIMENTO' });
    const cache = c.syncVentureRules([BETA], 0);
    expect(c.calculateSignalAmount(100000, { empreendimento: BETA, cache, agora: 1 }).origemPercentual).toBe('CACHE');
  });
  test('valor negativo é inválido', () => {
    expect(() => c.calculateSignalAmount(-1)).toThrow(ErroDeRegra);
  });
});

describe('R12 calculateSignalInstallmentValue', () => {
  test('parcelas exatas sobre o percentual padrão', () => {
    const r = c.calculateSignalInstallmentValue(100000, 3);
    expect(r.valorTotalSinal).toBe(4000);
    expect(r.parcelas).toEqual([1333.34, 1333.33, 1333.33]);
    expect(soma(r.parcelas)).toBe(4000);
  });
});

describe('R13 calculateFirstEntryDates', () => {
  test('PIX/TED/dinheiro: todas na data da venda', () => {
    expect(isos(c.calculateFirstEntryDates(D('2026-03-13'), 2, 'PIX').datas)).toEqual(['2026-03-13', '2026-03-13']);
  });
  test('débito: 1ª no próximo dia útil, demais mês a mês a partir da venda', () => {
    const r = c.calculateFirstEntryDates(D('2026-03-13'), 3, 'CARTAO_DEBITO');
    expect(r.regraAplicada).toBe('PROXIMO_DIA_UTIL');
    expect(isos(r.datas)).toEqual(['2026-03-16', '2026-04-13', '2026-05-13']);
  });
  test('crédito/boleto: a partir do mês seguinte, sem dia útil', () => {
    expect(isos(c.calculateFirstEntryDates(D('2026-01-31'), 2, 'BOLETO').datas)).toEqual(['2026-02-28', '2026-03-31']);
  });
  test('meio de pagamento desconhecido', () => {
    expect(() => c.calculateFirstEntryDates(D('2026-03-13'), 1, 'CHEQUE')).toThrow(/não suportado/);
  });
});

describe('R14 calculateFirstEntryParcelValue', () => {
  test('parcelas somam o total', () => {
    const r = c.calculateFirstEntryParcelValue(1000, 3);
    expect(r.parcelas).toEqual([333.34, 333.33, 333.33]);
    expect(c.calculateFirstEntryParcelValue(1000, 1).parcelas).toEqual([1000]);
  });
});

describe('R15 calculateRemainingEntryValue', () => {
  test('entrada total − 1ª − 2ª, dividida', () => {
    const r = c.calculateRemainingEntryValue(6000, 1000, 500, 3);
    expect(r).toMatchObject({ valorRestante: 4500, negativo: false, parcelas: [1500, 1500, 1500] });
  });
  test('sinaliza quando 1ª + 2ª excedem a entrada', () => {
    expect(c.calculateRemainingEntryValue(1000, 800, 300, 2)).toMatchObject({ valorRestante: -100, negativo: true });
  });
});

describe('R16 calculateRemainingEntryDates', () => {
  test('série mensal encadeada (deriva no fim do mês, como no original)', () => {
    expect(isos(c.calculateRemainingEntryDates(D('2026-01-31'), 3))).toEqual(['2026-01-31', '2026-02-28', '2026-03-28']);
  });
});

describe('R17 checkSignalConflict', () => {
  const restante = [D('2026-04-10'), D('2026-05-10')];
  test('conflito quando o sinal começa até a última parcela restante', () => {
    const r = c.checkSignalConflict(D('2026-05-10'), restante);
    expect(r.conflito).toBe(true);
    expect(iso(r.inicioSugerido)).toBe('2026-06-10');
  });
  test('sem conflito depois dela', () => {
    expect(c.checkSignalConflict(D('2026-06-10'), restante).conflito).toBe(false);
  });
  test('exige datas de entrada restante', () => {
    expect(() => c.checkSignalConflict(D('2026-06-10'), [])).toThrow(/entrada restante/);
  });
});

describe('R18 calculateBalanceStartDate', () => {
  test('mês seguinte à última parcela do sinal, no dia do sinal (com ajuste)', () => {
    expect(iso(c.calculateBalanceStartDate(D('2026-06-30'), 4, 31))).toBe('2026-10-31');
    expect(iso(c.calculateBalanceStartDate(D('2026-06-10'), 4, 10))).toBe('2026-10-10');
  });
});

describe('R19 calculateBalanceAmount', () => {
  test('unidade − entrada − sinal, sem erro de ponto flutuante', () => {
    expect(c.calculateBalanceAmount(80000, 4000, 3200)).toBe(72800);
    expect(c.calculateBalanceAmount(0.3, 0.1, 0.1)).toBe(0.1);
  });
});

describe('R20 calculateBalanceInstallmentValue', () => {
  test('parcelas somam exatamente o saldo', () => {
    const r = c.calculateBalanceInstallmentValue(1000, 3);
    expect(soma(r.parcelas)).toBe(1000);
  });
  test('saldo não positivo é inválido', () => {
    expect(() => c.calculateBalanceInstallmentValue(0, 3)).toThrow(/Saldo/);
  });
});

describe('R21 checkSignalAuthorizationRequired', () => {
  const venda = D('2026-01-01');
  const { gerenciaAcimaDe: g, diretoriaAcimaDe: dir } = CONFIG.autorizacaoSinal;
  test.each([
    [g, false, null],
    [g + 1, true, 'GERENCIA'],
    [dir, true, 'GERENCIA'],
    [dir + 1, true, 'DIRETORIA'],
  ])('%i dias → exigida=%s nível=%s', (dias, exigida, nivel) => {
    expect(c.checkSignalAuthorizationRequired(maisDias(venda, dias), venda)).toMatchObject({ exigida, nivel, dias });
  });
});

describe('R22 identifySkippedMonths', () => {
  test('considera 1ª e 2ª entradas juntas', () => {
    expect(c.identifySkippedMonths(D('2026-06-10'), [D('2026-01-10')], [D('2026-03-10')])).toEqual(['4/2026', '5/2026']);
  });
  test('listas obrigatórias', () => {
    expect(() => c.identifySkippedMonths(D('2026-06-10'), null, [])).toThrow(/listas/);
  });
});

describe('R23 syncVentureRules', () => {
  test('cacheia só os ativos, com percentual do empreendimento ou padrão', () => {
    const cache = c.syncVentureRules([ALFA, BETA, EPSILON], 0);
    expect(cache.itens.size).toBe(2);
    expect(c.getVentureFromCache(cache, 'resort beta', 1).percentualSinal).toBe(6);
    expect(c.getVentureFromCache(cache, 'Residencial Alfa', 1).percentualSinal).toBe(CONFIG.sinal.percentualPadrao);
  });
  test('cache expira após a validade', () => {
    const cache = c.syncVentureRules([BETA], 0);
    expect(c.getVentureFromCache(cache, 'Resort Beta', CONFIG.cacheRegras.validadeMs)).toBeNull();
  });
});

describe('R24 calculateLinearModelPayments', () => {
  const tabela = require('../src/dados/tabelas').find((t) => t.tipo === 'LINEAR').dados;
  const DELTA = { id: 'parque-delta', nome: 'Parque Delta', categoria: 'PADRAO' };

  test('valores e datas vêm da tabela', () => {
    const r = c.calculateLinearModelPayments(DELTA, 'prata', 1, D('2026-03-13'), tabela);
    expect(r.valorTotal).toBe(40000);
    expect(r.entrada).toMatchObject({ qtdParcelas: 10, valorTotal: 2000 });
    expect(r.sinal).toMatchObject({ qtdParcelas: 5, valorTotal: 1500 });
    expect(r.saldo).toMatchObject({ qtdParcelas: 55, valorTotal: 36500, divergenciaTabela: -200 });
    expect(iso(r.entrada.datas[0])).toBe('2026-04-13');
    expect(iso(r.sinal.datas[0])).toBe(`2027-02-${String(CONFIG.modeloLinear.diaVencimentoSinal).padStart(2, '0')}`);
    expect(iso(r.saldo.datas[0])).toBe('2027-07-10');
    expect(soma([...r.entrada.parcelas, ...r.sinal.parcelas, ...r.saldo.parcelas])).toBe(40000);
  });
  test('quantidades zeradas usam os padrões', () => {
    const r = c.calculateLinearModelPayments(DELTA, 'Ouro', 1, D('2026-03-13'), tabela);
    const p = CONFIG.modeloLinear.parcelasPadrao;
    expect([r.entrada.qtdParcelas, r.sinal.qtdParcelas, r.saldo.qtdParcelas]).toEqual([p.entrada, p.sinal, p.saldo]);
  });
  test('categoria inexistente lista as disponíveis', () => {
    expect(() => c.calculateLinearModelPayments(DELTA, 'Diamante', 1, D('2026-03-13'), tabela)).toThrow(
      expect.objectContaining({ codigo: 'CATEGORIA_NAO_ENCONTRADA', detalhes: { disponiveis: ['Bronze', 'Prata', 'Ouro'] } }),
    );
  });
  test('sem tabela', () => {
    expect(() => c.calculateLinearModelPayments(DELTA, 'Prata', 1, D('2026-03-13'), null)).toThrow(/LINEAR/);
  });
});
