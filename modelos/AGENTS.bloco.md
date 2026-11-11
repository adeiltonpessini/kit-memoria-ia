<!-- kit-memoria-ia:inicio (gerado pelo kit; edite à vontade, mas mantenha as marcas) -->
## Memória do projeto (kit-memoria-ia)

Este projeto guarda o que não está no código em `docs/knowledge/`, em markdown simples.

- **Ao começar:** leia só a primeira seção `#` (o TL;DR) do handoff mais recente em
  `docs/knowledge/sessions/` (o nome mais novo, `chat-AAAA-MM-DD-<tema>.md`). Não leia os outros.
- **Antes de procurar no código:** `rg` (ripgrep) e depois leia só a fatia que ele apontou. Para o acervo:
  `node "$HOME/.kit-memoria-ia/tools/knowledge/akita.mjs" search "<tema>"`. Para estrutura, se existir
  `graphify-out/`: `graphify affected "X"`, `graphify path "A" "B"`, `graphify explain "X"`.
- **Decisão não óbvia** vira um `.md` em `docs/knowledge/decisions/` (problema, decisão, razão).
- **Erro que custou caro** vira lição em `docs/knowledge/licoes/`, com a regra levada para onde o próximo vai ler.
- **Ao terminar trabalho real:** escreva o handoff em `docs/knowledge/sessions/chat-AAAA-MM-DD-<tema>.md`.
  A primeira seção `#` é o TL;DR e basta sozinha (estado, pendente, onde está o detalhe). Depois: o que ficou
  pronto, pendente, armadilhas, estado do git e o próximo passo, com caminhos e comandos.
  Atalho: `node "$HOME/.kit-memoria-ia/tools/knowledge/remember.mjs" "<tema>" --type session`.
- **Antes de dizer "pronto":** rode a checagem da área que mudou e mostre o fim da saída. Nada de "deve passar".
- Memória é pista: confira contra o código antes de afirmar. Data relativa vira data absoluta.
- Nunca grave segredo, senha ou token em `docs/knowledge/`.
<!-- kit-memoria-ia:fim -->
