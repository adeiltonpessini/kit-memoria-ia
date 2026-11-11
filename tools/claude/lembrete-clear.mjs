#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
// lembrete-clear.mjs — hook Stop: no fim do turno, avisa quando a sessão já está cara
// o bastante para justificar `/clear` (ou fechar o chat e abrir outro).
//
// Porquê: a cada requisição o Claude relê o contexto inteiro, então sessão longa custa mais por
// turno. `/clear` ao trocar de tarefa é a maior alavanca de cota, e a única que depende de uma
// pessoa lembrar. A barra de status mostra o número, mas é passiva; este hook fala quando o
// turno acaba e a próxima tarefa ainda não começou.
//
// NÃO dá para limpar sozinho: `/clear` é comando de UI, nenhum hook consegue disparar.
//
// Anti-ruído: o Stop dispara a CADA turno. Só falamos acima de LIMIAR, e depois só voltamos
// a falar quando o contexto cresceu mais REPIQUE desde o último aviso. Estado por sessão em
// arquivo temporário. Sem aviso = sem saída nenhuma.
//
// Lê só o RABO do transcript, igual ao statusline.mjs. Zero deps, zero rede.
// CLAUDE_LEMBRETE_CLEAR=0 desliga.

import { openSync, fstatSync, readSync, closeSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

// Limiares: ajuste ao tamanho da sua janela de contexto.
const LIMITE = Number(process.env.CLAUDE_LEMBRETE_JANELA) || 160_000; // janela de contexto de referência (tokens)
const LIMIAR = Math.round(LIMITE * 0.5); // começa a avisar na metade do caminho: cedo o bastante para agir
const REPIQUE = 20_000;                  // só repete o aviso a cada +20k de contexto
const TAIL = 256 * 1024;                 // bytes lidos do fim do transcript
const ESTADO = join(tmpdir(), "claude-kit-lembrete-clear.json");

/** Último uso de tokens do transcript (linha `assistant` fora de subagente), ou null. */
export function ultimoUso(caminho) {
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
      } catch { /* linha cortada no início do rabo */ }
    }
    return null;
  } catch { return null; } finally { if (fd !== undefined) try { closeSync(fd); } catch { /* nada */ } }
}

export const contexto = (u) => (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);

const mil = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

// Cobra o handoff ANTES do /clear, mas só em projeto que usa docs/knowledge/sessions e só se não há um de hoje.
function avisoHandoff(repo) {
  const dir = resolve(repo, "docs", "knowledge", "sessions");
  try {
    if (!existsSync(dir)) return "";
    const arqs = readdirSync(dir).filter((f) => f.endsWith(".md"));
    if (!arqs.length) return "";
    const recente = Math.max(...arqs.map((f) => statSync(join(dir, f)).mtimeMs));
    const dias = Math.floor((Date.now() - recente) / 86400000);
    if (dias < 1) return ""; // já tem handoff de hoje
    return `ANTES do /clear: escreva o handoff (o último em docs/knowledge/sessions/ é de ${dias} dia(s) atrás). ` +
           "Peça \"faz o handoff da sessão\". Resumo no chat NÃO conta: some junto. ";
  } catch { return ""; }
}

function lerEstado() {
  try { return JSON.parse(readFileSync(ESTADO, "utf8")); } catch { return {}; }
}
function gravarEstado(e) {
  // poda: guarda no máximo as 20 sessões mais recentes (o arquivo é temporário e trivial)
  const chaves = Object.keys(e);
  if (chaves.length > 20) for (const k of chaves.slice(0, chaves.length - 20)) delete e[k];
  try { writeFileSync(ESTADO, JSON.stringify(e)); } catch { /* silêncio */ }
}

/** Devolve o texto do aviso, ou null se não é hora. Grava o estado quando avisa. */
export function decidir(ev, repo) {
  const u = ultimoUso(ev.transcript_path);
  if (!u) return null;
  const ctx = contexto(u);
  if (ctx < LIMIAR) return null;

  const sessao = ev.session_id || "sem-id";
  const estado = lerEstado();
  if (ctx < (estado[sessao] || 0) + REPIQUE) return null;
  estado[sessao] = ctx;
  gravarEstado(estado);

  const pct = Math.round((ctx / LIMITE) * 100);
  return `Contexto em ${mil(ctx)}/${mil(LIMITE)} (${pct}%). ${avisoHandoff(repo)}` +
    `Se a tarefa acabou, /clear (ou feche este chat e abra outro): daqui para frente ` +
    `TODA requisição relê esses ${mil(ctx)} tokens. Se a tarefa continua, siga; ` +
    `o aviso volta a cada +${mil(REPIQUE)}.`;
}

if (process.argv[1] && process.argv[1].endsWith("lembrete-clear.mjs")) {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    if (process.env.CLAUDE_LEMBRETE_CLEAR === "0") return process.exit(0);
    let ev = {};
    try { ev = JSON.parse(raw || "{}"); } catch { return process.exit(0); }
    let msg = null;
    try { msg = decidir(ev, resolve(ev.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd())); } catch { /* silêncio */ }
    if (!msg) return process.exit(0);
    process.stdout.write(JSON.stringify({ systemMessage: msg, suppressOutput: true }), () => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
