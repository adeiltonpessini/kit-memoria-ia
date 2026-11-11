---
name: licao-aprendida
description: Use quando um gotcha, bug de causa não óbvia ou passo caro for descoberto ("isso de novo", "não repetir", "anota a lição", retro do handoff): verifica a causa contra o código, escreve a lição em docs/knowledge/licoes/ e leva a regra para onde o próximo agente lê (playbook, skill, teste ou script).
---

# licao-aprendida: gotcha vira regra onde ela protege

Lição que só existe no arquivo morto não protege ninguém. O próximo agente lê o playbook da
área dele, a skill que carregou e o teste que quebrou, não o acervo inteiro. Por isso a lição
tem **duas metades**: o registro (`docs/knowledge/licoes/`) e a regra no lugar certo.

## Quando
- Bug cuja causa não era óbvia, ou que já aconteceu antes.
- Passo que custou caro (tempo, contexto, cota, deploy desfeito) e tem jeito barato de evitar.
- Item "Mudar" da retro do handoff que ainda não virou nada.
- **Não** é para fato de estado do projeto (isso é handoff) nem para decisão de produto (isso é `remember`, tipo decisão).

## Passo a passo
1. **Reproduza ou prove a causa hoje.** Memória é pista: rode o comando, ache o `caminho:linha`.
   Sem prova, a lição fica como suspeita no handoff, não vira regra.
2. **Procure se já existe**: `rg -il "<termo>" docs/knowledge docs/agentes .claude/skills`
   e `node $HOME/.claude/kit/tools/knowledge/akita.mjs search "<termo>"`. Existe? Atualize `verificada-em` e a
   regra; não crie outra.
3. **Escreva:** `node $HOME/.claude/kit/tools/knowledge/remember.mjs "<regra curta>" --type licao`. Preencha sintoma,
   causa verificada, regra no imperativo, como detectar e onde a regra mora.
4. **Leve a regra para onde ela age** (escolha o mais forte que couber):
   | Força | Onde | Quando |
   |---|---|---|
   | 1 | teste, gate ou guarda em script | dá para detectar por máquina |
   | 2 | "Armadilhas" do playbook do agente da área (`docs/agentes/`) | vale para uma área |
   | 3 | `docs/agentes/_padroes-comuns.md` | vale para todo agente (raro: pesa em toda sessão) |
   | 4 | skill relacionada (seção Gotchas) | vale para um procedimento |
   Uma linha, com link para a lição: `- <regra> ([[licoes/<slug>]])`.
5. **Commit junto**: lição + regra no mesmo commit, `docs(licao): <regra>`.

## Regras
- Uma lição, uma regra. Título é a regra, não o sintoma ("cliente perde a assinatura ao reconectar sem sessão", não "fila bugada").
- Sem nada de outro projeto: lição de outro repo não se copia; se o mecanismo é genérico, reescreva com o caso daqui.
- Data absoluta e local. Lição contraditada pelo código atual é apagada ou corrigida, nunca deixada brigando.
- Nunca segredo, IP de cliente ou token no exemplo.
- Não é hook, não bloqueia nada: é hábito da revisão e da retro.

## Faxina
Na consolidação (`docs/knowledge/CONSOLIDATION.md`), cada lição com `verificada-em` velho tem o
"Como detectar" rodado de novo. Não detecta mais e o código mudou: atualize ou apague.

Relacionado: `remember` (decisão e handoff) · `skill-smith` (quando a lição vira procedimento novo).
