#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
// uso.mjs — relatório diário e semanal de consumo do Claude Code, lido dos transcripts locais.
//
//   node $HOME/.claude/kit/tools/claude/uso.mjs              últimos 7 dias, todos os projetos
//   node $HOME/.claude/kit/tools/claude/uso.mjs --dias 1     só hoje (corte em 00:00 local)
//   node $HOME/.claude/kit/tools/claude/uso.mjs --projeto meu-projeto --dias 30
//   node $HOME/.claude/kit/tools/claude/uso.mjs --sessao <id-ou-prefixo>   uma sessão (comparar antes e depois)
//
// Três números de natureza diferente, nunca somados:
//   1. tokens medidos: o que o Claude Code gravou em `usage` (input, output, cache lido, cache escrito);
//   2. ≈US$ API: tokens × preço de lista (tabela abaixo). Na assinatura NÃO é cobrança; serve para comparar;
//   3. cota da assinatura: % de 5 h e 7 dias que a statusline amostra em ~/.claude/uso-cota.jsonl.
//      Sem amostra no período, o relatório diz "sem dado" e não estima.
// Só lê arquivos locais. Não imprime conteúdo de conversa, só contagens.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// US$ por milhão de tokens: entrada, saída, escrita de cache 1h, escrita 5 min, leitura de cache.
// Fonte: tabela de lista usada na auditoria de 11/11 (CLAUDE_CODE_AUDITORIA.md). Modelo fora da
// tabela entra nos tokens e fica sem US$, com aviso.
const PRECO = {
  opus: [5, 25, 10, 6.25, 0.5],
  sonnet: [3, 15, 6, 3.75, 0.3],
};

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const DIAS = Math.max(1, Number(opt("--dias", 7)) || 7);
const PROJ = (opt("--projeto", "") || "").toLowerCase();
const SESSAO = opt("--sessao", "");
const HOME = os.homedir();
const RAIZ = path.join(HOME, ".claude", "projects");

const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
const DESDE = hoje0.getTime() - (DIAS - 1) * 864e5;

const familia = m => (/opus/.test(m) ? "opus" : /sonnet/.test(m) ? "sonnet" : /haiku/.test(m) ? "haiku" : m || "?");
const diaLocal = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function* jsonl(dir) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* jsonl(p);
    else if (p.endsWith(".jsonl")) yield p;
  }
}

function custo(fam, u) {
  const t = PRECO[fam];
  if (!t) return null;
  const cc = u.cache_creation || {};
  const w1h = cc.ephemeral_1h_input_tokens ?? 0;
  const w5m = cc.ephemeral_5m_input_tokens ?? Math.max(0, (u.cache_creation_input_tokens || 0) - w1h);
  return ((u.input_tokens || 0) * t[0] + (u.output_tokens || 0) * t[1] + w1h * t[2] + w5m * t[3] + (u.cache_read_input_tokens || 0) * t[4]) / 1e6;
}

const novo = () => ({ resp: 0, in: 0, out: 0, cr: 0, cw: 0, usd: 0, semPreco: 0, ferramentas: 0, compact: 0, erros: 0, limite: 0, sessoes: new Set() });
const porDia = {}, porModelo = {}, porAgente = {}, ondeTotal = { principal: novo(), subagente: novo() };
const vistos = new Set();
let arquivos = 0;

for (const f of jsonl(RAIZ)) {
  const rel = path.relative(RAIZ, f);
  if (PROJ && !rel.split(path.sep)[0].toLowerCase().includes(PROJ)) continue;
  if (SESSAO && !rel.includes(SESSAO)) continue;
  let st; try { st = fs.statSync(f); } catch { continue; }
  if (st.mtimeMs < DESDE) continue;
  arquivos++;
  const sub = rel.includes(`${path.sep}subagents${path.sep}`);
  let tipo = "principal";
  if (sub) { try { tipo = JSON.parse(fs.readFileSync(f.replace(/\.jsonl$/, ".meta.json"), "utf8")).agentType || "?"; } catch { tipo = "?"; } }
  const sessao = rel.split(path.sep)[1]?.replace(/\.jsonl$/, "") || "?";
  for (const l of fs.readFileSync(f, "utf8").split("\n")) {
    if (!l) continue;
    let o; try { o = JSON.parse(l); } catch { continue; }
    const t = Date.parse(o.timestamp || 0);
    if (!(t >= DESDE)) continue;
    const d = (porDia[diaLocal(t)] ||= novo());
    const onde = ondeTotal[sub ? "subagente" : "principal"];
    if (o.type === "system" && o.subtype === "compact_boundary") { d.compact++; onde.compact++; continue; }
    if (o.type === "system" && o.subtype === "api_error") { d.erros++; onde.erros++; continue; }
    if (o.type !== "assistant" || !o.message?.usage) continue;
    if (o.isApiErrorMessage && /limit/i.test(JSON.stringify(o.message.content || "").slice(0, 400))) { d.limite++; continue; }
    const id = o.message.id || o.requestId || o.uuid;
    if (vistos.has(id)) continue;
    vistos.add(id);
    const u = o.message.usage, fam = familia(o.message.model || ""), usd = custo(fam, u);
    const nFerr = Array.isArray(o.message.content) ? o.message.content.filter(c => c.type === "tool_use").length : 0;
    for (const a of [d, onde, (porModelo[fam] ||= novo()), (porAgente[tipo] ||= novo())]) {
      a.resp++; a.in += u.input_tokens || 0; a.out += u.output_tokens || 0;
      a.cr += u.cache_read_input_tokens || 0; a.cw += u.cache_creation_input_tokens || 0;
      if (usd === null) a.semPreco++; else a.usd += usd;
      a.ferramentas += nFerr; a.sessoes.add(sessao);
    }
  }
}

