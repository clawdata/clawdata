/**
 * `clawdata completions` — generate shell completions for zsh, bash, or fish.
 */

import { jsonMode, output, die } from "../lib/output.js";

type Shell = "zsh" | "bash" | "fish";

/** All top-level commands and their subcommands. */
export const COMMAND_TREE: Record<string, string[]> = {
  data: ["list", "ingest", "ingest-all", "reset"],
  db: ["query", "exec", "info", "tables", "schema", "sample", "profile", "export"],
  dbt: ["run", "test", "compile", "seed", "docs", "debug", "models", "lineage"],
  run: [],
  init: [],
  config: ["get", "set", "path"],
  status: [],
  setup: [],
  skills: [],
  doctor: [],
  version: [],
  completions: ["zsh", "bash", "fish"],
  help: [],
};

export function generateBashCompletions(): string {
  const cmds = Object.keys(COMMAND_TREE).join(" ");
  const lines: string[] = [
    `# bash completion for clawdata`,
    `# Add to ~/.bashrc: eval "$(clawdata completions bash)"`,
    `_clawdata() {`,
    `  local cur="\${COMP_WORDS[COMP_CWORD]}"`,
    `  local prev="\${COMP_WORDS[COMP_CWORD-1]}"`,
    ``,
    `  if [[ \${COMP_CWORD} -eq 1 ]]; then`,
    `    COMPREPLY=( $(compgen -W "${cmds}" -- "$cur") )`,
    `    return 0`,
    `  fi`,
    ``,
    `  case "$prev" in`,
  ];

  for (const [cmd, subs] of Object.entries(COMMAND_TREE)) {
    if (subs.length) {
      lines.push(`    ${cmd}) COMPREPLY=( $(compgen -W "${subs.join(" ")}" -- "$cur") ) ;;`);
    }
  }

  lines.push(
    `  esac`,
    `  return 0`,
    `}`,
    `complete -F _clawdata clawdata`
  );

  return lines.join("\n");
}

export function generateZshCompletions(): string {
  const cmds = Object.keys(COMMAND_TREE)
    .map((c) => `'${c}:${c} command'`)
    .join("\n        ");

  const subcases: string[] = [];
  for (const [cmd, subs] of Object.entries(COMMAND_TREE)) {
    if (subs.length) {
      const subArgs = subs.map((s) => `'${s}:${s}'`).join(" ");
      subcases.push(`      ${cmd})\n        _arguments '1:subcommand:(${subs.join(" ")})'\n        ;;`);
    }
  }

  return `#compdef clawdata
# zsh completion for clawdata
# Add to ~/.zshrc: eval "$(clawdata completions zsh)"

_clawdata() {
  local -a commands
  commands=(
        ${cmds}
  )

  _arguments '1:command:->cmd' '*::arg:->args'

  case $state in
    cmd)
      _describe 'command' commands
      ;;
    args)
      case $words[1] in
${subcases.join("\n")}
      esac
      ;;
  esac
}

_clawdata "$@"`;
}

export function generateFishCompletions(): string {
  const lines: string[] = [
    `# fish completion for clawdata`,
    `# Save to ~/.config/fish/completions/clawdata.fish`,
    ``,
  ];

  // Top-level commands
  for (const cmd of Object.keys(COMMAND_TREE)) {
    lines.push(
      `complete -c clawdata -n '__fish_use_subcommand' -a '${cmd}' -d '${cmd} command'`
    );
  }

  lines.push(``);

  // Subcommands
  for (const [cmd, subs] of Object.entries(COMMAND_TREE)) {
    for (const sub of subs) {
      lines.push(
        `complete -c clawdata -n '__fish_seen_subcommand_from ${cmd}' -a '${sub}' -d '${sub}'`
      );
    }
  }

  return lines.join("\n");
}

export async function completionsCommand(
  sub: string | undefined,
  _rest: string[]
): Promise<void> {
  switch (sub) {
    case "bash":
      console.log(generateBashCompletions());
      return;
    case "zsh":
      console.log(generateZshCompletions());
      return;
    case "fish":
      console.log(generateFishCompletions());
      return;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      if (jsonMode) {
        output({ shells: ["bash", "zsh", "fish"], commands: COMMAND_TREE });
      } else {
        console.log("Usage: clawdata completions <shell>\n");
        console.log("Shells: bash, zsh, fish\n");
        console.log("Examples:");
        console.log('  eval "$(clawdata completions bash)"    # add to ~/.bashrc');
        console.log('  eval "$(clawdata completions zsh)"     # add to ~/.zshrc');
        console.log("  clawdata completions fish > ~/.config/fish/completions/clawdata.fish");
      }
      return;
    default:
      die(`Unknown shell: ${sub}\nSupported: bash, zsh, fish`);
  }
}
