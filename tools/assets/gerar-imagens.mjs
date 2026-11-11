#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
//
// Gera as imagens do README em assets/, em versão clara e escura (SVG com CSS e SMIL,
// sem script; o GitHub mostra animado dentro de <img>). Rode: node tools/assets/gerar-imagens.mjs

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SAIDA = join(RAIZ, 'assets');
mkdirSync(SAIDA, { recursive: true });

// Paleta sóbria: papel, tinta, fio fino e um acento só.
const TEMAS = {
  claro: {
    fundo: '#f5f3ee', folha: '#ffffff', borda: '#d3cfc4', fio: '#e3e0d7',
    texto: '#17171a', suave: '#5d5b55', apagado: '#8a867d', acento: '#c93f22', ok: '#11734b',
    term: '#17171a', termTexto: '#ece9e2', termApagado: '#9a968d', termOk: '#3fb67f', termAcento: '#e8714f',
  },
  escuro: {
    fundo: '#161615', folha: '#1e1e1c', borda: '#3a3935', fio: '#2c2b28',
    texto: '#ece9e2', suave: '#b3afa6', apagado: '#8a867d', acento: '#e8714f', ok: '#3fb67f',
    term: '#0f0f0e', termTexto: '#ece9e2', termApagado: '#9a968d', termOk: '#3fb67f', termAcento: '#e8714f',
  },
};
const SANS = "font-family:system-ui,-apple-system,'Segoe UI','Helvetica Neue',Arial,sans-serif";
const MONO = "font-family:ui-monospace,'SF Mono','Cascadia Code',Menlo,Consolas,monospace";
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const moldura = (C, w, h) =>
  `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10" fill="${C.fundo}" stroke="${C.borda}"/>`;

const svg = (w, h, rotulo, estilo, corpo) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${rotulo}">
<style>${estilo}</style>
${corpo}
</svg>`;

// Linha que aparece num instante do ciclo e some no fim. 'digita' revela da esquerda para a direita.
function quadros(nome, ini, ciclo, digita) {
  const p = (s) => ((s / ciclo) * 100).toFixed(2);
  const a = p(ini), b = p(ini + (digita ? 1.0 : 0.25));
  return digita
    ? `@keyframes ${nome}{0%,${a}%{clip-path:inset(0 100% 0 0)}${b}%,94%{clip-path:inset(0 0 0 0);opacity:1}98%,100%{opacity:0}}`
    : `@keyframes ${nome}{0%,${a}%{opacity:0}${b}%,94%{opacity:1}98%,100%{opacity:0}}`;
}

function hero(C) {
  const W = 1280, H = 440, ciclo = 13;
  const linhas = [
    ['$ node kit.mjs instalar', 0.4, true],
    ['✓ Claude Code   skills, agentes, hooks', 1.6],
    ['✓ Codex         skills, regras globais', 1.9],
    ['✓ Gemini CLI    skills, regras globais', 2.2],
    null,
    ['$ node kit.mjs iniciar', 3.4, true],
    ['✓ docs/knowledge/', 4.6],
    ['✓ AGENTS.md com as regras de memória', 4.9],
    ['pronto, abra a sua IA', 5.6],
  ];
  const tx = 704, ty = 140, passo = 29;
  let css = '', txt = '';
  linhas.forEach((l, i) => {
    if (!l) return;
    const [t, ini, digita] = l;
    css += quadros(`l${i}`, ini, ciclo, digita) + `.l${i}{animation:l${i} ${ciclo}s linear infinite}`;
    let conteudo, cor = C.termTexto;
    if (t.startsWith('$ ')) conteudo = `<tspan fill="${C.termApagado}">$</tspan> ${esc(t.slice(2))}`;
    else if (t.startsWith('✓ ')) { conteudo = `<tspan fill="${C.termOk}">✓</tspan> ${esc(t.slice(2))}`; cor = C.termApagado; }
    else { conteudo = esc(t); cor = C.termAcento; }
    txt += `<text class="l${i}" x="${tx}" y="${ty + i * passo}" fill="${cor}" style="${MONO};font-size:17px">${conteudo}</text>`;
  });
  const ias = 'Claude Code · Codex · Gemini CLI · Cursor · Copilot';
  return svg(W, H, 'kit-memoria-ia: a sua IA começa sabendo onde parou',
    `${css}@keyframes pisca{0%,49%{opacity:1}50%,100%{opacity:0}}.cursor{animation:pisca 1.1s steps(1) infinite}`,
    `${moldura(C, W, H)}
