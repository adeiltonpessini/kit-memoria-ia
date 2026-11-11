# kit-memoria-ia

Memória de projeto para IAs de código. A sessão nova começa sabendo onde a anterior parou, você não cola nada e
gasta menos token.

Funciona com **Claude Code, Codex, Gemini CLI, Cursor e GitHub Copilot**, e com qualquer IA que leia `AGENTS.md`
ou skills no formato `SKILL.md`. É markdown simples dentro do seu repositório: sem banco, sem RAG de embeddings,
sem serviço na nuvem, sem dependência do npm.

[![Licença: Apache-2.0](https://img.shields.io/badge/licen%C3%A7a-Apache--2.0-blue)](LICENSE)
![Node 22+](https://img.shields.io/badge/node-22%2B-green)

## Em 2 comandos

Você precisa do [Node 22 ou mais novo](https://nodejs.org).

**1. Uma vez por computador:**

```sh
git clone https://github.com/adeiltonpessini/kit-memoria-ia
node kit-memoria-ia/kit.mjs instalar
```

O instalador procura as IAs que você tem (`~/.claude`, `~/.codex`, `~/.gemini`, `~/.cursor`, `~/.copilot`) e
instala em cada uma. Não mexe em nenhuma que você não tem.

**2. Em cada projeto, na pasta dele:**

```sh
node "$HOME/.kit-memoria-ia/kit.mjs" iniciar
```

Isso cria `docs/knowledge/` e um `AGENTS.md` com as regras de memória. Agora é só abrir a IA e pedir:

> leia o AGENTS.md e continue de onde parou

Se a IA for o Claude Code, você não precisa pedir: os hooks fazem isso sozinhos.

## Como funciona

```
 fim da sessão ──► a IA escreve o handoff        docs/knowledge/sessions/chat-2026-11-11-login.md
                                                  # TL;DR      ← só esta parte é lida no começo
                                                  o que ficou pronto, pendente, armadilhas, próximo passo
                         │
 sessão nova ────► a IA lê só o TL;DR do mais recente (até 3.000 caracteres)
                         │
 durante ────────► busca com rg e lê só a fatia; decisão vira docs/knowledge/decisions/;
                   erro caro vira lição em docs/knowledge/licoes/
```

A economia vem de três hábitos que o kit põe na IA:

1. **Começar pelo resumo.** A IA lê o TL;DR da última sessão, não o histórico inteiro.
2. **Buscar antes de ler.** `rg` acha a linha e a IA lê 40 linhas, não o arquivo de 2.000.
3. **Não repetir erro.** O que custou caro uma vez vira regra escrita onde a próxima sessão lê.

Tudo fica em `docs/knowledge/`, versionado no git junto com o código. Você lê, edita e apaga como qualquer
arquivo.

## O que cada IA recebe

| | Claude Code | Codex · Gemini CLI | Cursor · Copilot · outras |
|---|---|---|---|
| Regras de memória no `AGENTS.md` do projeto | ✓ (via `@AGENTS.md`) | ✓ | ✓ |
| 13 skills (`SKILL.md`) | ✓ | ✓ | ✓ |
| Regras globais no seu usuário | | ✓ | |
| Hooks automáticos (injeta o TL;DR, cobra o handoff, roda a checagem) | ✓ | | |
| Linha de status com contexto e cota | ✓ | | |

Nas IAs sem hooks, a regra está no `AGENTS.md` e a IA a segue quando lê o arquivo. No Claude Code, o hook garante.

## Comandos

| Comando | O que faz |
|---|---|
| `node kit.mjs instalar` | instala no seu usuário (uma vez) |
| `node kit.mjs iniciar` | liga a memória no projeto da pasta atual; pode rodar de novo sem duplicar nada |
| `node kit.mjs lembrar "<tema>" --type session` | cria handoff (também `decision`, `licao`, `misc`) |
| `node kit.mjs buscar "<tema>"` | busca ranqueada no acervo do projeto |
| `node kit.mjs diagnostico` | mostra o que está instalado e o que falta |
| `node kit.mjs remover` | tira o kit do seu usuário; as notas dos projetos ficam |

Depois de instalado, troque `kit.mjs` por `"$HOME/.kit-memoria-ia/kit.mjs"` (bash e PowerShell) para rodar de qualquer pasta.

## Skills incluídas

| Skill | Para quê |
|---|---|
| `remember` | grava decisão, handoff ou nota com o modelo certo |
| `busca-eficiente` | `rg` + leitura da fatia mínima antes de abrir arquivo inteiro |
| `licao-aprendida` | transforma erro caro em regra onde a próxima sessão lê |
| `verify` | roda a checagem da área antes de dizer "pronto" |
| `veracidade-de-numero` | rastreia número e métrica até a fonte antes de publicar |
| `spec-primeiro` | spec curta antes de feature cara de refazer |
| `grilling` | sabatina um plano com perguntas e respostas recomendadas |
| `pr` | corpo de PR com diagrama, evidência e risco de merge |
| `wizard` | script guiado para o passo que só você pode fazer (painel, 2FA, segredo) |
| `docs-context7` | puxa doc atual de biblioteca em vez de chutar API |
| `graphify` | mapa do código por AST: "o que quebra se eu mudar X?" |
| `sem-cara-de-ia` | revisa texto para não soar como robô |
| `skill-smith` | cria skill ou agente novo no padrão certo |

Mais dois agentes para o Claude Code: `Explore` (busca só de leitura, em modelo barato) e `docs-researcher`
(doc de biblioteca em contexto isolado).

## Opcionais

- **[ripgrep](https://github.com/BurntSushi/ripgrep)** (`rg`): recomendado. Sem ele a busca fica mais cara.
- **[graphify](https://github.com/safishamsi/graphify)**: grafo do código para perguntas de estrutura.
- **Checagem automática** (Claude Code): copie `verifica.exemplo.json` para `<projeto>/.claude/verifica.json` e
  diga qual comando roda em qual pasta. O hook roda a checagem da área que mudou antes de a IA encerrar.
- **Guarda do git** (Claude Code): `node kit.mjs instalar --com-guard-git` bloqueia `reset --hard`,
  `push --force` e parecidos.

Cada hook tem uma variável para desligar (`CLAUDE_VERIFICA=0`, `CLAUDE_LEMBRETE_CLEAR=0`, `CLAUDE_CORRECAO=0`,
`CLAUDE_DESPACHO=0`). Projeto sem `docs/knowledge/` não recebe nada: os hooks ficam calados.

## Mais leitura

- [GUIA.md](GUIA.md): o método completo, com o porquê de cada regra e um prompt para configurar um projeto do zero.
- [INSTALAR.md](INSTALAR.md): referência detalhada da parte do Claude Code (cada hook, cada script).
- [SECURITY.md](SECURITY.md): o que o kit lê, o que grava e o que nunca toca.

## Licença e autoria

Copyright 2026 [Adeilton Pessini](https://github.com/adeiltonpessini). Distribuído sob a
[Apache License 2.0](LICENSE): uso livre, inclusive comercial, desde que você mantenha o [NOTICE](NOTICE) e os
avisos de autoria. O nome do projeto não pode ser usado para endossar trabalho derivado; veja [MARCA.md](MARCA.md).
Partes de terceiros estão listadas no NOTICE, cada uma com a sua licença.

Para citar: [CITATION.cff](CITATION.cff). Para contribuir: [CONTRIBUTING.md](CONTRIBUTING.md).

Claude, Codex, Gemini, Cursor e GitHub Copilot são marcas de seus donos. Este projeto não tem vínculo com eles.
