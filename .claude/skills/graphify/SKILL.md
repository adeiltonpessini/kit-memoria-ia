---
name: graphify
description: "Use for any question about a codebase, its architecture, file relationships, or project content — especially when graphify-out/ exists, where the question should be treated as a graphify query first. Turns any input (code, docs, papers, images, videos) into a persistent knowledge graph with god nodes, community detection, and query/path/explain tools."
---

> Versão enxuta da skill do [graphify](https://github.com/safishamsi/graphify) (MIT, Copyright (c) 2026 Safi Shamsi; texto em `LICENSES/MIT-graphify.txt` na raiz do kit).

# /graphify

Turn any folder of files (code, docs, papers, images, video) into a navigable knowledge graph: community detection, an honest audit trail (EXTRACTED/INFERRED/AMBIGUOUS), and three outputs — interactive HTML, GraphRAG-ready JSON, and a plain-language GRAPH_REPORT.md. Persistent across sessions.

This file is the core. Anything not here lives in `references/` — see the map at the bottom and load only the one file you need.

## Decide first: graph or grep?

| Question shape | Tool |
|---|---|
| "what breaks if I change X", "who depends on X", "how does A reach B", "what are the hubs", broad orientation in an unfamiliar area | **the graph** (commands below) |
| "where is X", exact string/symbol lookup | `rg` |
| structural code pattern ("every call passing Y") | `ast-grep` |

Topology → graph. Text → `rg`. Never rebuild a graph to answer a text question.

## Fast path — existing graph (check this before anything else)

Check whether `graphify-out/graph.json` exists, relative to the **current working directory** (the project root where you run commands). If it exists AND the user's request is a natural-language question about the codebase (e.g. "How does X work?", "What calls Y?", "Trace the data flow through Z") and NOT an explicit rebuild command (`--update`, `--cluster-only`, or a bare path/URL that implies fresh extraction): **skip the build pipeline entirely** and run `graphify query "<question>"` immediately (full flow: `references/query.md`). Do not run detect. Do not check corpus size. Do not ask the user to narrow. The graph is already built — use it.

`/graphify --help` or `-h` with no other arguments: print the `## Usage` block of `references/usage-flags.md` verbatim and stop. Run no commands, detect nothing, do not default the path to `.`.

Anything that really does need a (re)build → `references/pipeline-build.md`, and follow its steps in order.

## Commands

| Goal | Command |
|---|---|
| Answer a question from the graph | `graphify query "<question>"` — `--dfs` to trace one chain, `--budget N` to cap output (default 2000) |
| Impact / reverse dependencies of X | `graphify affected "X" [--depth N] [--relation R]` |
| How does A reach B | `graphify path "A" "B"` |
| What is X, and what touches it | `graphify explain "X"` |
| Architectural hubs | `graphify god-nodes [--top N]` |
| Refresh the graph after code changes (AST only, no LLM, free) | `graphify update .` |
| Recluster an existing graph + regenerate report | `graphify cluster-only .` |
| Build a graph that does not exist yet | full pipeline — `references/pipeline-build.md` |

Query discipline (details in `references/query.md`):

- **Expand the question against the graph's own vocabulary first** (query.md Step 0, REQUIRED). Node matching is case-folded substring + IDF — no stemming, no synonyms, no cross-language. A wording mismatch returns 0 hits and the answer collapses to noise. Pick only tokens that exist in the graph; never invent one.
- Answer using **only** what the graph output contains, and quote `source_location` when citing a fact. If the graph lacks the information, say so — do not hallucinate edges.
- Save the answer back (`graphify save-result … --outcome useful|dead_end|corrected`) so the next run learns. At the start of graph work, `graphify reflect --if-stale` then read `graphify-out/reflections/LESSONS.md`.
- If the `graphify` CLI is unavailable, fall back to the inline NetworkX traversal in query.md.

## Gotchas that break this skill if ignored

- **No API key. Ever.** graphify does not read `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`. Code is extracted structurally (AST, no LLM, no key), so the common `/graphify .` on a repo needs nothing. Semantic extraction (docs/papers/images only) uses Gemini **if** `GEMINI_API_KEY`/`GOOGLE_API_KEY` is already set, otherwise the host agent itself is the LLM. Prompting for, waiting on, or stopping because of a missing key is a misread of this skill.
- **Semantic subagents must be `subagent_type="general-purpose"`.** `Explore` is read-only, cannot write chunk files, and silently drops the extraction. Dispatch every chunk in **one** message or they run sequentially and the parallelism is lost.
- **Code-only corpus:** skip semantic extraction, but first write the empty `graphify-out/.graphify_semantic.json` — the merge reads it unconditionally and otherwise dies with `FileNotFoundError`.
- **Substitute the placeholders** (`INPUT_PATH`, `IS_DIRECTED`, `SPEC_PATH`, `LABELS_DICT`, absolute `CHUNK_PATH`) in every block. `SPEC_PATH` must be the same absolute path in the cache-check and cache-save steps, or entries are written where the next run will not look (#1939).
- **Never clobber a good graph.** An empty extraction aborts before any write, and `to_json` refuses to shrink `graph.json` (#479) — re-run with `--force` only when the shrink is intentional (files were deleted).
- **`cluster-only` is self-contained** — it regenerates report/json/html by itself. Do not re-run the later pipeline steps after it; they read intermediates that cleanup already deleted.
- **HTML viz above 5,000 nodes:** warn the user first (the exporter auto-aggregates to a community view).
- **`--obsidian` only when explicitly asked** — it writes one file per node.

## Interpreter guard for subcommands

Before running any subcommand (`--update`, `--cluster-only`, `query`, `path`, `explain`, `add`), check that `.graphify_python` exists. If it's missing (e.g. user deleted `graphify-out/`), re-resolve the interpreter first:

```bash
if [ ! -f graphify-out/.graphify_python ]; then
    GRAPHIFY_BIN=$(which graphify 2>/dev/null)
    if [ -n "$GRAPHIFY_BIN" ]; then
        PYTHON=$(head -1 "$GRAPHIFY_BIN" | tr -d '#!')
        case "$PYTHON" in *[!a-zA-Z0-9/_.@-]*) PYTHON="python3" ;; esac
    else
        PYTHON="python3"
    fi
    mkdir -p graphify-out
    "$PYTHON" -c "import sys; open('graphify-out/.graphify_python', 'w', encoding='utf-8').write(sys.executable)"
fi
```

Every bash block in the references uses `$(cat graphify-out/.graphify_python)` as the interpreter.

## Honesty Rules

- Never invent an edge. If unsure, use AMBIGUOUS.
- Never skip the corpus check warning.
- Always show token cost in the report.
- Never hide cohesion scores behind symbols - show the raw number.
- Never run HTML viz on a graph with more than 5,000 nodes without warning the user.

## Reference map — load only what the task needs

| Topic | File |
|---|---|
| Full command/flag list, `--help` output, CLI surface beyond the slash command | `references/usage-flags.md` |
| Full build pipeline Steps 0-9: install + interpreter detection, file detection, AST + semantic extraction, build/cluster/analyze, graph health check, community labels, HTML/Obsidian, manifest + cost + cleanup + final report | `references/pipeline-build.md` |
| `query` / `path` / `explain`: vocabulary expansion, BFS vs DFS, `--budget`, inline NetworkX fallback, `save-result` feedback loop, LESSONS.md | `references/query.md` |
| `--update` (incremental re-extraction, pruning, graph diff) and `--cluster-only` | `references/update.md` |
| Exact extraction subagent prompt: JSON schema, node-ID rules, confidence rubric, frontmatter, hyperedges, vision rules | `references/extraction-spec.md` |
| Exports and benchmark: wiki, Neo4j, FalkorDB, SVG, GraphML, MCP server, token-reduction benchmark | `references/exports.md` |
| GitHub URL clone, cross-repo merge, monorepo flow | `references/github-and-merge.md` |
| Video/audio transcription (Whisper) before extraction | `references/transcribe.md` |
| `/graphify add <url>` and `--watch` | `references/add-watch.md` |
| post-commit auto-rebuild hook, native CLAUDE.md integration | `references/hooks.md` |
