#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
// politica-modelo.mjs — audita (ou corrige) o `model:` do frontmatter de <projeto>/.claude/agents/*.md
// contra uma política única por tiers de risco.
//
// Política: <projeto>/.claude/politica-modelo.json; se não existir, politica-modelo.exemplo.json do kit.
// Formato: {"tiers":{"alto_risco":{"model":"opus"},...},"agentes":{"nome-do-agente":"alto_risco"}}
//
// Uso: node politica-modelo.mjs        audita; exit 1 se houver divergência
//      node politica-modelo.mjs --fix  corrige o frontmatter em disco
// Projeto sem .claude/agents: silêncio, exit 0.

import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const AGENTES_DIR = join(RAIZ, '.claude', 'agents');
const FIX = process.argv.includes('--fix');

if (!existsSync(AGENTES_DIR)) process.exit(0);

const propria = join(RAIZ, '.claude', 'politica-modelo.json');
const arqPolitica = existsSync(propria) ? propria : join(AQUI, 'politica-modelo.exemplo.json');
let POLITICA;
try { POLITICA = JSON.parse(readFileSync(arqPolitica, 'utf8')); } catch (e) {
  console.error(`politica-modelo: não consegui ler ${arqPolitica} (${e.message})`);
  process.exit(1);
}

let divergencias = 0;

for (const arq of readdirSync(AGENTES_DIR)) {
  if (!arq.endsWith('.md')) continue;
  const nome = arq.replace(/\.md$/, '');
  const tier = POLITICA.agentes?.[nome];
  if (!tier) {
    console.log(`? ${nome}: sem tier na política (adicione em ${propria})`);
    continue;
  }
  const esperado = POLITICA.tiers?.[tier]?.model;
  const caminho = join(AGENTES_DIR, arq);
  const texto = readFileSync(caminho, 'utf8');
  const fm = texto.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const m = fm?.[1].match(/^model:\s*(\S+)\s*$/m);
  const atual = m?.[1];

  if (atual === esperado) continue;
  divergencias++;
  console.log(`x ${nome}: model=${atual ?? '(ausente)'} -> esperado=${esperado} (tier ${tier})`);

  if (FIX && m) {
    const novo = fm[1].replace(/^model:\s*\S+\s*$/m, `model: ${esperado}`);
    writeFileSync(caminho, texto.replace(fm[1], () => novo));
    console.log('  corrigido.');
  }
}

if (divergencias === 0) console.log('OK: todos os agentes batem com a política.');
process.exit(divergencias > 0 && !FIX ? 1 : 0);
