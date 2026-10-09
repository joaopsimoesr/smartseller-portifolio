/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

/**
 * Orquestra as regras atômicas (R01–R24) numa simulação completa.
 *
 * Fluxo da negociação:
 *   1ª entrada  →  2ª entrada (opcional)  →  entrada restante  →  sinal  →  saldo
 *
 * Invariante central (coberta por teste): a soma de todas as parcelas do
 * cronograma é exatamente igual ao valor da unidade, ao centavo.
 * Cada resposta lista as regras aplicadas (`regrasAplicadas`), para que o
 * cálculo seja auditável.
 */

const { REGRAS } = require('../config/regras');
const { ErroDeNegocio } = require('./erros');
const datas = require('./datas');
const { paraCentavos, paraReais, formatarBRL } = require('./dinheiro');
const r = require('./regras');

const ORDEM_ETAPAS = ['PRIMEIRA_ENTRADA', 'SEGUNDA_ENTRADA', 'ENTRADA_RESTANTE', 'SINAL', 'SALDO'];

function montarParcelas(etapa, datasVenc, valoresCentavos, extra = {}) {
  return datasVenc.map((d, i) => ({
    etapa,
    parcela: i + 1,
    totalParcelas: datasVenc.length,
    vencimento: datas.toISO(d),
    valor: paraReais(valoresCentavos[i]),
    ...extra,
  }));
}

function ordenarCronograma(itens) {
  return [...itens].sort(
    (a, b) =>
      a.vencimento.localeCompare(b.vencimento) ||
      ORDEM_ETAPAS.indexOf(a.etapa) - ORDEM_ETAPAS.indexOf(b.etapa) ||
      a.parcela - b.parcela,
  );
}

function resumirCronograma(cronograma) {
  const totalCentavos = cronograma.reduce((s, p) => s + paraCentavos(p.valor), 0);
  return {
    totalPlano: paraReais(totalCentavos),
    quantidadeParcelas: cronograma.length,
    primeiroVencimento: cronograma[0]?.vencimento ?? null,
    ultimoVencimento: cronograma[cronograma.length - 1]?.vencimento ?? null,
  };
}

function buscarEmpreendimentoAtivo(repo, id, dataVenda) {
  // Tabelas vigentes na data da venda (temporalidade), não na data de hoje.
  const emp = repo.buscarPorId(id, { data: dataVenda });
  if (!emp || !emp.ativo) {
    throw new ErroDeNegocio('EMPREENDIMENTO_NAO_ENCONTRADO', `Empreendimento não encontrado ou inativo: ${id}`);
  }
  return emp;
}

const mesBR = (chave) => chave.split('-').reverse().join('/');

/**
 * @param {object} entrada payload validado
 * @param {object} repo repositório de empreendimentos
 * @param {{cacheRegras?: object}} [opcoes] cache de regras (R23), opcional
 */
