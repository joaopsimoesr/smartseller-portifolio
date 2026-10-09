// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

/**
 * Orquestra as 24 regras numa simulação completa — o que o assistente de
 * venda (frontend) envia ao final das etapas.
 *
 *   1ª entrada → 2ª entrada (opcional) → entrada restante → sinal → saldo
 *
 * Cada resultado lista as regras aplicadas (`regrasAplicadas`), para
 * rastrear a cobertura contra o REGRAS.md.
 */

const { CONFIG } = require('../config/regras');
const { ErroDeRegra } = require('../regras/erros');
const datas = require('../regras/datas');
const calc = require('../regras/calculo');
const { parcelar, formatarBRL, paraCentavos, paraReais } = require('../regras/dinheiro');

const ORDEM = ['PRIMEIRA_ENTRADA', 'SEGUNDA_ENTRADA', 'ENTRADA_RESTANTE', 'SINAL', 'SALDO'];

function itens(etapa, datasVenc, valores, extra = {}) {
  return datasVenc.map((d, i) => ({
    etapa,
    parcela: i + 1,
    totalParcelas: datasVenc.length,
    vencimento: datas.toISO(d),
    valor: valores[i],
    ...extra,
  }));
}

function ordenar(cronograma) {
  return [...cronograma].sort(
    (a, b) => a.vencimento.localeCompare(b.vencimento) || ORDEM.indexOf(a.etapa) - ORDEM.indexOf(b.etapa) || a.parcela - b.parcela,
  );
}

function resumir(cronograma) {
  return {
    totalPlano: paraReais(cronograma.reduce((s, p) => s + paraCentavos(p.valor), 0)),
    quantidadeParcelas: cronograma.length,
    primeiroVencimento: cronograma[0]?.vencimento ?? null,
    ultimoVencimento: cronograma[cronograma.length - 1]?.vencimento ?? null,
  };
}

/** Série mensal ancorada num dia fixo (sinal e saldo). */
function serieNoDia(inicio, n, dia) {
  return Array.from({ length: n }, (_, i) => datas.setDayOfMonth(datas.addMonths(datas.setDayOfMonth(inicio, 1), i), dia));
}

