<!-- Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados. -->
<!-- Uso sujeito aos termos do arquivo LICENSE na raiz do repositório. -->

# Funcionalidades além do cálculo

Origem: as versões locais do MVP (2025). Nenhum arquivo foi copiado como estava. Cada funcionalidade foi
reescrita com dados fictícios, sem histórico git, sem nome de cliente e sem template de terceiros.

| Linhagem | Nome interno | Stack original |
|---|---|---|
| **L3** | piloto (calculadora monolítica + fichas PDF) | JS puro, pdf-lib, Jest, Puppeteer |
| **L4** | backend | Express, MongoDB, Joi, JWT, Jest |
| **L5** | frontend "flow" | React, TypeScript, shadcn, react-hook-form, zod |
| **L6** | app de cadastro de clientes | React, Tailwind |

| Funcionalidade | O que faz aqui | Veio de | Onde está | Simplificações |
|---|---|---|---|---|
| **Assistente de venda em 7 etapas** | Cliente → Negociação → 1ª entrada → 2ª entrada → Entrada restante → Sinal e saldo → Resumo e fichas; o modelo linear pula as etapas de pagamento | L5 (`SalesProcess`, `components/forms/*`) | `web/src/paginas/Assistente.tsx` | sem react-hook-form/zod/shadcn; a validação oficial é a da API |
| **Ficha de Negociação (PDF)** | PDF gerado no servidor a partir da simulação: negociação, totais, resumo por etapa, alertas, cronograma paginado, assinaturas | L3 (`pdf-service.js`, fichas) + L5 (`pdfService.ts`) | `api/src/pdf/ficha-negociacao.js`, `api/src/pdf/campos.js` | desenhada do zero com pdf-lib; sem template de terceiros |
| **Ficha de Cadastro (PDF)** | Template genérico com campos de formulário nomeados por código (`CAD.NOME`, `NEG.COTAS`…), preenchido e achatado; código sem campo quebra o mapeamento | L3 (template com campos codificados, `PDFMappingModule`, testes de template) | `api/src/pdf/ficha-cadastro.js` | template gerado pelo código (nenhum PDF binário no repositório) |
| **Mapeamento de campos por código** | Layout só conhece códigos; um mapa diz de onde vem cada valor | L3 | `api/src/pdf/campos.js`, `LAYOUT` em `ficha-cadastro.js` | — |
| **Validação de CPF** | Dígitos verificadores na ficha de cadastro | L3 (máscaras e validação) | `api/src/http/validacao.js` · `cpfValido` | sem máscara de entrada no frontend |
| **Importação de tabelas de preço** | CSV (texto) → tabela LINEAR ou EXCECOES, com versão e data de vigência; a simulação usa a versão vigente na data da venda | L4 (`venture-table.service`, importer, seeds) | `api/src/servicos/importacao.js`, `repositorio.js`, tela *Tabelas de preço* | sem XLSX; formato de colunas próprio; memória em vez de MongoDB |
| **Tabela de exceções de entrada** | Prioridade sobre o valor por categoria (R10) | L4 | `regras/calculo.js` · `calculateEntryAmount` | — |
| **Shadow mode** | Roda a implementação legada (ponto flutuante, `setMonth` sem ajuste) ao lado da nova, compara com tolerâncias, registra e mostra estatísticas | L4 (`shadow-mode.service`, rotas, dashboard) + L5 (`legacyCalculations.ts`) | `api/src/servicos/shadow.js`, tela *Shadow mode* | 3 funções observadas; registro em memória |
| **Login e perfis** | JWT; VENDEDOR simula e gera fichas; ADMIN também importa tabelas e vê o shadow mode | L4 (`auth.controller`, middleware) + L5 (tela de login) | `api/src/servicos/auth.js`, `web/src/App.tsx` | segredo gerado na inicialização; usuários demo públicos (senha `demo`) com hash scrypt |
| **Cache de regras por empreendimento** | Sincroniza regras dos empreendimentos ativos com validade (R23) | L4 (`syncVentureRules`) | `regras/calculo.js`, `servicos/simulacao.js` | — |
| **Contrato de erros da API** | 400 validação (com campos), 401/403 autenticação, 404 inexistente, 422 regra violada com `codigo` estável | L4 | `api/src/http/erros.js` | — |
| **Rastreio de regras** | Cada simulação devolve `regrasAplicadas` | novo | `servicos/simulacao.js` | — |

## Ficou de fora (e por quê)

| Funcionalidade original | Origem | Motivo |
|---|---|---|
| Persistência MongoDB, backup e auditoria com cron | L4 | exige infraestrutura; pouco valor para uma demo |
| Importação de XLSX e as planilhas comerciais | L4 | dados reais |
| Testes e2e com Puppeteer | L3 | pesados para `npm test`; a cobertura de API e regras os substitui |
| Persistência local com IndexedDB | protótipo de março/2025 | superado pela API |
| CRUD de cadastro de clientes | L6 | fora do fluxo de venda; o cadastro entra só na ficha |
| Templates PDF originais e PDFs preenchidos | L3 | identidade visual e dados de terceiros |
| OpenAPI | L4 | não foi refeito nesta versão (ver README) |