function simularPlanoPadrao(entrada, repo, { cacheRegras = null } = {}) {
  const emp = buscarEmpreendimentoAtivo(repo, entrada.empreendimentoId, entrada.dataVenda);
  const dataVenda = datas.parseISO(entrada.dataVenda); // R05
  const cotas = entrada.quantidadeCotas;
  const valorUnidadeCent = paraCentavos(entrada.valorUnidade);
  const alertas = [];
  const cronograma = [];
  const aplicadas = new Set(['R05']);

  // --- Entrada -------------------------------------------------------------
  const ent = r.valorEntrada(emp, cotas, dataVenda); // R10
  aplicadas.add('R10');

  const p1Cent = paraCentavos(entrada.primeiraEntrada.valor);
  const datasP1 = r.datasPorMeioDePagamento(entrada.primeiraEntrada.meioPagamento, dataVenda, entrada.primeiraEntrada.parcelas); // R13
  cronograma.push(
    ...montarParcelas('PRIMEIRA_ENTRADA', datasP1, r.parcelasDaEntrada(p1Cent, datasP1.length), { // R14
      meioPagamento: entrada.primeiraEntrada.meioPagamento,
    }),
  );
  aplicadas.add('R13').add('R14');
  if (REGRAS.meiosPagamento[entrada.primeiraEntrada.meioPagamento].regra === 'DIAS_UTEIS_APOS') {
    ['R07', 'R08', 'R09'].forEach((x) => aplicadas.add(x));
  }

  let p2Cent = 0;
  let datasP2 = [];
  if (entrada.segundaEntrada) {
    const s = entrada.segundaEntrada;
    p2Cent = paraCentavos(s.valor);
    const base = s.dataBase ? datas.parseISO(s.dataBase) : dataVenda;
    if (base < dataVenda) {
      throw new ErroDeNegocio('DATA_ANTERIOR_A_VENDA', 'A 2ª entrada não pode ser anterior à venda');
    }
    datasP2 = r.datasPorMeioDePagamento(s.meioPagamento, base, s.parcelas);
    cronograma.push(
      ...montarParcelas('SEGUNDA_ENTRADA', datasP2, r.parcelasDaEntrada(p2Cent, datasP2.length), {
        meioPagamento: s.meioPagamento,
      }),
    );
  }

  const { restanteCentavos, negativo } = r.entradaRestante(ent.totalCentavos, p1Cent, p2Cent); // R15
  aplicadas.add('R15');
  if (negativo) {
    throw new ErroDeNegocio(
      'ENTRADA_EXCEDIDA',
      `1ª + 2ª entrada (${formatarBRL(p1Cent + p2Cent)}) excedem a entrada total (${formatarBRL(ent.totalCentavos)})`,
    );
  }

  let datasRestante = [];
  if (restanteCentavos > 0) {
    if (!entrada.entradaRestante) {
      throw new ErroDeNegocio(
        'ENTRADA_RESTANTE_OBRIGATORIA',
        `Faltam ${formatarBRL(restanteCentavos)} de entrada: informe o parcelamento da entrada restante`,
      );
    }
    const inicio = datas.parseISO(entrada.entradaRestante.dataInicio);
    if (inicio <= dataVenda) {
      throw new ErroDeNegocio('DATA_ANTERIOR_A_VENDA', 'A entrada restante deve começar após a venda');
    }
    datasRestante = r.datasEntradaRestante(inicio, entrada.entradaRestante.parcelas); // R16, R01
    cronograma.push(
      ...montarParcelas('ENTRADA_RESTANTE', datasRestante, r.parcelasDaEntrada(restanteCentavos, datasRestante.length)),
    );
    aplicadas.add('R16').add('R01');

    const pulados = r.mesesPuladosAntesDaRestante(inicio, datasP1, datasP2); // R22, R02
    aplicadas.add('R22').add('R02');
    if (pulados.length > 0) {
      alertas.push({
        codigo: 'MESES_SEM_PAGAMENTO',
        regra: 'R22',
        severidade: 'aviso',
        mensagem: `Há ${pulados.length} mês(es) sem parcela antes da entrada restante: ${pulados.map(mesBR).join(', ')}`,
        meses: pulados,
      });
    }
  } else if (entrada.entradaRestante) {
    alertas.push({
      codigo: 'ENTRADA_QUITADA',
      regra: 'R15',
      severidade: 'info',
      mensagem: 'A entrada foi quitada na 1ª/2ª entrada; o parcelamento da entrada restante foi ignorado',
    });
  }

  // --- Sinal ---------------------------------------------------------------
  const sinal = r.valorSinal(emp, valorUnidadeCent, { regrasEmCache: cacheRegras?.ler(emp.id) }); // R11, R23
  aplicadas.add('R11');
  if (sinal.origem === 'CACHE') aplicadas.add('R23');
  const inicioSinal = datas.parseISO(entrada.sinal.dataInicio);
  if (inicioSinal <= dataVenda) {
    throw new ErroDeNegocio('DATA_ANTERIOR_A_VENDA', 'O sinal deve começar após a venda');
  }
  const datasSinal = datas.serieMensal(inicioSinal, entrada.sinal.parcelas);
  cronograma.push(...montarParcelas('SINAL', datasSinal, r.parcelasDoSinal(sinal.totalCentavos, datasSinal.length))); // R12
  aplicadas.add('R12');

  const conflito = r.conflitoSinalEntrada(inicioSinal, datasRestante); // R17
  aplicadas.add('R17');
  if (conflito.conflito) {
    alertas.push({
      codigo: 'CONFLITO_SINAL_ENTRADA',
      regra: 'R17',
      severidade: 'bloqueante',
      mensagem: `O sinal começa antes do fim da entrada restante (${datas.toBR(conflito.ultimaParcelaRestante)}). Início sugerido: ${datas.toBR(conflito.inicioSugerido)}`, // R04
      inicioSugerido: datas.toISO(conflito.inicioSugerido),
    });
    aplicadas.add('R04');
  }

  const alcada = r.alcadaAprovacaoSinal(dataVenda, inicioSinal); // R21
  aplicadas.add('R21');
  if (alcada.exigeAprovacao) {
    alertas.push({
      codigo: 'APROVACAO_NECESSARIA',
      regra: 'R21',
      severidade: 'atencao',
      mensagem: `Sinal inicia ${alcada.dias} dias após a venda: requer aprovação de ${alcada.rotulo}`,
      nivel: alcada.nivel,
    });
  }

  // --- Saldo ---------------------------------------------------------------
  const saldoCent = r.valorSaldo(valorUnidadeCent, ent.totalCentavos, sinal.totalCentavos); // R19
  const valoresSaldo = r.parcelasDoSaldo(saldoCent, entrada.saldo.parcelas); // R20
  const datasSaldo = datas.serieMensal(
    r.inicioSaldo(inicioSinal, datasSinal.length), // R18, R03
    entrada.saldo.parcelas,
    inicioSinal.getUTCDate(),
  );
  cronograma.push(...montarParcelas('SALDO', datasSaldo, valoresSaldo));
  ['R18', 'R03', 'R19', 'R20'].forEach((x) => aplicadas.add(x));

  const ordenado = ordenarCronograma(cronograma);

  return {
    modelo: 'PADRAO',
    regrasVersao: REGRAS.versao,
    regrasAplicadas: [...aplicadas].sort(),
    empreendimento: { id: emp.id, nome: emp.nome, categoria: emp.categoria },
    quantidadeCotas: cotas,
    dataVenda: entrada.dataVenda,
    resumo: {
      valorUnidade: paraReais(valorUnidadeCent),
      entrada: {
        total: paraReais(ent.totalCentavos),
        porCota: paraReais(ent.porCotaCentavos),
        regra: ent.regra,
        primeira: paraReais(p1Cent),
        segunda: paraReais(p2Cent),
        restante: paraReais(restanteCentavos),
      },
      sinal: { total: paraReais(sinal.totalCentavos), percentual: sinal.percentual, origemPercentual: sinal.origem },
      saldo: { total: paraReais(saldoCent) },
      ...resumirCronograma(ordenado),
    },
    alertas,
    cronograma: ordenado,
  };
}

