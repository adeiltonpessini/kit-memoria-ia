#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
// quota.mjs — audita o consumo REAL de token do Claude Code neste projeto.
//
//   node $HOME/.claude/kit/tools/claude/quota.mjs [dias]      (padrão: 7)
//
// Lê os transcripts em ~/.claude/projects/<projeto>/*.jsonl por STREAMING e imprime só
// agregados — nunca despeja conteúdo (ler transcript inteiro é justamente o que o
// guard-contexto.mjs bloqueia). Zero deps, zero rede.
//
// Como ler o resultado: o número que domina a cota é o `cacheR` (contexto re-lido a cada
// requisição). Ele cresce com o TAMANHO da sessão × o NÚMERO de requisições — por isso
// sessão longa é imposto composto, e `/clear` entre tarefas é a economia nº 1.

import { createReadStream, readdirSync, statSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { homedir } from "node:os";

// Descobre a pasta de transcripts DESTE projeto: o Claude Code sanitiza o cwd
// (minúsculas, tudo que não é [a-z0-9] vira "-"). Ex.: C:/projetos/app -> c--projetos-app.
const RAIZ = join(homedir(), ".claude", "projects");
const DIR = (() => {
  const slug = process.cwd().toLowerCase().replace(/[^a-z0-9]/g, "-");
  const exato = join(RAIZ, slug);
  if (existsSync(exato)) return exato;
  // fallback: maior prefixo que exista (cwd pode ser subpasta do projeto)
  try {
    const cand = readdirSync(RAIZ).filter(d => slug.startsWith(d)).sort((a, b) => b.length - a.length)[0];
    if (cand) return join(RAIZ, cand);
  } catch {}
  return exato;
})();
const DAYS = Number(process.argv[2] || 7);
const cutoff = Date.now() - DAYS * 86400000;

let files;
try {
  files = readdirSync(DIR).filter(f => f.endsWith(".jsonl"))
    .map(f => ({ f, full: join(DIR, f), mtime: statSync(join(DIR, f)).mtimeMs }))
    .filter(x => x.mtime >= cutoff);
} catch { console.error(`sem transcripts em ${DIR}`); process.exit(1); }

const byDay = new Map(), byModel = new Map();
const ctx = [], dumps = [];
const zero = () => ({ in: 0, out: 0, cr: 0, cread: 0, reqs: 0 });
const add = (m, k, u) => {
  const e = m.get(k) || zero();
  e.in += u.input_tokens || 0; e.out += u.output_tokens || 0;
  e.cr += u.cache_creation_input_tokens || 0; e.cread += u.cache_read_input_tokens || 0;
  e.reqs++; m.set(k, e);
};

for (const { f, full } of files) {
  const nomes = new Map();
  let sumCR = 0, maxCR = 0, reqs = 0;
  const rl = createInterface({ input: createReadStream(full), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.startsWith("{")) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    const u = j.message?.usage;
    if (u && j.type === "assistant") {
      add(byDay, (j.timestamp || "").slice(0, 10), u);
      add(byModel, j.message?.model || "?", u);
      const cr = u.cache_read_input_tokens || 0;
      sumCR += cr; maxCR = Math.max(maxCR, cr); reqs++;
    }
    const c = j.message?.content;
    if (Array.isArray(c)) for (const b of c) {
      if (b.type === "tool_use") nomes.set(b.id, { name: b.name, desc: String(b.input?.command || b.input?.file_path || b.input?.pattern || "").slice(0, 70) });
      if (b.type === "tool_result") {
        const t = typeof b.content === "string" ? b.content : JSON.stringify(b.content || "");
        if (t.length > 20000) dumps.push({ len: t.length, ...(nomes.get(b.tool_use_id) || { name: "?", desc: "" }) });
      }
    }
  }
  if (reqs > 20) ctx.push({ f: f.slice(0, 8), avg: sumCR / reqs, maxCR, reqs });
}

const k = n => (n / 1000).toFixed(0) + "k";
const ln = (l, e) => `${l.padEnd(24)} out ${k(e.out).padStart(7)} | cacheW ${k(e.cr).padStart(7)} | cacheR ${k(e.cread).padStart(9)} | reqs ${String(e.reqs).padStart(5)}`;

console.log(`\n=== ${DAYS} DIAS · ${files.length} sessoes ===`);
console.log("\n-- por DIA --");
[...byDay.entries()].sort().forEach(([d, e]) => console.log(ln(d, e)));
console.log("\n-- por MODELO --");
[...byModel.entries()].sort((a, b) => b[1].out - a[1].out).forEach(([m, e]) => console.log(ln(m.slice(0, 24), e)));
console.log("\n-- CONTEXTO MEDIO POR REQUISICAO (quanto maior, mais cara cada chamada) --");
ctx.sort((a, b) => b.avg - a.avg).slice(0, 8).forEach(c => console.log(`  ${c.f}: media ${k(c.avg)} · pico ${k(c.maxCR)} · ${c.reqs} reqs`));
if (ctx.length) {
  const t = ctx.reduce((a, c) => ({ s: a.s + c.avg * c.reqs, r: a.r + c.reqs }), { s: 0, r: 0 });
  console.log(`  >> MEDIA GERAL: ${k(t.s / t.r)} tokens re-lidos por requisicao`);
}
console.log(`\n-- DUMPS > 20k chars: ${dumps.length} (top 5) --`);
dumps.sort((a, b) => b.len - a.len).slice(0, 5).forEach(d => console.log(`  ${(d.len / 1000).toFixed(0).padStart(4)}k  ${d.name.padEnd(11)} ${d.desc}`));
const tot = [...byModel.values()].reduce((a, e) => ({ out: a.out + e.out, cread: a.cread + e.cread }), { out: 0, cread: 0 });
console.log(`\n-- TOTAL: out ${k(tot.out)} | cacheR ${k(tot.cread)} --`);
