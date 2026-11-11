# Changelog

Formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), versões [SemVer](https://semver.org/lang/pt-BR/).

## [1.1.0] - 2026-11-11

### Adicionado
- README em inglês (`README.en.md`) e imagens animadas de fluxo, claras e escuras, em `assets/`.
- Créditos a Fabio Akita (método Akita e ai-memory) no NOTICE e no README.
- Imagem de prévia para redes sociais (`assets/social.png`).

### Corrigido
- Skills apontavam para `~/.claude/kit/tools`, que só existe no Claude Code. Agora usam `kit.mjs lembrar`,
  `kit.mjs buscar` e `~/.kit-memoria-ia/tools`, que valem para qualquer IA.
- `spec-primeiro`, `skill-smith`, `licao-aprendida` e `skills-audit` citavam um arquivo que o kit não cria;
  agora citam o `AGENTS.md` do projeto.
- `assets/`, `README.en.md` e `CHANGELOG.md` entram no pacote npm.

## [1.0.0] - 2026-11-11

### Adicionado
- Memória de projeto em markdown (`docs/knowledge/`): handoff de sessão, decisões, lições, busca BM25.
- Instalação global de um comando, para Claude Code, Codex, Gemini CLI, Copilot e Cursor.
- `AGENTS.md` por projeto, lido por qualquer IA de código.
- Hooks do Claude Code: injeção do handoff, cobrança de handoff, guarda de contexto, roteador de agentes,
  checagem antes de encerrar, lembrete de `/clear`, aviso de correção, guarda de git opcional.
- Skills: memória, busca econômica, mapa do código, spec, PR, sabatina, verificação, veracidade de número,
  revisão de texto, criação de skill, passo manual guiado.
- Guia de economia de token (`GUIA.md`).
