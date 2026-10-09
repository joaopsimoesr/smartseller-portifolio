/**
 * Orquestra as regras atômicas numa simulação completa de plano de pagamento.
 *
 * Fluxo da negociação:
 *   1ª entrada  →  2ª entrada (opcional)  →  entrada restante  →  sinal  →  saldo
 *
 * Invariante central (coberta por teste): a soma de todas as parcelas do
 * cronograma é exatamente igual ao valor da unidade, ao centavo.
 */

const { REGRAS } = require('../config/regras');
const { ErroDeNegocio } = require('./erros');
const datas = require('./datas');
const { paraCentavos, paraReais, dividirEmParcelas } = require('./dinheiro');
const calc = require('./calculos');

const ORDEM_ETAPAS = [
  'PRIMEIRA_ENTRADA',
  'SEGUNDA_ENTRADA',
  'ENTRADA_RESTANTE',
  'SINAL',
  'SALDO',
];

function montarParcelas(etapa, datasVenc, totalCentavos, extra = {}) {
  const valores = dividirEmParcelas(totalCentavos, datasVenc.length);
  return datasVenc.map((d, i) => ({
    etapa,
    parcela: i + 1,
    totalParcelas: datasVenc.length,
    vencimento: datas.toISO(d),
    valor: paraReais(valores[i]),
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

function buscarEmpreendimentoAtivo(repo, id) {
  const emp = repo.buscarPorId(id);
  if (!emp || !emp.ativo) {
    throw new ErroDeNegocio(
      'EMPREENDIMENTO_NAO_ENCONTRADO',
      `Empreendimento não encontrado ou inativo: ${id}`,
    );
  }
  return emp;
}

function simularPlanoPadrao(entrada, repo) {
  const emp = buscarEmpreendimentoAtivo(repo, entrada.empreendimentoId);
  const dataVenda = datas.parseISO(entrada.dataVenda);
  const cotas = entrada.quantidadeCotas;
  const valorUnidadeCent = paraCentavos(entrada.valorUnidade);
  const alertas = [];
  const cronograma = [];

  // --- Entrada -------------------------------------------------------------
  const ent = calc.valorEntrada(emp, cotas, dataVenda);

  const p1Cent = paraCentavos(entrada.primeiraEntrada.valor);
  const datasP1 = calc.datasPorMeioDePagamento(
    entrada.primeiraEntrada.meioPagamento,
    dataVenda,
    entrada.primeiraEntrada.parcelas,
  );
  cronograma.push(
    ...montarParcelas('PRIMEIRA_ENTRADA', datasP1, p1Cent, {
      meioPagamento: entrada.primeiraEntrada.meioPagamento,
    }),
  );

  let p2Cent = 0;
  let datasP2 = [];
  if (entrada.segundaEntrada) {
    const s = entrada.segundaEntrada;
    p2Cent = paraCentavos(s.valor);
    const base = s.dataBase ? datas.parseISO(s.dataBase) : dataVenda;
    if (base < dataVenda) {
      throw new ErroDeNegocio('DATA_ANTERIOR_A_VENDA', 'A 2ª entrada não pode ser anterior à venda');
    }
    datasP2 = calc.datasPorMeioDePagamento(s.meioPagamento, base, s.parcelas);
    cronograma.push(
      ...montarParcelas('SEGUNDA_ENTRADA', datasP2, p2Cent, {
        meioPagamento: s.meioPagamento,
      }),
    );
  }

  const restanteCent = ent.totalCentavos - p1Cent - p2Cent;
  if (restanteCent < 0) {
    throw new ErroDeNegocio(
      'ENTRADA_EXCEDIDA',
      `1ª + 2ª entrada (R$ ${paraReais(p1Cent + p2Cent)}) excedem a entrada total (R$ ${paraReais(ent.totalCentavos)})`,
    );
  }

  let datasRestante = [];
  if (restanteCent > 0) {
    if (!entrada.entradaRestante) {
      throw new ErroDeNegocio(
        'ENTRADA_RESTANTE_OBRIGATORIA',
        `Faltam R$ ${paraReais(restanteCent)} de entrada: informe o parcelamento da entrada restante`,
      );
    }
    const inicio = datas.parseISO(entrada.entradaRestante.dataInicio);
    if (inicio <= dataVenda) {
      throw new ErroDeNegocio('DATA_ANTERIOR_A_VENDA', 'A entrada restante deve começar após a venda');
    }
    datasRestante = datas.serieMensal(inicio, entrada.entradaRestante.parcelas);
    cronograma.push(...montarParcelas('ENTRADA_RESTANTE', datasRestante, restanteCent));

    const pulados = calc.mesesSemPagamento([...datasP1, ...datasP2], inicio);
    if (pulados.length > 0) {
      alertas.push({
        codigo: 'MESES_SEM_PAGAMENTO',
        severidade: 'aviso',
        mensagem: `Há ${pulados.length} mês(es) sem parcela antes da entrada restante: ${pulados.join(', ')}`,
        meses: pulados,
      });
    }
  } else if (entrada.entradaRestante) {
    alertas.push({
      codigo: 'ENTRADA_QUITADA',
      severidade: 'info',
      mensagem: 'A entrada foi quitada na 1ª/2ª entrada; o parcelamento da entrada restante foi ignorado',
    });
  }

  // --- Sinal ---------------------------------------------------------------
  const sinal = calc.valorSinal(emp, valorUnidadeCent);
  const inicioSinal = datas.parseISO(entrada.sinal.dataInicio);
  if (inicioSinal <= dataVenda) {
    throw new ErroDeNegocio('DATA_ANTERIOR_A_VENDA', 'O sinal deve começar após a venda');
  }
  const datasSinal = datas.serieMensal(inicioSinal, entrada.sinal.parcelas);
  cronograma.push(...montarParcelas('SINAL', datasSinal, sinal.totalCentavos));

  const conflito = calc.conflitoSinalEntrada(inicioSinal, datasRestante);
  if (conflito.conflito) {
    alertas.push({
      codigo: 'CONFLITO_SINAL_ENTRADA',
      severidade: 'bloqueante',
      mensagem: `O sinal começa antes do fim da entrada restante (${datas.toISO(conflito.ultimaParcelaRestante)}). Início sugerido: ${datas.toISO(conflito.inicioSugerido)}`,
      inicioSugerido: datas.toISO(conflito.inicioSugerido),
    });
  }

  const alcada = calc.alcadaAprovacaoSinal(dataVenda, inicioSinal);
  if (alcada.exigeAprovacao) {
    alertas.push({
      codigo: 'APROVACAO_NECESSARIA',
      severidade: 'atencao',
      mensagem: `Sinal inicia ${alcada.dias} dias após a venda: requer aprovação de ${alcada.rotulo}`,
      nivel: alcada.nivel,
    });
  }

  // --- Saldo ---------------------------------------------------------------
  const saldoCent = valorUnidadeCent - ent.totalCentavos - sinal.totalCentavos;
  if (saldoCent <= 0) {
    throw new ErroDeNegocio(
      'VALOR_UNIDADE_INSUFICIENTE',
      'Valor da unidade não cobre entrada + sinal; não há saldo a parcelar',
    );
  }
  const datasSaldo = datas.serieMensal(
    calc.inicioSaldo(datasSinal),
    entrada.saldo.parcelas,
    inicioSinal.getUTCDate(),
  );
  cronograma.push(...montarParcelas('SALDO', datasSaldo, saldoCent));

  const ordenado = ordenarCronograma(cronograma);

  return {
    modelo: 'PADRAO',
    regrasVersao: REGRAS.versao,
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
        restante: paraReais(restanteCent),
      },
      sinal: { total: paraReais(sinal.totalCentavos), percentual: sinal.percentual },
      saldo: { total: paraReais(saldoCent) },
      ...resumirCronograma(ordenado),
    },
    alertas,
    cronograma: ordenado,
  };
}

function simularModeloLinear(entrada, repo) {
  const emp = buscarEmpreendimentoAtivo(repo, entrada.empreendimentoId);
  calc.validarCotas(entrada.quantidadeCotas);
  if (!emp.tabelaLinear) {
    throw new ErroDeNegocio('SEM_TABELA_LINEAR', `${emp.nome} não possui tabela do modelo linear`);
  }
  const linha = emp.tabelaLinear.find(
    (l) => l.categoriaPreco.toLowerCase() === entrada.categoriaPreco.trim().toLowerCase(),
  );
  if (!linha) {
    throw new ErroDeNegocio(
      'CATEGORIA_PRECO_NAO_ENCONTRADA',
      `Categoria "${entrada.categoriaPreco}" não existe na tabela de ${emp.nome}`,
      { disponiveis: emp.tabelaLinear.map((l) => l.categoriaPreco) },
    );
  }

  const cotas = entrada.quantidadeCotas;
  const dataVenda = datas.parseISO(entrada.dataVenda);
  const padrao = REGRAS.modeloLinear.parcelasPadrao;
  const qtd = {
    entrada: linha.entrada.parcelas || padrao.entrada,
    sinal: linha.sinal.parcelas || padrao.sinal,
    saldo: linha.saldo.parcelas || padrao.saldo,
  };

  const totalCent = paraCentavos(linha.valorCota) * cotas;
  const entradaCent = paraCentavos(linha.entrada.valorPorCota) * cotas;
  const sinalCent = paraCentavos(linha.sinal.valorPorCota) * cotas;
  const saldoCent = totalCent - entradaCent - sinalCent;

  // Entrada segue a regra do boleto; sinal vence num dia fixo do mês; saldo na sequência.
  const datasEntrada = calc.datasPorMeioDePagamento('BOLETO', dataVenda, qtd.entrada);
  const ultimaEntrada = datasEntrada[datasEntrada.length - 1];
  const inicioSinal = datas.addMeses(ultimaEntrada, 1, REGRAS.modeloLinear.diaVencimentoSinal);
  const datasSinal = datas.serieMensal(inicioSinal, qtd.sinal);
  const datasSaldo = datas.serieMensal(calc.inicioSaldo(datasSinal), qtd.saldo);

  const cronograma = ordenarCronograma([
    ...montarParcelas('PRIMEIRA_ENTRADA', datasEntrada, entradaCent, { meioPagamento: 'BOLETO' }),
    ...montarParcelas('SINAL', datasSinal, sinalCent),
    ...montarParcelas('SALDO', datasSaldo, saldoCent),
  ]);

  return {
    modelo: 'LINEAR',
    regrasVersao: REGRAS.versao,
    empreendimento: { id: emp.id, nome: emp.nome, categoria: emp.categoria },
    categoriaPreco: linha.categoriaPreco,
    quantidadeCotas: cotas,
    dataVenda: entrada.dataVenda,
    resumo: {
      valorUnidade: paraReais(totalCent),
      entrada: { total: paraReais(entradaCent), parcelas: qtd.entrada },
      sinal: { total: paraReais(sinalCent), parcelas: qtd.sinal },
      saldo: { total: paraReais(saldoCent), parcelas: qtd.saldo },
      ...resumirCronograma(cronograma),
    },
    alertas: [],
    cronograma,
  };
}

module.exports = { simularPlanoPadrao, simularModeloLinear };
