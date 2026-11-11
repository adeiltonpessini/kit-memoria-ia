#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
// ─────────────────────────────────────────────────────────────────────
// akita.mjs — busca de conhecimento FULL-TEXT RANQUEADA (método Akita:
// "compile-not-retrieve", sem RAG/embeddings). Indexa os .md curados e
// devolve os trechos mais relevantes por BM25 — recall alto, custo ~zero.
//
// Núcleo: FTS5 do SQLite via `node:sqlite` (built-in no Node 22+). NENHUMA
// dependência nova. Complementa o `rg`: rg = exato/código; akita = ranqueado/
// conhecimento (grepe a fatia → leia só ela, mas agora ordenado por relevância).
//
// Uso:
//   node $HOME/.kit-memoria-ia/tools/knowledge/akita.mjs search "timeout no login" [-n 8]
//   node $HOME/.kit-memoria-ia/tools/knowledge/akita.mjs search "linha G H dosagem"   # siglas 1 letra OK
//   node $HOME/.kit-memoria-ia/tools/knowledge/akita.mjs index            # (re)constrói o índice
//   node $HOME/.kit-memoria-ia/tools/knowledge/akita.mjs status           # estado do índice
//   node $HOME/.kit-memoria-ia/tools/knowledge/akita.mjs search "..." --rebuild      # força reindex
//   node $HOME/.kit-memoria-ia/tools/knowledge/akita.mjs search "..." --root docs/agentes
//
// O índice é CACHE regenerável (docs/knowledge/.cache/akita.db, na pasta do projeto) — não vai pro git.
// Auto-(re)indexa quando o conjunto de .md muda (path+mtime+size → pega edição,
// criação, remoção, RENAME e restore de git). Se o cache corromper, se regenera.
// Revisado por 2 cabeças (subagente Claude + codex GPT-5). NODE_NO_WARNINGS=1 cala o aviso.
// ─────────────────────────────────────────────────────────────────────

import { DatabaseSync } from "node:sqlite"
import { readdirSync, readFileSync, statSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { join, sep } from "node:path"
import { createHash } from "node:crypto"

const DEFAULT_ROOTS = ["docs/knowledge"]
const CACHE_DIR = join("docs", "knowledge", ".cache")
const DB_PATH = join(CACHE_DIR, "akita.db")
const NUL = String.fromCharCode(0)

// ---- args ----
const argv = process.argv.slice(2)
const cmd = argv[0] || "search"
const opts = { n: 8, rebuild: false, roots: [] }
const words = []
for (let i = 1; i < argv.length; i++) {
  const a = argv[i]
  if (a === "-n" || a === "--limit") opts.n = Math.max(1, Number(argv[++i]) || 8)
  else if (a === "--rebuild") opts.rebuild = true
  else if (a === "--root") { const r = argv[++i]; if (r) opts.roots.push(r) }
  else words.push(a)
}
const roots = opts.roots.length ? opts.roots : DEFAULT_ROOTS
const query = words.join(" ").trim()

// ---- coleta de .md ----
function walk(dir, out = []) {
  let ents
  try { ents = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git" || e.name === ".cache") continue
      walk(full, out)
    } else if (e.name.toLowerCase().endsWith(".md") && e.name.toLowerCase() !== "readme.md") {
      try { const s = statSync(full); out.push({ path: full, mtime: s.mtimeMs, size: s.size }) } catch { /* ignora */ }
    }
  }
  return out
}
// roots válidos (codex ALTA: --root inexistente NÃO pode zerar/sobrescrever o índice bom)
function validRoots() {
  const ok = []
  for (const r of roots) {
    try { if (statSync(r).isDirectory()) ok.push(r); else console.error(`⚠ root ignorado (não é diretório): ${r}`) }
    catch { console.error(`⚠ root inexistente, ignorado: ${r}`) }
  }
  return ok
}
function collect() {
  const files = []
  for (const r of validRoots()) walk(r, files)
  return files
}
function titleOf(text, path) {
  const m = text.match(/^\s*#\s+(.+?)\s*$/m)        // primeiro H1
  if (m) return m[1]
  const fm = text.match(/^---[\s\S]*?\btitle:\s*(.+?)\s*$[\s\S]*?^---/m) // frontmatter title
  if (fm) return fm[1].replace(/^["']|["']$/g, "")
  return path.split(sep).pop().replace(/\.md$/i, "")
}
// assinatura do conjunto: path+mtime+size ordenado (codex MÉDIA: size pega edição
// que preserva mtime). Pega criação, remoção, RENAME, edição e restore de git.
function signature(files) {
  const lines = files.map((f) => `${f.path}|${Math.round(f.mtime)}|${f.size}`).sort()
  return createHash("sha1").update(lines.join("\n")).digest("hex")
}

// ---- índice ----
function ensureDb() { if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true }) }
function openDb() {
  ensureDb()
  const db = new DatabaseSync(DB_PATH)
  db.exec("PRAGMA busy_timeout = 4000")            // codex MÉDIA: tolera 2 processos reindexando
  return db
}
function dropCache() { for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) { try { if (existsSync(f)) rmSync(f) } catch { /* nada */ } } }
function isCorrupt(e) { return /SQLITE_CORRUPT|SQLITE_NOTADB|not a database|malformed/i.test(e?.message || "") }

