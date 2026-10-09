/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

// Um bloco por regra (R01–R24), na numeração de REGRAS.md.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const d = require('../src/domain/datas');
const r = require('../src/domain/regras');
const { dividirEmParcelas } = require('../src/domain/dinheiro');
const { ErroDeNegocio } = require('../src/domain/erros');
const { criarCacheDeRegras } = require('../src/repositories/cache-regras');
const { empreendimentos } = require('../src/data/empreendimentos.json');

const iso = (s) => d.parseISO(s);
const isos = (lista) => lista.map(d.toISO);
const emp = (id) => empreendimentos.find((e) => e.id === id);
const soma = (xs) => xs.reduce((a, b) => a + b, 0);

const padrao = { id: 'a', nome: 'A', categoria: 'PADRAO' };
const premium = { id: 'b', nome: 'B', categoria: 'PREMIUM', percentualSinal: 6 };
const promo = {
  id: 'c',
  nome: 'C',
  categoria: 'PADRAO',
  promocaoEntrada: { valorPorCota: 1800, inicio: '2026-01-01', fim: '2026-12-31' },
};

describe('R01 somar meses', () => {
  test('ajusta para o último dia em mês mais curto, inclusive bissexto', () => {
    assert.equal(d.toISO(d.addMeses(iso('2026-01-31'), 1)), '2026-02-28');
    assert.equal(d.toISO(d.addMeses(iso('2028-01-31'), 1)), '2028-02-29');
  });
  test('atravessa o ano e aceita meses negativos', () => {
    assert.equal(d.toISO(d.addMeses(iso('2026-11-10'), 3)), '2027-02-10');
    assert.equal(d.toISO(d.addMeses(iso('2026-01-15'), -2)), '2025-11-15');
  });
  test('série ancorada não "arrasta" o dia após fevereiro', () => {
    assert.deepEqual(isos(d.serieMensal(iso('2026-01-31'), 3)), ['2026-01-31', '2026-02-28', '2026-03-31']);
  });
  test('rejeita data inválida', () => {
    assert.throws(() => d.addMeses(new Date('x'), 1), TypeError);
  });
});

describe('R02 meses sem pagamento', () => {
  test('lista os meses vazios entre o último pagamento e o início', () => {
    assert.deepEqual(d.mesesSemPagamento([iso('2026-03-10')], iso('2026-07-10')), ['2026-04', '2026-05', '2026-06']);
  });
  test('sem lacuna quando o início é no mês seguinte', () => {
    assert.deepEqual(d.mesesSemPagamento([iso('2026-03-10')], iso('2026-04-10')), []);
  });
  test('sem pagamentos anteriores não há meses pulados', () => {
    assert.deepEqual(d.mesesSemPagamento([], iso('2026-07-10')), []);
  });
});

describe('R03 última parcela', () => {
  test('a data inicial é a 1ª parcela', () => {
    assert.equal(d.toISO(d.ultimaParcela(iso('2026-01-31'), 1)), '2026-01-31');
    assert.equal(d.toISO(d.ultimaParcela(iso('2026-01-31'), 2)), '2026-02-28');
  });
  test('parcelas inválidas', () => {
    assert.throws(() => d.ultimaParcela(iso('2026-01-31'), 0), ErroDeNegocio);
  });
});

describe('R04 formatar data', () => {
  test('DD/MM/AAAA com zeros à esquerda', () => {
    assert.equal(d.toBR(iso('2026-03-05')), '05/03/2026');
  });
});

describe('R05 ler data', () => {
  test('lê AAAA-MM-DD como meia-noite UTC', () => {
    assert.equal(iso('2026-03-15').toISOString(), '2026-03-15T00:00:00.000Z');
  });
  test('rejeita formato errado e data inexistente', () => {
    assert.throws(() => iso('15/03/2026'), TypeError);
    assert.throws(() => iso('2026-02-30'), TypeError);
  });
});

