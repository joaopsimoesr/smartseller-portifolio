# SmartSeller — simulador de planos de pagamento

> **Versão de portfólio.** Empreendimentos, valores, percentuais, prazos e
> alçadas são **fictícios**. A arquitetura e as técnicas vêm de um MVP real
> (2025) usado por vendedores para montar propostas de venda de cotas
> imobiliárias. As regras comerciais originais foram trocadas por uma
> simulação.

![Plano padrão](docs/img/plano-padrao.png)

## O que faz

O vendedor informa a negociação: empreendimento, cotas, valor da unidade e
como o cliente quer pagar. O sistema devolve o **cronograma completo de
parcelas** e os **alertas de política comercial**:

```
1ª entrada ─► 2ª entrada (opcional) ─► entrada restante ─► sinal ─► saldo
```

| Regra | Exemplo na simulação |
|---|---|
| Entrada por cota, por categoria, com promoção por vigência | Padrão R$ 2.500 · Premium R$ 3.200 · promoção R$ 1.800 em 2026 |
| Sinal como % da unidade, sobrescrevível por empreendimento | 4% padrão · 6% no Resort Beta |
| Data da 1ª parcela depende do meio de pagamento | PIX/TED/dinheiro no dia · débito em D+2 **úteis** · crédito/boleto no mês seguinte |
| Dia útil considera feriados nacionais **móveis** (Páscoa) | Carnaval, Sexta-feira Santa, Corpus Christi |
| Meses sem parcela entre a entrada e a entrada restante | alerta `MESES_SEM_PAGAMENTO` |
| Sinal não pode começar antes do fim da entrada restante | alerta bloqueante com data sugerida |
| Alçada de aprovação pela distância entre venda e sinal | > 120 dias: gerência · > 180 dias: comitê |
| **Modelo linear**: valores e prazos vêm de uma tabela por categoria de preço | Parque Delta · Bronze/Prata/Ouro |

Todas as regras ficam num único arquivo declarativo,
[`api/src/config/regras.js`](api/src/config/regras.js). O motor de cálculo não
tem números mágicos.

## Como rodar

Requisitos: Node 20 ou superior. Não há banco, Docker nem variáveis de ambiente.

```bash
npm install
npm run dev        # API em :3001 e interface em http://localhost:5173
npm test           # 42 testes (unidade + HTTP)
npm run build      # build de produção do frontend
```

Exemplo direto na API:

```bash
curl -s localhost:3001/api/simulacoes -H 'Content-Type: application/json' -d '{
  "empreendimentoId": "residencial-alfa", "quantidadeCotas": 2, "valorUnidade": 80000,
  "dataVenda": "2026-03-13",
  "primeiraEntrada": { "meioPagamento": "PIX", "parcelas": 1, "valor": 1000 },
  "entradaRestante": { "parcelas": 2, "dataInicio": "2026-04-13" },
  "sinal": { "parcelas": 4, "dataInicio": "2026-06-13" },
  "saldo": { "parcelas": 60 }
}'
```

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/health` | status e versão das regras |
| GET | `/api/regras` | regras simuladas vigentes |
| GET | `/api/empreendimentos` | empreendimentos ativos |
| POST | `/api/simulacoes` | plano padrão completo |
| POST | `/api/simulacoes/linear` | modelo linear por tabela |
| GET | `/api/datas/dia-util?data=AAAA-MM-DD&dias=N` | N-ésimo dia útil após a data |

Erros seguem um formato único: `400` para formato inválido (com a lista de
campos), `404` para empreendimento inexistente e `422` para regra de negócio
violada (com `codigo` estável, como `ENTRADA_EXCEDIDA`).

## Arquitetura

```
api/
  src/config/regras.js        política comercial (dados, não código)
  src/domain/                 funções puras: datas, dinheiro, cálculos, simulação
  src/repositories/           acesso a dados (em memória, mesma interface de um banco)
  src/http/                   Express: rotas, validação (Joi), mapeamento de erros
  tests/                      Jest + Supertest
web/
  src/                        React + TypeScript + Tailwind (Vite)
```

Decisões técnicas que valem destaque:

- **Dinheiro em centavos inteiros.** A divisão em parcelas distribui o resto
  nos primeiros vencimentos. A soma do cronograma é igual ao valor da unidade
  **ao centavo**, e isso é verificado em teste.
- **Datas civis em UTC**, trafegando como `AAAA-MM-DD`. O fuso do servidor não
  desloca vencimentos. Séries mensais ficam ancoradas no dia original:
  31/01 → 28/02 → **31/03**, não 28/03.
- **Feriados móveis** calculados pela Páscoa (algoritmo de Meeus), em vez de
  uma lista fixa que caduca todo ano.
- **Domínio sem I/O.** A camada HTTP só valida, chama o domínio e traduz
  `ErroDeNegocio` para status HTTP. O repositório é injetado no app, o que
  facilita testes e troca de persistência.
- **Backend como fonte da verdade.** O frontend mostra estimativas para
  orientar o preenchimento, mas todo valor oficial vem da API.

Mais contexto em [`docs/DECISOES.md`](docs/DECISOES.md).

## Status e limitações

- ✅ Motor de cálculo, API, interface, exportação CSV e testes automatizados (CI).
- ⚠️ Persistência em memória. O MVP original usava MongoDB, com importação de
  tabelas de preço e histórico de versões. Aqui foi simplificado para o
  projeto rodar com um único `npm install`.
- ⚠️ Sem autenticação. O original tinha login JWT e perfis. Foi removido porque
  não agrega a uma demo pública.
- ⚠️ Sem geração das fichas em PDF e sem o *shadow mode*, que comparava o
  cálculo legado do frontend com o novo backend durante a migração. Ambos
  existiam no MVP e foram deixados de fora desta versão.
- ⚠️ Feriados apenas nacionais. Feriados estaduais e municipais não são
  considerados.

## Autoria e licença

Projeto concebido e desenvolvido por **João Pedro Simões Rodrigues**.
Código disponibilizado para avaliação de portfólio. Veja a [LICENSE](LICENSE).
