#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV_DIR="$ROOT_DIR/memory/.venv"
PALACE_DIR="$ROOT_DIR/memory/.palace"
WING="${1:-rois-ai}"
export PATH="$VENV_DIR/bin:$PATH"

mempalace --palace "$PALACE_DIR" wake-up --wing "$WING"
