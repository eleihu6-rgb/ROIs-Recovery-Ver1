#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV_DIR="$ROOT_DIR/memory/.venv"
PALACE_DIR="$ROOT_DIR/memory/.palace"
export PATH="$VENV_DIR/bin:$PATH"

mkdir -p "$PALACE_DIR"

mempalace --palace "$PALACE_DIR" init "$ROOT_DIR" --yes
echo "Initialized rois-ai palace metadata from $ROOT_DIR into $PALACE_DIR"
