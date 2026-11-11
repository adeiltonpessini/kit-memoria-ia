#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
// Lint de "cara de IA" em texto que gente lê. Só stdlib. Uso:
//   node $HOME/.kit-memoria-ia/tools/texto/cara-de-ia.mjs <arquivo|pasta> [...]   (exit 1 se achar algo)
// Marca por linha: travessão, muleta de transição, jargão vazio, tríade, emoji em título,
// rodapé de IA, inglês de interface. Falso positivo justificado: comentário `cara-de-ia: ok`
// na mesma linha. Skill: .claude/skills/sem-cara-de-ia/SKILL.md
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const EXT = new Set(['.md', '.mdx', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.json', '.txt', '.html', '.yml', '.yaml', '.go'])
const IGNORA = /(^|[\\/])(node_modules|\.next|dist|build|\.git|graphify-out|coverage|package-lock\.json|pnpm-lock\.yaml)([\\/]|$)|\.generated\./

const REGRAS = [
  ['travessão como aposto', /\s—\s|\s–\s/u],
  ['muleta de transição', /(^|[^\p{L}])(Além disso|Vale ressaltar|Vale lembrar|É importante (ressaltar|notar|destacar)|Em resumo|Em suma|Note que|Nota:|Importante:|Dito isso|Por fim|Nesse sentido|Ou seja,)/iu],
  ['jargão vazio', /\b(robust[oa]s?|escal[áa]ve(l|is)|sem fric[çc][ãa]o|de ponta a ponta|poderos[oa]s?|alavanc(ar|a|amos)|potencializ(ar|a)|seamless|otimiz(e|a|ar) (sua|seu|a|o) (experi[êe]ncia|jornada|fluxo)|experi[êe]ncia (do|de) (usu[áa]rio|cliente) (incr[íi]vel|[úu]nica|perfeita)|jornada do (cliente|usu[áa]rio)|solu[çc][ãa]o completa|tudo em um)\b/i],
  ['"não é só X, é Y"', /\b(n[ãa]o [ée] (s[óo]|apenas) [^.;]{2,40}, ([ée]|mas) )|(mais (do )?que (um|uma) [^.;]{2,30}:)/i],
  ['tríade perfeita', /\b\w+, \w+ e \w+\.(\s|$)/],
  ['emoji em título', /^#{1,6} .*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u],
  ['rodapé de IA', /Generated with \[?Claude Code|🤖|Co-Authored-By: Claude|Powered by (AI|IA)|gerado por IA/i],
  ['inglês de interface', /["'`>](Dashboard|Features|Pricing|Get started|Learn more|Sign up|Sign in|Settings|Overview)["'`<]/],
  ['abertura retórica', /^(Vamos |Imagine |Já pensou |Você sabia |Quer )/m],
  ['promessa vaga', /\b(em breve|e muito mais|entre outros recursos)\b/i],
]

function arquivos(p, out = []) {
  if (IGNORA.test(p)) return out
  const st = statSync(p)
  if (st.isDirectory()) { for (const f of readdirSync(p)) arquivos(join(p, f), out); return out }
  if (EXT.has(extname(p))) out.push(p)
  return out
}

const alvos = process.argv.slice(2)
if (!alvos.length) { console.error('uso: node $HOME/.kit-memoria-ia/tools/texto/cara-de-ia.mjs <arquivo|pasta> [...]'); process.exit(2) }

let achados = 0
const porRegra = new Map()
for (const alvo of alvos) for (const f of arquivos(alvo)) {
  const linhas = readFileSync(f, 'utf8').split(/\r?\n/)
  linhas.forEach((l, i) => {
    if (/cara-de-ia: ok/.test(l)) return
    for (const [nome, re] of REGRAS) {
      if (re.test(l)) {
        achados++
        porRegra.set(nome, (porRegra.get(nome) || 0) + 1)
        console.log(`${f}:${i + 1}: [${nome}] ${l.trim().slice(0, 140)}`)
        break
      }
    }
  })
}
if (achados) {
  console.log(`\n${achados} achado(s):`)
  for (const [n, c] of [...porRegra].sort((a, b) => b[1] - a[1])) console.log(`  ${String(c).padStart(4)}  ${n}`)
  process.exit(1)
}
console.log('sem cara de IA nos arquivos lidos')
