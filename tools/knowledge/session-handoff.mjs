#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
// session-handoff.mjs — auto-surface do handoff mais recente (método Akita-lite).
//
// Rodado pelo hook SessionStart (.claude/settings.json). Imprime no stdout o
// `.md` de handoff mais recente de docs/knowledge/sessions/ (só TL;DR) — assim a próxima
// sessão/agente já começa sabendo onde paramos, sem ninguém lembrar de procurar.
//
// ZERO LLM, zero rede, zero custo: é só um `cat` esperto, cross-platform (Node,
// não bash — não quebra no Windows). Spec: docs/knowledge/sessions/README.md.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SESSIONS_DIR = join(
  process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  "docs",
  "knowledge",
  "sessions",
);

// Só mostra handoff recente — passado distante é ruído, não contexto.
const MAX_AGE_DAYS = 14;

function dateFromName(name) {
  // chat-AAAA-MM-DD-<tema>.md → AAAA-MM-DD (fonte primária de ordenação).
  const m = name.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "0000-00-00";
}

function main() {
  let files;
  try {
    files = readdirSync(SESSIONS_DIR);
  } catch {
    return; // pasta não existe ainda — silencioso.
  }

  const handoffs = files
    .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
    .map((f) => {
      const full = join(SESSIONS_DIR, f);
      return { name: f, date: dateFromName(f), mtime: statSync(full).mtimeMs, full };
    })
    // Mais recente primeiro: data no nome, desempata por mtime.
    .sort((a, b) => (a.date === b.date ? b.mtime - a.mtime : a.date.localeCompare(b.date) * -1));

  const latest = handoffs[0];
  if (!latest) return;

  // Filtro de idade pela data do nome (cai pra mtime se nome não tem data).
  const ageMs = Date.now() - (latest.date !== "0000-00-00" ? Date.parse(latest.date) : latest.mtime);
  if (ageMs > MAX_AGE_DAYS * 86_400_000) return;

  const body = fatiaDoHandoff(readFileSync(latest.full, "utf8").trim());
  process.stdout.write(
    "## Handoff da sessão anterior: " + latest.name + "\n\n" +
      "> Injetado pelo hook SessionStart: só o frontmatter e a primeira seção `#` (TL;DR), até " + CAP + " caracteres. " +
      "O resto está em `docs/knowledge/sessions/" + latest.name + "`.\n\n" +
      body + "\n",
  );
}

// Contrato: o TL;DR é a primeira seção `#` e basta sozinho. Entra só ela (e o frontmatter),
// cortada em CAP caracteres, para a sessão nova não herdar um handoff inteiro de contexto.
const CAP = 3000;
function fatiaDoHandoff(texto) {
  const linhas = texto.split("\n");
  let i = 0;
  let front = "";
  if (linhas[0] === "---") {
    const fim = linhas.indexOf("---", 1);
    if (fim > 0) { front = linhas.slice(0, fim + 1).join("\n") + "\n\n"; i = fim + 1; }
  }
  const resto = linhas.slice(i);
  const ini = resto.findIndex((l) => /^# /.test(l));
  if (ini < 0) return (front + resto.join("\n")).slice(0, CAP);
  let fimSecao = resto.length;
  for (let j = ini + 1; j < resto.length; j++) if (/^# /.test(resto[j])) { fimSecao = j; break; }
  let secao = resto.slice(ini, fimSecao).join("\n").trim();
  if (secao.length > CAP) secao = secao.slice(0, CAP).trimEnd() + "\n[...cortado: leia o arquivo inteiro]";
  return front + secao;
}

main();
