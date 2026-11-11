#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
//
// kit.mjs: a porta de entrada. Um comando para cada coisa.
//
//   node kit.mjs instalar            instala no seu usuário, para as IAs que achar (uma vez por computador)
//   node kit.mjs iniciar             liga a memória no projeto da pasta atual
//   node kit.mjs lembrar "<tema>"    cria nota (--type session | decision | licao | misc)
//   node kit.mjs buscar "<tema>"     procura no acervo do projeto
//   node kit.mjs diagnostico         mostra o que está instalado e o que falta
//   node kit.mjs remover             tira o kit do seu usuário (mantém as notas dos projetos)

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = dirname(fileURLToPath(import.meta.url));
const HOME = homedir();
const CASA = join(HOME, '.kit-memoria-ia'); // ferramentas instaladas, iguais para qualquer IA
const BLOCO = readFileSync(join(KIT, 'modelos', 'AGENTS.bloco.md'), 'utf8');
const INI = '<!-- kit-memoria-ia:inicio';
const FIM = '<!-- kit-memoria-ia:fim -->';

// IA → onde ela lê skills e instruções globais. Todas recebem também ~/.agents/skills, o lugar comum;
// as fontes divergem se o Codex lê de lá ou de ~/.codex/skills, então vai nos dois. Só mexemos na que já existe no computador.
const IAS = [
  { nome: 'Claude Code', pasta: '.claude', skills: '.claude/skills', agentes: '.claude/agents' },
  { nome: 'Codex', pasta: '.codex', skills: '.codex/skills', regras: '.codex/AGENTS.md' },
  { nome: 'Gemini CLI', pasta: '.gemini', skills: '.gemini/skills', regras: '.gemini/GEMINI.md' },
  { nome: 'Cursor', pasta: '.cursor', skills: '.cursor/skills' },
  { nome: 'GitHub Copilot', pasta: '.copilot', skills: '.copilot/skills' },
];

const ok = (m) => console.log(`  ✓ ${m}`);
const pula = (m) => console.log(`  · ${m}`);
const node = (arq, args) => spawnSync(process.execPath, [arq, ...args], { stdio: 'inherit', env: process.env }).status ?? 1;

function versaoNode() {
  const maior = Number(process.versions.node.split('.')[0]);
  if (maior < 22) {
    console.error(`Precisa do Node 22 ou mais novo (você tem ${process.versions.node}). Baixe em https://nodejs.org`);
    process.exit(1);
  }
}

// Põe (ou troca) o bloco do kit num arquivo de regras, sem tocar no resto.
function gravaBloco(arq, conteudo = BLOCO) {
  mkdirSync(dirname(arq), { recursive: true });
  const atual = existsSync(arq) ? readFileSync(arq, 'utf8') : '';
  const i = atual.indexOf(INI);
  const f = atual.indexOf(FIM);
  const novo = i >= 0 && f > i
    ? atual.slice(0, i) + conteudo.trim() + atual.slice(f + FIM.length)
    : (atual.trim() ? atual.trimEnd() + '\n\n' : '') + conteudo.trim() + '\n';
  writeFileSync(arq, novo);
}

function tiraBloco(arq) {
  if (!existsSync(arq)) return;
  const s = readFileSync(arq, 'utf8');
  const i = s.indexOf(INI);
  const f = s.indexOf(FIM);
  if (i >= 0 && f > i) writeFileSync(arq, (s.slice(0, i) + s.slice(f + FIM.length)).trim() + '\n');
}

function copiaSkills(destino) {
  const orig = join(KIT, '.claude', 'skills');
  mkdirSync(destino, { recursive: true });
  let n = 0;
  for (const nome of readdirSync(orig)) {
    const alvo = join(destino, nome);
    if (existsSync(alvo)) continue; // não sobrescreve skill sua com o mesmo nome
    cpSync(join(orig, nome), alvo, { recursive: true });
    n++;
  }
  return n;
}

