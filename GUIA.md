# Claude Code econômico: tokens, memória, skills e agentes

Guia para quem divide a mesma conta. Ele tem duas partes:

1. **Os métodos.** O que fazer e por quê, para gastar menos sem perder qualidade.
2. **O prompt de montagem.** Um texto para colar no Claude dentro de qualquer projeto. Ele analisa o repositório e
   monta sozinho o `CLAUDE.md`, a memória, os agentes, as skills, os hooks e os MCPs certos para aquele projeto.

Nada aqui depende de linguagem ou de stack. Vale para backend, front, firmware, dados ou documentação.

---

## Parte 1: os métodos

### 1. O que custa caro (entenda isto primeiro)

- **Cada mensagem reenvia o contexto inteiro.** Um chat com 150 mil tokens cobra esses 150 mil de novo a cada
  pergunta, mesmo a mais simples. Chat longo é o maior ralo de cota.
- **Ler arquivo inteiro** quando só precisava de 20 linhas.
- **Despejar log, diff ou saída de teste** no chat. O texto fica no contexto até o fim da sessão.
- **Modelo grande para tarefa pequena.** Busca, renomeação e checagem rodam bem num modelo menor.
- **Refazer o que outra sessão já descobriu**, porque ninguém anotou.
- **Instrução gigante carregada sempre**: um `CLAUDE.md` de 30 KB, uma skill de 50 KB, uma descrição de agente de
  2 KB. Tudo isso entra em toda conversa.

### 2. Um chat por tarefa, com handoff

- **Tarefa nova pede chat novo** (`/clear`). Não emende frentes diferentes no mesmo chat.
- **Troque de chat** quando o contexto passar de uns 150 mil tokens ou quando um bloco de trabalho fechar.
- **Antes de trocar, escreva o handoff** em `docs/knowledge/sessions/chat-AAAA-MM-DD-<tema>.md`:
  - **Primeira seção (`# TL;DR`), que basta sozinha:** estado atual, o que está pendente e onde está o detalhe.
    Até uns 3.000 caracteres.
  - **Depois:** o que ficou pronto, o que está pendente, armadilhas, estado do git e próximo passo. Tudo concreto
    (caminhos, comandos, números), sem narrativa.
  - **No fim, uma retro curta:** *Custou caro* / *Mudar* / *Virou* (em que regra, teste ou skill a lição virou).
  - **Primeira mensagem sugerida** para o chat seguinte.
- **Um hook de `SessionStart` injeta só o TL;DR** do último handoff no chat novo (exemplo na seção 9). O chat começa
  sabendo onde parou e pagando 3 mil tokens, não 150 mil.

### 3. Busca barata antes de ler

A ordem certa é **achar → ler só a fatia**.

| Pergunta | Ferramenta |
|---|---|
| Onde aparece este texto? | `rg` (ripgrep) ou o tool Grep |
| Onde está este padrão de código? | `ast-grep` / `sg -p 'chamada($$$)'` |
| Que arquivo tem este nome? | `fd` ou o tool Glob |
| O que quebra se eu mudar X? Como A chega em B? | grafo do código (ex.: graphify, que usa AST e roda sem LLM) |
| Como se usa a lib Y hoje? | MCP **context7** (doc atual, evita API inventada) |

- **Leia com `offset`/`limit`** na faixa que o grep apontou, não o arquivo inteiro.
- **Corte pastas de build e dependência** na busca: `-g '!{node_modules,dist,build,.venv,target}'`.
- **Pense duas vezes antes de montar RAG com embeddings** para o conhecimento do projeto. Markdown curto e
  grepável sai mais barato, mais exato e mais fácil de manter.

**Mapa do código (graphify):** lê o repo pela AST, sem IA, e responde perguntas de estrutura sem abrir
arquivo: `graphify affected "X"` (o que quebra), `graphify path "A" "B"`, `graphify explain "X"`, `graphify query
"<pergunta>" --budget 1500`. Os hooks do git o mantêm atualizado. Instalação no `INSTALAR.md` do kit.

