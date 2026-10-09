<!-- Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados. Uso sujeito aos termos do arquivo LICENSE na raiz do repositório. -->

# As 24 regras de cálculo

O MVP original implementava 24 regras: 9 de calendário e 15 de cálculo do plano.
Esta versão implementa todas. A **lógica** de cada uma foi preservada; os
**valores** (percentuais, faixas de dias, valores por cota, prazos) são
fictícios e ficam em [`api/src/config/regras.js`](api/src/config/regras.js).

Cada regra tem um bloco `describe('Rnn …')` em
[`api/tests/regras.test.js`](api/tests/regras.test.js), e cada simulação
devolve em `regrasAplicadas` as regras que usou.

## Degraus normativos

Seguindo a pirâmide de Kelsen (ver o README), cada regra pertence a um degrau:

| Degrau | Significado | Quem pode mudar |
|---|---|---|
| **Invariante** | vale para qualquer venda; violar recusa a proposta | ninguém |
| **Calendário** | fato externo (datas, feriados), não política comercial | ninguém; só se corrige |
| **Política** | regra geral da empresa, em `regras.js` | diretoria, editando o dado |
| **Específica** | norma do empreendimento, prevalece sobre a geral | gestor do empreendimento |
| **Competência** | remete a decisão a uma instância (alçada) | quem tem a alçada |

## Tabela

| Nº | Regra | O que faz | Degrau | Valores fictícios | Função |
|---|---|---|---|---|---|
| R01 | Somar meses | Soma N meses; se o dia não existe no mês de destino, usa o último (31/01 + 1 → 28/02) | Calendário | — | `datas.addMeses` |
| R02 | Meses sem pagamento | Meses sem parcela entre o último pagamento e uma data de início | Calendário | — | `datas.mesesSemPagamento` |
| R03 | Última parcela | Data da última parcela de uma série mensal (a inicial é a 1ª) | Calendário | — | `datas.ultimaParcela` |
| R04 | Formatar data | DD/MM/AAAA para mensagens e documentos | Calendário | — | `datas.toBR` |
| R05 | Ler data | `AAAA-MM-DD` → meia-noite UTC; rejeita formato e data inexistentes | Invariante | — | `datas.parseISO` |
| R06 | Fixar dia do mês | Troca o dia; se não existe no mês, usa o último | Calendário | — | `datas.fixarDiaDoMes` |
| R07 | Próximo dia útil (inclusivo) | A própria data se for útil; senão avança, com limite | Calendário | limite de **10** dias | `datas.proximoDiaUtil({ inclusivo: true })` |
| R08 | Próximo dia útil (estrito) | Primeiro dia útil **depois** da data | Calendário | limite de **10** dias | `datas.proximoDiaUtil` · `diasUteisApos` |
| R09 | Feriado | Feriado nacional fixo ou móvel (Páscoa) | Calendário | 9 fixos + Carnaval, Sexta-feira Santa, Corpus Christi | `datas.isFeriado` |
| R10 | Valor da entrada | Prioridade: tabela de exceções do empreendimento → promoção vigente → valor por cota da categoria | Específica > Política | Padrão **R$ 2.500**/cota · Premium **R$ 3.200** · promoção **R$ 1.800** (2026) · exceções **R$ 1.250** (1 cota), **R$ 2.500** (2), +**R$ 1.250**/cota | `regras.valorEntrada` |
| R11 | Valor do sinal | Unidade × percentual: cache (R23) → empreendimento → padrão | Específica > Política | padrão **4%** · Resort Beta **6%** | `regras.valorSinal` |
| R12 | Parcelas do sinal | Divide o total da R11 em N parcelas exatas | Invariante | — | `regras.parcelasDoSinal` |
| R13 | Datas por meio de pagamento | PIX/TED/dinheiro no dia · débito em D+N úteis · crédito/boleto a partir do mês seguinte | Política | débito **D+2 úteis** · crédito até **12×** · boleto até **24×** | `regras.datasPorMeioDePagamento` |
| R14 | Parcelas da entrada | Divide a 1ª (ou 2ª) entrada em N parcelas exatas | Invariante | — | `regras.parcelasDaEntrada` |
| R15 | Entrada restante | Entrada total − 1ª − 2ª; negativo recusa a proposta | Invariante | — | `regras.entradaRestante` |
| R16 | Datas da entrada restante | Série mensal ancorada no dia do 1º vencimento | Política | — | `regras.datasEntradaRestante` |
| R17 | Conflito sinal × entrada | O sinal não pode começar até o último vencimento da entrada restante; sugere data | Invariante (alerta bloqueante) | — | `regras.conflitoSinalEntrada` |
| R18 | Início do saldo | Mês seguinte à última parcela do sinal, no dia do sinal | Política | — | `regras.inicioSaldo` |
| R19 | Valor do saldo | Unidade − entrada − sinal | Invariante | — | `regras.valorSaldo` |
| R20 | Parcelas do saldo | Divide o saldo em N parcelas exatas; saldo ≤ 0 recusa | Invariante | até **84** parcelas | `regras.parcelasDoSaldo` |
| R21 | Alçada do sinal | Sinal muito distante da venda exige aprovação | Competência | > **120** dias: gerência · > **180**: comitê | `regras.alcadaAprovacaoSinal` |
| R22 | Meses pulados (1ª + 2ª) | R02 aplicada às duas entradas antes da restante | Política (alerta) | — | `regras.mesesPuladosAntesDaRestante` |
| R23 | Cache de regras | Regras por empreendimento em memória, com validade | Infraestrutura | validade **10 min** | `repositories/cache-regras` |
| R24 | Modelo linear | Tudo vem da linha da tabela; quantidades zeradas usam padrões; mede a divergência da tabela | Específica | sinal no dia **10** · padrões **10/5/72** · Parque Delta Bronze/Prata/Ouro/Esmeralda | `regras.modeloLinear` |

## Diferenças deliberadas em relação ao original

Corrigidas porque eram defeitos, não escolhas de política:

| Regra | Original | Esta versão | Por quê |
|---|---|---|---|
| Todas | mistura de horário local e UTC | UTC de ponta a ponta | o fuso do servidor não muda vencimentos |
| Todas | ponto flutuante | centavos inteiros, resto nas primeiras parcelas | a soma do cronograma é igual ao total, ao centavo |
| Todas | `{ success: false }` silencioso | `ErroDeNegocio` com código estável → HTTP 422 | erro de regra não passa despercebido |
| R09 | só feriados fixos | fixos + móveis pela Páscoa | a lista não caduca a cada ano |
| R12 | recalculava o sinal pelo percentual **padrão** | divide o total da R11 | o percentual do empreendimento valia no total e era ignorado nas parcelas |
| R16 | encadeava meses e "derivava" (31/01 → 28/02 → 28/03) | série ancorada no dia original | o cliente não perde o dia de vencimento combinado |
| R23 | cache em `global` | objeto injetável com relógio | testável e sem estado escondido |
| R24 | confiava na parcela de saldo da tabela | calcula o saldo e alerta se a tabela diverge | a invariante (soma = valor) prevalece sobre o dado tabelado |
