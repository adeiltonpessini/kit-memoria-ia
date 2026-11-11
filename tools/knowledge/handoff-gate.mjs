#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
/**
 * handoff-gate.mjs — hook `Stop`: garante que TODA sessão de trabalho real deixe handoff.
 *
 * POR QUE existe: lembrar era papel do humano, e humano esquece. Medido num projeto real:
 * ficaram dias sem handoff — justo os dias de trabalho pesado.
 * Aviso passivo não resolveu; este hook **bloqueia o fim do turno UMA vez** e manda escrever.
 *
 * Regras (nesta ordem, tudo barato antes do caro):
 *  1. `stop_hook_active` → NUNCA bloqueia de novo (anti-loop; é a trava do próprio harness).
 *  2. Já bloqueou nesta sessão → cala. Cobra uma vez, não vira carcereiro.
 *  3. Já existe handoff de hoje em `docs/knowledge/sessions/` → cala. É o objetivo, não a punição.
 *  4. Sessão pequena (< PISO de contexto) → cala. Pergunta rápida não vira documento.
 *
 * `sessions/auto/` (captura do ai-memory) NÃO conta como handoff: é lista de prompts, não
 * é o "onde paramos e por quê". A rede de segurança não substitui a decisão escrita.
 *
 * Zero dependência, zero rede. Lê só o rabo do transcript (256 KB), igual ao statusline.
 */

import { closeSync, existsSync, fstatSync, openSync, readdirSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const REPO = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const SESSOES = join(REPO, "docs", "knowledge", "sessions");
const ESTADO = join(tmpdir(), `${basename(REPO)}-handoff-gate.json`);
const PISO = 50_000;      // abaixo disto a sessão não produziu o bastante pra virar handoff
const TAIL = 256 * 1024;

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let ev = {};
  try { ev = JSON.parse(raw || "{}"); } catch { return calado(); }

  if (ev.stop_hook_active) return calado();               // 1. anti-loop
  if (!existsSync(join(REPO, "docs", "knowledge"))) return calado(); // projeto sem memória do kit

  const sessao = ev.session_id || "sem-id";
  const estado = lerEstado();
  if (estado[sessao]) return calado();                    // 2. já cobrado nesta sessão

  if (temHandoffDeHoje()) return calado();                // 3. objetivo cumprido

  const u = ultimoUso(ev.transcript_path);
  const ctx = u ? (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) : 0;
  if (ctx < PISO) return calado();                        // 4. sessão pequena

  estado[sessao] = Date.now();
  gravarEstado(estado);

  process.stdout.write(JSON.stringify({
    decision: "block",
    reason:
      "MEMÓRIA É PRIORIDADE — esta sessão ainda não tem handoff e já passou de " +
      `${Math.round(ctx / 1000)}k de contexto. ESCREVA AGORA, antes de encerrar o turno: ` +
      `crie \`docs/knowledge/sessions/${padraoNome()}\` (ou rode ` +
      "`node $HOME/.claude/kit/tools/knowledge/remember.mjs \"<título>\" --type session`) com o que FICOU PRONTO, " +
      "o que está PENDENTE, os GOTCHAS descobertos, o estado de git e o PRÓXIMO PASSO — " +
      "concreto o bastante pra outro chat retomar sem reler nada. " +
      "Resumo no chat NÃO conta: some junto com a sessão. " +
      "Depois de gravar o arquivo, siga normalmente; este bloqueio não se repete.",
  }));
});

/** Cada repo tem sua convenção de nome; sugerir a errada gera pasta bagunçada. */
function padraoNome() {
  try {
    const arqs = readdirSync(SESSOES).filter((f) => f.endsWith(".md"));
    const n = arqs.filter((f) => f.startsWith("handoff-")).length;
    if (n > arqs.length / 2) return "handoff-<tema>-AAAA-MM-DD.md";
  } catch {}
  return "chat-AAAA-MM-DD-<tema>.md";
}

/** Handoff = `.md` na RAIZ de sessions/ (não em auto/), modificado nas últimas 24h. */
function temHandoffDeHoje() {
  try {
    const arqs = readdirSync(SESSOES).filter(
      (f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md",
    );
    if (!arqs.length) return false;
    const recente = Math.max(...arqs.map((f) => statSync(join(SESSOES, f)).mtimeMs));
    return Date.now() - recente < 86_400_000;
  } catch {
    return true; // sem a pasta não há o que cobrar — nunca travar por erro nosso
  }
}

function lerEstado() {
  try { return JSON.parse(readFileSync(ESTADO, "utf8")); } catch { return {}; }
}
function gravarEstado(e) {
  const chaves = Object.keys(e);
  if (chaves.length > 20) for (const k of chaves.slice(0, chaves.length - 20)) delete e[k];
  try { writeFileSync(ESTADO, JSON.stringify(e)); } catch {}
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
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { closeSync(fd); } catch {}
  }
}

function calado() {
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }));
}
