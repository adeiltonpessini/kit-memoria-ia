// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
// Teste do guard de contexto — roda o hook como processo filho, sem escaping de shell.
// Uso: node tools/claude/guard-contexto.test.mjs
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as juntar } from "node:path";
// Perfil vazio: o gate-sessao.off da máquina de quem roda não pode mudar o resultado do teste.
const PERFIL_LIMPO = mkdtempSync(juntar(tmpdir(), "guard-perfil-"));
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, rmSync } from "node:fs";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "guard-contexto.mjs");
const BS = String.fromCharCode(92); // barra invertida, sem passar por shell

// Fixtures da regra 3 (arquivo grande lido inteiro). Limiar do guard: 64 KB.
const GRANDE = join(tmpdir(), "guard-contexto-grande.txt");
const PEQUENO = join(tmpdir(), "guard-contexto-pequeno.txt");
const GRANDE_PNG = join(tmpdir(), "guard-contexto-grande.png");
const PEQUENO_PNG = join(tmpdir(), "guard-contexto-pequeno.png");
writeFileSync(GRANDE, "x".repeat(200 * 1024));
writeFileSync(GRANDE_PNG, "x".repeat(200 * 1024));
writeFileSync(PEQUENO_PNG, "x".repeat(20 * 1024));
writeFileSync(PEQUENO, "x".repeat(2 * 1024));

// Fixtures da regra 4 (gate de sessão). Teto do guard: 150 M de tokens re-lidos.
// O estado é incremental e por session_id — cada caso usa um id próprio, e zeramos o
// arquivo de estado antes de rodar para o teste não depender de execuções anteriores.
const ESTADO_GATE = join(tmpdir(), "guard-gate-sessao.json");
rmSync(ESTADO_GATE, { force: true });
const linhaUso = n => JSON.stringify({ type: "assistant", message: { usage: { cache_read_input_tokens: n } } }) + "\n";
const T_CARO = join(tmpdir(), "guard-gate-caro.jsonl");
const T_BARATO = join(tmpdir(), "guard-gate-barato.jsonl");
const T_SIDECHAIN = join(tmpdir(), "guard-gate-sidechain.jsonl");
writeFileSync(T_CARO, linhaUso(100e6).repeat(2));      // 200 M — estourado
writeFileSync(T_BARATO, linhaUso(5e6).repeat(3));      // 15 M — folgado
// subagente (isSidechain) não conta: o contexto dele morre no fim, não é re-lido aqui
writeFileSync(T_SIDECHAIN, JSON.stringify({ type: "assistant", isSidechain: true, message: { usage: { cache_read_input_tokens: 900e6 } } }) + "\n");
const RUN = Date.now().toString(36); // id único por execução: o aviso do gate é 1x por sessão
const evGate = (t, sid) => ({ tool_name: "Read", tool_input: { file_path: PEQUENO }, transcript_path: t, session_id: `${sid}-${RUN}` });