### 4. Modelo certo para cada trabalho

| Trabalho | Modelo |
|---|---|
| Busca ampla no repo, listar, localizar | o menor (Haiku), via agente `Explore` |
| Rotina: teste, ajuste pequeno, doc, CI | médio (Sonnet) |
| Arquitetura, segurança, bug difícil, decisão | o maior (Opus) |

- **Defina o modelo no próprio agente**, com `model: haiku` no frontmatter, para não depender de lembrar.
- **Use o esforço de raciocínio** ("effort") baixo em tarefa mecânica.

### 5. Subagentes: paralelo e contexto limpo

- **Um subagente roda num contexto próprio.** Ele pode ler 40 arquivos e devolver 10 linhas. O chat principal só
  paga as 10 linhas.
- **Peça sempre "devolva só a conclusão"**, com caminhos e números, sem colar arquivos.
- **Mande as áreas independentes juntas**, na mesma mensagem, para rodarem em paralelo.
- **Não exagere:** tarefa de 1 arquivo e menos de 20 linhas o chat principal faz sozinho. Abrir agente para isso
  custa mais.
- **O chat principal orquestra e julga.** Quem executa é o agente da área.

### 6. Agentes enxutos

- **O arquivo do agente** (`.claude/agents/<nome>.md`) **é só roteamento:** nome, descrição curta (até ~300
  bytes), ferramentas e modelo.
- **A substância fica num playbook à parte** (`docs/agentes/<nome>.md`), lido uma vez por sessão, quando o agente
  é usado. Assim a descrição de todos os agentes, que entra em toda conversa, fica pequena.
- **Dê aos agentes somente as ferramentas de que precisam.** Agente de revisão ou segurança fica só com leitura.
- **Um agente por área** que o projeto realmente tem. Dez agentes genéricos valem menos que quatro bem
  delimitados.

### 7. Skills curtas e com gatilho claro

- **Skill** (`.claude/skills/<nome>/SKILL.md`) **é procedimento repetível:** revisar PR, escrever migration,
  depurar teste instável, escrever handoff.
- **A `description` diz quando usar**, com as palavras que o usuário diria (até ~400 bytes).
- **O corpo fica em até ~8 KB.** Detalhe longo vai em arquivo de referência ao lado, lido sob demanda.
- **Faça uma auditoria automática** (um script que falha se uma skill passar do limite) para o tamanho não
  crescer escondido.
- **Skills que valem em quase todo projeto:**
  - busca eficiente;
  - escrever spec antes de codar;
  - handoff/registro de decisão;
  - lição aprendida;
  - corpo de PR;
  - revisão de segurança;
  - doc atual via context7;
  - texto sem cara de IA.

### 8. Memória: um fato por arquivo, índice curto

O Claude Code tem memória própria em `~/.claude/projects/<projeto>/memory/`.

- **Um fato por arquivo**, com frontmatter `name`, `description` e `type` (`user`, `feedback`, `project` ou
  `reference`).
- **`MEMORY.md` é só o índice**, uma linha por memória. É ele que carrega em toda sessão, então mantenha-o curto.
  Quando passar de umas 40 linhas, agrupe em **hubs** (ex.: "hub: git e CI", "hub: banco"): uma linha que aponta
  para um arquivo com a lista.
- **O que entra:** preferência do usuário, correção que ele fez ("não faça X, porque Y"), armadilha técnica que
  custou caro, onde fica um recurso externo.
- **O que não entra:**
  - o que o código ou o git já dizem;
  - o estado do trabalho (isso vai para o handoff);
  - qualquer segredo.
- **Memória é pista.** Confira contra o código antes de afirmar.
- **Data relativa vira absoluta** ("ontem" → "2026-11-10").

**Separe o que cada lugar guarda:**

