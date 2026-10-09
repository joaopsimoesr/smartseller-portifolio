/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

import { useState } from 'react';
import type { Alerta, Etapa, Simulacao } from '../api';
import { baixarArquivo, COR_ETAPA, cronogramaCSV, dataBR, moeda, ROTULO_ETAPA } from '../formato';

const ESTILO_ALERTA: Record<Alerta['severidade'], string> = {
  info: 'border-slate-300 bg-slate-50 text-slate-700',
  aviso: 'border-amber-300 bg-amber-50 text-amber-900',
  atencao: 'border-orange-300 bg-orange-50 text-orange-900',
  bloqueante: 'border-red-300 bg-red-50 text-red-900',
};

function Indicador({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className="text-lg font-semibold tabular-nums">{valor}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default function Resultado({ sim }: { sim: Simulacao }) {
  const [filtro, setFiltro] = useState<Etapa | 'TODAS'>('TODAS');
  const { resumo } = sim;
  const etapas = [...new Set(sim.cronograma.map((p) => p.etapa))];
  const linhas = filtro === 'TODAS' ? sim.cronograma : sim.cronograma.filter((p) => p.etapa === filtro);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {sim.empreendimento.nome} · {sim.quantidadeCotas} cota(s)
          {sim.modelo === 'LINEAR' && ' · modelo linear'}
        </h2>
        <span className="text-xs text-slate-400">regras {sim.regrasVersao}</span>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador rotulo="Unidade" valor={moeda(resumo.valorUnidade)} />
        <Indicador rotulo="Entrada" valor={moeda(resumo.entrada.total)} sub={typeof resumo.entrada.regra === 'string' ? `regra: ${resumo.entrada.regra.toLowerCase()}` : undefined} />
        <Indicador rotulo="Sinal" valor={moeda(resumo.sinal.total)} sub={resumo.sinal.percentual ? `${resumo.sinal.percentual}% da unidade` : undefined} />
        <Indicador rotulo="Saldo" valor={moeda(resumo.saldo.total)} />
      </div>

      <p className="text-sm text-slate-600">
        {resumo.quantidadeParcelas} parcelas de {dataBR(resumo.primeiroVencimento)} a {dataBR(resumo.ultimoVencimento)} ·
        total do plano <strong>{moeda(resumo.totalPlano)}</strong>
      </p>

      {sim.alertas.length > 0 && (
        <ul className="space-y-2">
          {sim.alertas.map((a) => (
            <li key={a.codigo} className={`rounded-md border px-3 py-2 text-sm ${ESTILO_ALERTA[a.severidade]}`}>
              {a.mensagem}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(['TODAS', ...etapas] as const).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setFiltro(e)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filtro === e ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            {e === 'TODAS' ? 'Todas' : ROTULO_ETAPA[e]}
          </button>
        ))}
        <button
          type="button"
          className="ml-auto text-xs font-medium text-indigo-600 hover:underline"
          onClick={() => baixarArquivo(`simulacao-${sim.empreendimento.id}.csv`, cronogramaCSV(sim.cronograma))}
        >
          Exportar CSV
        </button>
      </div>

      <div className="max-h-[28rem] overflow-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Etapa</th>
              <th className="px-3 py-2">Parcela</th>
              <th className="px-3 py-2">Vencimento</th>
              <th className="px-3 py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((p) => (
              <tr key={`${p.etapa}-${p.parcela}`} className="border-t border-slate-100">
                <td className="px-3 py-1.5">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${COR_ETAPA[p.etapa]}`}>{ROTULO_ETAPA[p.etapa]}</span>
                </td>
                <td className="px-3 py-1.5 tabular-nums text-slate-600">{p.parcela}/{p.totalParcelas}</td>
                <td className="px-3 py-1.5 tabular-nums">{dataBR(p.vencimento)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{moeda(p.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
