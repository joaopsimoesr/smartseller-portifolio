// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

/**
 * Telas de administração: importação de tabelas de preço (CSV) e painel do
 * shadow mode (origem: venture-table importer e shadow-mode-dashboard.html).
 */

import { useEffect, useState } from 'react';
import { api, ErroApi } from '../api';

export function Tabelas() {
  const [versoes, setVersoes] = useState<Record<string, string | number>[]>([]);
  const [exemplos, setExemplos] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ empreendimentoId: 'parque-delta', tipo: 'LINEAR', vigenteDesde: new Date().toISOString().slice(0, 10), csv: '' });
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const carregar = () =>
    api.tabelas().then((r) => {
      setVersoes(r.versoes);
      setExemplos(r.exemplos);
    });
  useEffect(() => {
    carregar();
  }, []);

  async function importar() {
    setMsg(null);
    try {
      const r = await api.importar(form);
      setMsg({ tipo: 'ok', texto: `Importada versão ${r.versao} (${r.linhas} linha(s)) de ${r.tipo} para ${r.empreendimentoId}` });
      carregar();
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e instanceof ErroApi ? e.message : String(e) });
    }
  }

  return (
    <>
      <div className="cartao">
        <h2>Importar tabela de preço (CSV)</h2>
        <div className="grade">
          <label>
            Empreendimento
            <input value={form.empreendimentoId} onChange={(e) => setForm({ ...form, empreendimentoId: e.target.value })} />
          </label>
          <label>
            Tipo
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              <option>LINEAR</option>
              <option>EXCECOES</option>
            </select>
          </label>
          <label>
            Vigente desde
            <input type="date" value={form.vigenteDesde} onChange={(e) => setForm({ ...form, vigenteDesde: e.target.value })} />
          </label>
        </div>
        <label style={{ marginTop: 12 }}>
          Conteúdo CSV
          <textarea value={form.csv} onChange={(e) => setForm({ ...form, csv: e.target.value })} />
        </label>
        <div className="acoes">
          <button className="botao secundario" onClick={() => setForm({ ...form, csv: exemplos[form.tipo] ?? '' })}>
            Carregar exemplo fictício
          </button>
          <button className="botao" disabled={!form.csv} onClick={importar}>
            Importar
          </button>
        </div>
        {msg && <div className={`alerta ${msg.tipo === 'erro' ? 'erro' : ''}`}>{msg.texto}</div>}
      </div>
      <div className="cartao">
        <h2>Versões</h2>
        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th>Empreendimento</th>
                <th>Tipo</th>
                <th>Versão</th>
                <th>Vigente desde</th>
                <th>Origem</th>
              </tr>
            </thead>
            <tbody>
              {versoes.map((v) => (
                <tr key={v.id}>
                  <td>{v.empreendimentoId}</td>
                  <td>{v.tipo}</td>
                  <td>{v.versao}</td>
                  <td>{v.vigenteDesde}</td>
                  <td>{v.origem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

type Estatisticas = Awaited<ReturnType<typeof api.shadowEstatisticas>>;

export function Shadow() {
  const [est, setEst] = useState<Estatisticas | null>(null);
  const [form, setForm] = useState({ valorUnidade: 12345.67, saldo: 1000, parcelasSaldo: 3, dataBase: '2026-01-31', meses: 1 });
  const carregar = () => api.shadowEstatisticas().then(setEst);
  useEffect(() => {
    carregar();
  }, []);

  return (
    <>
      <div className="cartao">
        <h2>Shadow mode: legado × novo</h2>
        <p className="muted">
          Executa a implementação legada (ponto flutuante, setMonth sem ajuste de fim de mês) ao lado da nova e registra as divergências acima da tolerância.
        </p>
        <div className="grade">
          {(Object.keys(form) as (keyof typeof form)[]).map((k) => (
            <label key={k}>
              {k}
              <input
                value={form[k]}
                type={k === 'dataBase' ? 'date' : 'number'}
                onChange={(e) => setForm({ ...form, [k]: k === 'dataBase' ? e.target.value : Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
        <div className="acoes">
          <span />
          <button className="botao" onClick={() => api.shadowComparar(form).then(carregar)}>
            Comparar
          </button>
        </div>
      </div>
      {est && (
        <div className="cartao">
          <div className="indicadores">
            <div>
              <span>Comparações</span>
              <strong>{est.total}</strong>
            </div>
            <div>
              <span>Divergentes</span>
              <strong>{est.divergentes}</strong>
            </div>
            <div>
              <span>Equivalência</span>
              <strong>{est.taxaEquivalencia === null ? '-' : `${(est.taxaEquivalencia * 100).toFixed(1)}%`}</strong>
            </div>
          </div>
          <div className="tabela-rolagem">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Função</th>
                  <th>Resultado</th>
                  <th>Diferenças</th>
                </tr>
              </thead>
              <tbody>
                {est.ultimas.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{r.funcao}</td>
                    <td>{r.equivalente ? 'equivalente' : 'divergente'}</td>
                    <td>{r.diferencas.map((d) => `${d.campo}: ${String(d.legado)} → ${String(d.novo)}`).join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