function criarSimulador(repo, { relogio = () => Date.now() } = {}) {
  let cache = calc.syncVentureRules(repo.listarEmpreendimentos(), relogio());

  /** Regra 23: ressincroniza quando o cache expira. */
  function cacheValido() {
    if (relogio() - cache.sincronizadoEm >= CONFIG.cacheRegras.validadeMs) {
      cache = calc.syncVentureRules(repo.listarEmpreendimentos(), relogio());
    }
    return cache;
  }

  function empreendimentoAtivo(id) {
    const emp = repo.buscarEmpreendimento(id);
    if (!emp || emp.ativo === false) throw new ErroDeRegra('EMPREENDIMENTO_NAO_ENCONTRADO', `Empreendimento não encontrado ou inativo: ${id}`);
    return emp;
  }

  function simularPadrao(e) {
    const aplicadas = new Set([5, 23]);
    const emp = empreendimentoAtivo(e.empreendimentoId);
    const dataVenda = datas.parseInputDate(e.dataVenda);
    const alertas = [];
    const cronograma = [];

    // Entrada (regra 10)
    const excecoes = repo.buscarTabelaVigente(emp.id, 'EXCECOES', e.dataVenda);
    const entrada = calc.calculateEntryAmount(emp, e.quantidadeCotas, excecoes?.dados ?? null);
    aplicadas.add(10);

    // 1ª entrada (regras 13, 14; 8 e 1 dentro da 13)
    const p1 = e.primeiraEntrada;
    const d1 = calc.calculateFirstEntryDates(dataVenda, p1.parcelas, p1.meioPagamento).datas;
    cronograma.push(...itens('PRIMEIRA_ENTRADA', d1, calc.calculateFirstEntryParcelValue(p1.valor, p1.parcelas).parcelas, { meioPagamento: p1.meioPagamento }));
    [13, 14, 1].forEach((r) => aplicadas.add(r));
    if (CONFIG.meiosPagamento[p1.meioPagamento] === 'PROXIMO_DIA_UTIL') [8, 9].forEach((r) => aplicadas.add(r));

    // 2ª entrada (opcional)
    let d2 = [];
    if (e.segundaEntrada) {
      const p2 = e.segundaEntrada;
      const base = p2.dataBase ? datas.parseInputDate(p2.dataBase) : dataVenda;
      if (base < dataVenda) throw new ErroDeRegra('DATA_ANTERIOR_A_VENDA', 'A 2ª entrada não pode ser anterior à venda');
      d2 = calc.calculateFirstEntryDates(base, p2.parcelas, p2.meioPagamento).datas;
      cronograma.push(...itens('SEGUNDA_ENTRADA', d2, calc.calculateFirstEntryParcelValue(p2.valor, p2.parcelas).parcelas, { meioPagamento: p2.meioPagamento }));
    }

    // Entrada restante (regras 15, 16, 22, 2)
    const nRestante = e.entradaRestante?.parcelas ?? 1;
    const restante = calc.calculateRemainingEntryValue(entrada.valorTotalEntrada, p1.valor, e.segundaEntrada?.valor ?? 0, nRestante);
    aplicadas.add(15);
    if (restante.negativo) {
      throw new ErroDeRegra(
        'ENTRADA_EXCEDIDA',
        `1ª + 2ª entrada excedem a entrada total (${formatarBRL(entrada.valorTotalEntrada)}) em ${formatarBRL(-restante.valorRestante)}`,
      );
    }
    let dRestante = [];
    if (restante.valorRestante > 0) {
      if (!e.entradaRestante) {
        throw new ErroDeRegra('ENTRADA_RESTANTE_OBRIGATORIA', `Faltam ${formatarBRL(restante.valorRestante)} de entrada: informe a entrada restante`);
      }
      const inicio = datas.parseInputDate(e.entradaRestante.dataInicio);
      if (inicio <= dataVenda) throw new ErroDeRegra('DATA_ANTERIOR_A_VENDA', 'A entrada restante deve começar após a venda');
      dRestante = calc.calculateRemainingEntryDates(inicio, nRestante);
      cronograma.push(...itens('ENTRADA_RESTANTE', dRestante, restante.parcelas));
      const pulados = calc.identifySkippedMonths(inicio, d1, d2);
      [16, 22, 2].forEach((r) => aplicadas.add(r));
      if (pulados.length) {
        alertas.push({ codigo: 'MESES_SEM_PAGAMENTO', severidade: 'aviso', mensagem: `Meses sem parcela antes da entrada restante: ${pulados.join(', ')}`, meses: pulados });
      }
    }

    // Sinal (regras 11, 6, 17, 21)
    const inicioSinal = datas.parseInputDate(e.sinal.dataInicio);
    if (inicioSinal <= dataVenda) throw new ErroDeRegra('DATA_ANTERIOR_A_VENDA', 'O sinal deve começar após a venda');
    const diaSinal = e.sinal.dia ?? inicioSinal.getUTCDate();
    const sinal = calc.calculateSignalAmount(e.valorUnidade, { empreendimento: emp, cache: cacheValido(), agora: relogio() });
    const dSinal = serieNoDia(inicioSinal, e.sinal.parcelas, diaSinal);
    cronograma.push(...itens('SINAL', dSinal, parcelar(sinal.valorSinal, e.sinal.parcelas)));
    [11, 6].forEach((r) => aplicadas.add(r));

    if (dRestante.length) {
      const conflito = calc.checkSignalConflict(dSinal[0], dRestante);
      aplicadas.add(17);
      if (conflito.conflito) {
        alertas.push({
          codigo: 'CONFLITO_SINAL_ENTRADA',
          severidade: 'bloqueante',
          mensagem: `O sinal começa antes do fim da entrada restante (${datas.formatDate(conflito.ultimaParcelaRestante)}). Início sugerido: ${datas.formatDate(conflito.inicioSugerido)}`,
          inicioSugerido: datas.toISO(conflito.inicioSugerido),
        });
        aplicadas.add(4);
      }
    }

    const alcada = calc.checkSignalAuthorizationRequired(dSinal[0], dataVenda);
    aplicadas.add(21);
    if (alcada.exigida) alertas.push({ codigo: 'APROVACAO_NECESSARIA', severidade: 'atencao', mensagem: alcada.mensagem, nivel: alcada.nivel });

    // Saldo (regras 19, 20, 18, 3)
    const valorSaldo = calc.calculateBalanceAmount(e.valorUnidade, entrada.valorTotalEntrada, sinal.valorSinal);
    if (valorSaldo <= 0) throw new ErroDeRegra('VALOR_UNIDADE_INSUFICIENTE', 'Valor da unidade não cobre entrada + sinal');
    const parcelasSaldo = calc.calculateBalanceInstallmentValue(valorSaldo, e.saldo.parcelas).parcelas;
    const inicioSaldo = calc.calculateBalanceStartDate(dSinal[0], e.sinal.parcelas, diaSinal);
    cronograma.push(...itens('SALDO', serieNoDia(inicioSaldo, e.saldo.parcelas, diaSinal), parcelasSaldo));
    [19, 20, 18, 3].forEach((r) => aplicadas.add(r));

    const ordenado = ordenar(cronograma);
    return {
      modelo: 'PADRAO',
      regrasVersao: CONFIG.versao,
      empreendimento: { id: emp.id, nome: emp.nome, categoria: emp.categoria },
      quantidadeCotas: e.quantidadeCotas,
      dataVenda: e.dataVenda,
      resumo: {
        valorUnidade: e.valorUnidade,
        entrada: { total: entrada.valorTotalEntrada, regra: entrada.regraAplicada, restante: restante.valorRestante },
        sinal: { total: sinal.valorSinal, percentual: sinal.percentualSinal, origemPercentual: sinal.origemPercentual },
        saldo: { total: valorSaldo },
        ...resumir(ordenado),
      },
      alertas,
      cronograma: ordenado,
      regrasAplicadas: [...aplicadas].sort((a, b) => a - b),
    };
  }

  function simularLinear(e) {
    const emp = empreendimentoAtivo(e.empreendimentoId);
    const dataVenda = datas.parseInputDate(e.dataVenda);
    const tabela = repo.buscarTabelaVigente(emp.id, 'LINEAR', e.dataVenda);
    const r = calc.calculateLinearModelPayments(emp, e.categoriaPreco, e.quantidadeCotas, dataVenda, tabela?.dados ?? null);
    const ordenado = ordenar([
      ...itens('PRIMEIRA_ENTRADA', r.entrada.datas, r.entrada.parcelas, { meioPagamento: CONFIG.modeloLinear.meioPagamentoEntrada }),
      ...itens('SINAL', r.sinal.datas, r.sinal.parcelas),
      ...itens('SALDO', r.saldo.datas, r.saldo.parcelas),
    ]);
    const alertas = [];
    if (r.saldo.divergenciaTabela !== 0) {
      alertas.push({
        codigo: 'DIVERGENCIA_TABELA_LINEAR',
        severidade: 'info',
        mensagem: `Parcela de saldo da tabela (${formatarBRL(r.saldo.valorParcelaTabela)}) × ${r.saldo.qtdParcelas} difere do saldo calculado em ${formatarBRL(r.saldo.divergenciaTabela)}`,
      });
    }
    return {
      modelo: 'LINEAR',
      regrasVersao: CONFIG.versao,
      empreendimento: { id: emp.id, nome: emp.nome, categoria: emp.categoria },
      categoriaPreco: r.categoriaPreco,
      tabelaVersao: tabela.versao,
      quantidadeCotas: r.quantCotas,
      dataVenda: e.dataVenda,
      resumo: {
        valorUnidade: r.valorTotal,
        entrada: { total: r.entrada.valorTotal, parcelas: r.entrada.qtdParcelas },
        sinal: { total: r.sinal.valorTotal, parcelas: r.sinal.qtdParcelas },
        saldo: { total: r.saldo.valorTotal, parcelas: r.saldo.qtdParcelas },
        ...resumir(ordenado),
      },
      alertas,
      cronograma: ordenado,
      regrasAplicadas: [1, 5, 6, 13, 24],
    };
  }

  return { simularPadrao, simularLinear, cacheAtual: () => cacheValido() };
}

module.exports = { criarSimulador };
