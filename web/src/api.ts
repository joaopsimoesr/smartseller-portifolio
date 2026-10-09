export type MeioPagamento =
  | 'PIX'
  | 'DINHEIRO'
  | 'TED'
  | 'CARTAO_DEBITO'
  | 'CARTAO_CREDITO'
  | 'BOLETO';

export interface Empreendimento {
  id: string;
  nome: string;
  categoria: 'PADRAO' | 'PREMIUM';
  percentualSinal: number;
  promocaoEntrada: { descricao: string; valorPorCota: number; inicio: string; fim: string } | null;
  categoriasLinear: string[];
}

export interface Regras {
  versao: string;
  limites: { cotasMin: number; cotasMax: number; parcelasMax: number };
  entrada: { valorPorCota: Record<string, number> };
  meiosPagamento: Record<MeioPagamento, { rotulo: string; regra: string; parcelasMax: number }>;
}

export type Etapa = 'PRIMEIRA_ENTRADA' | 'SEGUNDA_ENTRADA' | 'ENTRADA_RESTANTE' | 'SINAL' | 'SALDO';

export interface Parcela {
  etapa: Etapa;
  parcela: number;
  totalParcelas: number;
  vencimento: string;
  valor: number;
  meioPagamento?: MeioPagamento;
}

export interface Alerta {
  codigo: string;
  severidade: 'info' | 'aviso' | 'atencao' | 'bloqueante';
  mensagem: string;
}

export interface Simulacao {
  modelo: 'PADRAO' | 'LINEAR';
  regrasVersao: string;
  empreendimento: { id: string; nome: string; categoria: string };
  quantidadeCotas: number;
  dataVenda: string;
  resumo: {
    valorUnidade: number;
    entrada: { total: number; [k: string]: number | string };
    sinal: { total: number; percentual?: number; parcelas?: number };
    saldo: { total: number; parcelas?: number };
    totalPlano: number;
    quantidadeParcelas: number;
    primeiroVencimento: string;
    ultimoVencimento: string;
  };
  alertas: Alerta[];
  cronograma: Parcela[];
}

export class ErroApi extends Error {
  constructor(
    message: string,
    public detalhes: { campo: string; mensagem: string }[] = [],
  ) {
    super(message);
  }
}

async function chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`/api${caminho}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const corpo = await resp.json().catch(() => null);
  if (!resp.ok || !corpo?.success) {
    const erro = corpo?.error;
    throw new ErroApi(
      erro?.mensagem ?? `Falha na API (${resp.status})`,
      Array.isArray(erro?.detalhes) ? erro.detalhes : [],
    );
  }
  return corpo.data as T;
}

export const api = {
  regras: () => chamar<Regras>('/regras'),
  empreendimentos: () => chamar<Empreendimento[]>('/empreendimentos'),
  simular: (payload: unknown) =>
    chamar<Simulacao>('/simulacoes', { method: 'POST', body: JSON.stringify(payload) }),
  simularLinear: (payload: unknown) =>
    chamar<Simulacao>('/simulacoes/linear', { method: 'POST', body: JSON.stringify(payload) }),
};
