#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
/**
 * correcao-gate.mjs: hook `UserPromptSubmit` que percebe quando você corrige o Claude e lembra de virar lição.
 *
 * POR QUE: a skill `licao-aprendida` só rodava quando alguém lembrava de pedir, e a mesma correção voltava.
 * Aqui o hook só avisa; a lição passa pela skill, com revisão (ferramenta que reescreve skill sozinha
 * pode gravar regra errada).
 *
 * Não bloqueia nada. Sem correção no texto = silêncio. Projeto sem `docs/knowledge` = silêncio.
 * CLAUDE_CORRECAO=0 desliga.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Frases de correção em PT-BR (com e sem acento) e em inglês. "não"/"no" sozinhos ficam de fora: comuns demais.
const PADROES = [
  /\bde novo\b/i,
  /\boutra vez\b/i,
  /\bj[aá] (te )?(falei|disse|pedi|expliquei)\b/i,
  /\bn[aã]o (era|é|e) (isso|assim|o que)\b/i,
  /\bn[aã]o (foi )?(isso )?que (eu )?pedi\b/i,
  /\bn[aã]o pedi\b/i,
  /\b(est[aá]|ficou|t[aá]) (errad[oa]|horr[ií]vel|ruim|fei[oa]|quebrad[oa])\b/i,
  /\bvoc[eê] (errou|esqueceu|ignorou)\b/i,
  /\bsempre (isso|a mesma coisa)\b/i,
  // inglês
  /\bagain\b/i,
  /\bI (already )?told you\b/i,
  /\bthat'?s not what I (asked|wanted|said)\b/i,
  /\bnot what I (asked|wanted)\b/i,
  /\byou (forgot|missed|ignored)\b/i,
];

export function ehCorrecao(texto) {
  const t = String(texto || "");
  if (t.trimStart().startsWith("/")) return false;
  return PADROES.some((re) => re.test(t));
}

const AVISO =
  "<correcao>O usuário está corrigindo algo. Depois de resolver, veja se a causa pode voltar; se puder, registre pela " +
  "skill `licao-aprendida` (regra onde o próximo agente lê: teste, playbook, skill ou o CLAUDE.md). Não mexa em skill " +
  "sem conferir a causa no código.</correcao>\n";

if (process.argv[1] && process.argv[1].endsWith("correcao-gate.mjs")) {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    if (process.env.CLAUDE_CORRECAO === "0") return process.exit(0);
    let ev = {};
    try { ev = JSON.parse(raw || "{}"); } catch { return process.exit(0); }
    const repo = resolve(ev.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd());
    // projeto que não adotou a memória: silêncio total
    if (!existsSync(resolve(repo, "docs", "knowledge"))) return process.exit(0);
    if (!ehCorrecao(ev.prompt)) return process.exit(0);
    // stdout pipeado é assíncrono no Windows: sair só depois de escrever.
    process.stdout.write(AVISO, () => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