const casos = [
  ["Read de transcript de SUBAGENTE (windows)", { tool_name: "Read", tool_input: { file_path: `C:${BS}Users${BS}A${BS}AppData${BS}Local${BS}Temp${BS}claude${BS}proj${BS}sess${BS}tasks${BS}a8be6ea6.output` } }, "aviso"],
  ["Read de transcript de SUBAGENTE (posix)", { tool_name: "Read", tool_input: { file_path: "/tmp/claude/proj/sess/tasks/aa87.output" } }, "aviso"],
  ["Read de transcript de SESSAO .jsonl", { tool_name: "Read", tool_input: { file_path: "C:/Users/A/.claude/projects/c--projetos-app/abc.jsonl" } }, "aviso"],
  ["Bash cat do transcript de sessao", { tool_name: "Bash", tool_input: { command: "cat ~/.claude/projects/c--projetos-app/abc.jsonl" } }, "aviso"],
  ["PowerShell Get-Content do .output", { tool_name: "PowerShell", tool_input: { command: "Get-Content C:/tmp/tasks/x.output" } }, "aviso"],
  ["Read de arquivo normal do repo", { tool_name: "Read", tool_input: { file_path: "c:/projetos/app/CLAUDE.md" } }, "allow"],
  ["Script agregador sobre transcripts (permitido)", { tool_name: "Bash", tool_input: { command: "node tools/claude/quota.mjs 7" } }, "allow"],
  ["rg dentro dos transcripts (permitido — saida limitada)", { tool_name: "Bash", tool_input: { command: "rg -c erro ~/.claude/projects/c--projetos-app/abc.jsonl" } }, "allow"],
  ["Write num .output (nao e leitura)", { tool_name: "Write", tool_input: { file_path: "/tmp/tasks/x.output" } }, "allow"],
  // Falso positivo real (27/07): cat de OUTRO arquivo + ls de .jsonl no mesmo comando.
  ["cat de outro arquivo + ls de .jsonl (segmentos distintos)", { tool_name: "Bash", tool_input: { command: "cat /c/projetos/app/.claude/settings.json; ls ~/.claude/projects/c--projetos-app/*.jsonl | wc -l" } }, "allow"],
  ["ls/du de transcripts sem despejo", { tool_name: "Bash", tool_input: { command: "du -sh ~/.claude/projects/c--projetos-app" } }, "allow"],
  ["pipe: cat transcript | head (despejo no transcript)", { tool_name: "Bash", tool_input: { command: "cat ~/.claude/projects/x/abc.jsonl | head -5" } }, "aviso"],
  ["head direto no .output", { tool_name: "Bash", tool_input: { command: "head -100 /tmp/claude/tasks/zz.output" } }, "aviso"],
  // Regra 3 — arquivo grande (medido 04/08: dumps de 517k/487k/483k chars vieram daqui)
  ["Read 200 KB SEM limit", { tool_name: "Read", tool_input: { file_path: GRANDE } }, "aviso"],
  ["Read 200 KB COM limit (ja fatiado)", { tool_name: "Read", tool_input: { file_path: GRANDE, limit: 100 } }, "allow"],
  ["Read 2 KB sem limit (abaixo do limiar)", { tool_name: "Read", tool_input: { file_path: PEQUENO } }, "allow"],
  // Regra 5 — screenshot (medido 07/08 num projeto real: os 5 maiores dumps da semana eram PNG)
  ["Regra 5: PNG de 200 KB pergunta antes de anexar", { tool_name: "Read", tool_input: { file_path: GRANDE_PNG } }, "aviso"],
  ["Regra 5: PNG de 20 KB passa direto", { tool_name: "Read", tool_input: { file_path: PEQUENO_PNG } }, "allow"],
  ["Regra 5: PNG em .playwright-mcp pergunta mesmo pequeno", { tool_name: "Read", tool_input: { file_path: "C:/projetos/app/.playwright-mcp/ag-desk.png" } }, "aviso"],
  ["Regra 5: PNG em test-results pergunta", { tool_name: "Read", tool_input: { file_path: "/repo/test-results/falha-1/screenshot.png" } }, "aviso"],
  ["Regra 5: SVG nao e raster, nao pergunta", { tool_name: "Read", tool_input: { file_path: "/repo/brand/logo.svg" } }, "allow"],
  ["Read de arquivo inexistente (nao trava o hook)", { tool_name: "Read", tool_input: { file_path: join(tmpdir(), "nao-existe-xyz.txt") } }, "allow"],
  // Regra 4 — gate de sessao (medido 04/08: 1 sessao de 612 M = 41% do gasto de 7 dias)
  ["Gate: sessao em 200 M (acima do teto)", evGate(T_CARO, "s-caro"), "aviso"],
  ["Gate: sessao em 15 M (abaixo do teto)", evGate(T_BARATO, "s-barato"), "allow"],
  ["Gate: 900 M so de subagente nao conta", evGate(T_SIDECHAIN, "s-side"), "allow"],
  ["Gate: sessao cara avisa ate no Write", { tool_name: "Write", tool_input: { file_path: PEQUENO }, transcript_path: T_CARO, session_id: `s-caro2-${RUN}` }, "aviso"],
  // Sem esta excecao o gate trava a sessao SEM deixar salva-la — foi como se perderam 04–09/08.
  ["Gate: handoff pode ser gravado mesmo no teto", { tool_name: "Write", tool_input: { file_path: "/repo/docs/knowledge/sessions/2026-08-09-handoff-x.md" }, transcript_path: T_CARO, session_id: `s-caro3-${RUN}` }, "allow"],
  ["Gate: Write fora de sessions/ tambem avisa", { tool_name: "Write", tool_input: { file_path: "/repo/docs/knowledge/decisions/x.md" }, transcript_path: T_CARO, session_id: `s-caro4-${RUN}` }, "aviso"],
  ["Gate: transcript inexistente falha ABERTO", evGate(join(tmpdir(), "nao-existe.jsonl"), "s-nada"), "allow"],
  ["Gate: sem transcript_path (nao aplica)", { tool_name: "Read", tool_input: { file_path: PEQUENO }, session_id: `s-sem-${RUN}` }, "allow"],
];

let falhas = 0;
for (const [nome, ev, esperado] of casos) {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(ev), encoding: "utf8", env: { ...process.env, USERPROFILE: PERFIL_LIMPO, HOME: PERFIL_LIMPO } });
  let got = "?";
  try { const h = JSON.parse(r.stdout).hookSpecificOutput; got = h.permissionDecision === "allow" && h.additionalContext ? "aviso" : h.permissionDecision; } catch { got = `saida invalida: ${r.stdout.slice(0, 60)}`; }
  const ok = got === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome.padEnd(46)} esperado=${esperado} obtido=${got}`);
}
for (const f of [GRANDE, PEQUENO, GRANDE_PNG, PEQUENO_PNG, T_CARO, T_BARATO, T_SIDECHAIN, ESTADO_GATE]) rmSync(f, { force: true });
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTodos os casos passaram.");
process.exit(falhas ? 1 : 0);
