// Shell completion for bash, zsh and fish (docs/design/08 s6), made from the command registry so it cannot fall behind it.
// It completes command names, sub-commands and flag names. It never completes a value, so nothing secret can end up in it.
type Cmd = { about: string; subs?: string[]; flags?: string[] };

export function completion(shell: string, cmds: Record<string, Cmd>, global: string[]): string | null {
  const names = Object.keys(cmds), words = (c: Cmd) => [...(c.subs ?? []), ...[...(c.flags ?? []), ...global].map(f => `--${f}`)].join(' ');
  if (shell === 'bash') return [`# apex completion for bash. Load it with: eval "$(apex completion bash)"`, '_apex() {', '  local cur="${COMP_WORDS[COMP_CWORD]}"',
    `  if [ "$COMP_CWORD" -eq 1 ]; then COMPREPLY=( $(compgen -W "${names.join(' ')}" -- "$cur") ); return; fi`, '  case "${COMP_WORDS[1]}" in',
    ...names.map(n => `    ${n}) COMPREPLY=( $(compgen -W "${words(cmds[n])}" -- "$cur") ) ;;`), '  esac', '}', 'complete -o default -F _apex apex'].join('\n');
  const q = (s: string) => s.replace(/'/g, `'\\''`);
  if (shell === 'zsh') return ['#compdef apex', `# apex completion for zsh. Load it with: eval "$(apex completion zsh)"`, '_apex() {', '  local -a cmds', `  cmds=(${names.map(n => `'${n}:${q(cmds[n].about).replace(/:/g, ' -')}'`).join(' ')})`,
    `  if (( CURRENT == 2 )); then _describe 'command' cmds; return; fi`, '  case "$words[2]" in', ...names.map(n => `    ${n}) compadd -- ${words(cmds[n])} ;;`), '  esac', '}', 'compdef _apex apex'].join('\n');
  if (shell === 'fish') return [`# apex completion for fish. Load it with: apex completion fish | source`, 'complete -c apex -f',
    ...names.map(n => `complete -c apex -n '__fish_use_subcommand' -a '${n}' -d '${q(cmds[n].about)}'`),
    ...names.flatMap(n => [...(cmds[n].subs ?? []).map(s => `complete -c apex -n '__fish_seen_subcommand_from ${n}' -a '${s}'`), ...[...(cmds[n].flags ?? []), ...global].map(f => `complete -c apex -n '__fish_seen_subcommand_from ${n}' -l '${f}'`)])].join('\n');
  return null;
}
