# Referência: a parte do Claude Code

> Começo rápido no [README](README.md). Aqui está o detalhe de cada hook e script do Claude Code.

Com este kit, cada sessão do Claude começa sabendo onde a anterior parou, sem você colar nada e sem RAG de
embeddings. **Instala uma vez só, no seu usuário (`~/.claude`), e vale para todo projeto.** No projeto fica só
o que é dele: as notas em `docs/knowledge/` e, se quiser, os agentes do time.

## Como funciona

```
 sessão termina ──► hook Stop (handoff-gate)       cobra o handoff UMA vez se a sessão foi grande
                    │                               e ainda não há handoff de hoje
                    ▼
        <projeto>/docs/knowledge/sessions/chat-AAAA-MM-DD-<tema>.md    (# TL;DR primeiro)
                    │
 sessão nova ──► hook SessionStart (session-handoff) injeta só o TL;DR (até 3.000 caracteres)
```

Os scripts ficam em `~/.claude/kit/tools/` e descobrem o projeto aberto pela variável `CLAUDE_PROJECT_DIR`.
**Projeto sem `docs/knowledge/` não recebe nada:** os hooks ficam calados. Assim o kit não atrapalha projeto
que não quer memória.

| Peça | O que faz |
|---|---|
| `knowledge/remember.mjs` | cria decisão, handoff, lição ou nota com o template certo; avisa duplicata |
| `knowledge/akita.mjs` | busca ranqueada (BM25, SQLite do Node) em `docs/knowledge/`; índice em `docs/knowledge/.cache/` |
| `knowledge/session-handoff.mjs` | hook `SessionStart`: injeta o frontmatter e a 1ª seção `#` do handoff mais recente |
| `knowledge/handoff-gate.mjs` | hook `Stop`: acima de 50k de contexto e sem handoff de hoje, bloqueia uma vez e cala |
| `knowledge/aimemory.mjs` | **opcional:** puxa a captura do servidor ai-memory; sem servidor, sai calado |
| `claude/statusline.mjs` | linha de status: modelo, pasta, contexto usado da janela, cota (tem teste) |
| `claude/guard-contexto.mjs` | hook `PreToolUse`, só avisa: leitura grande sem `limit`, despejo de transcript (tem teste) |
| `claude/despacho-gate.mjs` | hook `UserPromptSubmit`: diz quais agentes e skills casam com o pedido; só fala em projeto com `docs/agentes/team-registry.json`; `CLAUDE_DESPACHO=0` desliga |
| `claude/verifica-gate.mjs` | hook `Stop`: com áreas em `<projeto>/.claude/verifica.json` (exemplo: `verifica.exemplo.json`), roda a checagem rápida da área mexida e bloqueia o fim da vez se falhar (até 3 vezes por sessão); sem o arquivo, calado; `CLAUDE_VERIFICA=0` desliga |
| `claude/lembrete-clear.mjs` | hook `Stop`: com o contexto passando da metade da janela, lembra de fazer o handoff e dar `/clear`; `CLAUDE_LEMBRETE_CLEAR=0` desliga (tem teste) |
| `claude/correcao-gate.mjs` | hook `UserPromptSubmit`: quando você corrige o Claude ("de novo", "that's not what I asked"), lembra de registrar a lição; só em projeto com `docs/knowledge/`; `CLAUDE_CORRECAO=0` desliga (tem teste) |
| `claude/guard-git.mjs` | **opcional** (`instalar.mjs --com-guard-git`), hook `PreToolUse` em Bash e PowerShell: nega `git reset --hard`, `clean -f`, `branch -D`, `push --force`, `stash drop` (derivado de mattpocock/skills, MIT; tem teste) |
| `claude/politica-modelo.mjs` | audita (ou `--fix`) o `model:` dos agentes do projeto contra tiers de risco em `.claude/politica-modelo.json` (exemplo: `politica-modelo.exemplo.json`) |
| `claude/skills-audit.mjs` | falha se um SKILL.md passar de ~8 KB, descrição de skill de 400 B ou de agente de 300 B |
| `claude/uso.mjs` · `quota.mjs` | medidores de gasto por projeto e histórico da cota |
| `texto/cara-de-ia.mjs` | lint de texto usado pela skill `sem-cara-de-ia` |
| `instalar.mjs` | copia tudo para `~/.claude` e junta os hooks no seu `settings.json` |
| `settings.global.recomendado.json` | modelo e esforço sugeridos para `~/.claude/settings.json` |
| `team-registry.exemplo.json` | formato do roteamento de agentes (o conteúdo de verdade sai do código de cada projeto) |

**Skills** (vão para `~/.claude/skills/`):

