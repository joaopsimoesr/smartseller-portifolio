/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import { api, ErroApi, type Empreendimento, type Regras, type Simulacao } from './api';
import FormLinear from './components/FormLinear';
import FormPlano from './components/FormPlano';
import Resultado from './components/Resultado';

type Aba = 'padrao' | 'linear';

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'padrao', rotulo: 'Plano padrão' },
  { id: 'linear', rotulo: 'Modelo linear' },
];

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
    <>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:rounded-sm focus:bg-white focus:px-3 focus:py-2">
        Ir para o conteúdo
      </a>

      <header className="topo">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5 sm:px-7">
          <p className="flex items-center gap-2.5">
            <span className="octogono size-3.5" />
            <span className="font-display text-[1.35rem] leading-none text-royal-900">SmartSeller</span>
          </p>
          <span className="selo" style={{ '--ponto': 'var(--color-aviso-600)' } as CSSProperties}>
            Regras fictícias
          </span>
        </div>
      </header>

      <main id="conteudo" className="mx-auto max-w-7xl px-5 pb-16 pt-12 sm:px-7">
        <section className="mb-10 max-w-[64ch]">
          <p className="eyebrow mb-3">Simulador de planos de pagamento</p>
          <h1 className="font-display text-[clamp(1.9rem,4.4vw,2.6rem)] leading-[1.15] text-royal-900">
            Da entrada ao saldo, o plano inteiro antes da assinatura.
          </h1>
          <p className="mt-4 text-[1.0625rem] leading-[1.7] text-suave">
            O vendedor descreve a negociação e recebe o cronograma de parcelas com os alertas da política comercial.
            Esta é uma versão de portfólio: empreendimentos, valores e regras são fictícios.
          </p>
        </section>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)]">
          <aside className="cartao min-w-0">
            <nav className="mb-6 grid grid-cols-2 gap-1 rounded-md bg-paper-100 p-1" aria-label="Modelo de venda">
              {ABAS.map(({ id, rotulo }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={aba === id}
                  onClick={() => {
                    setAba(id);
                    setSim(null);
                    setErro(null);
                  }}
                  className={`rounded-sm px-3 py-2 text-[0.92rem] font-medium transition-colors ${
                    aba === id ? 'bg-white text-royal-900 shadow-card' : 'text-suave hover:text-royal-900'
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </nav>

            {!regras ? (
              <p className="text-suave">{erro ? '' : 'Carregando regras…'}</p>
            ) : aba === 'padrao' ? (
              <FormPlano regras={regras} empreendimentos={empreendimentos} carregando={carregando} onSimular={(p) => simular(() => api.simular(p))} />
            ) : (
              <FormLinear empreendimentos={empreendimentos} carregando={carregando} onSimular={(p) => simular(() => api.simularLinear(p))} />
            )}
          </aside>

          <section className="cartao min-h-[22rem] min-w-0" aria-live="polite">
            {erro && (
              <div className="mb-5 flex gap-3 rounded-md border border-risco-700 bg-white px-4 py-3" role="alert">
                <span className="octogono mt-1.5" style={{ '--ponto': 'var(--color-risco-700)' } as CSSProperties} />
                <div>
                  <p className="rotulo mb-0.5">Não foi possível simular</p>
                  <p className="text-tinta">{erro.message}</p>
                  {erro.detalhes.length > 0 && (
                    <ul className="mt-1 list-inside list-disc text-[0.92rem] text-suave">
                      {erro.detalhes.map((d) => (
                        <li key={d.campo}>{d.mensagem}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
            {sim ? (
              <Resultado sim={sim} />
            ) : (
              !erro && (
                <div className="flex h-full min-h-[18rem] flex-col items-start justify-center">
                  <p className="eyebrow mb-2">Cronograma</p>
                  <p className="max-w-[40ch] font-display text-[1.3rem] leading-snug text-royal-900">
                    Preencha a negociação ao lado e simule para ver todas as parcelas.
                  </p>
                </div>
              )
            )}
          </section>
        </div>
      </main>

      <footer className="border-t hairline">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-5 py-6 text-[0.85rem] text-suave sm:px-7">
          <p>© 2025–2026 João Pedro Simões Rodrigues — todos os direitos reservados.</p>
          <p className="font-mono text-[0.72rem] uppercase tracking-[0.1em]">Versão de portfólio · dados fictícios</p>
        </div>
      </footer>
    </>
  );
}