<rect x="64" y="96" width="14" height="14" fill="${C.acento}"/>
<text x="90" y="108" fill="${C.suave}" style="${MONO};font-size:14px;letter-spacing:1.5px">MEMÓRIA DE PROJETO PARA IAs DE CÓDIGO</text>
<text x="62" y="186" fill="${C.texto}" style="${SANS};font-size:60px;font-weight:700;letter-spacing:-1.5px">kit-memoria-ia</text>
<text x="64" y="236" fill="${C.texto}" style="${SANS};font-size:24px">A sua IA começa sabendo onde parou.</text>
<text x="64" y="270" fill="${C.suave}" style="${SANS};font-size:19px">Menos token, nada para colar. Markdown no seu repositório.</text>
<line x1="64" y1="318" x2="600" y2="318" stroke="${C.fio}"/>
<text x="64" y="350" fill="${C.suave}" style="${SANS};font-size:15px">${ias}</text>
<text x="64" y="376" fill="${C.apagado}" style="${SANS};font-size:15px">sem banco · sem dependência · funciona offline</text>
<rect x="672" y="56" width="560" height="328" rx="8" fill="${C.term}"/>
<circle cx="696" cy="80" r="5" fill="${C.termApagado}" fill-opacity="0.45"/>
<circle cx="714" cy="80" r="5" fill="${C.termApagado}" fill-opacity="0.45"/>
<circle cx="732" cy="80" r="5" fill="${C.termApagado}" fill-opacity="0.45"/>
<line x1="672" y1="102" x2="1232" y2="102" stroke="${C.termApagado}" stroke-opacity="0.18"/>
${txt}
<rect class="cursor" x="${tx + 22 * 10.3}" y="${ty + 8 * passo - 15}" width="9" height="19" fill="${C.termAcento}"/>`);
}

function fluxo(C) {
  const W = 1280, H = 400, ciclo = 6;
  const xs = [56, 470, 884], cw = 340, cy = 118, ch = 236;
  const doc = (x, y, larg) => larg.map((l, k) =>
    `<rect x="${x}" y="${y + k * 15}" width="${l}" height="6" rx="3" fill="${C.fio}"/>`).join('');
  const passo = (i, titulo, sub, miolo) => `