describe('R06 fixar dia do mês', () => {
  test('usa o último dia quando o dia não existe no mês', () => {
    assert.equal(d.toISO(d.fixarDiaDoMes(iso('2026-02-10'), 31)), '2026-02-28');
    assert.equal(d.toISO(d.fixarDiaDoMes(iso('2026-04-10'), 15)), '2026-04-15');
  });
  test('dia fora de 1..31', () => {
    assert.throws(() => d.fixarDiaDoMes(iso('2026-02-10'), 0), ErroDeNegocio);
    assert.throws(() => d.fixarDiaDoMes(iso('2026-02-10'), 32), ErroDeNegocio);
  });
});

describe('R07 próximo dia útil (inclusivo)', () => {
  test('dia útil devolve a própria data', () => {
    assert.equal(d.toISO(d.proximoDiaUtil(iso('2026-03-13'), { inclusivo: true })), '2026-03-13');
  });
  test('fim de semana e feriado avançam', () => {
    assert.equal(d.toISO(d.proximoDiaUtil(iso('2026-03-14'), { inclusivo: true })), '2026-03-16');
    assert.equal(d.toISO(d.proximoDiaUtil(iso('2026-04-21'), { inclusivo: true })), '2026-04-22');
  });
  test('respeita o limite de dias corridos', () => {
    assert.throws(() => d.proximoDiaUtil(iso('2026-03-14'), { inclusivo: true, maxDias: 1 }), /Nenhum dia útil/);
  });
});

describe('R08 próximo dia útil (estrito)', () => {
  test('sempre estritamente depois, mesmo de um dia útil', () => {
    assert.equal(d.toISO(d.proximoDiaUtil(iso('2026-03-12'))), '2026-03-13');
    assert.equal(d.toISO(d.proximoDiaUtil(iso('2026-03-13'))), '2026-03-16');
  });
  test('N dias úteis seguidos', () => {
    assert.equal(d.toISO(d.diasUteisApos(iso('2026-04-20'), 2)), '2026-04-23'); // 21 é Tiradentes
  });
});

describe('R09 feriado', () => {
  test('feriados fixos', () => {
    assert.ok(d.isFeriado(iso('2026-12-25')));
    assert.ok(d.isFeriado(iso('2026-11-20')));
  });
  test('feriados móveis derivados da Páscoa (diferença deliberada: o original não os tinha)', () => {
    assert.equal(d.toISO(d.pascoa(2026)), '2026-04-05');
    assert.ok(d.isFeriado(iso('2026-02-17'))); // Carnaval
    assert.ok(d.isFeriado(iso('2026-04-03'))); // Sexta-feira Santa
    assert.ok(d.isFeriado(iso('2026-06-04'))); // Corpus Christi
  });
  test('entrada inválida não é feriado; independe do fuso do processo', () => {
    assert.equal(d.isFeriado(new Date('x')), false);
    assert.ok(d.isFimDeSemana(iso('2026-03-14')));
  });
});

describe('R10 valor da entrada', () => {
  const venda = iso('2026-05-01');
  test('valor fixo por cota, conforme a categoria', () => {
    assert.equal(r.valorEntrada(padrao, 2, venda).totalCentavos, 500000);
    assert.equal(r.valorEntrada(premium, 2, venda).totalCentavos, 640000);
  });
  test('promoção só vale dentro da vigência', () => {
    assert.equal(r.valorEntrada(promo, 2, iso('2026-12-31')).regra, 'PROMOCAO');
    assert.equal(r.valorEntrada(promo, 2, iso('2027-01-01')).regra, 'PADRAO');
  });
  test('tabela de exceções tem prioridade: quantidades listadas e cota adicional', () => {
    const delta = emp('parque-delta');
    assert.deepEqual(
      [1, 2, 3, 5].map((c) => r.valorEntrada(delta, c, venda).totalCentavos),
      [125000, 250000, 375000, 625000],
    );
    assert.equal(r.valorEntrada(delta, 1, venda).regra, 'EXCECAO');
  });
  test('limite de cotas', () => {
    assert.throws(() => r.valorEntrada(padrao, 0, venda), ErroDeNegocio);
    assert.throws(() => r.valorEntrada(padrao, 11, venda), ErroDeNegocio);
  });
});

