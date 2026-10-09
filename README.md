<!-- Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados. Uso sujeito aos termos do arquivo LICENSE na raiz do repositório. -->

# SmartSeller — simulador de planos de pagamento

> **Versão de portfólio.** Empreendimentos, valores, percentuais, prazos e
> alçadas são **fictícios**. A arquitetura e as técnicas vêm de um MVP real
> (2025) usado por vendedores para montar propostas de venda de cotas
> imobiliárias. As regras comerciais originais foram trocadas por uma
> simulação.

![Plano padrão](docs/img/plano-padrao.png)

<p align="center"><img src="docs/img/mobile.png" alt="Versão para celular" width="260"></p>

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

## Da norma ao código

A parte mais desafiadora do projeto não foi técnica. Foi **traduzir a política
comercial e as normas internas, escritas para pessoas, em regras executáveis**,
sem perder o sentido nem criar comportamento que a norma não previa. O MVP
original implementava 24 regras de cálculo. Esta versão reúne um subconjunto
representativo, com valores fictícios, mas preserva o método.

Cada regra percorre o mesmo caminho: **norma → interpretação → dado → função → teste**.

**1. A norma**, como um gestor a escreveria:

> *"O início do sinal pode ser postergado. Se começar mais de 120 dias após a
> venda, depende de aprovação da gerência; acima de 180 dias, do comitê comercial."*

**2. A interpretação.** O texto deixa perguntas que o código não pode deixar em
aberto:

| Dúvida | Decisão registrada |
|---|---|
| "Mais de 120 dias" inclui o 120º dia? | Não: a aprovação começa no 121º dia (`>`, não `>=`) |
| E exatamente 180 dias? | Gerência: "acima de 180" significa a partir do 181º dia |
| Dias corridos ou úteis? | Corridos: a norma não fala em dias úteis, e onde fala (débito) isso está explícito |
| A falta de aprovação impede a proposta? | Não: o sistema **alerta** e o vendedor decide. Bloquear seria criar uma regra que a norma não criou |

**3. O dado.** A política vira configuração, não código
([`regras.js`](api/src/config/regras.js)):

```js
autorizacaoSinal: [
  { acimaDeDias: 180, nivel: 'COMITE',   rotulo: 'Comitê comercial' },
  { acimaDeDias: 120, nivel: 'GERENCIA', rotulo: 'Gerência' },
],
```

**4. A função**, pura e sem números mágicos
([`calculos.js`](api/src/domain/calculos.js)):

```js
function alcadaAprovacaoSinal(dataVenda, inicioSinal) {
  const dias = datas.diffDias(inicioSinal, dataVenda);
  const faixa = REGRAS.autorizacaoSinal.find((f) => dias > f.acimaDeDias);
  return { dias, exigeAprovacao: Boolean(faixa), nivel: faixa?.nivel ?? null }; // resumido
}
```

**5. O teste**, que fixa a interpretação nas fronteiras, onde as normas costumam
ser ambíguas ([`calculos.test.js`](api/tests/calculos.test.js)):

```js
['2026-04-30', null],        // 119 dias
['2026-05-02', 'GERENCIA'],  // 121 dias
['2026-06-30', 'GERENCIA'],  // 180 dias (limite)
['2026-07-01', 'COMITE'],    // 181 dias
```

Quando a política mudar, muda o dado. Quando a interpretação mudar, um teste de
fronteira quebra antes de qualquer proposta sair errada.

### A pirâmide normativa como arquitetura

O guia da conversão foi a **pirâmide normativa de Kelsen**: uma norma só é
válida se encontra fundamento na norma superior, e nenhuma camada inferior pode
contrariar a de cima. As regras do SmartSeller foram organizadas da mesma forma,
e cada degrau tem um lugar próprio no código:

| Degrau | No negócio | No código | Pode ser alterado por… |
|---|---|---|---|
| 1 | **Invariantes**: o que vale para qualquer venda | O domínio garante: a soma das parcelas é igual ao valor da unidade, as datas existem, nenhum pagamento é anterior à venda | ninguém; violar gera erro (`422`) |
| 2 | **Política comercial geral** | [`regras.js`](api/src/config/regras.js): valores por categoria, percentual de sinal, meios de pagamento, alçadas | a diretoria, editando o dado |
| 3 | **Norma específica** do empreendimento | `percentualSinal` e `promocaoEntrada` no cadastro do empreendimento | o gestor do empreendimento, dentro dos limites do degrau 2 |
| 4 | **Ato concreto**: a proposta do vendedor | O payload de `POST /api/simulacoes` | o vendedor, dentro de tudo o que está acima |

Os critérios clássicos de solução de antinomias também aparecem no motor:

- **Hierarquia** (*lex superior*): nenhum dado de empreendimento ou de proposta
  quebra uma invariante: o motor recusa a proposta com um código de erro estável.
- **Especialidade** (*lex specialis*): o percentual de sinal do empreendimento
  prevalece sobre o geral (`empreendimento.percentualSinal ?? percentualPadrao`).
- **Temporalidade** (*lex posterior* e vigência): a promoção de entrada só
  vale entre `inicio` e `fim`, e cada simulação registra a versão das regras
  aplicadas (`regrasVersao`).
- **Competência**: o que excede a autonomia do vendedor não é proibido. É
  remetido à instância competente, e as alçadas de gerência e comitê
  funcionam como delegação de competência.

## Como rodar

Requisitos: Node 20 ou superior. Não há banco, Docker nem variáveis de ambiente.
O `npm install` termina com **0 vulnerabilidades**: os testes usam o runner nativo do
Node, e a única dependência de teste é o Supertest.

```bash
npm install
npm run dev        # API em :3001 e interface em http://localhost:5173
npm test           # 42 testes (node:test + Supertest)
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
  tests/                      node:test (nativo) + Supertest
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

## Design

A interface segue a linguagem do Design System Leginova (superfícies em papel,
tipografia editorial, cards brancos com borda fina, marcador octogonal), com a
paleta adaptada para **azul royal**, na tinta e na ação, e **verde**, no dado e
na confirmação:

- **Tipografia.** EB Garamond nos títulos, Inter na interface, JetBrains Mono
  em rótulos, parcelas e selos.
- **Cor nunca carrega significado sozinha.** Etapas e alertas usam um ponto
  colorido sempre acompanhado de texto, e as cores das etapas diferem em
  luminosidade, não só em matiz.
- **Contraste.** Todo texto fica acima de 4,5:1 (WCAG AA). Os tons mais claros
  de azul e verde são usados só em marcas gráficas (≥ 3:1).
- **Sem requisições a terceiros.** As fontes são servidas pelo próprio app.
  Foco visível em todos os controles, link para pular ao conteúdo e
  `prefers-reduced-motion` respeitado.

Os tokens estão em [`web/src/index.css`](web/src/index.css).

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

As fontes em `web/public/fonts/` (EB Garamond, Inter e JetBrains Mono) são de
seus respectivos autores e são distribuídas sob a SIL Open Font License 1.1.
As licenças estão em [`web/public/fonts/licencas/`](web/public/fonts/licencas/).
