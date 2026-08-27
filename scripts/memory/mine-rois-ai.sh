#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV_DIR="$ROOT_DIR/memory/.venv"
PALACE_DIR="$ROOT_DIR/memory/.palace"
export PATH="$VENV_DIR/bin:$PATH"

DRY_RUN_FLAG=()
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN_FLAG=(--dry-run)
fi

mine_dir() {
  local target="$1"
  local wing="$2"
  local args=(
    --wing "$wing"
  )

  if ((${#DRY_RUN_FLAG[@]} > 0)); then
    args+=("${DRY_RUN_FLAG[@]}")
  fi

  mempalace --palace "$PALACE_DIR" mine "$ROOT_DIR/$target" "${args[@]}"
}

mine_dir docs rois-ai
mine_dir doc rois-ai
mine_dir sql rois-ai
mine_dir gantt gantt
mine_dir live-server live-server
mine_dir pbs-server pbs
mine_dir pbs-portal pbs
mine_dir pbs-app pbs
mine_dir rule-engine engines
mine_dir po-engine engines
mine_dir ro-engine engines