| Onde | O que guarda | Quem lê |
|---|---|---|
| `CLAUDE.md` do projeto | regras fixas, stack, como buscar, comandos | todo chat do projeto |
| `~/.claude/CLAUDE.md` | preferências pessoais em todos os projetos | todo chat seu |
| memória | fatos e correções duráveis | todo chat do projeto (o índice) |
| handoff | estado da última sessão | o chat seguinte (só o TL;DR) |
| `docs/knowledge/decisions/` | decisão não óbvia: problema, decisão, razão, resultado | quem buscar |
| `docs/knowledge/licoes/` | gotcha → regra levada para teste, skill ou playbook | quem buscar |

**Kit pronto:** este repositório (kit-memoria-ia) tem esse sistema inteiro já testado:
- **memória:** os scripts `remember`, a busca ranqueada `akita`, o hook que injeta o handoff e o que cobra o
  handoff, e as 3 skills;
- **ferramental:** a statusline, o guarda que barra leitura gigante, o roteador de agentes e skills, a auditoria de
  tamanho das skills, os medidores de uso e o agente `Explore` em Haiku;
- **configuração:** um instalador que junta os hooks no seu `~/.claude/settings.json` e um
  `settings.global.recomendado.json`.

**Instala uma vez só, no seu usuário (`~/.claude`), e vale para todo projeto.** No projeto fica só o que é dele:
`docs/knowledge/` e, se quiser, os agentes gerados a partir do código daquele repo. Projeto sem
`docs/knowledge/` não recebe nada. O `INSTALAR.md` do kit tem dois prompts para colar no Claude: o da
instalação global e o curto, por projeto. Os exemplos da seção 9 abaixo são a versão mínima, para entender como
funciona.

### 9. Hooks que trabalham por você

Os hooks ficam no `settings.json` (o global, `~/.claude/settings.json`, vale para todo projeto) e rodam sem
gastar raciocínio do modelo. Um script global descobre o projeto aberto pela variável `CLAUDE_PROJECT_DIR`.

| Hook | Para quê |
|---|---|
| `SessionStart` | injeta o TL;DR do último handoff |
| `Stop` | cobra o handoff **uma vez** quando a sessão ficou grande e ainda não há handoff de hoje |
| `UserPromptSubmit` | casa palavras do pedido com agentes e skills (lista em JSON) e sugere quem chamar |
| `PreToolUse` | guarda de contexto: avisa antes de ler arquivo enorme sem `limit`, despejar transcript ou print grande |
| `SessionEnd` (opcional) | puxa a captura automática de um servidor de memória local |
| `PostToolUse` (opcional) | formata ou testa depois de editar |

- **Hook não deve bloquear trabalho toda hora.** Cobra uma vez e cala; senão vira atrito e o pessoal desliga.

Exemplo de `settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/tools/claude/injeta-handoff.mjs\"" } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/tools/claude/cobra-handoff.mjs\"" } ] }
    ]
  },
  "statusLine": { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/tools/claude/statusline.mjs\"" }
}
```

`injeta-handoff.mjs`: imprime o frontmatter e a primeira seção `#` do handoff mais recente, cortados em 3.000
caracteres. O que o hook escreve no stdout entra como contexto.

