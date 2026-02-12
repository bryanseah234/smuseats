#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage:
  $(basename "$0") --base main --prs 1,2,3,4,5 [--remote origin] [--branch integration/pr-1-5-into-main]

Description:
  Fetches each PR head ref from the remote and merges them into a new integration branch
  from the specified base branch using --no-ff to preserve commit history.
USAGE
}

REMOTE="origin"
BASE=""
PRS=""
BRANCH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote)
      REMOTE="$2"
      shift 2
      ;;
    --base)
      BASE="$2"
      shift 2
      ;;
    --prs)
      PRS="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$BASE" || -z "$PRS" ]]; then
  echo "Error: --base and --prs are required." >&2
  usage
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: not inside a git repository." >&2
  exit 1
fi

if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  echo "Error: remote '$REMOTE' is not configured." >&2
  echo "Add it first, e.g. git remote add $REMOTE <repo-url>" >&2
  exit 1
fi

if [[ -z "$BRANCH" ]]; then
  BRANCH="integration/pr-${PRS//,/\-}-into-${BASE}"
fi

echo "Fetching latest refs from $REMOTE..."
git fetch "$REMOTE"

echo "Preparing base branch $BASE..."
git checkout "$BASE"
git pull --ff-only "$REMOTE" "$BASE"

echo "Creating integration branch $BRANCH..."
if git show-ref --quiet "refs/heads/$BRANCH"; then
  echo "Error: branch '$BRANCH' already exists locally. Remove it or pass --branch." >&2
  exit 1
fi
git checkout -b "$BRANCH"

IFS=',' read -r -a pr_numbers <<< "$PRS"

for pr in "${pr_numbers[@]}"; do
  pr_trimmed="$(echo "$pr" | xargs)"
  if [[ ! "$pr_trimmed" =~ ^[0-9]+$ ]]; then
    echo "Error: invalid PR number '$pr_trimmed'." >&2
    exit 1
  fi

  local_ref="pr-$pr_trimmed"
  echo "\nFetching PR #$pr_trimmed into local ref '$local_ref'..."
  git fetch "$REMOTE" "pull/$pr_trimmed/head:$local_ref"

  echo "Merging '$local_ref' with --no-ff..."
  if ! git merge --no-ff "$local_ref" -m "Merge PR #$pr_trimmed into $BRANCH"; then
    echo "Merge conflict while applying PR #$pr_trimmed." >&2
    echo "Resolve conflicts, then run: git add <files> && git commit" >&2
    echo "After completion, continue with remaining PRs manually." >&2
    exit 1
  fi
done

echo "\nIntegration complete."
echo "Run your checks, then push:"
echo "  git push -u $REMOTE $BRANCH"