describe('R11 valor do sinal', () => {
  test('percentual padrão e do empreendimento', () => {
    assert.deepEqual(r.valorSinal(padrao, 10000000), { percentual: 4, origem: 'PADRAO', totalCentavos: 400000 });
    assert.equal(r.valorSinal(premium, 10000000).totalCentavos, 600000);
  });
  test('percentual em cache prevalece', () => {
    const s = r.valorSinal(premium, 10000000, { regrasEmCache: { percentualSinal: 5 } });
    assert.equal(s.origem, 'CACHE');
    assert.equal(s.totalCentavos, 500000);
  });
  test('valor da unidade inválido', () => {
    assert.throws(() => r.valorSinal(padrao, 0), ErroDeNegocio);
  });
});

describe('R12 parcelas do sinal', () => {
  test('soma exata do total da R11, resto nas primeiras', () => {
    const p = r.parcelasDoSinal(100000, 3);
    assert.deepEqual(p, [33334, 33333, 33333]);
    assert.equal(soma(p), 100000);
  });
});

describe('R13 datas por meio de pagamento', () => {
  const venda = iso('2026-03-13'); // sexta
  test('PIX: no dia, parcela única', () => {
    assert.deepEqual(isos(r.datasPorMeioDePagamento('PIX', venda, 1)), ['2026-03-13']);
    assert.throws(() => r.datasPorMeioDePagamento('PIX', venda, 2), /no máximo 1/);
  });
  test('débito: 2 dias úteis depois (pula o fim de semana)', () => {
    assert.deepEqual(isos(r.datasPorMeioDePagamento('CARTAO_DEBITO', venda, 1)), ['2026-03-17']);
  });
  test('boleto: a partir do mês seguinte, sem ajuste para dia útil', () => {
    assert.deepEqual(isos(r.datasPorMeioDePagamento('BOLETO', venda, 3)), ['2026-04-13', '2026-05-13', '2026-06-13']);
  });
  test('meio desconhecido', () => {
    assert.throws(() => r.datasPorMeioDePagamento('CHEQUE', venda, 1), ErroDeNegocio);
  });
});

describe('R14 parcelas da entrada', () => {
  test('soma exata', () => {
    const p = r.parcelasDaEntrada(100001, 4);
    assert.equal(soma(p), 100001);
  });
  test('valor não positivo', () => {
    assert.throws(() => r.parcelasDaEntrada(0, 1), ErroDeNegocio);
  });
});

describe('R15 entrada restante', () => {
  test('entrada total − 1ª − 2ª', () => {
    assert.deepEqual(r.entradaRestante(500000, 100000, 50000), { restanteCentavos: 350000, negativo: false });
  });
  test('sinaliza quando 1ª + 2ª excedem a entrada', () => {
    assert.equal(r.entradaRestante(500000, 400000, 200000).negativo, true);
  });
});

describe('R16 datas da entrada restante', () => {
  test('série ancorada no dia do 1º vencimento (diferença deliberada: o original derivava)', () => {
    assert.deepEqual(isos(r.datasEntradaRestante(iso('2026-01-31'), 3)), ['2026-01-31', '2026-02-28', '2026-03-31']);
  });
});

describe('R17 conflito sinal × entrada restante', () => {
  const restante = [iso('2026-04-10'), iso('2026-05-10')];
  test('conflito quando o sinal começa até a última parcela restante, com sugestão', () => {
    const c = r.conflitoSinalEntrada(iso('2026-05-10'), restante);
    assert.equal(c.conflito, true);
    assert.equal(d.toISO(c.inicioSugerido), '2026-06-10');
  });
  test('sem conflito depois dela ou sem entrada restante', () => {
    assert.equal(r.conflitoSinalEntrada(iso('2026-05-11'), restante).conflito, false);
    assert.equal(r.conflitoSinalEntrada(iso('2026-05-11'), []).conflito, false);
  });
});

describe('R18 início do saldo', () => {
  test('mês seguinte à última parcela do sinal, no dia do sinal (com ajuste de fim de mês)', () => {
    assert.equal(d.toISO(r.inicioSaldo(iso('2026-06-13'), 4)), '2026-10-13');
    assert.equal(d.toISO(r.inicioSaldo(iso('2026-10-31'), 4)), '2027-02-28');
  });
});

