// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

import { dataBR, moeda, ROTULO_ETAPA, type Simulacao } from '../api';

export default function Resultado({ sim }: { sim: Simulacao }) {
  const { resumo } = sim;
  return (
    <>
      <p className="muted">
        {sim.empreendimento.nome} · {sim.quantidadeCotas} cota(s)
        {sim.modelo === 'LINEAR' ? ` · modelo linear (${sim.categoriaPreco})` : ''} · regras {sim.regrasVersao}
      </p>
      <div className="indicadores">
        <div>
          <span>Unidade</span>
          <strong>{moeda(resumo.valorUnidade)}</strong>
        </div>
        <div>
          <span>Entrada</span>
          <strong>{moeda(resumo.entrada.total)}</strong>
        </div>
        <div>
          <span>Sinal{resumo.sinal.percentual ? ` (${resumo.sinal.percentual}%)` : ''}</span>
          <strong>{moeda(resumo.sinal.total)}</strong>
        </div>
        <div>
          <span>Saldo</span>
          <strong>{moeda(resumo.saldo.total)}</strong>
        </div>
      </div>
      <p className="muted">
        {resumo.quantidadeParcelas} parcelas de {dataBR(resumo.primeiroVencimento)} a {dataBR(resumo.ultimoVencimento)} · total{' '}
        <strong>{moeda(resumo.totalPlano)}</strong> · regras aplicadas: {sim.regrasAplicadas.map((r) => `R${String(r).padStart(2, '0')}`).join(', ')}
      </p>
      {sim.alertas.map((a) => (
        <div key={a.codigo} className={`alerta ${a.severidade}`}>
          {a.mensagem}
        </div>
      ))}
      <div className="tabela-rolagem">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Etapa</th>
              <th>Parcela</th>
              <th>Vencimento</th>
              <th>Meio</th>
              <th className="num">Valor</th>
            </tr>
          </thead>
          <tbody>
            {sim.cronograma.map((p, i) => (
              <tr key={`${p.etapa}-${p.parcela}`}>
                <td>{i + 1}</td>
                <td>{ROTULO_ETAPA[p.etapa] ?? p.etapa}</td>
                <td>
                  {p.parcela}/{p.totalParcelas}
                </td>
                <td>{dataBR(p.vencimento)}</td>
                <td>{p.meioPagamento ?? ''}</td>
                <td className="num">{moeda(p.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