<rect x="${xs[i]}" y="${cy}" width="${cw}" height="${ch}" rx="8" fill="${C.folha}" stroke="${C.borda}"/>
<text class="n${i}" x="${xs[i] + 24}" y="${cy + 40}" fill="${C.apagado}" style="${MONO};font-size:14px">0${i + 1}</text>
<text x="${xs[i] + 56}" y="${cy + 41}" fill="${C.texto}" style="${SANS};font-size:20px;font-weight:600">${titulo}</text>
<text x="${xs[i] + 24}" y="${cy + 72}" fill="${C.suave}" style="${SANS};font-size:15px">${sub}</text>
<g transform="translate(${xs[i] + 24} ${cy + 96})">
<rect width="292" height="112" rx="6" fill="${C.fundo}" stroke="${C.fio}"/>${miolo}</g>`;
  const seta = (x1, x2) => {
    const y = cy + ch / 2;
    return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${C.borda}"/>
<path d="M${x2 - 7} ${y - 5}L${x2} ${y}L${x2 - 7} ${y + 5}" fill="none" stroke="${C.borda}"/>
<circle r="4" cy="${y}" fill="${C.acento}"><animate attributeName="cx" values="${x1};${x2 - 6}" dur="2.4s" repeatCount="indefinite"/>
<animate attributeName="opacity" values="0;1;1;0" dur="2.4s" repeatCount="indefinite"/></circle>`;
  };
  const destaque = [0, 1, 2].map((i) => {
    const a = i * 33;
    return `@keyframes n${i}{0%,${a}%{fill:${C.apagado}}${a + 5}%,${a + 28}%{fill:${C.acento}}${a + 33}%,100%{fill:${C.apagado}}}.n${i}{animation:n${i} ${ciclo}s ease-in-out infinite}`;
  }).join('');
  return svg(W, H, 'Fim da sessão, handoff no repositório, sessão nova lê só o TL;DR',
    `${destaque}@keyframes esc{0%{width:0}55%,100%{width:170px}}.esc{animation:esc 3s ease-out infinite}`,
    `${moldura(C, W, H)}
<text x="56" y="62" fill="${C.texto}" style="${SANS};font-size:24px;font-weight:600">Como a memória passa de uma sessão para a outra</text>
<text x="56" y="92" fill="${C.suave}" style="${SANS};font-size:16px">Tudo em arquivo no seu repositório, versionado no git junto com o código.</text>
${passo(0, 'Fim da sessão', 'a IA escreve o handoff',
  `<text x="16" y="30" fill="${C.suave}" style="${MONO};font-size:14px">&gt; faz o handoff</text>
<rect class="esc" x="16" y="48" height="6" rx="3" fill="${C.texto}"/>${doc(16, 66, [230, 180])}`)}
${passo(1, 'Handoff no repo', 'docs/knowledge/sessions/',
  `<text x="16" y="26" fill="${C.apagado}" style="${MONO};font-size:13px">chat-2026-11-11-login.md</text>
<line x1="16" y1="38" x2="276" y2="38" stroke="${C.fio}"/>
<rect x="12" y="46" width="3" height="22" fill="${C.acento}"/>
<text x="24" y="62" fill="${C.texto}" style="${MONO};font-size:14px;font-weight:600"># TL;DR</text>
<text x="96" y="62" fill="${C.suave}" style="${MONO};font-size:13px">estado e próximo passo</text>${doc(16, 82, [240, 190])}`)}
${passo(2, 'Sessão nova', 'lê só o TL;DR, não o histórico',
  `<text x="16" y="30" fill="${C.ok}" style="${MONO};font-size:14px">✓ contexto carregado</text>
<text x="16" y="56" fill="${C.apagado}" style="${MONO};font-size:13px">até 3.000 caracteres</text>
<text x="16" y="88" fill="${C.texto}" style="${SANS};font-size:15px">e continua de onde parou</text>`)}
${seta(xs[0] + cw + 10, xs[1] - 10)}
${seta(xs[1] + cw + 10, xs[2] - 10)}`);
}

