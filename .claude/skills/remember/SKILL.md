---
name: remember
description: Registra conhecimento curado (decisão, handoff de sessão, ADR/nota) como markdown grepável em docs/knowledge/ — método Akita, SEM RAG/embeddings. Use quando o usuário disser "anota essa decisão", "guarda isso", "faz o handoff da sessão", ou quando uma decisão não-óbvia precisa sobreviver à sessão. O hook SessionStart injeta o handoff de sessão mais recente.
---

# remember — inserir conhecimento (markdown grepável, sem RAG)

Conhecimento vive em `docs/knowledge/` e é achado por `rg` depois — **nunca embeddings**.
Estrutura: `decisions/` (problema→decisão→razão→resultado), `sessions/` (handoffs), `misc/` (ADRs/notas).

## Criar
```bash
node $HOME/.claude/kit/tools/knowledge/remember.mjs "<título>"                 # decisão (default)
node $HOME/.claude/kit/tools/knowledge/remember.mjs "<título>" --type session  # handoff de sessão
node $HOME/.claude/kit/tools/knowledge/remember.mjs "<título>" --type licao     # gotcha verificado (skill licao-aprendida)
node $HOME/.claude/kit/tools/knowledge/remember.mjs "<título>" --type misc      # ADR/nota
node $HOME/.claude/kit/tools/knowledge/remember.mjs "<título>" --print          # só imprime o template
```
Cria o `.md` com template + avisa se houver duplicata. Preencha o corpo e salve.

## Buscar (antes de criar — evita duplicar)
```bash
node $HOME/.claude/kit/tools/knowledge/akita.mjs search "<tema>"   # ranqueado FTS5 (método Akita) — começe aqui
rg "<termo>" docs/knowledge/                       # exato/literal
```

## Quando usar handoff de sessão
No fim de uma frente de trabalho relevante: `--type session`. O hook `SessionStart`
(`~/.claude/kit/tools/knowledge/session-handoff.mjs`) injeta o handoff mais recente na próxima sessão.

⚠️ **O hook injeta SÓ o frontmatter + a PRIMEIRA seção `#` (cap 3.000 chars)** — economia de
token (decisão 27/07). Logo: **o TL;DR tem que ser a primeira seção `#` do handoff**, e tem
que bastar sozinho (o que mudou, o que está no ar, o que ficou pendente). Detalhe vem depois,
em seções seguintes, lido sob demanda por `rg`. Handoff sem TL;DR na frente = próxima sessão
começa cega.

O template do handoff termina com a **Retro**: o que custou caro, o que mudar e no que virou.
Item que vale para sempre vira lição na mesma sessão (skill `licao-aprendida`); o resto fica
`**Virou:** pendente` e a consolidação recolhe.

## Princípio
**Memória é PISTA — verifique contra o sistema/código antes de confiar.** Se um `.md` cita
arquivo/tag/flag, confirme que ainda existe antes de recomendar.

Conteúdo de longo prazo sobre o usuário/projeto também pode ir na auto-memória local
(`MEMORY.md` + arquivos), fora do git. Decisões técnicas do projeto → `docs/knowledge/`.
