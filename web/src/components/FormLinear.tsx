import { useState } from 'react';
import type { Empreendimento } from '../api';
import { hojeISO } from '../formato';

interface Props {
  empreendimentos: Empreendimento[];
  carregando: boolean;
  onSimular: (payload: unknown) => void;
}

export default function FormLinear({ empreendimentos, carregando, onSimular }: Props) {
  const comTabela = empreendimentos.filter((e) => e.categoriasLinear.length > 0);
  const [empId, setEmpId] = useState(comTabela[0]?.id ?? '');
  const emp = comTabela.find((e) => e.id === empId);
  const [categoria, setCategoria] = useState(emp?.categoriasLinear[0] ?? '');
  const [cotas, setCotas] = useState(1);
  const [dataVenda, setDataVenda] = useState(hojeISO());

  if (comTabela.length === 0) {
    return <p className="text-sm text-slate-500">Nenhum empreendimento possui tabela linear.</p>;
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSimular({ empreendimentoId: empId, categoriaPreco: categoria, quantidadeCotas: cotas, dataVenda });
      }}
    >
      <p className="text-sm text-slate-600">
        No modelo linear, valores e quantidade de parcelas vêm da tabela do empreendimento: o vendedor escolhe apenas a
        categoria de preço.
      </p>
      <label className="block">
        <span className="rotulo">Empreendimento</span>
        <select
          className="campo"
          value={empId}
          onChange={(e) => {
            setEmpId(e.target.value);
            setCategoria(comTabela.find((x) => x.id === e.target.value)?.categoriasLinear[0] ?? '');
          }}
        >
          {comTabela.map((e) => (
            <option key={e.id} value={e.id}>{e.nome}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="rotulo">Categoria</span>
          <select className="campo" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {emp?.categoriasLinear.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="rotulo">Cotas</span>
          <input className="campo" type="number" min={1} value={cotas} onChange={(e) => setCotas(Number(e.target.value))} />
        </label>
        <label className="block">
          <span className="rotulo">Data da venda</span>
          <input className="campo" type="date" value={dataVenda} onChange={(e) => setDataVenda(e.target.value)} />
        </label>
      </div>
      <button className="botao w-full" disabled={carregando}>
        {carregando ? 'Calculando…' : 'Simular modelo linear'}
      </button>
    </form>
  );
}