```js
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const dir = join(process.env.CLAUDE_PROJECT_DIR ?? ".", "docs/knowledge/sessions");
let arqs = [];
try { arqs = readdirSync(dir).filter(f => f.endsWith(".md")).sort(); } catch { process.exit(0); }
if (!arqs.length) process.exit(0);
const texto = readFileSync(join(dir, arqs.at(-1)), "utf8");
const [, fm = "", corpo = texto] = texto.match(/^(---[\s\S]*?---\n)?([\s\S]*)$/) ?? [];
const tldr = corpo.split(/\n(?=# )/).find(s => s.startsWith("# ")) ?? corpo;
console.log(`## Último handoff: ${arqs.at(-1)}\n\n${(fm + tldr).slice(0, 3000)}`);
```

`cobra-handoff.mjs`: bloqueia o fim do turno uma vez se não houver handoff com a data de hoje. O
`stop_hook_active` evita laço.

```js
import { readdirSync } from "node:fs";
import { join } from "node:path";
const entrada = JSON.parse(await new Promise(r => { let d = ""; process.stdin.on("data", c => d += c).on("end", () => r(d || "{}")); }));
if (entrada.stop_hook_active) process.exit(0);
const hoje = new Date().toISOString().slice(0, 10);
const dir = join(process.env.CLAUDE_PROJECT_DIR ?? ".", "docs/knowledge/sessions");
let tem = false;
try { tem = readdirSync(dir).some(f => f.includes(hoje)); } catch {}
if (!tem) console.log(JSON.stringify({ decision: "block", reason: `Sem handoff de ${hoje}. Se houve trabalho real, escreva docs/knowledge/sessions/chat-${hoje}-<tema>.md (TL;DR primeiro).` }));
```

- **Refinamento:** só cobrar quando a sessão passou de uns 50 mil tokens. Leia o `usage` da última linha do
  `transcript_path` que vem na entrada.

### 10. Statusline com o contexto à vista

- **Mostre na linha de status:** tokens de contexto em uso, a porcentagem da janela e o modelo.
- **Ver "140k / 160k" é o melhor lembrete** para fazer handoff e trocar de chat.
- **No kit:** `~/.claude/kit/tools/claude/statusline.mjs` mostra modelo, pasta, contexto e cota. Os medidores
  `uso.mjs` (gasto por projeto lido dos transcripts) e `quota.mjs` (histórico da cota) respondem
  "onde foi o meu limite?" sem chute.

**Configuração global recomendada** (`~/.claude/settings.json`, também em `settings.global.recomendado.json`):

| Chave | Valor | Por quê |
|---|---|---|
| `model` | `opus` | o chat principal julga e orquestra |
| `effortLevel` | `medium` | raciocínio alto só quando pedir |
| `env.CLAUDE_CODE_SUBAGENT_MODEL` | `sonnet` | subagente executa com o modelo mais barato |
| `autoCompactWindow` | `200000` | compacta antes de a conversa ficar cara demais |
| `skillListingMaxDescChars` | `400` | a lista de skills vai em toda requisição; descrição longa custa sempre |
| `language` | `pt-br` | respostas no idioma do time |

- **Plugins úteis:** `superpowers` (skills de processo: debug sistemático, plano, TDD, revisão) e
  `claude-code-setup` (recomenda hooks, skills e MCPs para o repo).
- **MCP:** `context7` para doc atual de biblioteca. MCP com muitas tools pesa em toda requisição; ligue só o que usa.

### 11. Spec antes de código não trivial

Para feature, refatoração ou endpoint, escreva antes uma spec curta em `docs/specs/<tema>.md`:

- objetivo;
- contrato (entradas, saídas, erros);
- casos, incluindo os de borda;
- plano em passos;
- como verificar.

- **Depois de implementar, confira contra a spec.** Refazer sai muito mais caro que 15 linhas de spec.
- **Tarefa trivial não precisa de spec.**

### 12. Motor externo para volume (opcional)

- **Se a conta tiver outro motor de código por assinatura** (ex.: Codex), mande para ele o trabalho mecânico em
  lote: implementar, escrever teste, revisar. O Claude julga o resultado com build e diff.
- **Mande em lote.** Cada despacho tem custo fixo.
- **Nunca mande para motor externo:** segredo, credencial, dado de cliente, nem nada que mexa em produção ou em
  equipamento físico.

### 13. Hábitos que economizam todo dia

- **Pedido claro e completo na primeira mensagem:** o quê, onde, como saber que ficou pronto.
- **Respostas curtas.** Peça ao Claude para não colar arquivo nem log no chat.
- **Prova antes de "pronto":** rodar teste, build ou lint e mostrar o número. "Deve funcionar" gera retrabalho.
- **Lição vira regra onde o próximo lê** (teste, skill, playbook), não só na memória. Assim o erro não se
  repete, e cada repetição custa cota.
- **Decisão já tomada fica escrita.** Ninguém precisa perguntar de novo.
- **Não reabra o que está resolvido.** Antes de investigar, faça um `rg` no acervo.

---

## Parte 2: prompt de montagem (cole no Claude, na raiz do projeto)

> Copie tudo dentro do bloco abaixo e cole num chat novo do Claude Code aberto na pasta do projeto.

```text
Quero que você deixe este projeto configurado para o Claude Code trabalhar bem e gastar pouco token.
Siga as etapas na ordem. Em cada etapa, mostre o que vai criar em no máximo 10 linhas e siga sem esperar,
a não ser que falte uma decisão que só eu posso tomar; aí pergunte uma vez, com a sua recomendação.

