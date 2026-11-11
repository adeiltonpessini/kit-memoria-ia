// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ultimoUso, contexto } from "./lembrete-clear.mjs";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "lembrete-clear.mjs");

function transcript(tokens) {
  const d = mkdtempSync(join(tmpdir(), "lembrete-teste-"));
  const arq = join(d, "t.jsonl");
  const linha = (o) => JSON.stringify(o);
  writeFileSync(
    arq,
    [
      linha({ type: "user", message: {} }),
      linha({ type: "assistant", message: { usage: { input_tokens: tokens, cache_read_input_tokens: 0 } } }),
      linha({ type: "assistant", isSidechain: true, message: { usage: { input_tokens: 1 } } }),
    ].join("\n"),
  );
  return { d, arq };
}
const rodar = (ev, env = {}) =>
  spawnSync(process.execPath, [HOOK], { input: JSON.stringify(ev), encoding: "utf8", env: { ...process.env, ...env } });

test("ultimoUso ignora subagente e soma o contexto", () => {
  const { arq } = transcript(123456);
  assert.equal(contexto(ultimoUso(arq)), 123456);
  assert.equal(ultimoUso(join(tmpdir(), "nao-existe.jsonl")), null);
});

test("contexto pequeno: silêncio total", () => {
  const { d, arq } = transcript(1000);
  const r = rodar({ transcript_path: arq, session_id: "a" + Math.random(), cwd: d });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

test("contexto grande: avisa uma vez e não repete logo em seguida", () => {
  const { d, arq } = transcript(150000);
  const ev = { transcript_path: arq, session_id: "b" + Math.random(), cwd: d };
  const primeiro = rodar(ev);
  assert.match(JSON.parse(primeiro.stdout).systemMessage, /\/clear/);
  assert.equal(rodar(ev).stdout, "");
});

test("CLAUDE_LEMBRETE_CLEAR=0 desliga", () => {
  const { d, arq } = transcript(150000);
  assert.equal(rodar({ transcript_path: arq, session_id: "c" + Math.random(), cwd: d }, { CLAUDE_LEMBRETE_CLEAR: "0" }).stdout, "");
});
