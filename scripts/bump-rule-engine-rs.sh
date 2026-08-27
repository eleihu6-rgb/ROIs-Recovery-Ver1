#!/usr/bin/env bash
# Usage: bash scripts/bump-rule-engine-rs.sh
# Run this after pushing changes in rule-engine-rs/ to auto-update the submodule pointer.
set -euo pipefail

root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$root"

git add rule-engine-rs
if git diff --cached --quiet rule-engine-rs; then
  echo "rule-engine-rs pointer already up to date, nothing to commit."
  exit 0
fi

hash=$(git -C rule-engine-rs rev-parse --short HEAD)
git commit -m "chore(submodule): bump rule-engine-rs to ${hash}"
git push
echo "✓ rule-engine-rs pointer bumped to ${hash} and pushed."
