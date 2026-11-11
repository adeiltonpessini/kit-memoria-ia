#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
/**
 * verifica-gate.mjs: hook `Stop` que só deixa o Claude encerrar a vez com a checagem da área mexida passando.
 *
 * As áreas vêm do projeto, em `<projeto>/.claude/verifica.json`:
 *   {"areas":[{"caminho":"<regex>","comando":"<cmd>","rotulo":"<nome>"}]}
 * Sem esse arquivo: silêncio total (o projeto não adotou o recurso). Exemplos: `verifica.exemplo.json` do kit.
 *
 * Regras (para não torrar cota nem travar o trabalho):
 *  - só olha o que está sem commit (git status) na pasta em que o Claude está (worktree incluído);
 *  - nada mudou desde a última checagem verde: não roda nada (impressão digital do diff);
 *  - use só checagem rápida por área; teste completo e build de produção ficam para a skill `verify`;
 *  - bloqueia no máximo LIMITE vezes por sessão; depois avisa e deixa parar (você decide);
 *  - CLAUDE_VERIFICA=0 desliga.
 * Falhou: sai com 2 e o fim da saída vai ao Claude como motivo para continuar.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LIMITE = 3;   // vezes que bloqueia por sessão antes de deixar parar
const LINHAS = 40;  // quantas linhas do fim da saída voltam ao Claude

/** Lê e valida `.claude/verifica.json`; devolve lista de [RegExp, comando, rótulo] (vazia se não há config). */
export function lerAreas(repo) {
  const arq = join(repo, ".claude", "verifica.json");
  if (!existsSync(arq)) return [];
  let cfg;
  try { cfg = JSON.parse(readFileSync(arq, "utf8")); } catch { return []; }
  const out = [];
  for (const a of Array.isArray(cfg?.areas) ? cfg.areas : []) {
    if (!a || typeof a.caminho !== "string" || typeof a.comando !== "string") continue;
    try { out.push([new RegExp(a.caminho), a.comando, String(a.rotulo || a.comando)]); } catch { /* regex inválida: ignora */ }
  }
  return out;
}

export function areasDe(areas, arquivos) {
  return areas.filter(([re]) => arquivos.some((a) => re.test(a)));
}

function sh(cmd, cwd) {
  const git = "C:/Program Files/Git/bin/bash.exe";
  const bash = process.platform === "win32" && existsSync(git) ? git : "bash";
  const r = spawnSync(bash, ["-c", cmd], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, saida: `${r.stdout || ""}${r.stderr || ""}` };
}

function principal(ev) {
  if (process.env.CLAUDE_VERIFICA === "0") return 0;
  const cwd = ev.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const raiz = sh("git rev-parse --show-toplevel", cwd);
  if (!raiz.ok) return 0;
  const repo = raiz.saida.trim();

  const todas = lerAreas(repo);
  if (!todas.length) return 0;

  const st = sh("git status --porcelain -uall", repo);
  const arquivos = st.saida.split("\n").filter(Boolean).map((l) => l.slice(3).replace(/^.* -> /, "").replace(/^"|"$/g, ""));
  const areas = areasDe(todas, arquivos);
  if (!areas.length) return 0;

  const digital = createHash("sha256").update(st.saida).update(sh("git diff HEAD", repo).saida).digest("hex");
  const estadoArq = join(tmpdir(), `claude-kit-verifica-${createHash("sha1").update(repo).digest("hex").slice(0, 10)}.json`);
  let estado = {};
  try { estado = JSON.parse(readFileSync(estadoArq, "utf8")); } catch { /* primeira vez */ }
  if (estado.verde === digital) return 0;

  const sessao = ev.session_id || "?";
  const bloqueios = estado.sessao === sessao ? estado.bloqueios || 0 : 0;

  for (const [, cmd, rotulo] of areas) {
    const r = sh(cmd, repo);
    if (!r.ok) {
      const fim = r.saida.trimEnd().split("\n").slice(-LINHAS).join("\n");
      if (bloqueios >= LIMITE) {
        process.stderr.write(`verifica-gate: ${rotulo} segue falhando depois de ${LIMITE} voltas; deixo parar. Diga ao usuário o que falta.\n`);
        return 0;
      }
      writeFileSync(estadoArq, JSON.stringify({ ...estado, sessao, bloqueios: bloqueios + 1 }));
      process.stderr.write(`verifica-gate: a checagem de ${rotulo} falhou (\`${cmd}\`). Corrija antes de encerrar; se não for possível, explique ao usuário por quê.\n\n${fim}\n`);
      return 2;
    }
  }
  writeFileSync(estadoArq, JSON.stringify({ verde: digital, sessao, bloqueios: 0 }));
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("verifica-gate.mjs")) {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    let ev = {};
    try { ev = JSON.parse(raw || "{}"); } catch { /* evento inválido: não bloqueia */ }
    let codigo = 0;
    try { codigo = principal(ev); } catch (e) { process.stderr.write(`verifica-gate: erro interno, não bloqueio (${e.message})\n`); }
    process.exit(codigo);
  });
}