ETAPA 0. Reconhecimento barato (sem ler arquivo inteiro)
- Liste a estrutura com Glob/fd, leia só manifestos (package.json, go.mod, pyproject, Cargo.toml, pom,
  docker-compose, workflows de CI) e o README.
- Descubra: linguagens, frameworks, como builda, como testa, como faz lint, como sobe, onde ficam os testes,
  integrações externas (banco, filas, APIs, nuvem).
- Use um subagente Explore (modelo pequeno) para a varredura e peça só a conclusão.
- Se já existir CLAUDE.md, .claude/agents, .claude/skills ou settings.json, leia e MELHORE; não apague nada
  sem me dizer o que é e por quê.

ETAPA 1. CLAUDE.md do projeto (até ~6 KB)
Seções: o que é o sistema (3 linhas) · regras que não se quebram · stack · comandos (build, teste, lint, rodar)
· como buscar no código (rg, ast-grep, fd, pastas a ignorar) · onde fica o conhecimento (docs/specs,
docs/knowledge/decisions, docs/knowledge/sessions, docs/knowledge/licoes) · time de agentes e skills (uma linha
cada) · o que NÃO fazer. Sem narrativa, sem repetir o que o código já diz.

ETAPA 2. Estrutura de conhecimento
Crie docs/specs/, docs/knowledge/decisions/, docs/knowledge/sessions/, docs/knowledge/licoes/ e docs/agentes/,
cada uma com um README de 3 linhas explicando o formato. Formato do handoff: primeira seção "# TL;DR" que basta
sozinha (até 3.000 caracteres), depois pronto / pendente / armadilhas / estado do git / próximo passo / retro
(Custou caro, Mudar, Virou) / primeira mensagem sugerida.

ETAPA 3. Agentes (.claude/agents/)
- Proponha de 4 a 8 agentes, um por área REAL deste projeto (ex.: backend, frontend, banco, infra/deploy,
  QA, QA adversarial, segurança, conhecimento/docs). Não crie agente para área que o projeto não tem.
- Arquivo do agente = só roteamento: frontmatter name, description (até 300 bytes, dizendo QUANDO despachar),
  tools (o mínimo; revisor e segurança só leitura), model (haiku para busca, sonnet para rotina, opus para
  arquitetura/segurança). Corpo: 5 linhas mandando ler o playbook docs/agentes/<nome>.md uma vez por sessão e
  devolver só a conclusão com caminhos e números.
- Playbook em docs/agentes/<nome>.md: responsabilidades, padrões do projeto naquela área (tirados do código
  existente, com exemplo de arquivo), comandos de verificação, armadilhas, o que nunca fazer.
- Crie também docs/agentes/team-registry.json: para cada agente e skill, uma lista "routingKeywords".

ETAPA 4. Skills (.claude/skills/<nome>/SKILL.md)
- Description até 400 bytes, começando por "Use quando..."; corpo até 8 KB; detalhe longo em arquivo ao lado.
- Base para todo projeto: busca-eficiente, spec-primeiro, remember (handoff e decisão), licao-aprendida,
  pr (corpo de PR com resumo, evidência antes/depois e risco do merge), revisão de segurança da stack,
  docs-context7 (consultar doc atual antes de usar lib).
- Mais as específicas da stack (ex.: migration de banco, teste e2e, release, componente de UI). Proponha só as
  que têm procedimento repetível de verdade neste repo.
