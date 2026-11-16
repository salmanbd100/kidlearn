#!/usr/bin/env bash
# PreToolUse guard: every PR targets `dev`; only `dev` itself may open a PR into `main`.
# The GitHub default branch is `dev`, but `--base` is still required so a PR's target
# never depends on a repository setting — this refuses that before it reaches GitHub.
set -euo pipefail

input=$(cat)
cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
cwd=$(jq -r '.cwd // empty' <<<"$input")

grep -qE '(^|[;&|[:space:]])gh[[:space:]]+pr[[:space:]]+(create|edit)([[:space:]]|$)' <<<"$cmd" || exit 0

base=$(grep -oE '(--base|-B)[=[:space:]]+["'\'']?[A-Za-z0-9._/-]+' <<<"$cmd" | head -1 \
  | sed -E 's/^(--base|-B)[=[:space:]]+["'\'']?//' || true)
head=$(grep -oE '(--head|-H)[=[:space:]]+["'\'']?[A-Za-z0-9._/:-]+' <<<"$cmd" | head -1 \
  | sed -E 's/^(--head|-H)[=[:space:]]+["'\'']?//; s/^.*://' || true)

if grep -qE 'gh[[:space:]]+pr[[:space:]]+edit' <<<"$cmd"; then
  [[ -z "$base" || "$base" == "dev" ]] && exit 0
fi

[[ "$base" == "dev" ]] && exit 0

if [[ -z "$base" ]]; then
  echo "Blocked: \`gh pr create\` without \`--base\` leaves the target to the repo default. Feature PRs in kidlearn target \`dev\` — add \`--base dev\`." >&2
  exit 2
fi

if [[ "$base" == "main" ]]; then
  [[ -z "$head" ]] && head=$(git -C "${cwd:-.}" branch --show-current 2>/dev/null || true)
  [[ "$head" == "dev" ]] && exit 0
  echo "Blocked: only \`dev\` may open a pull request into \`main\` (head here is \`${head:-unknown}\`). Use \`--base dev\`; a dev → main release PR is opened from \`dev\` only when the user asks for one." >&2
  exit 2
fi

echo "Blocked: pull requests in kidlearn target \`dev\` (or \`main\` from \`dev\` only), not \`$base\`." >&2
exit 2