function habitos(C) {
  const W = 1280, H = 380;
  const xs = [56, 470, 884], y0 = 110, w = 340, h = 240;
  const cartao = (i, titulo, l1, l2, desenho) => `
<rect x="${xs[i]}" y="${y0}" width="${w}" height="${h}" rx="8" fill="${C.folha}" stroke="${C.borda}"/>
<g transform="translate(${xs[i]} ${y0})">${desenho}</g>
<line x1="${xs[i] + 24}" y1="${y0 + 150}" x2="${xs[i] + w - 24}" y2="${y0 + 150}" stroke="${C.fio}"/>
<text x="${xs[i] + 24}" y="${y0 + 182}" fill="${C.texto}" style="${SANS};font-size:19px;font-weight:600">${titulo}</text>
<text x="${xs[i] + 24}" y="${y0 + 208}" fill="${C.suave}" style="${SANS};font-size:15px">${l1}</text>
<text x="${xs[i] + 24}" y="${y0 + 228}" fill="${C.suave}" style="${SANS};font-size:15px">${l2}</text>`;
  // 1. várias sessões empilhadas; só a de cima tem o resumo marcado
  const pilha = [2, 1, 0].map((k) => `<rect x="${86 + k * 12}" y="${24 + k * 10}" width="168" height="92" rx="5" fill="${C.folha}" stroke="${k ? C.fio : C.borda}"/>`).join('')
    + `<rect x="98" y="38" width="3" height="18" fill="${C.acento}"/><rect x="108" y="44" width="90" height="6" rx="3" fill="${C.texto}"/>
<rect x="98" y="66" width="140" height="6" rx="3" fill="${C.fio}"/><rect x="98" y="80" width="120" height="6" rx="3" fill="${C.fio}"/><rect x="98" y="94" width="130" height="6" rx="3" fill="${C.fio}"/>`;
  // 2. arquivo longo; a busca acha uma linha e só ela é lida
  const larg = [150, 110, 180, 130, 160, 100, 170, 140];
  const busca = `<rect x="70" y="20" width="200" height="118" rx="5" fill="${C.folha}" stroke="${C.borda}"/>`
    + larg.map((l, k) => `<rect x="84" y="${32 + k * 13}" width="${l}" height="5" rx="2.5" fill="${C.fio}"/>`).join('')
    + `<rect x="78" y="0" width="184" height="13" rx="2" fill="none" stroke="${C.acento}" stroke-width="1.5">
<animate attributeName="y" values="28;28;80;80;28" keyTimes="0;.15;.45;.85;1" dur="4.5s" repeatCount="indefinite"/></rect>`;
  // 3. erro vira regra
  const regra = `<circle cx="112" cy="72" r="26" fill="none" stroke="${C.borda}" stroke-width="1.5"/>
<path d="M102 62l20 20M122 62l-20 20" stroke="${C.apagado}" stroke-width="2" stroke-linecap="round"/>
<line x1="148" y1="72" x2="192" y2="72" stroke="${C.borda}"/><path d="M186 67l6 5-6 5" fill="none" stroke="${C.borda}"/>
<rect x="206" y="36" width="78" height="72" rx="5" fill="${C.folha}" stroke="${C.borda}"/>
<rect x="206" y="36" width="3" height="72" fill="${C.acento}"/>
<rect x="220" y="52" width="50" height="5" rx="2.5" fill="${C.texto}"/>
<rect x="220" y="66" width="44" height="5" rx="2.5" fill="${C.fio}"/><rect x="220" y="80" width="52" height="5" rx="2.5" fill="${C.fio}"/>`;
  return svg(W, H, 'Começa pelo resumo, busca antes de ler, erro não se repete', '',
    `${moldura(C, W, H)}
<text x="56" y="62" fill="${C.texto}" style="${SANS};font-size:24px;font-weight:600">De onde vem a economia</text>
<text x="56" y="90" fill="${C.suave}" style="${SANS};font-size:16px">Três hábitos que o kit põe na sua IA.</text>
${cartao(0, 'Começa pelo resumo', 'lê o TL;DR da última sessão,', 'não o histórico inteiro', pilha)}
${cartao(1, 'Busca antes de ler', 'rg acha a linha e a IA lê só a', 'fatia, não o arquivo todo', busca)}
${cartao(2, 'Erro não se repete', 'o que custou caro vira regra', 'escrita onde a próxima sessão lê', regra)}`);
}

rmSync(join(SAIDA, 'ias.svg'), { force: true });
for (const [tema, C] of Object.entries(TEMAS)) {
  for (const [nome, fn] of Object.entries({ hero, fluxo, habitos })) {
    const arq = `${nome}-${tema}.svg`;
    writeFileSync(join(SAIDA, arq), fn(C).replace(/\n\s+/g, '\n') + '\n');
    console.log(`assets/${arq}`);
  }
}
