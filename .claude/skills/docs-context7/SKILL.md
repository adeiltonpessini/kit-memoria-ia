---
name: docs-context7
description: Use antes de codar com lib externa (pgx, Flutter, React, Vite, Playwright...) ou ao depurar erro de API: puxa doc ATUALIZADA via context7 (MCP) e evita API alucinada. Prefira delegar ao subagente docs-researcher.
---

# docs-context7 — documentação atual sob demanda (sem alucinar API)

context7 é um MCP HTTP remoto (`.mcp.json` do projeto). Dá **docs version-specific** direto
da fonte. Resolve o problema nº1 de escrever código de lib: **API desatualizada/inventada**.

## Quando usar
- Antes de escrever/alterar código que usa uma lib externa cuja API você não tem 100% na cabeça.
- Ao depurar `undefined: X`/assinatura errada/parâmetro que "sumiu" entre versões.
- Ao **gerar uma skill** que embrulha uma lib (a skill nasce com a API certa — ver `skill-smith`).

## Como (2 ferramentas MCP)
Carregue os schemas: `ToolSearch` → `select:resolve-library-id,query-docs`. Depois:
1. `resolve-library-id` — `libraryName` + `query` (pergunta completa) → escolha o match oficial/score alto.
2. `query-docs` — `libraryId` (ex.: `/jackc/pgx`, ou versionado `/vercel/next.js/v14.3.0`) + `query` específica.

## Economia de token (o ponto)
- **Delegue ao subagente `docs-researcher`** (Agent tool) sempre que a busca puder ser volumosa:
  o dump de docs fica no contexto DELE; você recebe só a conclusão citada. Padrão do projeto.
- Pergunte o **tópico específico**, nunca "toda a doc". Cite o libraryId/versão usados.

## Verificação (memória é PISTA)
- O que vier do context7 é a doc da lib — confirme contra a **versão instalada** no projeto
  (`go.mod`, `pubspec.yaml`, `package.json`) e contra como já usamos a lib aqui (`rg`).

Relacionado: subagente `docs-researcher`, skills `skill-smith` e `busca-eficiente`.
