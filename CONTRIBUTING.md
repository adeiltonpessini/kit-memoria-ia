# Como contribuir

Obrigado por querer melhorar o kit. Para ele não virar bagunça, tudo passa por estas regras.

## Antes de abrir PR

1. **Abra uma issue primeiro** para mudança grande (peça nova, skill nova, mudança de formato). Correção
   pequena pode ir direto.
2. **Genérico sempre.** Nada de nome de empresa, cliente, domínio, IP, caminho de disco ou segredo. Exemplo
   usa `meu-projeto`, `backend`, `exemplo.com`.
3. **Zero dependência npm.** Node 22+ e a biblioteca padrão. Dependência nova só com issue aprovada.
4. **Skill curta.** `SKILL.md` até ~8 KB, `description` até 400 bytes, com `author` e `license` no
   frontmatter. Rode `node tools/claude/skills-audit.mjs`.
5. **Teste.** Script novo com lógica ganha `*.test.mjs` (`node --test`). O CI roda tudo.
6. **Hook calado por padrão.** Projeto que não adotou o recurso não pode receber saída nem bloqueio.
7. **Texto em português claro**, sem jargão inventado. Inglês é bem-vindo em `README.en.md`.

## Assinatura (DCO)

Cada commit leva a linha `Signed-off-by` (use `git commit -s`). Ela declara que você tem o direito de
enviar o código sob a licença do projeto ([Developer Certificate of Origin 1.1](https://developercertificate.org/)).
PR sem assinatura não é mesclado.

## Autoria

Arquivo novo leva o cabeçalho:

```js
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
```

Você entra em `AUTHORS` no PR. A licença do projeto não muda por contribuição.

## Quem decide

O mantenedor (`.github/CODEOWNERS`) revisa e mescla. A `main` é protegida: só entra por PR com CI verde.
