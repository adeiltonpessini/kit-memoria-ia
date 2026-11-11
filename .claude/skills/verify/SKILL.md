---
name: verify
description: Use antes de commit, push, PR ou de dizer "pronto": roda a checagem completa da área mexida (lint, teste e build do que mudou) e mostra comando e saída. O hook Stop verifica-gate só faz a checagem rápida; esta é a completa. Nunca "deve passar".
author: Adeilton Pessini
license: Apache-2.0
---

# verify: provar que ficou pronto

O hook `Stop` (`verifica-gate.mjs`) barra o fim da vez com a checagem **rápida** da área que mudou, quando o projeto
tem `.claude/verifica.json`. Esta skill é a checagem **completa**, para antes de commit, PR ou de dizer "pronto".
Prove com saída, não com "deve passar".

## 1. Ver o que mudou
`git status --short` e `git diff --stat <base>...` (base = branch principal). Rode só as áreas tocadas.

## 2. Rodar por área (mostre o comando e o fim da saída)
Use a lista do projeto em `.claude/verifica.json` (campo `comando` de cada área) como ponto de partida e some o que o
hook deixa de fora por ser lento (teste completo, build de produção). Sem o arquivo, escolha pela stack:

| Stack | Comando | Passa quando |
|---|---|---|
| Node/npm | `npm run lint && npm test && npm run build` | tudo verde |
| Python | `ruff check .` e `python -m pytest -q` | `passed`, sem `failed` |
| Go | `go vet ./... && go test ./...` | `ok` em todos os pacotes |
| .NET | `dotnet build` e `dotnet test` | `0 Error(s)`, `Passed!` |
| Rust | `cargo clippy && cargo test` | sem erro, `test result: ok` |
| Tela web mexida | abrir no navegador e olhar a tela | nada cortado nem sobreposto |
| Skills e agentes | `node $HOME/.claude/kit/tools/claude/skills-audit.mjs` | sem estouro |
| Ferramentas do kit | `node --test <cada arquivo .test.mjs>` | `fail 0` |

## 3. Conferir de verdade
- Teste que não dá para rodar aqui (serviço externo, hardware, produção) fica como "não conferido", com o motivo.
- Teste novo só vale se falhou antes (ou com erro plantado) e passa depois.
- Número mostrado na tela tem que bater com a origem (skill `veracidade-de-numero`).

## 4. Relatar
Comando, as 2 ou 3 últimas linhas da saída e o que **não** deu para conferir. Se algo falhou e não dá para corrigir
agora, diga isso, não "pronto".
