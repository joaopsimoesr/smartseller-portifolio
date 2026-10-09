# Decisões de projeto

## Contexto

O SmartSeller nasceu em 2025 como MVP para vendedores de cotas imobiliárias.
O cálculo do plano de pagamento (entrada, sinal, saldo, datas por meio de
pagamento, alertas de política) era feito em planilha e em JavaScript no
navegador, o que gerava divergências e expunha a regra comercial no cliente.

O projeto evoluiu em três fases:

1. **Protótipo no navegador.** HTML e JS com IndexedDB para uso offline.
2. **Migração para backend.** API Node/Express com MongoDB, regras
   centralizadas no servidor e *shadow mode*: durante a transição, o frontend
   calculava pelos dois caminhos e registrava as divergências, até o backend
   provar equivalência.
3. **Frontend novo.** React, TypeScript e um formulário em etapas consumindo a
   API.

Este repositório é a **consolidação** dessas fases numa versão de portfólio.
O que mudou em relação ao original:

| Aspecto | MVP original | Esta versão |
|---|---|---|
| Regras e valores | política comercial real | **simulação fictícia** |
| Empreendimentos | carteira real, importada de planilhas | 5 empreendimentos fictícios em JSON |
| Persistência | MongoDB com versionamento de tabelas | repositório em memória (mesma interface) |
| Autenticação | JWT com perfis | removida |
| Datas | mistura de horário local e UTC | UTC de ponta a ponta |
| Valores | ponto flutuante | centavos inteiros, soma exata |
| Feriados | lista fixa | fixos + móveis calculados pela Páscoa |

## Decisões

**Regras como dados.** `api/src/config/regras.js` concentra tudo o que é
política comercial. Mudar um percentual, uma alçada ou o comportamento de um
meio de pagamento não exige tocar no motor. No original, a mesma ideia
existia, mas com constantes espalhadas em vários módulos.

**Domínio puro, HTTP fino.** `src/domain` não importa Express nem faz I/O. Isso
permite testar todas as regras em milissegundos e reaproveitar o motor em
outro transporte, como fila, CLI ou função serverless.

**Erros de negócio tipados.** `ErroDeNegocio` carrega um `codigo` estável
(`ENTRADA_EXCEDIDA`, `SEM_TABELA_LINEAR`…). O frontend pode reagir por código,
não por texto. Validação de formato (`400`) e violação de regra (`422`) são
coisas diferentes.

**Alertas não são erros.** Meses sem parcela, conflito entre sinal e entrada e
necessidade de aprovação não impedem a simulação. Eles aparecem com
severidade (`info` < `aviso` < `atencao` < `bloqueante`), e o vendedor decide
o que fazer com a proposta.

**Centavos e distribuição de resto.** R$ 1.000,00 em 3 parcelas vira
333,34 + 333,33 + 333,33. A soma do cronograma é igual ao valor da unidade em
todos os cenários de teste.
