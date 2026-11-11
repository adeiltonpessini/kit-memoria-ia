#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
/**
 * aimemory.mjs — ponte entre o servidor ai-memory (captura automática) e o repo.
 *
 * POR QUE existe: o ai-memory captura a sessão sozinho, mas grava num wiki LOCAL
 * (volume docker `ai-memory-data`), fora do git — invisível pro `rg`, pro `akita.mjs`
 * e pro próximo agente. Este script traz o que interessa pra DENTRO do repo, em
 * `docs/knowledge/sessions/auto/`, onde o método grep-first alcança.
 *
 * CUSTO DE CONTEXTO: zero. Nada aqui é hook de tool nem tool MCP registrada — é um
 * script que só roda quando chamado (ou no SessionEnd, que não injeta contexto).
 * As 17 tools MCP do ai-memory ficaram DESLIGADAS de propósito: medido 09/08 elas
 * pesavam 33,9 KB (~8,5k tokens) em TODA requisição.
 *
 * Uso:
 *   node $HOME/.claude/kit/tools/knowledge/aimemory.mjs status
 *   node $HOME/.claude/kit/tools/knowledge/aimemory.mjs recent [-n 10]
 *   node $HOME/.claude/kit/tools/knowledge/aimemory.mjs query "<pergunta>" [-n 8]
 *   node $HOME/.claude/kit/tools/knowledge/aimemory.mjs pull [-n 10]     # grava em sessions/auto/
 *
 * Falha SEMPRE em silêncio com exit 0 quando o servidor está fora do ar — é rede de
 * segurança, não pode quebrar sessão de ninguém.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER = process.env.AI_MEMORY_SERVER_URL || "http://127.0.0.1:49374";
const TIMEOUT_MS = 4000;
const REPO = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const DEST = join(REPO, "docs", "knowledge", "sessions", "auto");

/** projeto = basename da raiz do git (mesma `--project-strategy repo-root` dos hooks). */
function projeto() {
  try {
    const raiz = execFileSync("git", ["-C", REPO, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return basename(raiz);
  } catch {
    return basename(REPO);
  }
}

/** Chama uma tool do MCP por HTTP. Aceita resposta JSON ou SSE. */
async function mcp(name, args) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${SERVER}/mcp`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
    const bruto = await r.text();
    const inicio = bruto.indexOf("{");
    if (inicio < 0) return null;
    const env = JSON.parse(bruto.slice(inicio));
    // Erro de RPC NÃO é servidor fora do ar. O caso comum é "project not found":
    // repo que ainda não teve nenhuma sessão capturada desde a instalação.
    if (env?.error) return { __erro: env.error.message || "erro do servidor" };
    const texto = env?.result?.content?.[0]?.text;
    if (!texto) return { __erro: "resposta vazia" };
    try {
      return JSON.parse(texto);
    } catch {
      return { text: texto };
    }
  } catch {
    return null; // servidor fora do ar / timeout — silêncio proposital
  } finally {
    clearTimeout(t);
  }
}

function slug(s) {
  return (s || "sessao")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "sessao";
}

function foraDoAr() {
  console.error(
    `ai-memory fora do ar em ${SERVER} — sobe com: docker start ai-memory`,
  );
  process.exit(0);
}

/**
 * Transporte morto = aviso de servidor fora do ar. Erro de RPC é OUTRA coisa: o caso
 * comum é `project not found`, que só quer dizer "este repo ainda não teve sessão
 * capturada". Confundir os dois faz o script mentir sobre o estado do servidor.
 */
function ou(r, vazio = "(nada capturado ainda pra este projeto)") {
  if (!r) foraDoAr();
  if (r.__erro) {
    console.log(/not found/i.test(r.__erro) ? vazio : `ai-memory: ${r.__erro}`);
    process.exit(0);
  }
  return r;
}

const [, , cmd = "status", ...resto] = process.argv;
const nIdx = resto.findIndex((a) => a === "-n" || a === "--limit");
const limite = nIdx >= 0 ? Number(resto[nIdx + 1]) || 10 : 10;
const livres = resto.filter((a, i) => i !== nIdx && i !== nIdx + 1);
const proj = projeto();

if (cmd === "status") {
  const s = ou(await mcp("memory_status", {}));
  console.log(`servidor: ${SERVER}  ·  projeto: ${proj}`);
  console.log(JSON.stringify(s, null, 2).slice(0, 1200));
} else if (cmd === "recent") {
  const r = ou(await mcp("memory_recent", { project: proj, limit: limite }));
  for (const h of r.hits || []) console.log(`- ${h.path}  ${h.title || ""}`);
  if (!(r.hits || []).length) console.log("(nada capturado ainda pra este projeto)");
} else if (cmd === "query") {
  const q = livres.join(" ").trim();
  if (!q) {
    console.error('uso: aimemory.mjs query "<pergunta>" [-n 8]');
    process.exit(2);
  }
  const r = ou(await mcp("memory_query", { project: proj, query: q, limit: limite }), "(sem resultado)");
  for (const h of r.hits || []) {
    console.log(`\n── ${h.path}  ${h.title || ""}`);
    console.log((h.snippet || "").replace(/\s+/g, " ").slice(0, 300));
  }
  if (!(r.hits || []).length) console.log("(sem resultado)");
} else if (cmd === "pull") {
  const r = ou(await mcp("memory_recent", { project: proj, limit: limite }), "(nada a trazer)");
  const hits = (r.hits || []).filter((h) => (h.path || "").startsWith("sessions/"));
  if (!hits.length) {
    console.log("(nada a trazer)");
    process.exit(0);
  }
  mkdirSync(DEST, { recursive: true });
  const jaTem = new Set(readdirSync(DEST));
  let novos = 0;
  for (const h of hits) {
    const pagina = await mcp("memory_read_page", { project: proj, path: h.path });
    const corpo = pagina?.body || pagina?.text || pagina?.content;
    if (!corpo) continue;
    // Só interessa sessão com PROMPT — é isso que salva o "chat que se perdeu".
    // Página só de observação de tool é ruído; fica no wiki local e não entra no git.
    if (!/^##\s+Prompts\s*$/m.test(corpo)) continue;
    const data = (corpo.match(/(?:started_at|ended_at):\*{0,2}\s*(\d{4}-\d{2}-\d{2})/) || [])[1] ||
      new Date().toLocaleDateString("sv-SE"); // data LOCAL (licoes/data-do-nome-e-local-nao-utc.md)
    const sid = basename(h.path, ".md").slice(0, 8);
    const nome = `${data}-${sid}-${slug(h.title)}.md`;
    if (jaTem.has(nome)) continue;
    const cabecalho =
      `<!-- GERADO pelo ai-memory (rule-based, sem LLM). NÃO é handoff curado:\n` +
      `     o handoff de verdade fica em ../ e é escrito à mão. Isto é rede de segurança. -->\n\n`;
    writeFileSync(join(DEST, nome), cabecalho + corpo, "utf8");
    novos++;
  }
  console.log(novos ? `${novos} página(s) nova(s) em docs/knowledge/sessions/auto/` : "(nada novo)");
} else {
  console.error(`comando desconhecido: ${cmd}\nuse: status | recent | query | pull`);
  process.exit(2);
}
