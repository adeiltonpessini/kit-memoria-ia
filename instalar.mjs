#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
// instalar.mjs — instala o kit UMA vez, no global (~/.claude). Vale para todo projeto.
//
//   node instalar.mjs            instala ou atualiza
//   node instalar.mjs --sem-hooks  copia ferramentas, skills e agentes, sem mexer no settings.json
//   node instalar.mjs --com-guard-git  também liga o guard-git (PreToolUse: nega git destrutivo)
//
// O que faz:
//   1. copia tools/ para ~/.claude/kit/tools/
//   2. copia .claude/skills/* para ~/.claude/skills/ e .claude/agents/* para ~/.claude/agents/
//      (não sobrescreve skill ou agente que já exista com o mesmo nome; avisa)
//   3. junta statusLine e os hooks no ~/.claude/settings.json, com caminho absoluto,
//      guardando cópia do arquivo antigo em settings.json.antes-do-kit
//
// Os scripts acham o projeto aberto por CLAUDE_PROJECT_DIR (ou pela pasta atual).
// Projeto sem docs/knowledge/ não recebe nada: os hooks ficam em silêncio.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const KIT = dirname(fileURLToPath(import.meta.url));
const CLAUDE = join(homedir(), '.claude');
const DEST = join(CLAUDE, 'kit', 'tools');
const semHooks = process.argv.includes('--sem-hooks');
const comGuardGit = process.argv.includes('--com-guard-git');

mkdirSync(DEST, { recursive: true });
cpSync(join(KIT, 'tools'), DEST, { recursive: true, force: true });
console.log('ferramentas  ->', DEST);

for (const tipo of ['skills', 'agents']) {
  const orig = join(KIT, '.claude', tipo);
  const dest = join(CLAUDE, tipo);
  mkdirSync(dest, { recursive: true });
  for (const nome of readdirSync(orig)) {
    const alvo = join(dest, nome);
    if (existsSync(alvo)) { console.log(`pulei ${tipo}/${nome}: já existe (apague e rode de novo para atualizar)`); continue; }
    cpSync(join(orig, nome), alvo, { recursive: true });
    console.log(`${tipo}/${nome} instalado`);
  }
}

if (semHooks) process.exit(0);

const p = (...s) => join(DEST, ...s).replace(/\\/g, '/');
const hook = (arq, timeout = 10, extra = []) => ({ type: 'command', command: 'node', timeout, args: [arq, ...extra] });
const novos = {
  SessionStart: [{ hooks: [hook(p('knowledge', 'session-handoff.mjs'))] }],
  PreToolUse: [{ matcher: '*', hooks: [hook(p('claude', 'guard-contexto.mjs'))] }],
  UserPromptSubmit: [{ hooks: [hook(p('claude', 'despacho-gate.mjs'))] }],
  Stop: [{ hooks: [hook(p('knowledge', 'handoff-gate.mjs')), hook(p('claude', 'lembrete-clear.mjs')), hook(p('claude', 'verifica-gate.mjs'), 300)] }],
  SessionEnd: [{ hooks: [hook(p('knowledge', 'aimemory.mjs'), 15, ['pull', '-n', '10'])] }],
};
novos.UserPromptSubmit[0].hooks.push(hook(p('claude', 'correcao-gate.mjs')));
// opcional: nega git destrutivo (reset --hard, push --force...). Só entra com a flag.
if (comGuardGit) novos.PreToolUse.push({ matcher: 'Bash|PowerShell', hooks: [hook(p('claude', 'guard-git.mjs'))] });

const arq = join(CLAUDE, 'settings.json');
let s = {};
if (existsSync(arq)) {
  copyFileSync(arq, arq + '.antes-do-kit');
  s = JSON.parse(readFileSync(arq, 'utf8'));
}
s.hooks ??= {};
for (const [ev, grupos] of Object.entries(novos)) {
  const atual = s.hooks[ev] ?? [];
  // tira versão anterior do kit e põe a nova; hooks de outra origem ficam
  const outros = atual.filter((g) => !JSON.stringify(g).includes('/.claude/kit/tools/'));
  s.hooks[ev] = [...outros, ...grupos];
}
if (!s.statusLine) s.statusLine = { type: 'command', command: `node "${p('claude', 'statusline.mjs')}"` };
else console.log('statusLine já existia: mantive o seu');
writeFileSync(arq, JSON.stringify(s, null, 2) + '\n');
console.log('hooks        ->', arq, '(cópia antiga: settings.json.antes-do-kit)');
