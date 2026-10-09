# SmartSeller — de norma a código

> Simulador de planos de pagamento em que **cada regra de negócio e cada
> alçada de aprovação é uma norma escrita, traduzida em código testável**.

**Versão de portfólio.** Empreendimentos, valores, percentuais, prazos e
alçadas são **fictícios**. A arquitetura e as técnicas vêm de um MVP que
construí em 2024–2025, como cofundador da KTB Smart Solutions, para
vendedores que montam propostas de venda de cotas imobiliárias. As regras
comerciais originais foram trocadas por uma simulação.

![Plano padrão](docs/img/plano-padrao.png)

## O desafio que me interessou

O difícil neste projeto não foi a interface nem a API. Foi **traduzir normas
internas em lógica de programação**. Uma norma não é uma lista de passos. Ela
tem estrutura própria:

- **condição**: "se o sinal começa antes do fim da entrada restante…";
- **exceção**: "…salvo na tabela de exceções do empreendimento";
- **hierarquia**: a tabela de exceções prevalece sobre o valor por categoria, e
  o percentual do empreendimento prevalece sobre o padrão;
- **competência**: acima de certo prazo, a aprovação sobe de gerência para
  comitê.

Esse texto só vira código correto quando se entende a norma, e não apenas a
sintaxe. Por isso o projeto trata a regra como cidadã de primeira classe.

| Norma (simulada) | Estrutura jurídica | Onde vive no código |
|---|---|---|
| Entrada por cota, por categoria, com promoção por vigência | regra geral, regra especial, vigência temporal | `api/src/config/regras.js` + `domain/calculos` |
| Sinal = % da unidade, sobrescrevível por empreendimento | norma geral e norma especial (a especial prevalece) | idem |
| Data da 1ª parcela conforme o meio de pagamento | tipificação: cada meio tem uma consequência | idem |
| Dia útil, com feriados nacionais **móveis** (Páscoa) | contagem de prazo em dias úteis | `domain/datas` |
| Sinal não pode começar antes do fim da entrada restante | vedação, com saída sugerida | alerta bloqueante com data sugerida |
| Meses sem parcela entre entrada e entrada restante | lacuna que deve ser sinalizada, não escondida | alerta `MESES_SEM_PAGAMENTO` |
| Distância venda → sinal acima de 120 dias: gerência; acima de 180: comitê | alçada, ou seja, competência por faixa | alerta com nível de aprovação |
| **Modelo linear**: valores e prazos vêm de tabela por categoria | regime alternativo, com sua própria regra de cálculo | `simularModeloLinear` |

Três escolhas de projeto vêm dessa mentalidade:

1. **A política é dado, não código.** Todas as regras ficam num arquivo
   declarativo, [`api/src/config/regras.js`](api/src/config/regras.js). O motor
   de cálculo não tem números mágicos. Alterar uma alçada é alterar uma linha
   versionada, e a versão das regras vai em toda resposta (`regrasVersao`).
2. **Rastreabilidade.** Cada violação tem um `codigo` estável
   (`ENTRADA_EXCEDIDA` etc.), e toda resposta informa a versão das regras. Na
   `versao-local/`, cada simulação também lista as `regrasAplicadas`. Dá para
   auditar por que o sistema decidiu o que decidiu.
3. **Cada regra tem teste.** Uma regra sem teste é uma interpretação sem
   fundamento. A suíte confere, por exemplo, que a soma do cronograma é igual
   ao valor da unidade **ao centavo**.

## Duas versões neste repositório

| Pasta | O que é |
|---|---|
| Raiz (`api/`, `web/`) | Versão enxuta: motor de cálculo, API, interface, testes e CI. |
| [`versao-local/`](versao-local/) | Versão consolidada: as **24 regras documentadas uma a uma** em [`REGRAS.md`](versao-local/REGRAS.md), assistente de venda em 7 etapas, login com perfis, importação de tabelas de preço por CSV com versão e vigência, *shadow mode* (nova implementação × legada) e fichas em PDF. Veja o [README](versao-local/README.md) e as [funcionalidades](versao-local/FUNCIONALIDADES.md). |

Para a leitura de "norma → código", comece pelo
[`REGRAS.md`](versao-local/REGRAS.md): cada regra tem entradas, saídas,
valores fictícios e a função que a implementa.

## O que faz

O vendedor informa a negociação: empreendimento, cotas, valor da unidade e
como o cliente quer pagar. O sistema devolve o **cronograma completo de
parcelas** e os **alertas de política comercial**:

```
1ª entrada ─► 2ª entrada (opcional) ─► entrada restante ─► sinal ─► saldo
```

## Como rodar

Requisitos: Node 20 ou superior. Não há banco, Docker nem variáveis de ambiente.

```bash
npm install
npm run dev        # API em :3001 e interface em http://localhost:5173
npm test           # unidade + HTTP
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
- ✅ [`versao-local/`](versao-local/): 24 regras documentadas, login com perfis,
  importação de tabelas por CSV, *shadow mode* e fichas em PDF.
- ⚠️ Persistência em memória. O MVP original usava MongoDB. Aqui foi simplificado
  para o projeto rodar com um único `npm install`.
- ⚠️ Os valores são fictícios. Nada aqui representa a política comercial de
  nenhuma empresa ou cliente.
- ⚠️ A versão da raiz não tem autenticação nem PDF. Esses recursos estão em
  `versao-local/`.
- ⚠️ Feriados apenas nacionais. Feriados estaduais e municipais não são
  considerados.

## Autoria e licença

Projeto concebido e desenvolvido por **João Pedro Simões Rodrigues**
([github.com/joaopsimoesr](https://github.com/joaopsimoesr)), bacharel em
Direito e desenvolvedor, com foco em automação e dados para o Direito.
Código disponibilizado para avaliação de portfólio. Veja a [LICENSE](LICENSE).