function instalar(args) {
  versaoNode();
  console.log('\nInstalando o kit-memoria-ia no seu usuário\n');
  mkdirSync(CASA, { recursive: true });
  cpSync(join(KIT, 'tools'), join(CASA, 'tools'), { recursive: true, force: true });
  for (const a of ['kit.mjs', 'instalar.mjs', 'modelos', '.claude', 'verifica.exemplo.json', 'team-registry.exemplo.json', 'settings.global.recomendado.json']) {
    if (existsSync(join(KIT, a))) cpSync(join(KIT, a), join(CASA, a), { recursive: true, force: true });
  }
  ok(`ferramentas em ${CASA}`);

  const achadas = IAS.filter((ia) => existsSync(join(HOME, ia.pasta)));
  if (!achadas.length) pula('nenhuma IA de código encontrada; as skills ficam só em ~/.agents/skills');
  // ~/.agents/skills é o lugar comum que várias IAs leem
  ok(`skills em ~/.agents/skills (${copiaSkills(join(HOME, '.agents', 'skills'))} novas)`);

  for (const ia of achadas) {
    if (ia.nome === 'Claude Code') {
      const extra = args.filter((a) => a.startsWith('--'));
      if (node(join(KIT, 'instalar.mjs'), extra) !== 0) { console.error('  ✗ Claude Code: o instalador falhou'); continue; }
      ok('Claude Code: skills, agentes e hooks automáticos');
      continue;
    }
    copiaSkills(join(HOME, ia.skills));
    if (ia.regras) gravaBloco(join(HOME, ia.regras), BLOCO.replace('## Memória do projeto (kit-memoria-ia)', '## Memória do projeto (kit-memoria-ia; vale quando o projeto tem docs/knowledge/)'));
    ok(`${ia.nome}: skills${ia.regras ? ' e regras globais' : ''}`);
  }
  console.log(`\nPronto. Agora, na pasta de cada projeto:\n  node "${join(CASA, 'kit.mjs')}" iniciar\n`);
}

function iniciar() {
  versaoNode();
  const raiz = resolve(process.cwd());
  console.log(`\nLigando a memória em ${raiz}\n`);
  for (const d of ['decisions', 'sessions', 'licoes', 'misc']) mkdirSync(join(raiz, 'docs', 'knowledge', d), { recursive: true });
  const cons = join(raiz, 'docs', 'knowledge', 'CONSOLIDATION.md');
  if (!existsSync(cons)) writeFileSync(cons, '# Consolidação\n\nUma vez por mês: juntar duplicatas, apagar o que o código desmentiu e recolher os "Virou: pendente" dos handoffs.\n\nÚltima consolidação: nunca.\n');
  ok('docs/knowledge/ (decisions, sessions, licoes, misc)');

  const gi = join(raiz, '.gitignore');
  const atual = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
  const faltam = ['docs/knowledge/.cache/', 'graphify-out/'].filter((l) => !atual.split(/\r?\n/).includes(l));
  if (faltam.length) appendFileSync(gi, (atual && !atual.endsWith('\n') ? '\n' : '') + faltam.join('\n') + '\n');
  ok('.gitignore');

  gravaBloco(join(raiz, 'AGENTS.md'));
  ok('AGENTS.md (Codex, Copilot, Cursor e outras leem este)');
  // Claude Code e Gemini CLI leem o próprio arquivo; @AGENTS.md importa o mesmo conteúdo, sem duplicar.
  for (const [arq, pasta] of [['CLAUDE.md', '.claude'], ['GEMINI.md', '.gemini']]) {
    const p = join(raiz, arq);
    if (!existsSync(join(HOME, pasta)) && !existsSync(p)) continue;
    const s = existsSync(p) ? readFileSync(p, 'utf8') : '';
    if (!s.includes('@AGENTS.md')) writeFileSync(p, (s.trim() ? s.trimEnd() + '\n\n' : '') + '@AGENTS.md\n');
    ok(`${arq} aponta para o AGENTS.md`);
  }

  const handoffs = readdirSync(join(raiz, 'docs', 'knowledge', 'sessions'));
  if (!handoffs.length) {
    const r = spawnSync(process.execPath, [join(KIT, 'tools', 'knowledge', 'remember.mjs'), 'inicio da memoria', '--type', 'session'], { cwd: raiz, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: raiz } });
    if (r.status === 0) ok('primeiro handoff criado em docs/knowledge/sessions/');
  }
  console.log('\nPronto. Abra a sua IA aqui e peça: "leia o AGENTS.md e continue de onde parou".');
  console.log('Opcional: mapa do código com graphify (https://github.com/safishamsi/graphify): graphify update .\n');
}

