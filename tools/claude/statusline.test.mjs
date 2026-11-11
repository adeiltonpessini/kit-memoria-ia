// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
// node --test tools/claude/statusline.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { janela, cota, linha, amostrarCota } from "./statusline.mjs";

test("amostrarCota: só grava número que veio, no máximo 1 a cada 5 min", () => {
  const arq = join(mkdtempSync(join(tmpdir(), "sl-c-")), "uso-cota.jsonl");
  assert.equal(amostrarCota(undefined, arq), false);
  assert.equal(amostrarCota({ five_hour: { used_percentage: null } }, arq), false);
  assert.equal(existsSync(arq), false);
  assert.equal(amostrarCota({ seven_day: { used_percentage: 41.2, resets_at: 1738857600 } }, arq), true);
  assert.equal(amostrarCota({ seven_day: { used_percentage: 42 } }, arq), false);
  const l = JSON.parse(readFileSync(arq, "utf8").trim());
  assert.equal(l.d7, 41.2); assert.equal(l.h5, null); assert.equal(l.r7, 1738857600);
});

const semCor = s => s.replace(/\x1b\[\d+m/g, "");

test("janela: env vence, depois local, projeto e global", () => {
  const home = mkdtempSync(join(tmpdir(), "sl-h-"));
  const proj = mkdtempSync(join(tmpdir(), "sl-p-"));
  mkdirSync(join(home, ".claude")); mkdirSync(join(proj, ".claude"));
  writeFileSync(join(home, ".claude", "settings.json"), '{"autoCompactWindow":200000}');
  assert.equal(janela(proj, {}, home), 200000);
  writeFileSync(join(proj, ".claude", "settings.json"), '{"autoCompactWindow":180000}');
  assert.equal(janela(proj, {}, home), 180000);
  writeFileSync(join(proj, ".claude", "settings.local.json"), '{"autoCompactWindow":160000}');
  assert.equal(janela(proj, {}, home), 160000);
  assert.equal(janela(proj, { CLAUDE_CODE_AUTO_COMPACT_WINDOW: "120000" }, home), 120000);
  assert.equal(janela("", {}, mkdtempSync(join(tmpdir(), "sl-v-"))), 200000);
});

test("cota: sem dado não inventa percentual", () => {
  assert.equal(cota(undefined), "");
  assert.equal(cota({}), "");
  assert.equal(cota({ five_hour: { used_percentage: null } }), "");
  assert.equal(cota({ five_hour: { used_percentage: "40" } }), "");
  assert.equal(semCor(cota({ five_hour: { used_percentage: 23.5 } })), "cota 5h 24%");
  assert.equal(semCor(cota({ five_hour: { used_percentage: 23.5 }, seven_day: { used_percentage: 41.2 } })), "cota 5h 24% 7d 41%");
});

test("linha: ctx medido, cota e custo de API separados", () => {
  const ev = { model: { display_name: "Opus" }, workspace: { current_dir: "C:\\projetos\\app" },
    rate_limits: { seven_day: { used_percentage: 41 } }, cost: { total_cost_usd: 1.234 } };
  const s = semCor(linha(ev, { input_tokens: 1000, cache_read_input_tokens: 79000 }, 160000));
  assert.match(s, /80k\/160k ctx/);
  assert.match(s, /cota 7d 41%/);
  assert.match(s, /≈US\$1\.23 API/);
  assert.doesNotMatch(s, /5h/);
  assert.equal(semCor(linha({ model: { id: "x" } }, null, 160000)), "x");
});
