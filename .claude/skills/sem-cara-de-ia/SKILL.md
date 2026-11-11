---
name: sem-cara-de-ia
description: "Use antes de entregar QUALQUER texto que alguém vai ler (texto de tela, doc, README, changelog, corpo de PR, commit, mensagem de alerta) e ao revisar texto existente. Tira a cara de IA; o texto tem que ter voz de gente. Lint em tools/texto/cara-de-ia.mjs."
---
# sem-cara-de-ia — texto com voz de gente

Regra do projeto: nada aqui pode "parecer escrito por IA". Vale para tudo que
um humano lê: telas, app, docs, README, changelog, PR, commit, texto de alerta e notificação.

## O que denuncia IA (e o que fazer)
| Marca | Troque por |
|---|---|
| Travessão `—` ou ` - ` fazendo aposto | ponto final, vírgula ou dois-pontos |
| "Além disso", "Vale ressaltar", "É importante", "Em resumo", "Note que", "Nota:" | corte; comece pela informação |
| Tríade perfeita ("rápido, seguro e escalável") | diga o que é verdade, 1 ou 2 adjetivos, ou nenhum |
| "robusto", "escalável", "sem fricção", "de ponta a ponta", "poderoso", "experiência", "jornada", "alavancar", "otimizar", "potencializar", "seamless", "fluxo de trabalho" como enfeite | o fato concreto (número, limite, o que acontece) |
| "não é só X, é Y" / "mais do que X" | afirme Y |
| Negrito no início de toda linha, lista de 5+ bullets curtos, títulos com emoji | prosa curta; bullet só para itens paralelos; emoji zero em título/doc/PR |
| Explicar o óbvio ("clique no botão para clicar") e repetir o título no 1º parágrafo | corte |
| Pergunta retórica de abertura, "Vamos …?", "Imagine …" | frase afirmativa |
| Rodapé "🤖 Generated with Claude Code", "Co-Authored-By: Claude" em PR/commit | sem rodapé. O autor é quem commita |
| Inglês de interface em produto pt-BR ("Dashboard", "Features", "Pricing", "Get started") | palavra que o operador e o dev brasileiro usam |
| Frases todas do mesmo tamanho, todas começando com substantivo | varie; uma curta depois de uma longa |
| Promessa vaga ("em breve", "e muito mais") | o que existe hoje, ou nada |

Voz do projeto: quem escreve é um dev que opera isso de verdade e fala com o usuário final e com outro dev.
Curto. Concreto. Alerta diz o que parou, onde e o que fazer ("Worker 2 sem resposta há 30 s. Reiniciando."), nunca "Ocorreu um erro". Segunda pessoa
para o leitor ("você"). Gíria técnica do Brasil é bem-vinda ("sobe", "cai", "trava").

## Procedimento
1. Escreva. Depois leia em voz alta (mentalmente): onde você engasgar, está artificial.
2. Rode o lint na fatia que tocou: `node "$HOME/.kit-memoria-ia/tools/texto/cara-de-ia.mjs" <arquivo|pasta> [...]`
   (só stdlib). Exit 1 com os achados por linha. Falso positivo
   justificado → comentário `cara-de-ia: ok` na linha (markdown/TSX/JSON não: reescreva).
3. Em PR: corpo sem rodapé de IA, sem emoji, Summary em prosa de 2–4 frases. A skill `pr` segue
   valendo para a estrutura (Summary/Evidence/Merge Danger), não para o tom.
4. Em tela (TSX): string nova passa pelo lint; copy longa (landing, guias) ganha leitura
   dupla quando mexer em mais de um bloco.

## Gotchas
- **Travessão não vira ponto por script.** Troca em massa deixa fragmento sem verbo e comma splice. Aposto explicativo vira dois-pontos ou vírgula; oração nova com verbo vira ponto; lista vira "X, Y ou Z". Releia cada frase.
- **String de tela mudou? Teste quebra.** Antes de commitar: `rg -F "<texto antigo>" src --glob '*test*' --glob '*spec*'` e atualize o teste junto. Mensagem de alerta também é lida por teste.
- Dentro de bloco de código, comentário pode ser reescrito; código, payload, comando e saída não.
- `rg` com `—` precisa de UTF-8 no terminal; o lint faz isso em Node para não depender do console.
- O lint não conhece contexto: "experiência" em "experiência do usuário" é marca, em "10 anos de
  experiência" não. Decide quem lê.
- Humano não é sem graça: a voz do projeto continua com personalidade.

## Done
- [ ] Lint sem achados (ou cada um justificado) nos arquivos tocados
- [ ] Nenhum rodapé/menção a IA em PR e commit
- [ ] Título e 1ª frase dizem coisas diferentes; nenhum bullet com negrito decorativo
- [ ] Li em voz alta e não engasguei
