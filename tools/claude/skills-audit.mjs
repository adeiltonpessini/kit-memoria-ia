#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
// skills-audit.mjs — trava anti-regressão do custo fixo de contexto.
//
//   node $HOME/.claude/kit/tools/claude/skills-audit.mjs            (falha com exit 1 se estourar)
//   node $HOME/.claude/kit/tools/claude/skills-audit.mjs --quiet    (só o resumo e as violações)
//
// POR QUE ISSO EXISTE: o fatiamento das skills (núcleo ≤ 8 KB + references/) é FRÁGIL.
// Um `graphify install`/upgrade, ou uma skill vendorizada nova, recopia o SKILL.md inteiro
// e desfaz o trabalho — sem ninguém perceber, porque o custo é invisível: `description`
// pesa em TODA sessão e o corpo pesa toda vez que a skill é carregada.
// Este script torna a regressão barulhenta. Zero deps, zero rede, zero LLM.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const LIMITE_SKILL = 8 * 1024;   // núcleo da skill; o detalhe vai p/ references/
const LIMITE_DESC = 400;         // = skillListingMaxDescChars do settings global
const LIMITE_AGENTE_DESC = 300;  // description de agente também pesa em toda sessão
const TOLERANCIA = 1.10;         // até +10% é AVISO, não falha
const quiet = process.argv.includes("--quiet");

// Exceção só com MOTIVO escrito — silenciar sem justificativa é como não ter o check.
const EXCECOES = {
  graphify: { corpo: 12 * 1024, motivo: "o bloco `## Usage` precisa ficar no núcleo: a skill manda imprimi-lo verbatim no --help" },
};

// Guard que grita por 2 bytes acaba desligado. Só falha (exit 1) quem estourou de verdade;
// o resto vira aviso para não normalizar a regressão nem virar ruído.
const avisos = [];
const anota = (valor, limite, msg) => {
  if (valor > limite * TOLERANCIA) violacoes.push(msg);
  else if (valor > limite) avisos.push(msg);
};

const frontmatter = (txt) => {
  const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const campo = (k) => {
    const r = m[1].match(new RegExp("^" + k + ":\\s*(.*)$", "m"));
    return r ? r[1].trim().replace(/^["']|["']$/g, "") : "";
  };
  return { name: campo("name"), description: campo("description"), model: campo("model") };
};

const bytes = (s) => Buffer.byteLength(s, "utf8");
const kb = (n) => (n / 1024).toFixed(1) + " KB";
const violacoes = [];
const linhas = [];

// ---- skills: núcleo + description ----
// Escopos SEPARADOS de propósito: `.claude/skills` pesa no contexto do Claude Code,
// `.codex/skills` pesa no do codex. Somar os dois infla o número e engana.
const porEscopo = { ".claude/skills": 0, ".codex/skills": 0 };
let nSkills = 0;
for (const base of [".claude/skills", ".codex/skills"]) {
  if (!existsSync(base)) continue;
  for (const dir of readdirSync(base)) {
    const skill = join(base, dir, "SKILL.md");
    if (!existsSync(skill)) continue;
    const txt = readFileSync(skill, "utf8");
    const fm = frontmatter(txt);
    const tam = bytes(txt);
    nSkills++;
    if (!fm) { violacoes.push(`${skill}: SEM frontmatter valido`); continue; }
    const d = bytes(fm.description);
    porEscopo[base] += d;
    const refs = join(base, dir, "references");
    const dica = existsSync(refs) ? "fatiamento pode ter sido DESFEITO (references/ existe)" : "fatiar em references/";
    const exc = EXCECOES[dir];
    const limiteCorpo = exc?.corpo ?? LIMITE_SKILL;
    if (exc && tam > LIMITE_SKILL && tam <= limiteCorpo && !quiet) console.log(`  (excecao) ${dir} em ${kb(tam)}: ${exc.motivo}`);
    anota(tam, limiteCorpo, `${skill}: ${kb(tam)} > ${kb(limiteCorpo)} — ${dica}`);
    anota(d, LIMITE_DESC, `${skill}: description ${d} B > ${LIMITE_DESC} B — corte a prosa, mantenha os gatilhos`);
    linhas.push(`${String(tam).padStart(6)} B  desc ${String(d).padStart(4)} B  ${dir}`);
  }
}

// ---- agentes: description ----
let totalAgente = 0, nAgentes = 0;
const dirAg = ".claude/agents";
if (existsSync(dirAg)) {
  for (const f of readdirSync(dirAg).filter((x) => x.endsWith(".md"))) {
    const txt = readFileSync(join(dirAg, f), "utf8");
    const fm = frontmatter(txt);
    nAgentes++;
    if (!fm) { violacoes.push(`${dirAg}/${f}: SEM frontmatter valido`); continue; }
    if (fm.name !== f.replace(/\.md$/, "")) violacoes.push(`${dirAg}/${f}: name "${fm.name}" != nome do arquivo`);
    if (!fm.model) violacoes.push(`${dirAg}/${f}: sem "model" — tier indefinido cai no modelo caro`);
    const d = bytes(fm.description);
    totalAgente += d;
    anota(d, LIMITE_AGENTE_DESC, `${dirAg}/${f}: description ${d} B > ${LIMITE_AGENTE_DESC} B`);
  }
}

// ---- arquivos lidos toda sessão ----
const fixos = ["CLAUDE.md", "docs/agentes/_padroes-comuns.md"];
let totalFixo = 0;
for (const f of fixos) {
  if (!existsSync(f)) continue;
  const t = statSync(f).size;
  totalFixo += t;
  if (!quiet) linhas.push(`${String(t).padStart(6)} B  (fixo)     ${f}`);
}

if (!quiet && linhas.length) {
  console.log("-- skills (corpo | description) e arquivos fixos --");
  linhas.sort((a, b) => parseInt(b) - parseInt(a)).forEach((l) => console.log("  " + l));
}
const dClaude = porEscopo[".claude/skills"], dCodex = porEscopo[".codex/skills"];
console.log(`\n${nSkills} skills · ${nAgentes} agentes`);
console.log(`custo POR SESSAO no CLAUDE CODE: descriptions ${kb(dClaude)} + agentes ${kb(totalAgente)} + fixos ${kb(totalFixo)} = ${kb(dClaude + totalAgente + totalFixo)}`);
if (dCodex) console.log(`custo POR SESSAO no CODEX (escopo separado): descriptions ${kb(dCodex)} + fixos ${kb(totalFixo)}`);

if (avisos.length) {
  console.log(`\n~ ${avisos.length} aviso(s) — no limite, ainda dentro da tolerancia de +10%:`);
  avisos.forEach((v) => console.log("  ~ " + v));
}
if (violacoes.length) {
  console.log(`\n!! ${violacoes.length} VIOLACAO(OES) — estouro real:`);
  violacoes.forEach((v) => console.log("  - " + v));
  console.log("\nContexto: o custo real e o contexto RE-LIDO a cada requisicao. Ver CLAUDE.md.");
  process.exit(1);
}
console.log(avisos.length ? "\nOK — nenhum estouro real (so avisos)." : "\nOK — nada estourou os limites.");
