---
name: busca-eficiente
description: Use sempre que for procurar algo no repo ("onde está X", "como usamos Y", "o que quebra se mudar Z") antes de ler arquivo inteiro. Playbook econômico: ripgrep + leitura da fatia mínima, ast-grep para padrão de código, fd para arquivo, akita para o acervo.
---

# busca-eficiente — método Akita no talo (grep > ler tudo)

Princípio: **grepe a fatia → leia só ela.** Nunca despeje arquivo/repo inteiro no contexto.
Cada linha trazida custa token; busca afiada é a maior economia que existe.

## Antes de tudo: a pergunta é de TEXTO ou de ESTRUTURA?
- **Texto** (string, valor literal, config, nome de evento) → escada de `rg` abaixo.
- **Estrutura de código** ("toda função que publica em `cmd`", "todo handler sem o middleware de auth") → `ast-grep`: `sg -p 'publish($$$)' -l go` (ex.: `sg -p '$C.Publish($$$)' -l go`).
- Regra prática: **se o plano é abrir 3+ arquivos "para entender", pare e grepe a fatia.** O grafo graphify não está instalado neste repo.

## Escada de busca (do mais barato pro mais caro)
1. **Existe / onde?** → `files_with_matches` (só caminhos), não leia conteúdo ainda.
   `rg -l "termo"` · tool Grep `output_mode:"files_with_matches"`.
2. **Quantos / vale a pena?** → `rg -c "termo"` (contagem por arquivo).
3. **Ver a fatia** → `rg -n -C 3 "termo" arquivo` (3 linhas de contexto, com nº de linha).
   Só então `Read` com `offset`/`limit` na linha que o grep apontou — nunca o arquivo todo.

## Flags que mais economizam
- `-l` (só nomes) / `-c` (contagem) — triagem antes de puxar conteúdo.
- `-g '!{node_modules,dist,.git,build,.dart_tool,__pycache__}'` — corte ruído (build gera MB).
- `-t go` / `-t js` / `--type sql` — restrinja a linguagem em vez de varrer tudo.
- `-o` — só o trecho casado (ex.: extrair nomes de função/rota sem a linha inteira).
- `-w` palavra inteira, `-F` literal (regex off), `-i` case-insensitive só quando preciso.
- `-m 5` — pare após N matches por arquivo (amostra, não exaustivo).
- multiline (`rg -U`) só quando o padrão cruza linha — caro, use por último.

## Arquivos (não conteúdo)
- `fd <padrão>` ou o tool Glob (`**/*.go`). `fd -e sql -e cjs` por extensão.

## Conhecimento curado (markdown grepável, NUNCA RAG)
Escada do mais barato/relevante pro mais caro:
1. **Ranqueado (método Akita, FTS5) — comece por aqui p/ "onde decidimos X":**
   `node $HOME/.claude/kit/tools/knowledge/akita.mjs search "<consulta>" -n 8`
   Full-text BM25 sobre `docs/knowledge/**`, acento-insensível, siglas de linha (G/H/D) OK.
   Devolve caminho + título + snippet ranqueado → aí leia só a fatia com `rg -n`. Zero rede, zero deps,
   zero embedding (FTS5 é lexical, não vetor). Auto-reindexa quando os `.md` mudam.
   (`akita.mjs status` mostra o índice; `--root <dir>` busca em outra árvore; `--rebuild` força.)
2. **Exato/literal:** `rg "<termo>" docs/knowledge/` · handoffs em `sessions/`, decisões em `decisions/`.

## Anti-padrões (não fazer)
- `cat`/`Read` de arquivo inteiro pra "dar uma olhada" → use `rg -n` na fatia.
- `rg` sem filtro de pasta no repo todo (varre `node_modules/`, `dist/` e `build/`).
- Re-ler arquivo/saída já vista nesta sessão.
- Varredura ampla no braço → delegue ao subagente **Explore** (devolve só a conclusão).

Ver também: CLAUDE.md, `docs-context7` (docs de lib), `remember` (anotar achado).