const pc = v => (typeof v === "number" ? `${Math.round(v)}%` : "sem dado");
const M = n => (n / 1e6).toFixed(1);
const tot = a => a.in + a.out + a.cr + a.cw;
const lin = (rot, a) => `${rot.padEnd(22)} ${String(a.resp).padStart(6)} ${M(tot(a)).padStart(8)} ${M(a.in + a.cw).padStart(7)} ${M(a.out).padStart(6)} ${M(a.cr).padStart(8)} ${(a.resp ? Math.round(a.cr / a.resp / 1e3) + "k" : "-").padStart(6)} ${a.usd.toFixed(2).padStart(9)}${a.semPreco ? `  (${a.semPreco} sem preço)` : ""}`;
const cab = `${"".padEnd(22)} ${"resp".padStart(6)} ${"Mtok".padStart(8)} ${"in+cw".padStart(7)} ${"out".padStart(6)} ${"cache_r".padStart(8)} ${"ctx/r".padStart(6)} ${"≈US$API".padStart(9)}`;

const filtro = [PROJ && `projeto~${PROJ}`, SESSAO && `sessao~${SESSAO}`].filter(Boolean).join(", ") || "todos os projetos";
console.log(`Uso do Claude Code: ${DIAS} dia(s) desde ${diaLocal(DESDE)}, ${filtro}, ${arquivos} transcript(s)`);
console.log("1) TOKENS MEDIDOS e 2) ≈US$ a preço de API (não é cobrança da assinatura)\n");
console.log("Por dia"); console.log(cab);
for (const k of Object.keys(porDia).sort()) {
  const a = porDia[k];
  console.log(lin(k, a) + `   ferr ${a.ferramentas} · compact ${a.compact} · erro API ${a.erros}${a.limite ? ` · LIMITE ${a.limite}` : ""}`);
}
const soma = Object.values(porDia).reduce((s, a) => { for (const k of ["resp", "in", "out", "cr", "cw", "usd", "semPreco", "ferramentas", "compact", "erros", "limite"]) s[k] += a[k]; return s; }, novo());
console.log(lin("TOTAL", soma) + `   ferr ${soma.ferramentas} · compact ${soma.compact} · erro API ${soma.erros}`);
console.log("\nPrincipal × subagente"); console.log(cab);
for (const [k, a] of Object.entries(ondeTotal)) console.log(lin(k, a) + `   compact ${a.compact}`);
console.log("\nPor modelo"); console.log(cab);
for (const [k, a] of Object.entries(porModelo).sort((x, y) => tot(y[1]) - tot(x[1]))) console.log(lin(k, a));
console.log("\nPor agente (top 12)"); console.log(cab);
for (const [k, a] of Object.entries(porAgente).sort((x, y) => tot(y[1]) - tot(x[1])).slice(0, 12)) console.log(lin(k, a) + `   ${a.sessoes.size} sessão(ões)`);

// 3) cota real, só de amostra gravada pela statusline
console.log("\n3) COTA DA ASSINATURA (amostras da statusline)");
let amostras = [];
try {
  amostras = fs.readFileSync(path.join(HOME, ".claude", "uso-cota.jsonl"), "utf8").split("\n").filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(a => a && a.ts >= DESDE);
} catch {}
if (!amostras.length) console.log("sem dado no período (a statusline só recebe a cota depois da 1ª resposta e em plano de assinatura)");
else {
  const dia = {};
  for (const a of amostras) { const k = diaLocal(a.ts), r = (dia[k] ||= { h5: null, d7: null, n: 0 }); r.n++; if (typeof a.h5 === "number") r.h5 = Math.max(r.h5 ?? 0, a.h5); if (typeof a.d7 === "number") r.d7 = Math.max(r.d7 ?? 0, a.d7); }
  for (const k of Object.keys(dia).sort()) console.log(`${k}  5h máx ${pc(dia[k].h5)}  ·  7d máx ${pc(dia[k].d7)}  (${dia[k].n} amostra(s))`);
  const u = amostras.at(-1);
  console.log(`última: ${new Date(u.ts).toLocaleString("pt-BR")}  5h ${pc(u.h5)}  7d ${pc(u.d7)}${u.r7 ? `  (7d renova ${new Date(u.r7 * 1000).toLocaleString("pt-BR")})` : ""}`);
}
