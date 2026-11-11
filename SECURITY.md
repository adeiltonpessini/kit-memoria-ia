# Segurança

O kit roda na sua máquina com as suas permissões: os hooks executam `node` a cada evento da IA. Por isso:

- não há rede, a não ser o `aimemory.mjs`, que só fala com `127.0.0.1` (ou o endereço que você der);
- nenhum script lê `.env`, chave ou credencial;
- o instalador guarda cópia do seu `settings.json` antes de mexer.

## Achou uma falha?

Não abra issue pública. Use **Security → Report a vulnerability** neste repositório (aviso privado do
GitHub). Resposta em até 7 dias. Versão suportada: a última release.
