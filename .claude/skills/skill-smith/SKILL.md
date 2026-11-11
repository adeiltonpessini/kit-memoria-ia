---
name: skill-smith
description: Cria e mantém NOVAS skills e subagentes do projeto na convenção certa. Use sempre que perceber um workflow repetido/cheio de gotcha que merece virar skill, ou quando precisar de um especialista recorrente que merece virar subagente nativo. Qualquer agente pode invocar esta skill.
---

# skill-smith — fábrica de skills e agentes do projeto

> **Autorização do projeto (fundamental):** qualquer agente pode criar uma skill ou um subagente
> quando julgar que otimiza o trabalho. Não peça permissão para criar — apenas siga esta convenção,
> mantenha enxuto e anote a decisão. Prefira EDITAR uma skill existente a duplicar.

## Quando criar
- **Skill** = um workflow **repetido** (≥2x) e/ou **cheio de gotcha** que sempre erra na mão.
  Encapsula o procedimento + os becos sem saída + o Definition of Done.
- **Subagente** = um **papel especialista recorrente** (varredura ampla, dispatch isolado) que
  vale ter despachável por tipo. Os playbooks vivem em `docs/agentes/`.
- **NÃO crie** se for tarefa única, trivial, ou já coberta por skill/playbook existente. Cheque antes:
  `ls .claude/skills/`, `ls .claude/agents/`, `rg "<tema>" docs/agentes/`.

## Anatomia de uma SKILL (`.claude/skills/<nome-kebab>/SKILL.md`)
```markdown
---
name: <nome-kebab>            # == nome da pasta, minúsculo-com-hífen
description: <quando usar — gatilhos concretos em PT-BR; gatilhos do dia a dia.
  Inclua a regra nº1 do projeto, se houver.>
---
# Título
<o procedimento real, com os COMANDOS verificados no sistema (não inventados)>
## Gotchas / becos sem saída (não refazer)
## Done (checklist curto)
<links [[memoria]] e caminhos docs/knowledge/>
```
Regras: conciso (economia de token), comandos verificados contra o sistema, **nenhum segredo**
(senha via env `${VAR}`), PT-BR. Cite caminhos em vez de despejar conteúdo.

**Teto de 8 KB no SKILL.md (progressive disclosure — decisão 27/07).** O SKILL.md inteiro
entra no contexto a cada invocação; as referências só quando lidas. Passou de ~8 KB: deixe
no núcleo o fluxo + gotchas + tabela "tema → arquivo" e mova o detalhe para
`<skill>/references/*.md`. Skill vendorizada de fora vem gorda — fatie ANTES de usar
(sql-server-performance 48→8 KB, playwright-testing 25→5 KB).
`description`: gatilhos concretos em ~1-2 linhas — ela pesa em TODA sessão, não só na invocação.

## Anatomia de um SUBAGENTE (`.claude/agents/<nome>.md`)
```markdown
---
name: <nome-kebab>
description: <quando despachar este especialista; gatilhos>
tools: Read, Grep, Glob, Bash      # mínimo necessário (menor privilégio)
model: sonnet                       # sonnet p/ a maioria; opus só p/ tarefa difícil
---
Você é <Nome>, <papel>. ANTES de agir leia (1x):
`AGENTS.md` do projeto e o playbook da área, se existir.
Siga a regra nº1 do projeto. Devolva só a CONCLUSÃO (sem dumps).
Você tem liberdade de criar skills (via skill-smith) se achar importante.
```
O corpo é **fino**: referencia o playbook (fonte da verdade), não duplica. Atualize o
`team-registry.json` se for um papel novo.

## Antes de embrulhar uma lib externa
- Confirme a **API atual** com a skill `docs-context7` (ou o subagente `docs-researcher`) — a skill
  nasce com a assinatura certa, não com API alucinada. Cite o libraryId/versão na skill.

## Depois de criar (sempre)
1. Teste mentalmente os gatilhos da `description` (é o que faz a skill ser auto-selecionada).
2. Garanta que os comandos batem com o sistema real (skill `run-sql`/`busca-eficiente` p/ conferir).
3. Anote a decisão: `node "$HOME/.kit-memoria-ia/kit.mjs" lembrar "nova skill/agente: <nome>"` se for não-óbvio.
4. Permissões: se a skill roda comandos novos repetidos, considere adicionar à allowlist em
   `.claude/settings.json` (`permissions.allow`).

## Princípio
Skill boa é a que você gostaria de ter encontrado pronta da próxima vez. Menos é mais —
uma skill afiada vence cinco vagas.
