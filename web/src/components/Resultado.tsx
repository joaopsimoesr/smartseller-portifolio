/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

import { useState, type CSSProperties } from 'react';
import type { Alerta, Etapa, Simulacao } from '../api';
import { baixarArquivo, cronogramaCSV, dataBR, moeda, ROTULO_ETAPA } from '../formato';

/** Cor do ponto de cada etapa: diferem em luminosidade, não só em matiz. */
const PONTO_ETAPA: Record<Etapa, string> = {
  PRIMEIRA_ENTRADA: 'var(--color-verde-600)',
  SEGUNDA_ENTRADA: 'var(--color-verde-800)',
  ENTRADA_RESTANTE: 'var(--color-royal-500)',
  SINAL: 'var(--color-royal-700)',
  SALDO: 'var(--color-royal-950)',
};

const ALERTA: Record<Alerta['severidade'], { rotulo: string; ponto: string; borda: string }> = {
  info: { rotulo: 'Informação', ponto: 'var(--color-royal-500)', borda: 'rgba(23,27,38,.12)' },
  aviso: { rotulo: 'Aviso', ponto: 'var(--color-aviso-600)', borda: 'rgba(23,27,38,.12)' },
  atencao: { rotulo: 'Aprovação', ponto: 'var(--color-aviso-600)', borda: 'var(--color-aviso-600)' },
  bloqueante: { rotulo: 'Bloqueante', ponto: 'var(--color-risco-700)', borda: 'var(--color-risco-700)' },
};

const ROTULO_REGRA: Record<string, string> = { PADRAO: 'padrão', PREMIUM: 'premium', PROMOCAO: 'promocional' };

const ponto = (cor: string) => ({ '--ponto': cor }) as CSSProperties;

function Indicador({ rotulo, valor, nota, destaque }: { rotulo: string; valor: string; nota?: string; destaque?: boolean }) {
  return (
    <div className="bg-white px-4 py-3.5">
      <p className="rotulo mb-1">{rotulo}</p>
      <p className={`tabular text-[1.35rem] font-medium leading-tight ${destaque ? 'text-verde-800' : 'text-royal-900'}`}>{valor}</p>
      {nota && <p className="mt-1 text-[0.82rem] text-suave">{nota}</p>}
    </div>
  );
}

export default function Resultado({ sim }: { sim: Simulacao }) {
  const [filtro, setFiltro] = useState<Etapa | 'TODAS'>('TODAS');
  const { resumo } = sim;
  const etapas = [...new Set(sim.cronograma.map((p) => p.etapa))];
  const linhas = filtro === 'TODAS' ? sim.cronograma : sim.cronograma.filter((p) => p.etapa === filtro);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1.5">{sim.modelo === 'LINEAR' ? 'Modelo linear' : 'Plano padrão'}</p>
          <h2 className="font-display text-[1.6rem] leading-tight text-royal-900">
            {sim.empreendimento.nome}
            <span className="text-suave"> · {sim.quantidadeCotas} {sim.quantidadeCotas === 1 ? 'cota' : 'cotas'}</span>
          </h2>
        </div>
        <span className="selo" style={ponto('var(--color-verde-600)')}>regras {sim.regrasVersao}</span>
      </header>

      {/* Grade por vão de 1px, como a grade de princípios do sistema */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-[#dfdfe4] hairline md:grid-cols-4">
        <Indicador rotulo="Unidade" valor={moeda(resumo.valorUnidade)} />
        <Indicador
          rotulo="Entrada"
          valor={moeda(resumo.entrada.total)}
          nota={typeof resumo.entrada.regra === 'string' ? `regra ${ROTULO_REGRA[resumo.entrada.regra] ?? resumo.entrada.regra.toLowerCase()}` : undefined}
        />
        <Indicador rotulo="Sinal" valor={moeda(resumo.sinal.total)} nota={resumo.sinal.percentual ? `${resumo.sinal.percentual}% da unidade` : undefined} />
        <Indicador rotulo="Saldo" valor={moeda(resumo.saldo.total)} />
      </div>

      <p className="flex flex-wrap items-center gap-x-2 text-[0.95rem] text-suave">
        <span className="octogono" />
        <span>
          <span className="tabular font-medium text-tinta">{resumo.quantidadeParcelas} parcelas</span> de{' '}
          <span className="tabular">{dataBR(resumo.primeiroVencimento)}</span> a <span className="tabular">{dataBR(resumo.ultimoVencimento)}</span>
        </span>
        <span aria-hidden>·</span>
        <span>
          total do plano <strong className="tabular font-medium text-verde-800">{moeda(resumo.totalPlano)}</strong>
        </span>
      </p>

      {sim.alertas.length > 0 && (
        <ul className="space-y-2.5" aria-label="Alertas da política comercial">
          {sim.alertas.map((a) => {
            const est = ALERTA[a.severidade];
            return (
              <li key={a.codigo} className="flex gap-3 rounded-md border bg-white px-4 py-3" style={{ borderColor: est.borda }}>
                <span className="octogono mt-1.5" style={ponto(est.ponto)} />
                <div>
                  <p className="rotulo mb-0.5">{est.rotulo}</p>
                  <p className="text-[0.95rem] text-tinta">{a.mensagem}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por etapa">
        {(['TODAS', ...etapas] as const).map((e) => {
          const ativo = filtro === e;
          return (
            <button
              key={e}
              type="button"
              aria-pressed={ativo}
              onClick={() => setFiltro(e)}
              className={`selo cursor-pointer transition-colors ${ativo ? '!border-royal-900 !bg-royal-900 !text-white' : 'hover:!border-royal-900'}`}
              style={ponto(e === 'TODAS' ? (ativo ? '#ffffff' : 'var(--color-suave)') : ativo ? '#ffffff' : PONTO_ETAPA[e])}
            >
              {e === 'TODAS' ? 'Todas' : ROTULO_ETAPA[e]}
            </button>
          );
        })}
        <button
          type="button"
          className="link ml-auto text-[0.92rem]"
          onClick={() => baixarArquivo(`simulacao-${sim.empreendimento.id}.csv`, cronogramaCSV(sim.cronograma))}
        >
          Exportar CSV
        </button>
      </div>

      <div className="max-h-[30rem] overflow-auto rounded-lg border hairline [-webkit-overflow-scrolling:touch]">
        <table className="w-full text-[0.93rem]">
          <thead className="sticky top-0 bg-paper-100 text-left">
            <tr>
              <th className="th">Etapa</th>
              <th className="th">Parcela</th>
              <th className="th">Vencimento</th>
              <th className="th text-right">Valor</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {linhas.map((p) => (
              <tr key={`${p.etapa}-${p.parcela}`} className="border-t hairline hover:bg-paper-50">
                <td className="px-4 py-2">
                  <span className="selo" style={ponto(PONTO_ETAPA[p.etapa])}>{ROTULO_ETAPA[p.etapa]}</span>
                </td>
                <td className="tabular px-4 py-2 font-mono text-[0.8rem] text-suave">
                  {String(p.parcela).padStart(2, '0')}/{String(p.totalParcelas).padStart(2, '0')}
                </td>
                <td className="tabular px-4 py-2">{dataBR(p.vencimento)}</td>
                <td className="tabular px-4 py-2 text-right font-medium text-royal-900">{moeda(p.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
