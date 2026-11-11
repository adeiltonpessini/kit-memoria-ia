#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Adeilton Pessini e contribuidores do kit-memoria-ia
// guard-git.mjs — hook PreToolUse (Bash|PowerShell): nega comando git DESTRUTIVO. OPCIONAL (instalar com --com-guard-git).
//
// Origem: skill git-guardrails do mattpocock/skills (MIT), adaptada. A original bloqueia até
// `git push`; aqui push normal, commit, merge e rebase seguem livres. Só cai o que apaga
// trabalho sem volta: reset --hard, clean -f, branch -D, push --force (sem lease),
// checkout/restore de tudo, stash clear/drop. É SEGURANÇA, não economia.
//
// Texto entre aspas é removido antes de casar (mensagem de commit citando
// "git reset --hard" não é comando). Intencional mesmo? Rode você com `!` no prompt.
// Zero deps. Sai 0 sempre; a decisão vai no JSON do stdout.

const REGRAS = [
  [/\bgit\b[^;&|\n]*\breset\b[^;&|\n]*--hard\b/, "git reset --hard descarta mudanças não commitadas"],
  [/\bgit\b[^;&|\n]*\bclean\b[^;&|\n]*\s-[a-zA-Z]*f/, "git clean -f apaga arquivos não rastreados"],
  [/\bgit\b[^;&|\n]*\bbranch\b[^;&|\n]*(\s-[a-zA-Z]*D\b|--delete\s+--force|--force\s+--delete)/, "git branch -D apaga branch sem checar merge"],
  [/\bgit\b[^;&|\n]*\bpush\b[^;&|\n]*(\s--force(?!-with-lease)\b|\s-[a-zA-Z]*f\b)/, "git push --force reescreve o remoto (use --force-with-lease na SUA branch)"],
  [/\bgit\b[^;&|\n]*\bpush\b[^;&|\n]*\s\+\S+/, "push com +refspec é force push"],
  [/\bgit\b[^;&|\n]*\b(checkout|restore)\b(\s+--)?\s+\.(\s|$)/, "checkout/restore de '.' descarta todas as mudanças locais"],
  [/\bgit\b[^;&|\n]*\bstash\b\s+(clear|drop)\b/, "stash é global do repo (todas as worktrees): clear/drop perde trabalho alheio"],
];

export function avaliar(comando) {
  // tira strings entre aspas (inclui heredoc dentro de "$(cat <<EOF ...)") e here-string do PS
  const limpo = String(comando || "")
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\b/g, " ") // corpo de heredoc é dado
    .replace(/@'[\s\S]*?'@|@"[\s\S]*?"@/g, " ")
    .replace(/"(?:\\.|[^"\\])*"|'[^']*'/g, " ");
  for (const [re, motivo] of REGRAS) if (re.test(limpo)) return motivo;
  return null;
}

if (process.argv[1]?.endsWith("guard-git.mjs")) { // rodando como hook (o teste só importa)
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    let motivo = null;
    try {
      const ev = JSON.parse(raw || "{}");
      if (/^(Bash|PowerShell)$/.test(ev.tool_name || "")) motivo = avaliar(ev.tool_input?.command);
    } catch { /* entrada estranha: não bloqueia */ }
    if (motivo) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `guard-git: ${motivo}. Ache a alternativa não destrutiva; se for mesmo intencional, peça ao usuário para rodar com '!' no prompt.`,
        },
      }));
    }
    process.exit(0);
  });
}
