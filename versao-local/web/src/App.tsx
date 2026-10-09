// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

import { useState } from 'react';
import { api, definirToken, ErroApi, type Usuario } from './api';
import Assistente from './paginas/Assistente';
import { Shadow, Tabelas } from './paginas/Admin';

type Aba = 'venda' | 'tabelas' | 'shadow';

function Login({ onEntrar }: { onEntrar: (u: Usuario) => void }) {
  const [email, setEmail] = useState('vendedor@exemplo.com');
  const [senha, setSenha] = useState('demo');
  const [erro, setErro] = useState('');

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api.login(email, senha);
      definirToken(r.token);
      onEntrar(r.usuario);
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : String(err));
    }
  }

  return (
    <form className="cartao login" onSubmit={entrar}>
      <h2>SmartSeller · versão local</h2>
      <p className="muted">Demonstração com regras e dados fictícios. Perfis: vendedor@exemplo.com ou admin@exemplo.com, senha "demo".</p>
      <label>
        E-mail
        <input value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label style={{ marginTop: 8 }}>
        Senha
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />
      </label>
      {erro && <div className="alerta erro">{erro}</div>}
      <div className="acoes">
        <span />
        <button className="botao">Entrar</button>
      </div>
    </form>
  );
}

export default function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [aba, setAba] = useState<Aba>('venda');

  if (!usuario) return <Login onEntrar={setUsuario} />;

  const abas: [Aba, string][] = [['venda', 'Nova venda']];
  if (usuario.perfil === 'ADMIN') abas.push(['tabelas', 'Tabelas de preço'], ['shadow', 'Shadow mode']);

  return (
    <>
      <header className="topo">
        <div>
          <h1>SmartSeller</h1>
          <small>versão local consolidada · dados fictícios</small>
        </div>
        <nav className="abas">
          {abas.map(([id, rotulo]) => (
            <button key={id} className={aba === id ? 'ativa' : ''} onClick={() => setAba(id)}>
              {rotulo}
            </button>
          ))}
          <button
            onClick={() => {
              definirToken(null);
              setUsuario(null);
              setAba('venda');
            }}
          >
            Sair ({usuario.nome})
          </button>
        </nav>
      </header>
      <main>
        {aba === 'venda' && <Assistente />}
        {aba === 'tabelas' && <Tabelas />}
        {aba === 'shadow' && <Shadow />}
      </main>
    </>
  );
}
