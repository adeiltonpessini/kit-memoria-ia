#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
/**
 * despacho-gate.mjs — hook `UserPromptSubmit`: ROTEADOR do time e das skills.
 *
 * A cada prompt de tarefa, casa o texto contra os `routingKeywords` de
 * `docs/agentes/team-registry.json` (fonte única do roteamento) e contra
 * a tabela SKILLS abaixo, e injeta QUAIS agentes despachar e QUAIS skills invocar.
 *
 * POR QUE existe: aviso genérico uma vez por sessão não muda comportamento; nome concreto
 * de agente e skill no momento do pedido muda.
 *
 * CUSTO: preâmbulo (~120 tokens) 1x por sessão; depois ~40–80 tokens só quando o prompt
 * casa alguma rota. Prompt curto (< PISO) ou sem rota = silêncio (stdout vazio).
 *
 * Invariante: nunca bloqueia, nunca falha. Erro nosso = silêncio.
 * Desligar: `CLAUDE_DESPACHO=0`.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const ESTADO = resolve(tmpdir(), `${basename(REPO)}-despacho-gate.json`);
const PISO = 40;      // abaixo disto é pergunta rápida, não tarefa
const MAX_AGENTES = 3;
const MAX_SKILLS = 3;

// Reforço fora do registry. Todas as personas despacháveis já estão no
// team-registry.json; keyword repetida aqui contaria em dobro.
const EXTRAS = {};

// Skill → regex de gatilho. Ordem = prioridade no empate.
const SKILLS = [
  ['superpowers:systematic-debugging', /\b(bug|erro|falh|quebr|n[ãa]o\s*funciona|crash|500\b|stack\s*trace|flaky)/i],
  ['superpowers:brainstorming', /\b(cri(?:a|ar|e)\b|adicion|nova?\s+(feature|tela|funcionalidade)|ideia|desenhar|construir)/i],
  ['spec-primeiro', /\b(spec|especifica|endpoint\s+novo|refactor\s+grande|[ée]pico)/i],
  ['superpowers:writing-plans', /\b(plano|planej|passo\s*a\s*passo|roadmap)/i],
  ['busca-eficiente', /\b(onde\s+(est[áa]|fica|mora)|quem\s+usa|como\s+usamos|o\s+que\s+quebra|depende\s+de)/i],
  ['graphify', /\b(graphify|grafo\s+d[oe]\s+c[óo]digo|arquitetura\s+d[oe]\s+(repo|projeto)|o\s+que\s+quebra\s+se|como\s+\S+\s+chega\s+em|quem\s+chama)/i],
  ['licao-aprendida', /\b(li[çc][ãa]o|n[ãa]o\s+repetir|de\s+novo\s+isso|isso\s+de\s+novo|retro\b|gotcha|armadilha)/i],
  ['superpowers:test-driven-development', /\b(tdd|teste\s+primeiro|cobertura)/i],
  ['grilling', /\b(sabatin|grill|me\s+questiona|fura\s+(esse|o)\s+plano|estress\w*\s+(o\s+)?plano)/i],
  ['pr', /\b(abr\w*\s+(o\s+)?pr\b|corpo\s+do\s+pr|descri[çc][ãa]o\s+do\s+pr|gh\s+pr\s+create)/i],
  ['docs-context7', /\b(api\s+d[aoe]\s+|vers[ãa]o\s+nova|documenta[çc][ãa]o\s+d[aoe]\s+(lib|biblioteca)|como\s+usar\s+a\s+lib)/i],
  ['remember', /\b(anota|guarda\s+isso|handoff|registr\w*\s+(a\s+)?decis)/i],
  ['superpowers:requesting-code-review', /\b(code\s*review|revisar\s+(o\s+)?(diff|pr|c[óo]digo)|antes\s+de\s+(mergear|merge))/i],
  ['superpowers:verification-before-completion', /\b(pronto\?|terminou|validar|verificar\s+se)/i],
  ['verify', /\b(verify|antes\s+de\s+(commitar|dar\s+push)|checagem\s+completa|provar\s+que|prove\s+que|conferir\s+se\s+(passa|funciona))/i],
  ['veracidade-de-numero', /\b(kpi|m[ée]trica|n[úu]mero\s+(est[áa]\s+)?(errado|estranho|certo)|esse\s+n[úu]mero|audit\w*\s+(o\s+)?(n[úu]mero|dado)|dado\s+(errado|estranho)|n[úu]mero\s+n[ãa]o\s+bate)/i],
  ['skill-smith', /\b(nova\s+skill|criar\s+(uma\s+)?skill|novo\s+agente|criar\s+(um\s+)?agente)/i],
];

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try { main(); } catch { process.exit(0); }
});

function main() {
  if (process.env.CLAUDE_DESPACHO === '0') return process.exit(0);
  let ev = {};
  try { ev = JSON.parse(raw || '{}'); } catch { return process.exit(0); }

  const prompt = String(ev.prompt || '');
  if (prompt.trim().length < PISO) return process.exit(0);
  if (prompt.trimStart().startsWith('/')) return process.exit(0); // slash command já escolheu
  // projeto que não adotou o time (sem registry): silêncio total
  if (!existsSync(resolve(REPO, 'docs/agentes/team-registry.json'))) return process.exit(0);

  const agentes = rotearAgentes(prompt);
  const skills = SKILLS.filter(([, re]) => re.test(prompt)).slice(0, MAX_SKILLS).map(([n]) => n);

  const sessao = ev.session_id || 'sem-id';
  const estado = lerEstado();
  const primeira = !estado[sessao];
  if (primeira) { estado[sessao] = Date.now(); gravarEstado(estado); }

  if (!primeira && !agentes.length && !skills.length) return process.exit(0);

  let out = '<time-do-projeto>\n';
  if (primeira) {
    out +=
      'Regra do projeto: trabalho de domínio vai para o AGENTE DA ÁREA (Agent tool, subagent_type\n' +
      'abaixo) — ele carrega o playbook de docs/agentes/ e roda em contexto\n' +
      'próprio. Áreas independentes: vários Agent na MESMA mensagem. Procedimento com skill:\n' +
      'invoque a skill ANTES de improvisar. Você orquestra, integra e julga o resultado.\n' +
      'Só faça sozinho o que é trivial (1 arquivo, < ~20 linhas) ou pergunta direta.\n';
  }
  if (agentes.length) out += `Agentes para este pedido: ${agentes.join(', ')}\n`;
  if (skills.length) out += `Skills para este pedido: ${skills.join(', ')}\n`;
  out += '</time-do-projeto>\n';

  // stdout pipeado é assíncrono (no Windows sempre): process.exit() imediato truncava a saída.
  process.stdout.write(out, () => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

/** Pontua cada persona pelo nº de keywords casadas; devolve o subagent_type real. */
function rotearAgentes(prompt) {
  const dirAgentes = resolve(REPO, '.claude', 'agents');
  const arquivos = existsSync(dirAgentes) ? readdirSync(dirAgentes).filter((f) => f.endsWith('.md')) : [];
  const tipoDe = (slug) => {
    const f = arquivos.find((a) => a === `${slug}.md` || a.startsWith(`${slug}-`));
    return f ? f.slice(0, -3) : null;
  };

  const keywords = {};
  try {
    const reg = JSON.parse(readFileSync(resolve(REPO, 'docs/agentes/team-registry.json'), 'utf8'));
    for (const p of reg.personas || []) keywords[p.slug] = [...(p.routingKeywords || [])];
  } catch { /* registry ilegível: segue só com EXTRAS */ }
  for (const [slug, ks] of Object.entries(EXTRAS)) keywords[slug] = [...(keywords[slug] || []), ...ks];

  const placar = [];
  for (const [slug, ks] of Object.entries(keywords)) {
    const tipo = tipoDe(slug);
    if (!tipo) continue; // persona sem agente despachável (otto, etc.)
    let pontos = 0;
    for (const k of ks) {
      try {
        // borda à esquerda: `ci\b` não pode casar dentro de "social"
        if (new RegExp(`(?<![\\p{L}\\d])(?:${k})`, 'iu').test(prompt)) pontos++;
      } catch { /* keyword com regex inválida: ignora */ }
    }
    if (pontos) placar.push([tipo, pontos]);
  }
  return placar.sort((a, b) => b[1] - a[1]).slice(0, MAX_AGENTES).map(([t]) => t);
}

function lerEstado() {
  try {
    const e = JSON.parse(readFileSync(ESTADO, 'utf8'));
    return e && typeof e === 'object' && !Array.isArray(e) ? e : {};
  } catch { return {}; }
}

/**
 * Sem lock de propósito: a v1 usava lock O_EXCL e um processo morto no meio deixava o
 * `.lock` órfão para sempre (visto 22/09). A pior corrida aqui é duas sessões verem o
 * preâmbulo duas vezes — barato; não justifica lock.
 */
function gravarEstado(e) {
  try {
    const ks = Object.keys(e);
    if (ks.length > 30) for (const k of ks.slice(0, ks.length - 30)) delete e[k];
    writeFileSync(ESTADO, JSON.stringify(e));
  } catch { /* silêncio */ }
}
