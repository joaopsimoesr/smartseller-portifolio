<!-- Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados. -->
<!-- Uso sujeito aos termos do arquivo LICENSE na raiz do repositório. -->

# SmartSeller — versão local consolidada

> Consolidação das versões locais mais completas do MVP (backend com as 24 regras de cálculo,
> geradores de PDF, assistente de venda, importação de tabelas, shadow mode e login).
> **Todas as regras de negócio usam valores fictícios** e os empreendimentos são inventados.
> Fica ao lado da versão simplificada da raiz (`../api`, `../web`) para comparar as duas.

- [REGRAS.md](REGRAS.md): as 24 regras, com entradas, saídas, valores fictícios e onde estão
- [FUNCIONALIDADES.md](FUNCIONALIDADES.md): o que existe além do cálculo e de qual versão veio

## Como rodar

Requisitos: Node 20 ou superior. Não precisa de banco, Docker nem variáveis de ambiente.

```bash
cd versao-local
npm install
npm run dev     # API em :3101 e interface em http://localhost:5174
npm test        # regras, serviços, PDFs e HTTP (Jest + Supertest)
npm run build   # build de produção do frontend
```

Login de demonstração (público):

| Perfil | E-mail | Senha | Acesso |
|---|---|---|---|
| Vendedor | `vendedor@exemplo.com` | `demo` | assistente de venda e fichas PDF |
| Admin | `admin@exemplo.com` | `demo` | tudo acima + tabelas de preço + shadow mode |

As portas (3101/5174) são diferentes das da versão da raiz (3001/5173), então as duas rodam ao mesmo tempo.

## API

| Método | Rota | Perfil | Descrição |
|---|---|---|---|
| GET | `/api/health` | — | status |
| GET | `/api/regras` | — | valores fictícios vigentes |
| POST | `/api/auth/login` | — | `{ email, senha }` → token JWT |
| GET | `/api/auth/eu` | logado | usuário do token |
| GET | `/api/empreendimentos` | logado | empreendimentos ativos e metadados de tabelas |
| POST | `/api/simulacoes` | logado | plano padrão (1ª/2ª entrada, restante, sinal, saldo) |
| POST | `/api/simulacoes/linear` | logado | modelo linear por tabela |
| POST | `/api/fichas/negociacao` · `/api/fichas/negociacao/linear` | logado | Ficha de Negociação em PDF |
| GET | `/api/fichas/cadastro/template` | logado | template de cadastro em branco (PDF com campos) |
| POST | `/api/fichas/cadastro` | logado | Ficha de Cadastro preenchida (PDF) |
| GET | `/api/datas/dia-util?data=AAAA-MM-DD&depois=true` | logado | próximo dia útil |
| GET | `/api/tabelas` | admin | versões de tabelas e exemplos de CSV |
| POST | `/api/tabelas/importar` | admin | `{ empreendimentoId, tipo, vigenteDesde, csv }` |
| POST | `/api/shadow/comparar` | admin | executa legado × novo |
| GET | `/api/shadow/estatisticas` | admin | taxa de equivalência e divergências |

## Estrutura

```
versao-local/
  api/src/config/regras.js     valores fictícios das 24 regras (único lugar com números)
  api/src/regras/              as 24 regras: datas.js (R01–R09), calculo.js (R10–R24), dinheiro.js
  api/src/servicos/            simulação, repositório + importação CSV, shadow mode, login
  api/src/pdf/                 ficha de negociação e ficha de cadastro (template + preenchimento)
  api/src/http/                rotas, validação Joi, contrato de erros
  api/tests/                   regras.test.js (1 bloco por regra), servicos.test.js, api.test.js
  web/src/                     React + TypeScript: login, assistente em 7 etapas, admin
```

## Limitações

- Persistência em memória: tabelas importadas e registros do shadow mode somem ao reiniciar.
- O segredo do JWT é gerado a cada inicialização; reiniciar a API desloga todos.
- Feriados só nacionais e fixos (R09 preserva o original).
- Sem OpenAPI nesta versão; a tabela acima documenta as rotas.
