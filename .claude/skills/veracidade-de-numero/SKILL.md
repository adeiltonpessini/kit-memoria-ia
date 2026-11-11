---
name: veracidade-de-numero
description: Método para auditar qualquer número, métrica ou KPI antes de publicar: rastrear até a origem, ver o que a fonte realmente mede e testar as armadilhas (flag presa, unidade, janela, fuso, duplicata, média de médias, ausente virando zero, amostragem). Use quando contestarem um número ou ao criar um.
author: Adeilton Pessini
license: Apache-2.0
---

# Veracidade de número

> Quando o número contradiz quem conhece o processo, suspeite do número primeiro.

## Ordem de trabalho
1. **Escreva a afirmação** que o número faz, em uma frase do mundo real ("o serviço ficou 4h fora do ar").
   Se soa impossível para quem conhece o processo, é bandeira.
2. **Rastreie até a origem:** tela, endpoint, query, view, tabela, coleta, sensor ou evento. Pode vir de uma fonte
   que ninguém suspeitava, ou de uma que não aplica os filtros.
3. **Pergunte o que a fonte mede**, não o que o rótulo afirma. São coisas diferentes.
4. **Rode os testes de armadilha** abaixo.
5. **Reporte** separando medido, estimado e suposto, e diga a direção do erro.

## Armadilhas e o teste de cada uma
- **Flag presa ou campo que não mede o que o nome diz.** "Ativo" pode ser "ligado", não "trabalhando". Cruze o estado
  com uma grandeza real (consumo, volume, requisições). Estado ligado com grandeza zero por muito tempo = flag presa.
  Conte as horas de cada estado: um estado quase ausente denuncia lógica quebrada (ex.: duas condições complementares
  unidas por OR dão sempre verdadeiro).
- **Unidade.** Segundos x milissegundos, bytes x bits, bruto x líquido, moeda e escala (milhar, milhão). Confira a
  ordem de grandeza contra algo que você sabe.
- **Janela de tempo.** A janela pedida existe nos dados? Início e fim inclusivos ou não? Período parcial comparado
  com período completo infla ou esvazia a comparação.
- **Fuso e virada de dia.** UTC x local, horário de verão, "hoje" cortado na hora errada.
- **Duplicata.** Reentrega, retry, join que multiplica linhas. Compare contagem total com contagem de chaves únicas.
- **Média de médias.** Média das médias de grupos de tamanhos diferentes não é a média geral. Agregue do dado
  bruto, ou pondere pelo tamanho do grupo; cuidado também com percentil de percentil.
- **Dado ausente virando zero.** Sem leitura não é zero. Se o coletor caiu, o KPI "ótimo" é cegueira. Zero evento é
  suspeito por padrão: prove que houve oportunidade de o evento existir.
- **Amostragem e truncamento.** Se limitou, amostrou ou cortou (limite de linhas, timeout, teto), diga o que ficou de
  fora. Pilha de valores exatamente no limite do teto é artefato, não medida: faça o histograma.
- **Limiar cego.** Limiar fora de toda a faixa real nunca dispara; o KPI dá zero e parece ótimo. Conte amostras dentro
  da banda que o KPI exige. Se a distribuição não tem vale entre dois modos, a resposta honesta é "esta grandeza não
  discrimina aqui".
- **Cobertura antes de ranking.** Quem não aparece pode estar sem coleta, não ótimo. Liste os ausentes e classifique.
- **O conserto não alcança quem lê direto.** Corrigir a view não corrige o endpoint que lê a tabela crua: busque todo
  consumidor da tabela **e** da view.
- **Saneamento retroativo:** marque, não apague. Coluna aditiva, script idempotente, rollback escrito. Não troque o
  sentido de coluna ou view existente em silêncio: crie a versão limpa ao lado e migre os consumidores.

## Vocabulário obrigatório no relatório
- **medido:** consulta rodada agora, com janela declarada.
- **estimado:** derivado por cálculo; diga a premissa e escreva "ordem de grandeza".
- **suposto:** hipótese sem prova. Marque como tal ou não escreva.
- **direção do erro:** infla ou subestima. Sempre.

## Anti-padrões
- Apresentar número sem a janela de dados.
- Tratar a premissa de quem conhece o processo como ruído.
- "Confirmar" a hipótese sem procurar o que a derrubaria.
- Corrigir o número e não corrigir o **método** que o gerou.
