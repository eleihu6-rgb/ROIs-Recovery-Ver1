#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 \"query\"" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV_DIR="$ROOT_DIR/memory/.venv"
PALACE_DIR="$ROOT_DIR/memory/.palace"
export PATH="$VENV_DIR/bin:$PATH"

mempalace --palace "$PALACE_DIR" search "$1"
