/**
 * Regras de cálculo atômicas — funções puras, sem I/O.
 * Valores monetários em centavos; datas como Date UTC.
 */

const { REGRAS } = require('../config/regras');
const { ErroDeNegocio } = require('./erros');
const datas = require('./datas');
const { paraCentavos } = require('./dinheiro');

function validarCotas(cotas) {
  const { cotasMin, cotasMax } = REGRAS.limites;
  if (!Number.isInteger(cotas) || cotas < cotasMin || cotas > cotasMax) {
    throw new ErroDeNegocio(
      'COTAS_FORA_DO_LIMITE',
      `Quantidade de cotas deve estar entre ${cotasMin} e ${cotasMax}`,
    );
  }
}

/**
 * Entrada = valor por cota × cotas.
 * Prioridade: promoção vigente na data da venda > valor da categoria.
 */
function valorEntrada(empreendimento, cotas, dataVenda) {
  validarCotas(cotas);
  const promo = empreendimento.promocaoEntrada;
  const iso = datas.toISO(dataVenda);
  const promoVigente = promo && iso >= promo.inicio && iso <= promo.fim;

  const valorPorCota = promoVigente
    ? promo.valorPorCota
    : REGRAS.entrada.valorPorCota[empreendimento.categoria];

  if (valorPorCota === undefined) {
    throw new ErroDeNegocio(
      'CATEGORIA_DESCONHECIDA',
      `Categoria sem valor de entrada: ${empreendimento.categoria}`,
    );
  }

  return {
    porCotaCentavos: paraCentavos(valorPorCota),
    totalCentavos: paraCentavos(valorPorCota) * cotas,
    regra: promoVigente ? 'PROMOCAO' : empreendimento.categoria,
  };
}

/** Sinal = percentual (do empreendimento ou padrão) sobre o valor da unidade. */
function valorSinal(empreendimento, valorUnidadeCentavos) {
  const percentual =
    empreendimento.percentualSinal ?? REGRAS.sinal.percentualPadrao;
  return {
    percentual,
    totalCentavos: Math.round((valorUnidadeCentavos * percentual) / 100),
  };
}

/** Datas das parcelas de uma entrada conforme o meio de pagamento. */
function datasPorMeioDePagamento(meio, dataBase, parcelas) {
  const cfg = REGRAS.meiosPagamento[meio];
  if (!cfg) {
    throw new ErroDeNegocio('MEIO_INVALIDO', `Meio de pagamento inválido: ${meio}`);
  }
  if (parcelas > cfg.parcelasMax) {
    throw new ErroDeNegocio(
      'PARCELAS_ACIMA_DO_PERMITIDO',
      `${cfg.rotulo} permite no máximo ${cfg.parcelasMax} parcela(s)`,
    );
  }

  switch (cfg.regra) {
    case 'MESMO_DIA':
      return [dataBase];
    case 'DIAS_UTEIS_APOS':
      return [datas.diasUteisApos(dataBase, cfg.diasUteis)];
    case 'MESES_APOS':
      return datas.serieMensal(
        datas.addMeses(dataBase, cfg.meses),
        parcelas,
        dataBase.getUTCDate(),
      );
    default:
      throw new Error(`Regra de meio de pagamento não implementada: ${cfg.regra}`);
  }
}

/**
 * Meses "pulados": entre o último pagamento anterior e o início da entrada
 * restante, quais meses ficam sem nenhuma parcela. Serve de alerta ao vendedor.
 */
function mesesSemPagamento(datasAnteriores, inicioRestante) {
  const anteriores = datasAnteriores.filter((d) => d < inicioRestante);
  if (anteriores.length === 0) return [];

  const comPagamento = new Set(anteriores.map(datas.chaveMes));
  const ultima = new Date(Math.max(...anteriores.map((d) => d.getTime())));
  const alvo = datas.chaveMes(inicioRestante);

  const pulados = [];
  for (let m = datas.addMeses(ultima, 1, 1); datas.chaveMes(m) < alvo; m = datas.addMeses(m, 1, 1)) {
    if (!comPagamento.has(datas.chaveMes(m))) pulados.push(datas.chaveMes(m));
  }
  return pulados;
}

/** O sinal não pode começar antes de terminar a entrada restante. */
function conflitoSinalEntrada(inicioSinal, datasRestante) {
  if (datasRestante.length === 0) return { conflito: false };
  const ultima = new Date(Math.max(...datasRestante.map((d) => d.getTime())));
  if (inicioSinal > ultima) return { conflito: false };
  return {
    conflito: true,
    ultimaParcelaRestante: ultima,
    inicioSugerido: datas.addMeses(ultima, 1),
  };
}

/** Alçada de aprovação conforme dias entre a venda e o início do sinal. */
function alcadaAprovacaoSinal(dataVenda, inicioSinal) {
  const dias = datas.diffDias(inicioSinal, dataVenda);
  const faixa = REGRAS.autorizacaoSinal.find((f) => dias > f.acimaDeDias);
  return {
    dias,
    exigeAprovacao: Boolean(faixa),
    nivel: faixa ? faixa.nivel : null,
    rotulo: faixa ? faixa.rotulo : null,
  };
}

/** Saldo começa no mês seguinte à última parcela do sinal, no mesmo dia do sinal. */
function inicioSaldo(datasSinal) {
  const ultima = datasSinal[datasSinal.length - 1];
  return datas.addMeses(ultima, 1, datasSinal[0].getUTCDate());
}

module.exports = {
  validarCotas,
  valorEntrada,
  valorSinal,
  datasPorMeioDePagamento,
  mesesSemPagamento,
  conflitoSinalEntrada,
  alcadaAprovacaoSinal,
  inicioSaldo,
};
