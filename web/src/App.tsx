import { useEffect, useState } from 'react';
import { api, ErroApi, type Empreendimento, type Regras, type Simulacao } from './api';
import FormLinear from './components/FormLinear';
import FormPlano from './components/FormPlano';
import Resultado from './components/Resultado';

type Aba = 'padrao' | 'linear';

export default function App() {
  const [regras, setRegras] = useState<Regras | null>(null);
  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [aba, setAba] = useState<Aba>('padrao');
  const [sim, setSim] = useState<Simulacao | null>(null);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    Promise.all([api.regras(), api.empreendimentos()])
      .then(([r, e]) => {
        setRegras(r);
        setEmpreendimentos(e);
      })
      .catch((e) => setErro(e instanceof ErroApi ? e : new ErroApi('API indisponível. Rode `npm run dev` na raiz.')));
  }, []);

  async function simular(chamada: () => Promise<Simulacao>) {
    setCarregando(true);
    setErro(null);
    try {
      setSim(await chamada());
    } catch (e) {
      setSim(null);
      setErro(e instanceof ErroApi ? e : new ErroApi(String(e)));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          SmartSeller <span className="font-normal text-slate-400">· simulador de planos de pagamento</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Versão de portfólio — empreendimentos, valores e regras comerciais são <strong>fictícios</strong>.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <aside className="cartao">
          <nav className="mb-5 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            {(['padrao', 'linear'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => { setAba(a); setSim(null); setErro(null); }}
                className={`flex-1 rounded-md px-3 py-1.5 font-medium ${aba === a ? 'bg-white shadow-sm' : 'text-slate-500'}`}
              >
                {a === 'padrao' ? 'Plano padrão' : 'Modelo linear'}
              </button>
            ))}
          </nav>

          {!regras ? (
            <p className="text-sm text-slate-500">{erro ? '' : 'Carregando regras…'}</p>
          ) : aba === 'padrao' ? (
            <FormPlano regras={regras} empreendimentos={empreendimentos} carregando={carregando} onSimular={(p) => simular(() => api.simular(p))} />
          ) : (
            <FormLinear empreendimentos={empreendimentos} carregando={carregando} onSimular={(p) => simular(() => api.simularLinear(p))} />
          )}
        </aside>

        <main className="cartao min-h-[20rem]">
          {erro && (
            <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
              <p className="font-medium">{erro.message}</p>
              {erro.detalhes.length > 0 && (
                <ul className="mt-1 list-inside list-disc">
                  {erro.detalhes.map((d) => <li key={d.campo}>{d.mensagem}</li>)}
                </ul>
              )}
            </div>
          )}
          {sim ? (
            <Resultado sim={sim} />
          ) : (
            !erro && <p className="text-sm text-slate-500">Preencha a negociação e clique em simular para ver o cronograma.</p>
          )}
        </main>
      </div>
    </div>
  );
}