// rebuild ATÔMICO: BEGIN IMMEDIATE (pega o write-lock cedo) + ROLLBACK em falha;
// o índice antigo permanece intacto se algo der errado.
function buildIndex(db, files) {
  const sig = signature(files)
  db.exec("BEGIN IMMEDIATE")
  let inserted = 0
  try {
    db.exec(`
      DROP TABLE IF EXISTS docs;
      CREATE VIRTUAL TABLE docs USING fts5(
        path UNINDEXED, title, body,
        tokenize = "unicode61 remove_diacritics 2"
      );
      DROP TABLE IF EXISTS meta;
      CREATE TABLE meta (built_at REAL, n INTEGER, sig TEXT);
    `)
    const ins = db.prepare("INSERT INTO docs(path, title, body) VALUES (?, ?, ?)")
    for (const f of files) {
      let text
      try { text = readFileSync(f.path, "utf8") } catch { continue }
      if (text.includes(NUL)) continue           // pula binário/NUL (codex BAIXA)
      ins.run(f.path, titleOf(text, f.path), text)
      inserted++
    }
    db.prepare("INSERT INTO meta(built_at, n, sig) VALUES (?, ?, ?)").run(Date.now(), inserted, sig)
    db.exec("COMMIT")
  } catch (e) {
    try { db.exec("ROLLBACK") } catch { /* nada */ }
    throw e
  }
  return { n: inserted, sig }
}

function readMeta(db) {
  try { return db.prepare("SELECT built_at, n, sig FROM meta LIMIT 1").get() || null }
  catch { return null }
}
function indexStale(db, files) {
  const row = readMeta(db)
  if (!row) return true
  return row.sig !== signature(files)
}
function refreshIfNeeded(db, files) {
  if (!files.length) return { n: 0, sig: "" }      // defesa: nunca reconstruir/zerar com conjunto vazio
  if (opts.rebuild || indexStale(db, files)) return buildIndex(db, files)
  const row = readMeta(db)
  return { n: row?.n ?? 0, sig: row?.sig ?? "" }
}

// ---- query FTS5 segura (sem injeção de operadores) ----
function ftsQuery(raw) {
  // tokeniza como o índice (unicode, sem acento). 1 char (siglas G/H/D) = token EXATO;
  // ≥2 chars = prefixo (recall). Aspas/operadores do usuário já caíram no split.
  const terms = raw
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/i).map((t) => t.trim()).filter(Boolean)
  if (!terms.length) return null
  const ors = terms.map((t) => (t.length === 1 ? `"${t}"` : `"${t}"*`)).join(" OR ")
  const phrase = terms.length > 1 ? ` OR "${terms.join(" ")}"` : ""
  return `${ors}${phrase}`
}

// ---- comandos ----
function runSearch() {
  const fts = ftsQuery(query)
  if (!fts) { console.error(`nenhum termo buscável em: "${query}" (só pontuação?).`); process.exit(2) }
  const files = collect()
  if (!files.length) { console.error("⚠ nenhum .md nos roots válidos — índice intacto, nada a buscar."); process.exit(2) }
  const db = openDb()
  let rows
  try {
    refreshIfNeeded(db, files)
    rows = db.prepare(`
      SELECT path, title,
             snippet(docs, 2, '«', '»', ' … ', 12) AS snip,
             bm25(docs, 0.0, 10.0, 1.0) AS score
      FROM docs WHERE docs MATCH ?
      ORDER BY score ASC LIMIT ?
    `).all(fts, opts.n)
  } finally { db.close() }
  if (!rows.length) { console.log(`(sem resultados para: ${query})`); return }
  console.log(`# akita — ${rows.length} resultado(s) p/ "${query}" (ranqueado BM25)\n`)
  for (const r of rows) {
    console.log(`• ${r.path}`)
    console.log(`  ${r.title}`)
    console.log(`  ${r.snip.replace(/\s+/g, " ").trim()}\n`)
  }
  console.log(`→ leia só a fatia: rg -n "<termo>" <caminho>  (lazy retrieval)`)
}
function cmdSearch() {
  if (!query) { console.error('uso: akita.mjs search "<consulta>" [-n N] [--root DIR] [--rebuild]'); process.exit(2) }
  try { runSearch() }
  catch (e) {
    if (isCorrupt(e)) { console.error("cache corrompido — regenerando…"); dropCache(); runSearch() } // codex MÉDIA: self-heal
    else { console.error("erro na busca FTS5:", e.message); process.exit(1) }
  }
}

function cmdIndex() {
  const files = collect()
  if (!files.length) { console.error("⚠ nenhum .md encontrado nos roots válidos — índice NÃO foi tocado."); process.exit(2) }
  const db = openDb()
  try { const { n } = buildIndex(db, files); console.log(`✅ índice reconstruído: ${n} páginas (${roots.join(", ")}) → ${DB_PATH}`) }
  finally { db.close() }
}

function cmdStatus() {
  if (!existsSync(DB_PATH)) { console.log("índice ausente — rode: akita.mjs index"); return }
  const db = openDb()
  try {
    const row = readMeta(db)
    const files = collect()
    console.log(`índice: ${DB_PATH}`)
    console.log(`páginas indexadas: ${row?.n ?? "?"} | .md em disco: ${files.length}`)
    console.log(`construído em: ${row?.built_at ? new Date(row.built_at).toISOString() : "?"}`)
    console.log(`estado: ${indexStale(db, files) ? "DESATUALIZADO (search vai reindexar)" : "atualizado"}`)
  } finally { db.close() }
}

if (cmd === "search") cmdSearch()
else if (cmd === "index") cmdIndex()
else if (cmd === "status") cmdStatus()
else { console.error(`comando inválido: ${cmd} (use search|index|status)`); process.exit(2) }
