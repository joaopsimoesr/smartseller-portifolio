<!-- Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados. -->
<!-- Uso sujeito aos termos do arquivo LICENSE na raiz do repositório. -->

# As 24 regras de cálculo (versão local)

As 24 regras são as funções exportadas pelos dois módulos de regras do backend do MVP:
15 em `calculation.service.js` e 9 em `date-utils.js`. A **lógica** de cada uma foi
preservada. Os **valores** (percentuais, faixas de dias, valores por cota, prazos)
são fictícios e ficam todos em [`api/src/config/regras.js`](api/src/config/regras.js).

Os nomes das funções são os originais, para facilitar a comparação.
Cada regra tem um bloco `describe('Rnn …')` em [`api/tests/regras.test.js`](api/tests/regras.test.js).

| Nº | Regra | O que faz | Entradas | Saídas | Valores fictícios | Arquivo · função |
|---|---|---|---|---|---|---|
| R01 | Somar meses | Soma N meses a uma data; se o dia não existe no mês de destino, usa o último dia (31/01 + 1 → 28/02) | data, meses (±) | data | — | `regras/datas.js` · `addMonths` |
| R02 | Meses sem pagamento | Lista os meses sem nenhum pagamento entre o último pagamento anterior e o mês de início | data de início, datas anteriores | `["M/AAAA", …]` | — | `regras/datas.js` · `checkAllMonthGaps` |
| R03 | Última parcela | Data da última parcela de uma série mensal (a data inicial é a 1ª) | data inicial, nº de parcelas | data | — | `regras/datas.js` · `getLastInstallmentDate` |
| R04 | Formatar data | DD/MM/AAAA | data | texto | — | `regras/datas.js` · `formatDate` |
| R05 | Ler data | "AAAA-MM-DD" → data UTC; rejeita formato errado e data inexistente | texto | data | — | `regras/datas.js` · `parseInputDate` |
| R06 | Fixar dia do mês | Troca o dia; se não existir no mês, usa o último dia | data, dia 1–31 | data | — | `regras/datas.js` · `setDayOfMonth` |
| R07 | Próximo dia útil (inclusivo) | A própria data se for dia útil; senão avança, com limite de iterações | data, máx. iterações | data | máx. **10** dias | `regras/datas.js` · `getNextBusinessDay` |
| R08 | Próximo dia útil (estrito) | Primeiro dia útil **depois** da data | data, máx. iterações | data | máx. **10** dias | `regras/datas.js` · `getNextBusinessDayAfter` |
| R09 | Feriado | Feriado nacional fixo? (móveis não entram, como no original) | data | booleano | 8 feriados nacionais fixos (calendário público) | `regras/datas.js` · `isHoliday` |
| R10 | Valor da entrada | 1º tabela de exceções do empreendimento (1 cota = X, 2 = 2X, +X por cota adicional); 2º valor fixo por cota da categoria | empreendimento, cotas, tabela de exceções | valor total, regra aplicada | Padrão **R$ 2.000**/cota · Premium **R$ 3.000**/cota · exceção (Vila Gama) **R$ 1.000**/cota · cotas **1–10** | `regras/calculo.js` · `calculateEntryAmount` |
| R11 | Valor do sinal | Unidade × percentual, arredondado ao real; percentual vem do cache (R23), senão do empreendimento, senão do padrão | valor da unidade, empreendimento, cache | valor, percentual, origem | padrão **4%** · Resort Beta **6%** | `regras/calculo.js` · `calculateSignalAmount` |
| R12 | Parcela do sinal | Sinal pelo percentual **padrão** dividido em N (ignora o percentual do empreendimento, como no original) | valor da unidade, parcelas | total, parcelas | **4%** | `regras/calculo.js` · `calculateSignalInstallmentValue` |
| R13 | Datas da 1ª entrada | PIX/TED/dinheiro: todas na data da venda · débito: 1ª no próximo dia útil (R08), demais venda + i meses · crédito/boleto: venda + (i+1) meses, sem dia útil | data da venda, parcelas, meio | datas, regra | mapeamento meio → regra em config | `regras/calculo.js` · `calculateFirstEntryDates` |
| R14 | Parcela da 1ª entrada | Divide o valor da 1ª entrada em N parcelas exatas | valor, parcelas | parcelas | — | `regras/calculo.js` · `calculateFirstEntryParcelValue` |
| R15 | Entrada restante | (entrada total − 1ª − 2ª) ÷ N; sinaliza quando fica negativo | entrada total, 1ª, 2ª, parcelas | restante, parcelas, `negativo` | — | `regras/calculo.js` · `calculateRemainingEntryValue` |
| R16 | Datas da entrada restante | Série mensal encadeada a partir do início (deriva no fim do mês: 31/01 → 28/02 → 28/03, como no original) | data inicial, parcelas | datas | — | `regras/calculo.js` · `calculateRemainingEntryDates` |
| R17 | Conflito sinal × entrada | Conflito se o sinal começa até o último vencimento da entrada restante; sugere o mês seguinte | início do sinal, datas restantes | conflito, última data, início sugerido | — | `regras/calculo.js` · `checkSignalConflict` |
| R18 | Início do saldo | Mês seguinte à última parcela do sinal, no dia do sinal (com ajuste de fim de mês) | início do sinal, parcelas, dia | data | — | `regras/calculo.js` · `calculateBalanceStartDate` |
| R19 | Valor do saldo | Unidade − entrada − sinal (em centavos) | unidade, entrada, sinal | valor | — | `regras/calculo.js` · `calculateBalanceAmount` |
| R20 | Parcela do saldo | Divide o saldo em N parcelas exatas | saldo, parcelas | parcelas | — | `regras/calculo.js` · `calculateBalanceInstallmentValue` |
| R21 | Alçada do sinal | Dias entre venda e início do sinal: acima da 1ª faixa exige gerência; acima da 2ª, diretoria | início do sinal, data da venda | exigida, nível, dias | Gerência **> 120 dias** · Diretoria **> 180 dias** | `regras/calculo.js` · `checkSignalAuthorizationRequired` |
| R22 | Meses pulados (1ª + 2ª) | R02 aplicada às datas da 1ª e da 2ª entrada juntas | início restante, datas 1ª, datas 2ª | `["M/AAAA", …]` | — | `regras/calculo.js` · `identifySkippedMonths` |
| R23 | Cache de regras | Monta cache nome → {categoria, valor base, promoção, % sinal} dos empreendimentos ativos; leitura só dentro da validade | empreendimentos, instante | cache | validade **10 min** | `regras/calculo.js` · `syncVentureRules` (+ `getVentureFromCache`) |
| R24 | Modelo linear | Tudo vem da linha da tabela LINEAR (categoria de preço): entrada no boleto, sinal no dia fixo do mês seguinte, saldo em sequência; quantidades zeradas usam padrões; reporta divergência entre parcela de saldo da tabela e saldo calculado | empreendimento, categoria, cotas, data, tabela | entrada/sinal/saldo com valores, parcelas e datas | dia do sinal **10** · padrões **10/5/50** parcelas · Parque Delta Bronze/Prata/Ouro | `regras/calculo.js` · `calculateLinearModelPayments` |

