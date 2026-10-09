// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

export type Perfil = 'VENDEDOR' | 'ADMIN';
export interface Usuario { id: number; email: string; nome: string; perfil: Perfil }

export interface Empreendimento {
  id: string;
  nome: string;
  categoria: 'PADRAO' | 'PREMIUM';
  percentualSinal: number;
  temExcecoes: boolean;
  categoriasLinear: string[];
}

export interface Parcela { etapa: string; parcela: number; totalParcelas: number; vencimento: string; valor: number; meioPagamento?: string }
export interface Alerta { codigo: string; severidade: 'info' | 'aviso' | 'atencao' | 'bloqueante'; mensagem: string }

export interface Simulacao {
  modelo: 'PADRAO' | 'LINEAR';
  regrasVersao: string;
  empreendimento: { id: string; nome: string; categoria: string };
  categoriaPreco?: string;
  quantidadeCotas: number;
  resumo: {
    valorUnidade: number;
    entrada: { total: number; regra?: string };
    sinal: { total: number; percentual?: number };
    saldo: { total: number };
    totalPlano: number;
    quantidadeParcelas: number;
    primeiroVencimento: string;
    ultimoVencimento: string;
  };
  alertas: Alerta[];
  cronograma: Parcela[];
  regrasAplicadas: number[];
}

export class ErroApi extends Error {
  constructor(message: string, public detalhes: { campo: string; mensagem: string }[] = []) {
    super(message);
  }
}

let token: string | null = null;
export const definirToken = (t: string | null) => {
  token = t;
};

async function requisitar(caminho: string, init: RequestInit = {}): Promise<Response> {
  const resp = await fetch(`/api${caminho}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  if (!resp.ok) {
    const corpo = await resp.json().catch(() => null);
    throw new ErroApi(corpo?.error?.mensagem ?? `Falha na API (${resp.status})`, corpo?.error?.detalhes ?? []);
  }
  return resp;
}

async function json<T>(caminho: string, init?: RequestInit): Promise<T> {
  return (await (await requisitar(caminho, init)).json()).data as T;
}

const post = (corpo: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(corpo) });

async function baixar(caminho: string, corpo: unknown, nome: string) {
  const blob = await (await requisitar(caminho, corpo === undefined ? {} : post(corpo))).blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  a.click();
  URL.revokeObjectURL(url);
}

export const api = {
  login: (email: string, senha: string) => json<{ token: string; usuario: Usuario }>('/auth/login', post({ email, senha })),
  empreendimentos: () => json<Empreendimento[]>('/empreendimentos'),
  simular: (p: unknown) => json<Simulacao>('/simulacoes', post(p)),
  simularLinear: (p: unknown) => json<Simulacao>('/simulacoes/linear', post(p)),
  fichaNegociacao: (p: unknown, linear: boolean) => baixar(linear ? '/fichas/negociacao/linear' : '/fichas/negociacao', p, 'ficha-negociacao.pdf'),
  fichaCadastro: (p: unknown) => baixar('/fichas/cadastro', p, 'ficha-cadastro.pdf'),
  tabelas: () => json<{ versoes: Record<string, string | number>[]; exemplos: Record<string, string> }>('/tabelas'),
  importar: (p: unknown) => json<Record<string, string | number>>('/tabelas/importar', post(p)),
  shadowComparar: (p: unknown) => json<unknown[]>('/shadow/comparar', post(p)),
  shadowEstatisticas: () =>
    json<{ total: number; equivalentes: number; divergentes: number; taxaEquivalencia: number | null; porFuncao: Record<string, { total: number; divergentes: number }>; ultimas: { id: number; funcao: string; equivalente: boolean; diferencas: { campo: string; legado: unknown; novo: unknown; delta?: unknown }[] }[] }>(
      '/shadow/estatisticas',
    ),
};

export const moeda = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const dataBR = (iso?: string) => (iso ? iso.split('-').reverse().join('/') : '-');
export const ROTULO_ETAPA: Record<string, string> = {
  PRIMEIRA_ENTRADA: '1ª entrada',
  SEGUNDA_ENTRADA: '2ª entrada',
  ENTRADA_RESTANTE: 'Entrada restante',
  SINAL: 'Sinal',
  SALDO: 'Saldo',
};
