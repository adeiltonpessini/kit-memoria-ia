// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { areasDe, lerAreas } from "./verifica-gate.mjs";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "verifica-gate.mjs");

function projeto(config) {
  const d = mkdtempSync(join(tmpdir(), "verifica-teste-"));
  const git = (...a) => spawnSync("git", a, { cwd: d, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t.t");
  git("config", "user.name", "t");
  writeFileSync(join(d, "base.txt"), "x");
  git("add", ".");
  git("commit", "-qm", "base");
  if (config) {
    mkdirSync(join(d, ".claude"));
    writeFileSync(join(d, ".claude", "verifica.json"), JSON.stringify(config));
  }
  return d;
}
const rodar = (d, extra = {}) =>
  spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ cwd: d, session_id: "s" + Math.random() }),
    encoding: "utf8",
    env: { ...process.env, ...extra },
  });

test("lerAreas: sem arquivo ou com JSON ruim devolve lista vazia", () => {
  assert.deepEqual(lerAreas(mkdtempSync(join(tmpdir(), "verifica-vazio-"))), []);
  const d = mkdtempSync(join(tmpdir(), "verifica-ruim-"));
  mkdirSync(join(d, ".claude"));
  writeFileSync(join(d, ".claude", "verifica.json"), "{nao e json");
  assert.deepEqual(lerAreas(d), []);
});

test("areasDe: cada área dispara só pelo próprio caminho", () => {
  const d = projeto({
    areas: [
      { caminho: "^web/.*\\.(js|ts)$", comando: "true", rotulo: "web" },
      { caminho: "^api/.*\\.py$", comando: "true", rotulo: "api" },
      { caminho: "(", comando: "true", rotulo: "regex inválida" },
    ],
  });
  const areas = lerAreas(d);
  assert.equal(areas.length, 2);
  const r = (arqs) => areasDe(areas, arqs).map((a) => a[2]);
  assert.deepEqual(r(["web/app.js"]), ["web"]);
  assert.deepEqual(r(["api/main.py"]), ["api"]);
  assert.deepEqual(r(["README.md"]), []);
});

test("sem verifica.json: silêncio total", () => {
  const d = projeto(null);
  writeFileSync(join(d, "novo.js"), "1");
  const r = rodar(d);
  assert.equal(r.status, 0);
  assert.equal(r.stdout + r.stderr, "");
});

test("área que falha bloqueia com exit 2; área que passa deixa seguir", () => {
  const d = projeto({ areas: [{ caminho: "\\.js$", comando: "echo quebrou; exit 1", rotulo: "js" }] });
  writeFileSync(join(d, "a.js"), "1");
  const r = rodar(d);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /quebrou/);

  const ok = projeto({ areas: [{ caminho: "\\.js$", comando: "true", rotulo: "js" }] });
  writeFileSync(join(ok, "a.js"), "1");
  assert.equal(rodar(ok).status, 0);
});

test("CLAUDE_VERIFICA=0 desliga", () => {
  const d = projeto({ areas: [{ caminho: "\\.js$", comando: "exit 1", rotulo: "js" }] });
  writeFileSync(join(d, "a.js"), "1");
  assert.equal(rodar(d, { CLAUDE_VERIFICA: "0" }).status, 0);
});
