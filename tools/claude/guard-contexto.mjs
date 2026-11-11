#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
// guard-contexto.mjs — hook PreToolUse: barra leituras que envenenam o contexto.
//
// Motivo (medido em 27/07 nos transcripts): os maiores dumps da semana foram leituras
// dos PRÓPRIOS transcripts de subagente (.output) e de sessão (.jsonl) — 640k, 591k,
// 517k chars cada. Um dump desses entra no contexto E É RE-LIDO em toda requisição
// seguinte da sessão; sozinho custa dezenas de milhões de tokens de cache read.
//
// Segunda medição (04/08, `node $HOME/.claude/kit/tools/claude/quota.mjs 7`): os transcripts sumiram do topo,
// mas os 3 maiores dumps da semana viraram Read de arquivo no scratchpad (517k/487k/483k
// chars) — arquivo que o próprio Claude escreveu e leu de volta INTEIRO. Daí a regra 3.
//
// Decisão: docs/knowledge/decisions/2026-07-27-economia-token-contexto-fixo.md
// Zero deps, cross-platform. Sai 0 sempre; a decisão vai no JSON do stdout.

import { statSync, openSync, fstatSync, readSync, closeSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";

// Read sem `limit` em arquivo acima disso é barrado (~16k tokens). Ajuste por env.
const MAX_READ_BYTES = Number(process.env.CLAUDE_GUARD_MAX_READ_KB || 64) * 1024;
// Formatos que o Read não despeja como texto (imagem entra como anexo, PDF exige `pages`).
const BINARIO_OK = /\.(png|jpe?g|gif|webp|bmp|svg|pdf)$/i;

// --- regra 5: screenshot pesado ----------------------------------------------------
// BINARIO_OK isenta imagem da regra 3, e era um buraco: a imagem NÃO vira texto, mas vira
// anexo que fica no contexto e é re-lido em toda requisição seguinte igual. Medido 07/08
// num projeto real: os CINCO maiores dumps da semana eram screenshot (501k/365k/358k/
// 354k/337k chars) — nenhum passava por regra nenhuma. Não é deny: às vezes o veredito é
// mesmo visual. É `ask`, para a decisão ser consciente.
const IMG_MAX_BYTES = Number(process.env.CLAUDE_GUARD_MAX_IMG_KB || 150) * 1024;
const IMAGEM = /\.(png|jpe?g|webp|gif|bmp)$/i;
// Diretórios de artefato de teste: sempre pergunta, mesmo se a imagem for pequena.
const IMG_TESTE = /\/(test-results|playwright-report|\.playwright-mcp|screenshots?|__snapshots__)\//i;

// --- regra 4: gate de sessão longa -------------------------------------------------
// A métrica NÃO é "contexto atual": com autoCompact em 110k o contexto nunca cresce
// muito, e mesmo assim a sessão faefb586 fez 1.234 requisições relendo ~496k cada =
// 41% do gasto de 7 dias sozinha. O que estoura a cota é o ACUMULADO da sessão.
// Por isso somamos cache-read de TODAS as requisições da sessão e travamos no teto.
// Medido 04/08: sessão normal ~60 M acumulados; a runaway, ~612 M. Teto em 150 M.
const GATE_M = Number(process.env.CLAUDE_GATE_MAX_M ?? 150);   // 0 desliga
const GATE_OFF = join(homedir(), ".claude", "gate-sessao.off");
const GATE_ESTADO = join(tmpdir(), "guard-gate-sessao.json");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", c => (raw += c));
process.stdin.on("end", () => {
  let ev = {};
  try { ev = JSON.parse(raw || "{}"); } catch { return ok(); }

  const tool = ev.tool_name || "";
  const i = ev.tool_input || {};

  // 4) gate de sessão: vale para QUALQUER tool, por isso vem antes do despacho.
  // ÚNICA exceção: gravar o handoff. Sem ela o gate vira destruidor de contexto — trava
  // tudo e manda dar /clear numa sessão que ninguém conseguiu salvar. Foi o que aconteceu
  // em 04–09/08. Escrever o handoff custa ~0 de contexto e é o que preserva o trabalho.
  const ehHandoff = /^(Write|Edit)$/.test(tool) &&
    /docs\/knowledge\/sessions\//i.test(String(i.file_path || i.path || "").replace(/\\/g, "/"));
  const gasto = ehHandoff ? null : gateEstourado(ev);
  if (gasto) return denyGate(gasto);

  // 1) transcript de subagente: .../tasks/<id>.output   2) transcript de sessão: .claude/projects/**.jsonl
  const AGENTE = /\/tasks\/[^/\s]*\.output\b/i;
  const SESSAO = /\.claude\/projects\/[^\s]*\.jsonl\b/i;
  const DESPEJA = /(^|[\s;&|(])(cat|type|head|tail|more|Get-Content|gc)([\s]|$)/i;

  let alvo = "";
  if (tool === "Read") {
    alvo = String(i.file_path || i.path || "").replace(/\\/g, "/");
    // 5) screenshot: pergunta antes de anexar (ver comentário do IMG_MAX_BYTES).
    if (IMAGEM.test(alvo)) {
      let bytes = 0;
      try { bytes = statSync(i.file_path || i.path || "").size; } catch { bytes = 0; }
      if (bytes > IMG_MAX_BYTES || IMG_TESTE.test(alvo)) return perguntarImagem(alvo, bytes);
      return ok();
    }
    // 3) arquivo grande lido INTEIRO (sem limit/pages): entra de uma vez e é re-lido
    // em toda requisição seguinte. Com `limit` o Read já vem fatiado — deixa passar.
    if (!i.limit && !i.pages && !BINARIO_OK.test(alvo)) {
      let bytes = 0;
      try { bytes = statSync(i.file_path || i.path || "").size; } catch { bytes = 0; }
      if (bytes > MAX_READ_BYTES) return denyGrande(alvo, bytes);
    }
  } else if (tool === "Bash" || tool === "PowerShell") {
    // Só bloqueia quando o DESPEJO é NO transcript: avalia segmento a segmento
    // (senão `cat outro.txt; ls *.jsonl` viraria falso positivo e o guard seria desligado).
    const cmd = String(i.command || "").replace(/\\/g, "/");
    const seg = cmd.split(/\n|;|&&|\|\||\|/).find(s => DESPEJA.test(s) && (AGENTE.test(s) || SESSAO.test(s)));
    if (!seg) return ok();
    alvo = seg;
  } else {
    return ok();
  }

  const ehTranscriptAgente = AGENTE.test(alvo);
  const ehTranscriptSessao = SESSAO.test(alvo);
  if (!ehTranscriptAgente && !ehTranscriptSessao) return ok();

  const oque = ehTranscriptAgente ? "transcript de SUBAGENTE" : "transcript de SESSÃO";
  deny(
    `BLOQUEADO (guard de contexto): isso é um ${oque} — arquivo enorme que entraria inteiro ` +
    `no contexto e seria RE-LIDO em toda requisição seguinte (os maiores dumps da semana ` +
    `passada vieram daí: 640k/591k/517k chars). ` +
    `Faça em vez disso: (a) o resultado do subagente já chega na notificação de tarefa — use-o; ` +
    `(b) para investigar, agregue com um script node/rg que imprima SÓ o resumo (ex.: ` +
    `tools/claude/*.mjs), nunca o conteúdo bruto.`
  );
});

// Soma INCREMENTAL do custo da sessão: guarda o offset já lido do transcript e, a cada
// chamada, processa só os bytes novos (normalmente alguns KB). Sem isso o hook releria o
// transcript inteiro a cada tool call — o guard viraria o próprio gargalo.
// Devolve {tokens, reqs} se estourou o teto, senão null. Falha SEMPRE aberto.
function gateEstourado(ev) {
  if (!GATE_M || existsSync(GATE_OFF)) return null;
  const caminho = ev.transcript_path;
  if (!caminho) return null;
  const sessao = ev.session_id || "sem-id";

  let fd;
  try {
    const estado = lerJson(GATE_ESTADO);
    // `/clear` abre sessão nova (session_id novo) → entrada zerada. É esse o alívio.
    const s = estado[sessao] || { off: 0, tokens: 0, reqs: 0 };

    fd = openSync(caminho, "r");
    const { size } = fstatSync(fd);
    if (size < s.off) { s.off = 0; s.tokens = 0; s.reqs = 0; }  // transcript rotacionado
    if (size > s.off) {
      const buf = Buffer.alloc(size - s.off);
      readSync(fd, buf, 0, buf.length, s.off);
      const txt = buf.toString("utf8");
      // só até a última quebra de linha: a cauda pode ser uma linha ainda sendo escrita
      const fim = txt.lastIndexOf("\n");
      if (fim >= 0) {
        for (const l of txt.slice(0, fim).split("\n")) {
          if (!l.startsWith("{") || !l.includes("usage")) continue;
          try {
            const j = JSON.parse(l);
            if (j.type !== "assistant" || !j.message?.usage || j.isSidechain) continue;
            const u = j.message.usage;
            s.tokens += (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.input_tokens || 0);
            s.reqs += 1;
          } catch {}
        }
        s.off += Buffer.byteLength(txt.slice(0, fim + 1), "utf8");
      }
    }

    estado[sessao] = s;
    const chaves = Object.keys(estado);
    if (chaves.length > 20) for (const k of chaves.slice(0, chaves.length - 20)) delete estado[k];
    try { writeFileSync(GATE_ESTADO, JSON.stringify(estado)); } catch {}

    return s.tokens > GATE_M * 1e6 ? { ...s, sessao } : null;
  } catch { return null; } finally { if (fd !== undefined) try { closeSync(fd); } catch {} }
}
function lerJson(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return {}; } }

// MODO SÓ-AVISO: nada aqui nega nem pergunta mais — "economia sem me
// atrapalhar". Cada regra vira dica curta ao modelo; o gate avisa UMA vez por sessão.
function aviso(paraModelo, paraDono) {
  const out = { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", additionalContext: paraModelo } };
  if (paraDono) out.systemMessage = paraDono;
  process.stdout.write(JSON.stringify(out));
}
function denyGate(s) {
  const M = Math.round(s.tokens / 1e6);
  const marca = join(tmpdir(), `guard-gate-avisado-${String(s.sessao || "x").replace(/[^\w-]/g, "")}`);
  if (existsSync(marca)) return ok();
  try { writeFileSync(marca, String(Date.now())); } catch {}
  aviso(
    `Sessão longa: ${M} M de tokens re-lidos em ${s.reqs} requisições. Não pare nada por isso. ` +
    `Num ponto natural de pausa, grave o handoff em docs/knowledge/sessions/ e sugira ao usuário um /clear.`,
    `🟡 sessão em ${M} M de tokens re-lidos — quando der, /clear (aviso único, nada bloqueado)`,
  );
}

function ok() { process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } })); }
function perguntarImagem(alvo, bytes) {
  aviso(`Screenshot de ${Math.round(bytes / 1024)} KB fica no contexto e é re-lido a cada requisição — ` +
    `se o veredito não é visual, prefira a saída textual do teste.`);
}
function denyGrande(alvo, bytes) {
  aviso(`${alvo.split("/").pop()} tem ${Math.round(bytes / 1024)} KB e foi lido sem limit — da próxima vez ` +
    `grepe a fatia e use limit/offset.`);
}
function deny(motivo) {
  aviso("Isso é transcript (enorme). Prefira agregar por script e imprimir só o resumo.");
}
