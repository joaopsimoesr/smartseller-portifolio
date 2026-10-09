/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

import type { Etapa, Parcela } from './api';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const moeda = (v: number) => brl.format(v);

/** Data ISO (YYYY-MM-DD) → DD/MM/AAAA, sem passar por Date (evita deslocamento de fuso). */
export const dataBR = (iso: string) => iso.split('-').reverse().join('/');

export const hojeISO = () => new Date().toISOString().slice(0, 10);

export function somarMesesISO(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const total = a * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = total % 12;
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

export const ROTULO_ETAPA: Record<Etapa, string> = {
  PRIMEIRA_ENTRADA: '1ª entrada',
  SEGUNDA_ENTRADA: '2ª entrada',
  ENTRADA_RESTANTE: 'Entrada restante',
  SINAL: 'Sinal',
  SALDO: 'Saldo',
};


export function cronogramaCSV(parcelas: Parcela[]): string {
  const linhas = parcelas.map((p) =>
    [ROTULO_ETAPA[p.etapa], `${p.parcela}/${p.totalParcelas}`, dataBR(p.vencimento), p.valor.toFixed(2).replace('.', ','), p.meioPagamento ?? ''].join(';'),
  );
  return ['Etapa;Parcela;Vencimento;Valor;Meio', ...linhas].join('\n');
}

export function baixarArquivo(nome: string, conteudo: string, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob(['﻿', conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}
