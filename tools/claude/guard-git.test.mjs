// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
// Teste do guard de git. Uso: node --test tools/claude/guard-git.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { avaliar } from "./guard-git.mjs";

const NEGA = [
  "git reset --hard HEAD~1",
  "git reset --hard",
  "cd x && git reset --hard origin/main",
  "git clean -fd",
  "git clean -xdf",
  "git branch -D feat/x",
  "git push --force origin main",
  "git push -f",
  "git push origin +main",
  "git checkout .",
  "git checkout -- .",
  "git restore .",
  "git stash clear",
  "git stash drop stash@{0}",
  "git -C ../outro reset --hard",
  "cat <<EOF\nx\nEOF\ngit reset --hard",
];
const PASSA = [
  "git push -u origin feat/x",
  "git push --force-with-lease origin feat/x",
  "git reset --soft HEAD~1",
  "git reset HEAD arquivo.ts",
  "git clean -n",
  "git branch -d feat/x",
  "git checkout main",
  "git checkout -- src/a.ts",
  "git restore --staged src/a.ts",
  "git stash list",
  "git stash pop",
  'git commit -m "docs: nunca rode git reset --hard"',
  "git commit -m \"$(cat <<'EOF'\nexplica git push --force\nEOF\n)\"",
  "git commit -q -F - <<'EOF'\nfeat: guarda nega reset --hard e clean -f\nEOF\ngit log --oneline -1",
  "cat > x.md <<EOF\ngit push --force\nEOF",
  "git log --oneline -5",
  "rg 'git reset --hard' docs",
];

test("nega os comandos destrutivos", () => {
  for (const c of NEGA) assert.ok(avaliar(c), `devia negar: ${c}`);
});

test("deixa passar o resto", () => {
  for (const c of PASSA) assert.equal(avaliar(c), null, `devia passar: ${c}`);
});

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "guard-git.mjs");
const run = (ev) => spawnSync(process.execPath, [HOOK], { input: JSON.stringify(ev), encoding: "utf8" });

test("ponta a ponta: o hook devolve deny no JSON", () => {
  const neg = run({ tool_name: "Bash", tool_input: { command: "git reset --hard" } });
  assert.ok(neg.stdout.includes('"deny"'));
  assert.equal(neg.status, 0);
  assert.ok(run({ tool_name: "PowerShell", tool_input: { command: "git clean -fd" } }).stdout.includes('"deny"'));
  const ok = run({ tool_name: "Bash", tool_input: { command: "git status" } });
  assert.equal(ok.stdout.trim(), "");
  const lixo = spawnSync(process.execPath, [HOOK], { input: "não é json", encoding: "utf8" });
  assert.equal(lixo.status, 0);
  assert.equal(lixo.stdout.trim(), "");
});
