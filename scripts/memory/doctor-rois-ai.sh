#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV_DIR="$ROOT_DIR/memory/.venv"
export PATH="$VENV_DIR/bin:$PATH"

command -v mempalace >/dev/null
test -d "$ROOT_DIR/docs"
test -d "$ROOT_DIR/doc"
test -d "$ROOT_DIR/sql"
test -d "$ROOT_DIR/gantt"
test -d "$ROOT_DIR/live-server"
test -d "$ROOT_DIR/pbs-server"
test -d "$ROOT_DIR/pbs-portal"
test -d "$ROOT_DIR/pbs-app"
test -d "$ROOT_DIR/rule-engine"
test -d "$ROOT_DIR/po-engine"
test -d "$ROOT_DIR/ro-engine"

echo "rois-ai memory doctor: OK"
