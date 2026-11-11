#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
// statusline.mjs — barra de status: contexto, cota da assinatura e custo equivalente de API.
//
// Porquê: o custo da cota é o contexto re-lido a cada requisição (medido: 375k tok/req
// em média na semana de 20-27/07). Com o medidor à vista, `/clear` vira reflexo.
//
// Três números de natureza diferente, nunca misturados:
//   ctx    tokens medidos da última resposta (input + cache), contra a janela de compactação;
//   cota   % da assinatura (5h e 7 dias) que o próprio Claude Code manda em `rate_limits`.
//          Só aparece quando o campo vem e é número: sem dado, sem percentual inventado;
//   ≈US$   custo de sessão a preço de lista de API (`cost.total_cost_usd`). Não é cobrança:
//          na assinatura serve só para comparar sessões.
//
// Uso vem do stdin (`context_window.current_usage`); o rabo do transcript (256 KB) é reserva
// para versão que não mande o campo. Zero deps, zero rede. Passivo: só mostra, nunca bloqueia.

import { openSync, fstatSync, readSync, closeSync, readFileSync, statSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const TAIL = 256 * 1024;
const PADRAO = 200_000;

// Janela de compactação, na mesma ordem do Claude Code: env > local do projeto > projeto > global.
// Constante copiada fica velha quando alguém muda a janela (já aconteceu: 165k fixo com 400k).
export function janela(projeto, env = process.env, home = homedir()) {
  const e = Number(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW);
  if (Number.isFinite(e) && e > 0) return e;
  const arquivos = [];
  if (projeto) arquivos.push(join(projeto, ".claude", "settings.local.json"), join(projeto, ".claude", "settings.json"));
  arquivos.push(join(home, ".claude", "settings.json"));
  for (const a of arquivos) {
    try {
      const n = Number(JSON.parse(readFileSync(a, "utf8")).autoCompactWindow);
      if (Number.isFinite(n) && n > 0) return n;
    } catch {}
  }
  return PADRAO;
}

// Cota da assinatura: só o que veio e é número entre 0 e 100 (ou pouco acima, se estourou).
export function cota(rl) {
  const partes = [];
  for (const [k, rot] of [["five_hour", "5h"], ["seven_day", "7d"]]) {
    const p = rl?.[k]?.used_percentage;
    if (typeof p !== "number" || !Number.isFinite(p) || p < 0) continue;
    const pct = Math.round(p);
    const cor = pct >= 90 ? vermelho : pct >= 70 ? amarelo : cinza;
    partes.push(cor(`${rot} ${pct}%`));
  }
  return partes.length ? `cota ${partes.join(" ")}` : "";
}

export function linha(ev, uso, limite) {
  const modelo = ev.model?.display_name || ev.model?.id || "";
  const pasta = (ev.workspace?.current_dir || ev.cwd || "").split(/[\\/]/).pop() || "";
  const extras = [];
  const c = cota(ev.rate_limits);
  if (c) extras.push(c);
  const usd = ev.cost?.total_cost_usd;
  if (typeof usd === "number" && Number.isFinite(usd) && usd > 0) extras.push(cinza(`≈US$${usd.toFixed(2)} API`));
  const sep = ` ${cinza("·")} `;
  const fim = [modelo, pasta].filter(Boolean).map(cinza).concat(extras).join(sep);
  if (!uso) return fim;

  const ctx = (uso.input_tokens || 0) + (uso.cache_read_input_tokens || 0) + (uso.cache_creation_input_tokens || 0);
  const pct = Math.min(999, Math.round((ctx / limite) * 100));
  const cor = pct >= 85 ? vermelho : pct >= 60 ? amarelo : verde;
  const dica = pct >= 85 ? vermelho(" -> /clear") : pct >= 60 ? amarelo(" -> /clear na proxima tarefa") : "";
  return `${cor(medidor(pct))} ${cor(`${mil(ctx)}/${mil(limite)} ctx`)}${sep}${fim}${dica}`;
}

// Grava a cota em ~/.claude/uso-cota.jsonl para o tools/claude/uso.mjs, no máximo 1 linha a cada 5 min
// e só com número que veio do Claude Code. Falha calada: a barra nunca quebra por causa disso.
export function amostrarCota(rl, arq = join(homedir(), ".claude", "uso-cota.jsonl"), agora = Date.now()) {
  const n = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const h5 = n(rl?.five_hour?.used_percentage), d7 = n(rl?.seven_day?.used_percentage);
  if (h5 === null && d7 === null) return false;
  try {
    try { if (agora - statSync(arq).mtimeMs < 5 * 60e3) return false; } catch {}
    appendFileSync(arq, JSON.stringify({ ts: agora, h5, d7, r5: n(rl?.five_hour?.resets_at), r7: n(rl?.seven_day?.resets_at) }) + "\n");
    return true;
  } catch { return false; }
}

function ultimoUso(caminho) {
  if (!caminho) return null;
  let fd;
  try {
    fd = openSync(caminho, "r");
    const { size } = fstatSync(fd);
    const inicio = Math.max(0, size - TAIL);
    const buf = Buffer.alloc(Math.min(TAIL, size));
    readSync(fd, buf, 0, buf.length, inicio);
    const linhas = buf.toString("utf8").split("\n");
    for (let i = linhas.length - 1; i >= 0; i--) {
      const l = linhas[i];
      if (!l.startsWith("{") || !l.includes("usage")) continue;
      try {
        const j = JSON.parse(l);
        if (j.type === "assistant" && j.message?.usage && !j.isSidechain) return j.message.usage;
      } catch {}
    }
    return null;
  } catch { return null; } finally { if (fd !== undefined) try { closeSync(fd); } catch {} }
}

const mil = n => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
const medidor = p => { const cheio = Math.min(10, Math.round(p / 10)); return "█".repeat(cheio) + "░".repeat(Math.max(0, 10 - cheio)); };
const verde = s => `\x1b[32m${s}\x1b[0m`;
const amarelo = s => `\x1b[33m${s}\x1b[0m`;
const vermelho = s => `\x1b[31m${s}\x1b[0m`;
const cinza = s => `\x1b[90m${s}\x1b[0m`;

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", c => (raw += c));
  process.stdin.on("end", () => {
    let ev = {};
    try { ev = JSON.parse(raw || "{}"); } catch {}
    const uso = ev.context_window?.current_usage || ultimoUso(ev.transcript_path);
    const projeto = ev.workspace?.project_dir || process.env.CLAUDE_PROJECT_DIR || "";
    process.stdout.write(linha(ev, uso, janela(projeto)));
    amostrarCota(ev.rate_limits);
  });
}