## Diferenças deliberadas em relação ao original

| Tema | Original | Versão local | Por quê |
|---|---|---|---|
| Fuso horário | mistura `getDay()` local com `getUTCDay()` | tudo em UTC | vencimento não muda com o fuso do servidor |
| Dinheiro | divisão em ponto flutuante | centavos inteiros; resto nas primeiras parcelas | soma do cronograma = total, ao centavo |
| Erros | `{ success: false, error }` | `throw ErroDeRegra(codigo)` → HTTP 422 | erro não passa despercebido |
| Dependências | Mongo + cache global (`global.ventureCache`) | funções puras; tabelas e cache por parâmetro | testável sem banco |
| Validade do cache (R23) | fixa | em `config/regras.js` | valor fictício centralizado |

Comportamentos do original **preservados de propósito**, mesmo quando discutíveis, para a comparação ser justa:
R09 sem feriados móveis, R12 ignorando o percentual do empreendimento, R13 com todas as parcelas
"mesmo dia" na data da venda e R16 derivando no fim do mês.

## Comparação rápida com a versão da raiz do repositório

| Regra | Raiz (`api/`) | Versão local |
|---|---|---|
| R09 feriados | fixos + móveis (Páscoa) | só fixos (original) |
| R13 débito | D+2 úteis | próximo dia útil (original) |
| R16 série mensal | ancorada no dia original | encadeada (original) |
| R10 exceções de entrada | não há | tabela de exceções com prioridade |
| R10 promoção por vigência | sim | não (o original só cacheava a flag) |
| R23 cache de regras | não há | sim |
| R24 divergência da tabela | não reporta | alerta `DIVERGENCIA_TABELA_LINEAR` |

## Como a simulação usa as regras

`api/src/servicos/simulacao.js` compõe as regras no fluxo 1ª entrada → 2ª entrada → entrada restante → sinal → saldo.
Cada resposta traz `regrasAplicadas` com as regras usadas. Uma simulação padrão completa, com débito e entrada restante,
exercita R01–R03, R05, R06, R08–R11 e R13–R23. As demais entram assim:

- R04: quando há conflito de sinal (mensagem com data formatada);
- R07: pela rota `/api/datas/dia-util`;
- R24: no modelo linear;
- R12: não entra no fluxo, porque o total do sinal vem da R11. Ela é coberta pelos testes.
