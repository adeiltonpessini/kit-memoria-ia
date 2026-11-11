// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ehCorrecao } from "./correcao-gate.mjs";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "correcao-gate.mjs");

test("pega as correções, em português e em inglês", () => {
  for (const t of [
    "ficou horrivel, vou esperar a outra",
    "de novo isso?",
    "já falei que não é para escrever aí",
    "não era isso que eu queria",
    "não foi isso que pedi",
    "você esqueceu do teste",
    "está errado o nome da tabela",
    "you did it again",
    "I told you to use the other file",
    "that's not what I asked",
    "you forgot the tests",
  ]) assert.equal(ehCorrecao(t), true, t);
});

test("não dispara em pedido comum nem em slash command", () => {
  for (const t of [
    "não tem como eu testar localmente?",
    "instale tudo que for melhor",
    "isso aqui é útil?",
    "/verify de novo",
    "please add a retry",
    "",
  ]) assert.equal(ehCorrecao(t), false, t);
});

test("o hook só escreve o aviso em projeto com docs/knowledge e prompt de correção", () => {
  const com = mkdtempSync(join(tmpdir(), "correcao-com-"));
  mkdirSync(join(com, "docs", "knowledge"), { recursive: true });
  const sem = mkdtempSync(join(tmpdir(), "correcao-sem-"));
  const rodar = (cwd, prompt) =>
    spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ prompt, cwd }), encoding: "utf8" });

  const sim = rodar(com, "ficou horrivel");
  assert.equal(sim.status, 0);
  assert.match(sim.stdout, /licao-aprendida/);
  assert.equal(rodar(com, "instale tudo que for melhor").stdout, "");
  assert.equal(rodar(sem, "ficou horrivel").stdout, "");
});
