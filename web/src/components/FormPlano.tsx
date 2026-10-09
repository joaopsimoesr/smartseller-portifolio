/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

import { useMemo, useState } from 'react';
import type { Empreendimento, MeioPagamento, Regras } from '../api';
import { hojeISO, moeda, somarMesesISO } from '../formato';

interface Props {
  regras: Regras;
  empreendimentos: Empreendimento[];
  carregando: boolean;
  onSimular: (payload: unknown) => void;
}

const MEIOS: MeioPagamento[] = ['PIX', 'DINHEIRO', 'TED', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'BOLETO'];

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="rotulo">{rotulo}</span>
      {children}
    </label>
  );
}

export default function FormPlano({ regras, empreendimentos, carregando, onSimular }: Props) {
  const venda0 = hojeISO();
  const [f, setF] = useState({
    empreendimentoId: empreendimentos[0]?.id ?? '',
    quantidadeCotas: 2,
    valorUnidade: 80000,
    dataVenda: venda0,
    p1Meio: 'PIX' as MeioPagamento,
    p1Parcelas: 1,
    p1Valor: 1000,
    usarSegunda: false,
    p2Meio: 'BOLETO' as MeioPagamento,
    p2Parcelas: 2,
    p2Valor: 1000,
    restanteParcelas: 2,
    restanteInicio: somarMesesISO(venda0, 1),
    sinalParcelas: 4,
    sinalInicio: somarMesesISO(venda0, 3),
    saldoParcelas: 60,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const num = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, Number(e.target.value) as never);
  const txt = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    set(k, e.target.value as never);

  const emp = empreendimentos.find((e) => e.id === f.empreendimentoId);

  // Estimativa apenas para orientar o preenchimento; o valor oficial vem da API.
  const entradaEstimada = useMemo(() => {
    if (!emp) return 0;
    const promo = emp.promocaoEntrada;
    const vigente = promo && f.dataVenda >= promo.inicio && f.dataVenda <= promo.fim;
    const porCota = vigente ? promo.valorPorCota : regras.entrada.valorPorCota[emp.categoria];
    return porCota * f.quantidadeCotas;
  }, [emp, f.dataVenda, f.quantidadeCotas, regras]);

  const maxParcelas = (m: MeioPagamento) => regras.meiosPagamento[m].parcelasMax;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    onSimular({
      empreendimentoId: f.empreendimentoId,
      quantidadeCotas: f.quantidadeCotas,
      valorUnidade: f.valorUnidade,
      dataVenda: f.dataVenda,
      primeiraEntrada: { meioPagamento: f.p1Meio, parcelas: f.p1Parcelas, valor: f.p1Valor },
      ...(f.usarSegunda && {
        segundaEntrada: { meioPagamento: f.p2Meio, parcelas: f.p2Parcelas, valor: f.p2Valor },
      }),
      entradaRestante: { parcelas: f.restanteParcelas, dataInicio: f.restanteInicio },
      sinal: { parcelas: f.sinalParcelas, dataInicio: f.sinalInicio },
      saldo: { parcelas: f.saldoParcelas },
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-6">
      <section className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Campo rotulo="Empreendimento">
            <select className="campo" value={f.empreendimentoId} onChange={txt('empreendimentoId')}>
              {empreendimentos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome} · {e.categoria === 'PREMIUM' ? 'Premium' : 'Padrão'}
                </option>
              ))}
            </select>
          </Campo>
          {emp?.promocaoEntrada && (
            <p className="mt-1 text-xs text-emerald-700">
              {emp.promocaoEntrada.descricao}: {moeda(emp.promocaoEntrada.valorPorCota)}/cota até{' '}
              {emp.promocaoEntrada.fim.split('-').reverse().join('/')}
            </p>
          )}
        </div>
        <Campo rotulo="Cotas">
          <input className="campo" type="number" min={regras.limites.cotasMin} max={regras.limites.cotasMax} value={f.quantidadeCotas} onChange={num('quantidadeCotas')} />
        </Campo>
        <Campo rotulo="Valor da unidade (R$)">
          <input className="campo" type="number" min={1} step="0.01" value={f.valorUnidade} onChange={num('valorUnidade')} />
        </Campo>
        <Campo rotulo="Data da venda">
          <input className="campo" type="date" value={f.dataVenda} onChange={txt('dataVenda')} />
        </Campo>
        <div className="flex items-end">
          <p className="text-sm text-slate-600">
            Entrada estimada: <strong>{moeda(entradaEstimada)}</strong>
          </p>
        </div>
      </section>

      <fieldset className="space-y-3 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold">1ª entrada</legend>
        <div className="grid grid-cols-3 gap-3">
          <Campo rotulo="Meio">
            <select className="campo" value={f.p1Meio} onChange={(e) => { const m = e.target.value as MeioPagamento; setF((s) => ({ ...s, p1Meio: m, p1Parcelas: Math.min(s.p1Parcelas, maxParcelas(m)) })); }}>
              {MEIOS.map((m) => <option key={m} value={m}>{regras.meiosPagamento[m].rotulo}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Parcelas">
            <input className="campo" type="number" min={1} max={maxParcelas(f.p1Meio)} value={f.p1Parcelas} onChange={num('p1Parcelas')} />
          </Campo>
          <Campo rotulo="Valor (R$)">
            <input className="campo" type="number" min={0.01} step="0.01" value={f.p1Valor} onChange={num('p1Valor')} />
          </Campo>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={f.usarSegunda} onChange={(e) => set('usarSegunda', e.target.checked)} />
            2ª entrada (opcional)
          </label>
        </legend>
        {f.usarSegunda && (
          <div className="grid grid-cols-3 gap-3">
            <Campo rotulo="Meio">
              <select className="campo" value={f.p2Meio} onChange={(e) => { const m = e.target.value as MeioPagamento; setF((s) => ({ ...s, p2Meio: m, p2Parcelas: Math.min(s.p2Parcelas, maxParcelas(m)) })); }}>
                {MEIOS.map((m) => <option key={m} value={m}>{regras.meiosPagamento[m].rotulo}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Parcelas">
              <input className="campo" type="number" min={1} max={maxParcelas(f.p2Meio)} value={f.p2Parcelas} onChange={num('p2Parcelas')} />
            </Campo>
            <Campo rotulo="Valor (R$)">
              <input className="campo" type="number" min={0.01} step="0.01" value={f.p2Valor} onChange={num('p2Valor')} />
            </Campo>
          </div>
        )}
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold">Entrada restante</legend>
        <Campo rotulo="Parcelas">
          <input className="campo" type="number" min={1} max={regras.limites.parcelasMax} value={f.restanteParcelas} onChange={num('restanteParcelas')} />
        </Campo>
        <Campo rotulo="1º vencimento">
          <input className="campo" type="date" value={f.restanteInicio} onChange={txt('restanteInicio')} />
        </Campo>
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold">Sinal e saldo</legend>
        <Campo rotulo="Parcelas do sinal">
          <input className="campo" type="number" min={1} max={regras.limites.parcelasMax} value={f.sinalParcelas} onChange={num('sinalParcelas')} />
        </Campo>
        <Campo rotulo="Início do sinal">
          <input className="campo" type="date" value={f.sinalInicio} onChange={txt('sinalInicio')} />
        </Campo>
        <Campo rotulo="Parcelas do saldo">
          <input className="campo" type="number" min={1} max={regras.limites.parcelasMax} value={f.saldoParcelas} onChange={num('saldoParcelas')} />
        </Campo>
      </fieldset>

      <button className="botao w-full" disabled={carregando || !emp}>
        {carregando ? 'Calculando…' : 'Simular plano'}
      </button>
    </form>
  );
}
