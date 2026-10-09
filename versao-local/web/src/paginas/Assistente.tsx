// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

/**
 * Assistente de venda em 7 etapas (origem: SalesProcess + components/forms do
 * smartseller-flow). O frontend só coleta e organiza; todo valor oficial vem
 * da API ao final.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ErroApi, type Empreendimento, type Simulacao } from '../api';
import Resultado from './Resultado';

const MEIOS = ['PIX', 'DINHEIRO', 'TED', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'BOLETO'];
const ETAPAS = ['Cliente', 'Negociação', '1ª entrada', '2ª entrada', 'Entrada restante', 'Sinal e saldo', 'Resumo e fichas'];

const hoje = new Date();
const isoMais = (meses: number) => {
  const d = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() + meses, Math.min(hoje.getDate(), 28)));
  return d.toISOString().slice(0, 10);
};

const inicial = {
  cliente: { nome: '', cpf: '', nascimento: '', email: '', telefone: '', endereco: '', cidade: '', uf: '', cep: '' },
  empreendimentoId: '',
  modelo: 'PADRAO' as 'PADRAO' | 'LINEAR',
  categoriaPreco: '',
  quantidadeCotas: 2,
  valorUnidade: 80000,
  dataVenda: isoMais(0),
  primeiraEntrada: { meioPagamento: 'PIX', parcelas: 1, valor: 1000 },
  usarSegunda: false,
  segundaEntrada: { meioPagamento: 'BOLETO', parcelas: 1, valor: 500, dataBase: isoMais(0) },
  entradaRestante: { parcelas: 3, dataInicio: isoMais(1) },
  sinal: { parcelas: 4, dataInicio: isoMais(4), dia: Math.min(hoje.getDate(), 28) },
  saldo: { parcelas: 60 },
};
type Form = typeof inicial;

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label>
      {rotulo}
      {children}
    </label>
  );
}

export default function Assistente() {
  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [f, setF] = useState<Form>(inicial);
  const [passo, setPasso] = useState(0);
  const [sim, setSim] = useState<Simulacao | null>(null);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    api.empreendimentos().then((lista) => {
      setEmpreendimentos(lista);
      setF((x) => ({ ...x, empreendimentoId: x.empreendimentoId || lista[0]?.id || '' }));
    });
  }, []);

  const emp = empreendimentos.find((e) => e.id === f.empreendimentoId);
  const linear = f.modelo === 'LINEAR';
  // No modelo linear, as etapas de pagamento vêm da tabela e são puladas.
  const visiveis = useMemo(() => ETAPAS.map((_, i) => !(linear && i >= 2 && i <= 5)), [linear]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const setSub = <K extends keyof Form>(k: K, campo: string, v: unknown) => setF((x) => ({ ...x, [k]: { ...(x[k] as object), [campo]: v } }));
  const num = (e: { target: { value: string } }) => Number(e.target.value);

  function payload() {
    if (linear) return { empreendimentoId: f.empreendimentoId, categoriaPreco: f.categoriaPreco, quantidadeCotas: f.quantidadeCotas, dataVenda: f.dataVenda };
    return {
      empreendimentoId: f.empreendimentoId,
      quantidadeCotas: f.quantidadeCotas,
      valorUnidade: f.valorUnidade,
      dataVenda: f.dataVenda,
      primeiraEntrada: f.primeiraEntrada,
      ...(f.usarSegunda ? { segundaEntrada: f.segundaEntrada } : {}),
      entradaRestante: f.entradaRestante,
      sinal: f.sinal,
      saldo: f.saldo,
    };
  }

  async function executar(acao: () => Promise<unknown>) {
    setErro(null);
    setCarregando(true);
    try {
      await acao();
    } catch (e) {
      setErro(e instanceof ErroApi ? e : new ErroApi(String(e)));
    } finally {
      setCarregando(false);
    }
  }

  function ir(delta: 1 | -1) {
    let p = passo + delta;
    while (p > 0 && p < ETAPAS.length - 1 && !visiveis[p]) p += delta;
    setPasso(p);
    if (p === ETAPAS.length - 1) executar(async () => setSim(await (linear ? api.simularLinear(payload()) : api.simular(payload()))));
  }

  const fichaCadastro = () => {
    const c = Object.fromEntries(Object.entries(f.cliente).filter(([, v]) => v !== ''));
    return api.fichaCadastro({
      cliente: c,
      negociacao: { empreendimento: emp?.nome, cotas: f.quantidadeCotas, valorUnidade: sim?.resumo.valorUnidade, dataVenda: f.dataVenda },
    });
  };

  return (
    <div className="cartao">
      <ol className="passos">
        {ETAPAS.map((nome, i) =>
          visiveis[i] ? (
            <li key={nome} className={i === passo ? 'atual' : i < passo ? 'feito' : ''}>
              {nome}
            </li>
          ) : null,
        )}
      </ol>

      {passo === 0 && (
        <>
          <h2>Dados do cliente</h2>
          <p className="muted">Use dados fictícios. O CPF passa pela validação de dígitos verificadores na geração da ficha.</p>
          <div className="grade">
            {(
              [
                ['nome', 'Nome completo'],
                ['cpf', 'CPF'],
                ['nascimento', 'Nascimento (AAAA-MM-DD)'],
                ['email', 'E-mail'],
                ['telefone', 'Telefone'],
                ['endereco', 'Endereço'],
                ['cidade', 'Cidade'],
                ['uf', 'UF'],
                ['cep', 'CEP'],
              ] as const
            ).map(([k, rotulo]) => (
              <Campo key={k} rotulo={rotulo}>
                <input value={f.cliente[k]} onChange={(e) => setSub('cliente', k, e.target.value)} />
              </Campo>
            ))}
          </div>
        </>
      )}

      {passo === 1 && (
        <>
          <h2>Negociação</h2>
          <div className="grade">
            <Campo rotulo="Empreendimento">
              <select value={f.empreendimentoId} onChange={(e) => set('empreendimentoId', e.target.value)}>
                {empreendimentos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome} ({e.categoria.toLowerCase()})
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Modelo">
              <select value={f.modelo} onChange={(e) => set('modelo', e.target.value as Form['modelo'])}>
                <option value="PADRAO">Padrão</option>
                <option value="LINEAR" disabled={!emp?.categoriasLinear.length}>
                  Linear (tabela)
                </option>
              </select>
            </Campo>
            {linear && (
              <Campo rotulo="Categoria de preço">
                <select value={f.categoriaPreco} onChange={(e) => set('categoriaPreco', e.target.value)}>
                  <option value="">—</option>
                  {emp?.categoriasLinear.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Campo>
            )}
            <Campo rotulo="Cotas">
              <input type="number" min={1} max={10} value={f.quantidadeCotas} onChange={(e) => set('quantidadeCotas', num(e))} />
            </Campo>
            {!linear && (
              <Campo rotulo="Valor da unidade (R$)">
                <input type="number" min={1} step="0.01" value={f.valorUnidade} onChange={(e) => set('valorUnidade', num(e))} />
              </Campo>
            )}
            <Campo rotulo="Data da venda">
              <input type="date" value={f.dataVenda} onChange={(e) => set('dataVenda', e.target.value)} />
            </Campo>
          </div>
          {emp?.temExcecoes && <p className="alerta">Este empreendimento tem tabela de exceções de entrada: ela tem prioridade sobre o valor por categoria.</p>}
        </>
      )}

      {passo === 2 && (
        <>
          <h2>1ª entrada</h2>
          <div className="grade">
            <Campo rotulo="Meio de pagamento">
              <select value={f.primeiraEntrada.meioPagamento} onChange={(e) => setSub('primeiraEntrada', 'meioPagamento', e.target.value)}>
                {MEIOS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Parcelas">
              <input type="number" min={1} value={f.primeiraEntrada.parcelas} onChange={(e) => setSub('primeiraEntrada', 'parcelas', num(e))} />
            </Campo>
            <Campo rotulo="Valor (R$)">
              <input type="number" min={1} step="0.01" value={f.primeiraEntrada.valor} onChange={(e) => setSub('primeiraEntrada', 'valor', num(e))} />
            </Campo>
          </div>
          <p className="muted">Só o débito considera dia útil (próximo dia útil após a venda).</p>
        </>
      )}

      {passo === 3 && (
        <>
          <h2>2ª entrada (opcional)</h2>
          <label className="check">
            <input type="checkbox" checked={f.usarSegunda} onChange={(e) => set('usarSegunda', e.target.checked)} /> Usar 2ª entrada
          </label>
          {f.usarSegunda && (
            <div className="grade">
              <Campo rotulo="Meio de pagamento">
                <select value={f.segundaEntrada.meioPagamento} onChange={(e) => setSub('segundaEntrada', 'meioPagamento', e.target.value)}>
                  {MEIOS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Parcelas">
                <input type="number" min={1} value={f.segundaEntrada.parcelas} onChange={(e) => setSub('segundaEntrada', 'parcelas', num(e))} />
              </Campo>
              <Campo rotulo="Valor (R$)">
                <input type="number" min={1} step="0.01" value={f.segundaEntrada.valor} onChange={(e) => setSub('segundaEntrada', 'valor', num(e))} />
              </Campo>
              <Campo rotulo="Data-base">
                <input type="date" value={f.segundaEntrada.dataBase} onChange={(e) => setSub('segundaEntrada', 'dataBase', e.target.value)} />
              </Campo>
            </div>
          )}
        </>
      )}

      {passo === 4 && (
        <>
          <h2>Entrada restante</h2>
          <div className="grade">
            <Campo rotulo="Parcelas">
              <input type="number" min={1} value={f.entradaRestante.parcelas} onChange={(e) => setSub('entradaRestante', 'parcelas', num(e))} />
            </Campo>
            <Campo rotulo="Início">
              <input type="date" value={f.entradaRestante.dataInicio} onChange={(e) => setSub('entradaRestante', 'dataInicio', e.target.value)} />
            </Campo>
          </div>
          <p className="muted">O valor é a entrada total menos 1ª e 2ª entradas, calculado no servidor.</p>
        </>
      )}

      {passo === 5 && (
        <>
          <h2>Sinal e saldo</h2>
          <div className="grade">
            <Campo rotulo="Parcelas do sinal">
              <input type="number" min={1} value={f.sinal.parcelas} onChange={(e) => setSub('sinal', 'parcelas', num(e))} />
            </Campo>
            <Campo rotulo="Início do sinal">
              <input type="date" value={f.sinal.dataInicio} onChange={(e) => setSub('sinal', 'dataInicio', e.target.value)} />
            </Campo>
            <Campo rotulo="Dia de vencimento">
              <input type="number" min={1} max={31} value={f.sinal.dia} onChange={(e) => setSub('sinal', 'dia', num(e))} />
            </Campo>
            <Campo rotulo="Parcelas do saldo">
              <input type="number" min={1} value={f.saldo.parcelas} onChange={(e) => setSub('saldo', 'parcelas', num(e))} />
            </Campo>
          </div>
        </>
      )}

      {passo === 6 && (
        <>
          <h2>Resumo e fichas</h2>
          {carregando && <p className="muted">Calculando…</p>}
          {sim && !erro && (
            <>
              <Resultado sim={sim} />
              <div className="acoes">
                <button className="botao" disabled={carregando} onClick={() => executar(() => api.fichaNegociacao(payload(), linear))}>
                  Baixar ficha de negociação (PDF)
                </button>
                <button className="botao secundario" disabled={carregando || !f.cliente.nome || !f.cliente.cpf} onClick={() => executar(fichaCadastro)}>
                  Baixar ficha de cadastro (PDF)
                </button>
              </div>
            </>
          )}
        </>
      )}

      {erro && (
        <div className="alerta erro">
          <strong>{erro.message}</strong>
          {erro.detalhes.length > 0 && (
            <ul>
              {erro.detalhes.map((d) => (
                <li key={d.campo}>
                  {d.campo}: {d.mensagem}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="acoes">
        <button className="botao secundario" disabled={passo === 0} onClick={() => ir(-1)}>
          Voltar
        </button>
        {passo < ETAPAS.length - 1 ? (
          <button className="botao" disabled={passo === 1 && linear && !f.categoriaPreco} onClick={() => ir(1)}>
            {passo === ETAPAS.length - 2 || (linear && passo === 1) ? 'Simular' : 'Avançar'}
          </button>
        ) : (
          <button
            className="botao secundario"
            onClick={() => {
              setSim(null);
              setPasso(0);
            }}
          >
            Nova negociação
          </button>
        )}
      </div>
    </div>
  );
}