function diagnostico() {
  const linha = (cond, sim, nao) => console.log(cond ? `  ✓ ${sim}` : `  ✗ ${nao}`);
  console.log('\nDiagnóstico do kit-memoria-ia\n');
  linha(Number(process.versions.node.split('.')[0]) >= 22, `Node ${process.versions.node}`, `Node ${process.versions.node}: precisa de 22+`);
  linha(existsSync(join(CASA, 'tools')), `instalado em ${CASA}`, 'não instalado: rode "node kit.mjs instalar"');
  for (const ia of IAS) if (existsSync(join(HOME, ia.pasta))) console.log(`  · ${ia.nome} encontrado`);
  const st = join(HOME, '.claude', 'settings.json');
  if (existsSync(st)) linha(readFileSync(st, 'utf8').includes('/.claude/kit/tools/'), 'hooks do Claude Code ligados', 'hooks do Claude Code ausentes');
  const raiz = process.cwd();
  linha(existsSync(join(raiz, 'docs', 'knowledge')), 'este projeto tem memória (docs/knowledge/)', 'este projeto ainda não tem memória: rode "iniciar"');
  linha(existsSync(join(raiz, 'AGENTS.md')) && readFileSync(join(raiz, 'AGENTS.md'), 'utf8').includes(INI), 'AGENTS.md com o bloco do kit', 'AGENTS.md sem o bloco do kit');
  const rg = spawnSync('rg', ['--version'], { encoding: 'utf8' });
  linha(rg.status === 0, 'ripgrep (rg) disponível', 'ripgrep ausente: a busca fica mais cara (https://github.com/BurntSushi/ripgrep)');
  const gf = spawnSync('graphify', ['--help'], { encoding: 'utf8' });
  console.log(gf.status === 0 ? '  ✓ graphify disponível' : '  · graphify não instalado (opcional)');
  console.log('');
}

function remover() {
  console.log('\nRemovendo o kit do seu usuário (as notas em docs/knowledge/ dos projetos ficam)\n');
  if (existsSync(join(HOME, '.claude'))) node(join(KIT, 'instalar.mjs'), ['--remover']);
  for (const ia of IAS) if (ia.regras) tiraBloco(join(HOME, ia.regras));
  rmSync(CASA, { recursive: true, force: true });
  ok('ferramentas e regras globais removidas');
  pula('skills copiadas ficam nas pastas de skills; apague as que não quiser');
}

const [cmd, ...resto] = process.argv.slice(2);
const ferramenta = (rel, pre = []) => process.exit(node(join(existsSync(join(CASA, 'tools')) ? CASA : KIT, 'tools', ...rel), [...pre, ...resto]));

switch (cmd) {
  case 'instalar': instalar(resto); break;
  case 'iniciar': iniciar(); break;
  case 'lembrar': ferramenta(['knowledge', 'remember.mjs']); break;
  case 'buscar': ferramenta(['knowledge', 'akita.mjs'], ['search']); break;
  case 'diagnostico': case 'diagnóstico': case 'doctor': diagnostico(); break;
  case 'remover': remover(); break;
  default:
    console.log(`kit-memoria-ia: memória de projeto e economia de token para IAs de código

  node kit.mjs instalar          uma vez por computador
  node kit.mjs iniciar           em cada projeto (na pasta dele)
  node kit.mjs lembrar "<tema>"  nota nova (--type session | decision | licao | misc)
  node kit.mjs buscar "<tema>"   procura no acervo
  node kit.mjs diagnostico       o que está instalado e o que falta
  node kit.mjs remover           tira do seu usuário

Depois de instalar, use a IA normalmente. Ela lê o AGENTS.md e cuida da memória.`);
}