- Crie tools/claude/skills-audit.mjs que falha se SKILL.md > 8 KB, description de skill > 400 B ou de agente > 300 B.

ETAPA 5. Hooks e statusline (.claude/settings.json, caminhos com ${CLAUDE_PROJECT_DIR})
- SessionStart: injeta frontmatter + primeira seção # do handoff mais recente, cortado em 3.000 caracteres.
- Stop: se a sessão passou de ~50k tokens (ler usage do transcript_path) e não há handoff com a data de hoje,
  bloqueia UMA vez pedindo o handoff (respeitar stop_hook_active).
- UserPromptSubmit: lê o team-registry.json e, se palavras do pedido casarem, imprime "Agentes para este pedido:
  ... / Skills: ..." (desligável por variável de ambiente).
- statusLine: contexto usado / janela, porcentagem e modelo.
- Nenhum hook pode bloquear trabalho repetidamente. Escreva teste simples para cada script de hook.

ETAPA 6. MCPs e ferramentas
- Verifique o que já está instalado (claude mcp list). Recomende só o que este projeto usa:
  context7 (doc de libs) quase sempre; playwright se houver front web; o do banco/nuvem se houver e for seguro.
- Verifique se rg, fd e ast-grep existem; se faltar, me dê o comando de instalação para o meu sistema.
- Se o repo for grande, sugira um grafo de código por AST (ex.: graphify) para "o que quebra se eu mudar X".

ETAPA 7. Memória
- Se o kit-memoria-ia ainda não estiver instalado (~/.kit-memoria-ia/ não existe), rode "node kit.mjs instalar"
  a partir da pasta do kit (uma vez por computador). Neste repo rode só node "$HOME/.kit-memoria-ia/kit.mjs" iniciar. Isso substitui os scripts
  de handoff e de hook das ETAPAS 4 e 5: não copie script para dentro do repo.
- Crie a memória inicial em ~/.claude/projects/<este projeto>/memory/: um fato por arquivo (frontmatter name,
  description, type), MEMORY.md só com uma linha por memória. Registre só fatos não óbvios que você descobriu
  (armadilha de build, comando que difere do padrão, serviço externo). Nada de segredo, nada de estado de tarefa.

ETAPA 8. Verificação e entrega
- Rode skills-audit e os testes dos hooks; mostre o resultado com número.
- Abra um chat de teste mentalmente: confira que o contexto fixo (CLAUDE.md + índice de memória + descrições de
  agentes e skills) ficou abaixo de ~15 KB e me diga quanto deu.
- Escreva o primeiro handoff (docs/knowledge/sessions/chat-<hoje>-setup-claude.md) com o que criou e o que
  ficou para mim decidir.
- Responda em até 15 linhas: o que foi criado, o tamanho do contexto fixo, e as 3 próximas melhorias sugeridas.

Regras durante todo o trabalho:
- Nunca leia, imprima ou grave segredo, token, senha ou .env com valor. Catálogo de segredo só por nome.
- Leia só a fatia necessária dos arquivos; subagente devolve só a conclusão.
- Nada de commit ou push sem eu pedir.
```

---

## Checklist rápido (para colar perto do monitor)

- [ ] Tarefa nova = chat novo. Passou de ~150k, faça o handoff e troque.
- [ ] Handoff com TL;DR primeiro; o hook injeta só ele.
- [ ] Ache com `rg`/`sg`/`fd`, depois leia só a fatia.
- [ ] Busca ampla vai para o `Explore` (modelo pequeno); rotina vai para o médio; decisão vai para o grande.
- [ ] Subagente devolve só a conclusão; áreas independentes rodam em paralelo.
- [ ] O arquivo do agente só roteia; a substância fica no playbook.
- [ ] Skill até 8 KB; description diz quando usar.
- [ ] Memória: um fato por arquivo, índice curto, nada de estado nem segredo.
- [ ] Spec curta antes de código não trivial.
- [ ] Prova com número antes de dizer "pronto".
- [ ] Gotcha vira regra num teste, skill ou playbook.