function simularModeloLinear(entrada, repo) {
  const emp = buscarEmpreendimentoAtivo(repo, entrada.empreendimentoId, entrada.dataVenda);
  const dataVenda = datas.parseISO(entrada.dataVenda);
  const ml = r.modeloLinear(emp, entrada.categoriaPreco, entrada.quantidadeCotas, dataVenda); // R24
  const alertas = [];

  if (ml.usouPadrao) {
    alertas.push({
      codigo: 'PARCELAS_PADRAO',
      regra: 'R24',
      severidade: 'info',
      mensagem: `A tabela de ${ml.linha.categoriaPreco} não define todas as quantidades de parcelas; foram usados os padrões (${ml.qtd.entrada}/${ml.qtd.sinal}/${ml.qtd.saldo})`,
    });
  }
  // Tolerância: o arredondamento da parcela da tabela a 2 casas gera até ½ centavo por parcela e cota.
  const tolerancia = ml.qtd.saldo * entrada.quantidadeCotas;
  if (Math.abs(ml.divergenciaCentavos) > tolerancia) {
    alertas.push({
      codigo: 'DIVERGENCIA_TABELA_LINEAR',
      regra: 'R24',
      severidade: 'aviso',
      mensagem: `A parcela de saldo da tabela soma ${formatarBRL(ml.saldo.totalCentavos + ml.divergenciaCentavos)}, mas o saldo é ${formatarBRL(ml.saldo.totalCentavos)}; o cronograma usa o saldo calculado`,
      divergencia: paraReais(ml.divergenciaCentavos),
    });
  }

  const cronograma = ordenarCronograma([
    ...montarParcelas('PRIMEIRA_ENTRADA', ml.entrada.datas, r.parcelasDaEntrada(ml.entrada.totalCentavos, ml.qtd.entrada), {
      meioPagamento: REGRAS.modeloLinear.meioPagamentoEntrada,
    }),
    ...montarParcelas('SINAL', ml.sinal.datas, r.parcelasDoSinal(ml.sinal.totalCentavos, ml.qtd.sinal)),
    ...montarParcelas('SALDO', ml.saldo.datas, r.parcelasDoSaldo(ml.saldo.totalCentavos, ml.qtd.saldo)),
  ]);

  return {
    modelo: 'LINEAR',
    regrasVersao: REGRAS.versao,
    regrasAplicadas: ['R01', 'R03', 'R05', 'R13', 'R18', 'R19', 'R24'],
    empreendimento: { id: emp.id, nome: emp.nome, categoria: emp.categoria },
    categoriaPreco: ml.linha.categoriaPreco,
    quantidadeCotas: entrada.quantidadeCotas,
    dataVenda: entrada.dataVenda,
    resumo: {
      valorUnidade: paraReais(ml.totalCentavos),
      entrada: { total: paraReais(ml.entrada.totalCentavos), parcelas: ml.qtd.entrada },
      sinal: { total: paraReais(ml.sinal.totalCentavos), parcelas: ml.qtd.sinal },
      saldo: { total: paraReais(ml.saldo.totalCentavos), parcelas: ml.qtd.saldo },
      ...resumirCronograma(cronograma),
    },
    alertas,
    cronograma,
  };
}

module.exports = { simularPlanoPadrao, simularModeloLinear };
