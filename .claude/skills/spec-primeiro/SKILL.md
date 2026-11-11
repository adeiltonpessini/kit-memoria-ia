---
name: spec-primeiro
description: Use antes de codar feature/refactor/endpoint não-trivial, ou quando o custo de re-fazer é alto — escreve uma SPEC curta (objetivo, contrato, casos, plano, verificação) e verifica DEPOIS. Tarefa trivial NÃO precisa de spec.
---

# spec-primeiro — pensar barato antes de escrever caro

Codar sem alvo gera retrabalho (e retrabalho = o maior gasto de token que existe). Uma spec
curta alinha o alvo antes, e a verificação confirma o resultado depois. Código perfeito = alvo
claro + contrato explícito + verificação real.

## Quando aplicar
- **Sim:** endpoint novo, refactor que cruza módulos, mudança de schema, lógica de regra de negócio,
  algo que toca produção (regra nº1). Custo de errar é alto.
- **Não:** correção trivial, ajuste de texto, one-liner óbvio. Spec aqui é desperdício.

## A SPEC (curta — cabe em ~15 linhas; não é documento corporativo)
1. **Objetivo** — 1 frase. O que muda pro usuário/sistema.
2. **Contrato** — entradas, saídas, tipos, erros. Para API: rota, payload, status, RBAC.
3. **Casos** — happy path + 2-3 bordas (vazio, inválido, concorrência, queda de rede).
4. **Invariantes/guard-rails** — o que NÃO pode quebrar (regra nº1 do projeto, se houver;
   idempotência; sem segredo no git; banco de prod vem de `app_settings.prodDb`).
5. **Plano** — arquivos a tocar (ache com `busca-eficiente`), na ordem.
6. **Verificação** — como vou provar que funciona (teste/curl/`run-sql`/Playwright via agente de QA).

## Fluxo
1. Escreva a spec (no chat ou, se grande, um `.md` em scratchpad). Antes de codar lib externa,
   confirme a API atual com `docs-context7`/`docs-researcher`.
2. Dispatche o especialista certo (agente de backend, de frontend, de banco...).
3. Implemente seguindo o plano. Código no idioma da vizinhança (mesma convenção/nomes/estilo).
4. **Verifique de verdade** — rode. Reporte fielmente (se falhou, diga com a saída).
5. Decisão não-óbvia → `remember`. Padrão repetido → vira skill via `skill-smith`.

## Definition of Done (universal do projeto)
- [ ] Contrato cumprido; bordas tratadas.
- [ ] Regra nº1 do projeto respeitada — confirmado quando aplicável.
- [ ] Sem segredo no arquivo/git (env `${VAR}`).
- [ ] Verificado rodando, não só "parece certo".
- [ ] Idempotente/reentrante quando aplicável.

Ver: `AGENTS.md` do projeto (regras e definição de pronto), `busca-eficiente`, `docs-context7`.