| Skill | Quando entra |
|---|---|
| `remember` · `licao-aprendida` · `busca-eficiente` | o núcleo da memória: registrar, virar lição, achar sem ler arquivo inteiro |
| `graphify` | mapa do código (AST, sem IA): "o que quebra se mudar X", "como A chega em B"; versão enxuta de 8 KB |
| `spec-primeiro` | feature ou refactor não trivial: spec curta antes, verificação depois |
| `pr` | corpo de PR com resumo visual, evidência e risco do merge |
| `grilling` | estressar um plano com perguntas numeradas e resposta recomendada |
| `docs-context7` | doc atual de biblioteca antes de codar (precisa do MCP context7) |
| `skill-smith` | criar skill ou agente novo na convenção do kit |
| `verify` | antes de commit, PR ou "pronto": checagem completa da área mexida, com comando e saída |
| `veracidade-de-numero` | auditar número, métrica ou KPI antes de publicar (origem, armadilhas, medido x estimado x suposto) |
| `sem-cara-de-ia` | revisar texto que alguém vai ler |
| `wizard` | passo que só uma pessoa faz (painel de terceiro, 2FA, segredo): gera script interativo |

**Agentes** (vão para `~/.claude/agents/`): `Explore` (troca o padrão por um em Haiku, só leitura) e
`docs-researcher` (doc de biblioteca via context7, devolve só a resposta).

**Fora do kit de propósito:** skills de terceiros (segurança, Postgres, Playwright e outras). Instale da fonte
original ou por plugin (`/plugin`), para receber as atualizações de quem mantém. Se instalar, acrescente a skill
na tabela `SKILLS` do `despacho-gate.mjs` para o roteador sugerir.

**Requisito:** Node 22 ou mais novo (o `akita.mjs` usa o `node:sqlite` embutido). Sem dependência npm.

## 1. Instalação global (uma vez por computador)

Cole no Claude, em qualquer pasta:

```text
Instale o kit que está em <CAMINHO DO KIT> no meu usuário. Siga na ordem:

1. Confira node --version (precisa ser 22+). Se for menor, pare e me diga.
2. Rode: node "<CAMINHO DO KIT>/instalar.mjs"
   Ele copia as ferramentas para ~/.claude/kit/tools/, as skills e os agentes para ~/.claude/skills/ e
   ~/.claude/agents/ (pula o que já existe com o mesmo nome e avisa), e junta a statusLine e os hooks no
   ~/.claude/settings.json, guardando cópia em settings.json.antes-do-kit. Mostre o que ele imprimiu.
   Se eu não uso o servidor ai-memory, tire o hook SessionEnd do settings.json.
   Se eu quiser o guarda de git destrutivo (opcional), rode com --com-guard-git.
3. Rode os testes:
   node --test ~/.claude/kit/tools/claude/statusline.test.mjs ~/.claude/kit/tools/claude/guard-contexto.test.mjs ~/.claude/kit/tools/claude/verifica-gate.test.mjs ~/.claude/kit/tools/claude/correcao-gate.test.mjs ~/.claude/kit/tools/claude/lembrete-clear.test.mjs ~/.claude/kit/tools/claude/guard-git.test.mjs
4. Configuração: compare ~/.claude/settings.json com <CAMINHO DO KIT>/settings.global.recomendado.json e me mostre
   as chaves que faltam ou divergem. Só grave com o meu ok; não apague chave que eu já tenho.
5. MCPs globais (escopo user, valem em todo projeto):
   claude mcp add -s user context7 -- npx -y @upstash/context7-mcp@<versão atual fixada>
   claude mcp add -s user playwright -- npx -y @playwright/mcp@<versão atual fixada>
   Consulte a versão atual de cada pacote no npm e fixe o número; não use "latest".
6. Mapa do código: se tiver Python e uv (https://docs.astral.sh/uv/), rode uv tool install graphifyy (dois "y";
   o comando é graphify). NÃO rode "graphify install": ele troca a skill enxuta por uma de ~48 KB.
7. Plugins sugeridos (/plugin): superpowers e claude-code-setup.
Mostre só o resultado de cada passo em uma linha.
```

Para atualizar o kit depois: rode `instalar.mjs` de novo. As ferramentas são trocadas e os hooks do kit
reescritos sem duplicar. Skill ou agente já instalado não é sobrescrito; apague a pasta antes para trocar.

## 2. Em cada projeto (só o que é do projeto)

Cole no Claude, na raiz do projeto:

