#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
// ─────────────────────────────────────────────────────────────────────
// remember — "inserir conhecimento" no método grep. NÃO embeda nada: cria um
// .md curado e versionado em docs/knowledge/, que o `rg` acha depois.
//
// Uso:
//   node $HOME/.kit-memoria-ia/tools/knowledge/remember.mjs "cache de sessão no redis"               # decisão
//   node $HOME/.kit-memoria-ia/tools/knowledge/remember.mjs "migração do banco" --type session      # handoff
//   node $HOME/.kit-memoria-ia/tools/knowledge/remember.mjs "build quebra sem a env X" --type licao  # gotcha
//   node $HOME/.kit-memoria-ia/tools/knowledge/remember.mjs "ADR cookies" --type misc
//   node $HOME/.kit-memoria-ia/tools/knowledge/remember.mjs "tema" --type session --print           # só imprime
//
// Flags:
//   --type decision|session|licao|misc   (default: decision)
//   --print                              imprime o template no stdout (não grava)
//
// Nomes (o SessionStart e o handoff-gate leem a data do nome):
//   decisions/AAAA-MM-DD-<slug>.md · sessions/chat-AAAA-MM-DD-<slug>.md
//   licoes/<slug>.md (lição não tem data no nome: é atualizada, não empilhada) · misc/note-<slug>-AAAA-MM-DD.md
//
// A data é a LOCAL da máquina, não UTC: depois das 21h em Brasília o toISOString()
// já é o dia seguinte, e o handoff da noite nascia com a data de amanhã.
// ─────────────────────────────────────────────────────────────────────

import { writeFileSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const argv = process.argv.slice(2)
const opts = { type: "decision", print: false }
const words = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--type") opts.type = argv[++i]
  else if (argv[i] === "--print") opts.print = true
  else words.push(argv[i])
}
const title = words.join(" ").trim()
if (!title) {
  console.error('uso: node $HOME/.kit-memoria-ia/tools/knowledge/remember.mjs "<título>" [--type decision|session|licao|misc] [--print]')
  process.exit(2)
}

const DIRS = { decision: "decisions", session: "sessions", licao: "licoes", misc: "misc" }
const sub = DIRS[opts.type]
if (!sub) { console.error(`--type inválido: ${opts.type} (use decision|session|licao|misc)`); process.exit(2) }

const d = new Date()
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const slug = title.toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")  // tira acento
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)
const NOMES = {
  decision: `${today}-${slug}.md`,
  session: `chat-${today}-${slug}.md`,
  licao: `${slug}.md`,
  misc: `note-${slug}-${today}.md`,
}
const filename = NOMES[opts.type]

const TEMPLATES = {
  decision: `# ${title} (${today})

**Problema:** <sintoma + contexto que motivou>

**Decisão:** <o que foi decidido + alternativas descartadas>

**Razão:** <por que essa e não outra: trade-offs explícitos>

**Resultado:** <o que ficou no código + arquivos-chave + testes/validação>

<!-- linke decisões relacionadas: ver \`rg -l "tema" docs/knowledge/\` -->
`,
  // A 1ª seção # é o TL;DR: é só ela (até 3.000 caracteres) que o SessionStart injeta.
  session: `---
data: ${today}
tema: ${title}
---

# Handoff ${today}: ${title}

<TL;DR que basta sozinho, em até 6 linhas: estado, o que está pendente, próximo passo e onde está o detalhe.>

## Ficou pronto
- <o quê, com caminho, commit e o número que prova>

## Pendente
- <o quê, quem, o que bloqueia>

## Gotchas
- <armadilha + como evitar. Se vale para sempre, vire lição: \`--type licao\`>

## Git
- <branch, último commit, o que não foi commitado, worktrees abertas>

## Próximo passo
<comando ou ação exata>

## Retro (o que custou caro e o que mudar)
- **Custou caro:** <passo que gastou tempo, contexto ou cota, e por quê>
- **Mudar:** <regra, skill, script, playbook ou memória que teria evitado>
- **Virou:** <arquivo alterado nesta sessão, ou "pendente: <responsável>">
`,
  licao: `---
titulo: ${title}
descoberta-em: ${today}
verificada-em: ${today}
aplica-se-a: <backend | frontend | banco | infra | app | ferramental>
---

# ${title}

**Sintoma:** <o que se viu: erro, número, comportamento. Sem narrativa.>

**Causa (verificada):** <o mecanismo, com \`caminho:linha\` ou comando que prova hoje>

**Regra:** <uma frase no imperativo que impede a repetição>

**Como detectar:** <comando, \`rg\`, teste ou gate que pega isso de novo>

**Onde a regra mora agora:** <playbook, skill, teste ou script que foi atualizado; lição que só existe aqui não protege ninguém>
`,
  misc: `# ${title} (${today})

<conteúdo livre: nota ou ADR>
`,
}
const TEMPLATE = TEMPLATES[opts.type]

if (opts.print) {
  process.stdout.write(TEMPLATE)
  process.exit(0)
}

// Avisa se já existe doc parecido (evita duplicar — usa rg, ignora se faltar).
const dir = join("docs/knowledge", sub)
const terms = slug.split("-").filter((t) => t.length >= 4).slice(0, 4).join("|")
if (terms) {
  const res = spawnSync("rg", ["-l", "-i", "-e", terms, "docs/knowledge"], { encoding: "utf8" })
  const hits = (res.stdout || "").split("\n").map((s) => s.trim()).filter(Boolean)
  if (hits.length) {
    console.error("⚠ já existem docs sobre termos parecidos (considere ATUALIZAR em vez de duplicar):")
    for (const h of hits.slice(0, 8)) console.error(`  ${h}`)
    console.error("")
  }
}

const path = join(dir, filename)
if (existsSync(path)) { console.error(`já existe: ${path} (atualize em vez de recriar)`); process.exit(1) }
mkdirSync(dir, { recursive: true })
writeFileSync(path, TEMPLATE, "utf8")
console.log(`✅ criado: ${path}`)
console.log(opts.type === "licao"
  ? "   preencha, verifique a causa contra o código e leve a regra para o playbook ou skill do agente da área."
  : "   preencha e commite.")