describe('R19 valor do saldo', () => {
  test('unidade − entrada − sinal, em centavos', () => {
    assert.equal(r.valorSaldo(8000000, 500000, 320000), 7180000);
  });
});

describe('R20 parcelas do saldo', () => {
  test('soma exata', () => {
    assert.equal(soma(r.parcelasDoSaldo(7180000, 60)), 7180000);
  });
  test('saldo não positivo é recusado', () => {
    assert.throws(() => r.parcelasDoSaldo(0, 60), /não há saldo/);
  });
});

describe('R21 alçada de aprovação do sinal', () => {
  const venda = iso('2026-01-01');
  const casos = [
    ['2026-04-30', null], // 119 dias
    ['2026-05-01', null], // 120 dias (limite)
    ['2026-05-02', 'GERENCIA'], // 121 dias
    ['2026-06-30', 'GERENCIA'], // 180 dias (limite)
    ['2026-07-01', 'COMITE'], // 181 dias
  ];
  for (const [inicio, nivel] of casos) {
    test(`início do sinal em ${inicio} → ${nivel}`, () => {
      assert.equal(r.alcadaAprovacaoSinal(venda, iso(inicio)).nivel, nivel);
    });
  }
});

describe('R22 meses pulados (1ª + 2ª entrada)', () => {
  test('considera as duas entradas juntas', () => {
    const pulados = r.mesesPuladosAntesDaRestante(iso('2026-08-10'), [iso('2026-03-10')], [iso('2026-05-10')]);
    assert.deepEqual(pulados, ['2026-06', '2026-07']);
  });
});

describe('R23 cache de regras', () => {
  test('cacheia só os ativos, com o percentual do empreendimento ou o padrão', () => {
    const cache = criarCacheDeRegras({ relogio: () => 0 });
    assert.equal(cache.sincronizar(empreendimentos), 4);
    assert.equal(cache.ler('resort-beta').percentualSinal, 6);
    assert.equal(cache.ler('residencial-alfa').percentualSinal, 4);
    assert.equal(cache.ler('mirante-epsilon'), null);
  });
  test('expira após a validade', () => {
    let agora = 0;
    const cache = criarCacheDeRegras({ validadeMs: 1000, relogio: () => agora });
    cache.sincronizar(empreendimentos);
    agora = 999;
    assert.ok(cache.ler('resort-beta'));
    agora = 1000;
    assert.equal(cache.ler('resort-beta'), null);
  });
});

describe('R24 modelo linear', () => {
  const delta = emp('parque-delta');
  const venda = iso('2026-03-13');
  test('valores e datas vêm da tabela; soma exata', () => {
    const ml = r.modeloLinear(delta, 'bronze', 2, venda);
    assert.equal(ml.totalCentavos, 6000000);
    assert.equal(ml.saldo.totalCentavos, 5460000);
    assert.deepEqual(ml.qtd, { entrada: 10, sinal: 5, saldo: 70 });
    assert.equal(d.toISO(ml.sinal.datas[0]), '2027-02-10');
    assert.equal(ml.divergenciaCentavos, 0);
  });
  test('quantidades zeradas usam os padrões e a divergência da tabela é medida', () => {
    const ml = r.modeloLinear(delta, 'Esmeralda', 1, venda);
    assert.equal(ml.usouPadrao, true);
    assert.deepEqual(ml.qtd, { entrada: 10, sinal: 5, saldo: 72 });
    assert.ok(Math.abs(ml.divergenciaCentavos) > 72);
  });
  test('categoria inexistente lista as disponíveis', () => {
    assert.throws(
      () => r.modeloLinear(delta, 'Diamante', 1, venda),
      (e) => e.codigo === 'CATEGORIA_PRECO_NAO_ENCONTRADA' && e.detalhes.disponiveis.includes('Esmeralda'),
    );
  });
  test('empreendimento sem tabela', () => {
    assert.throws(() => r.modeloLinear(emp('residencial-alfa'), 'Bronze', 1, venda), /não possui tabela/);
  });
});

describe('dinheiro', () => {
  test('dividirEmParcelas: soma sempre igual ao total, resto nas primeiras', () => {
    assert.deepEqual(dividirEmParcelas(100000, 3), [33334, 33333, 33333]);
  });
});