```text
Ligue a memória do kit global neste projeto. Nada de copiar script: as ferramentas já estão em
~/.claude/kit/tools/ e os hooks no meu settings global.

1. Crie docs/knowledge/{decisions,sessions,licoes,misc}/ e docs/knowledge/CONSOLIDATION.md (3 linhas: para que
   serve e "última consolidação: nunca").
2. No .gitignore: docs/knowledge/.cache/ e graphify-out/. Se o repo tiver .gitattributes, garanta *.md com eol=lf.
3. No CLAUDE.md do projeto (crie se não houver), uma seção curta "Memória":
   - handoff obrigatório em docs/knowledge/sessions/chat-AAAA-MM-DD-<tema>.md; a 1ª seção # é o TL;DR e basta
     sozinha; depois pronto/pendente/gotchas/git/próximo passo e a retro "Custou caro / Mudar / Virou";
   - decisão não óbvia vira .md em docs/knowledge/decisions/; gotcha vira lição pela skill licao-aprendida;
   - ordem de busca: rg → node $HOME/.claude/kit/tools/knowledge/akita.mjs search "<tema>" → graphify → memória;
   - memória é pista: confira contra o código antes de afirmar; data relativa vira absoluta.
4. Agentes (só se o projeto tiver mais de uma área): leia o código e proponha 3 a 6 agentes, um por área que
   existe aqui (ex.: backend, frontend, banco, qa). Para cada um: .claude/agents/<slug>-<papel>.md curto
   (descrição até 300 B, model sonnet ou haiku, tools mínimas) e o playbook em docs/agentes/<slug>.md, com os
   comandos, pastas e armadilhas deste repo. Monte docs/agentes/team-registry.json no formato de
   <CAMINHO DO KIT>/team-registry.exemplo.json, com as palavras que este time usa. Atenção: dentro do JSON, borda
   de palavra se escreve "\\b" (com duas barras). Mostre a lista antes de criar.
   Opcional, checagem ao fim de cada vez: leia os scripts do projeto (package.json, Makefile, go.mod, pyproject,
   .sln...) e proponha as áreas para .claude/verifica.json, no formato de <CAMINHO DO KIT>/verifica.exemplo.json
   ({"areas":[{"caminho":"<regex>","comando":"<cmd rápido>","rotulo":"<nome>"}]}). Só lint, build ou teste
   rápido; nada de teste de minutos. Mostre a lista antes de criar. Sem o arquivo, o hook fica calado.
5. Se o graphify estiver instalado: graphify update . e graphify hook install (se o hook mexer no .gitattributes
   e eu não quiser isso versionado, git checkout -- .gitattributes). No CLAUDE.md, seção "Como buscar no código":
   graphify affected "X" (o que quebra), graphify path "A" "B", graphify explain "X",
   graphify query "<pergunta>" --budget 1500.
6. Teste:
   node $HOME/.claude/kit/tools/knowledge/remember.mjs "setup da memória" --type session
   node $HOME/.claude/kit/tools/knowledge/akita.mjs search "setup"
   e, se criou agentes, mande ao roteador um pedido típico deste projeto (mais de 40 letras):
   echo '{"prompt":"<pedido>","session_id":"teste"}' | CLAUDE_PROJECT_DIR=. node $HOME/.claude/kit/tools/claude/despacho-gate.mjs
   Preencha o primeiro handoff com o que foi feito. Mostre só o resultado de cada teste em uma linha.
Não faça commit sem eu pedir.
```

A memória própria do Claude (`~/.claude/projects/<projeto>/memory/`) já é do Claude Code: ele cria sozinho. A
regra que vale a pena seguir: um fato por arquivo, índice `MEMORY.md` com uma linha por memória, nada de estado
de tarefa nem segredo.

## Uso no dia a dia

- **Fim de sessão:** "faça o handoff". O hook também lembra sozinho.
- **Decisão tomada:** "anota essa decisão".
- **Erro que custou caro:** "vira lição".
- **"Já resolvemos isso?":** busca no acervo (`akita.mjs search "<tema>"`).
- **"O que quebra se eu mudar isto?":** `graphify affected "<arquivo ou função>"`.
- **Uma vez por mês:** "faz a consolidação". Junta duplicatas, apaga o que o código desmentiu e recolhe os
  `Virou: pendente` dos handoffs.

## Memória x mapa do código

A memória guarda o que não está no código: decisões, motivos, onde a sessão parou, erros caros. O graphify
guarda a estrutura do código: arquivos, funções, quem chama quem. Um não substitui o outro.

## Opcional: captura automática (ai-memory)

O `aimemory.mjs` conversa com um servidor ai-memory local (padrão `http://127.0.0.1:49374`, ou a variável
`AI_MEMORY_SERVER_URL`). Sem o servidor, não faz nada. Com ele, deixe as tools MCP do servidor desligadas (pesam
uns 8 mil tokens por requisição); o script basta. A captura é rede de segurança e não substitui o handoff.
