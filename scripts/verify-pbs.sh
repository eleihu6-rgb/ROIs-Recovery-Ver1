#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WITH_E2E="${1:-}"

run_step() {
  local label="$1"
  shift

  echo ""
  echo "==> ${label}"
  "$@"
}

run_in_dir() {
  local label="$1"
  local dir="$2"
  shift 2

  echo ""
  echo "==> ${label}"
  (
    cd "${ROOT_DIR}/${dir}"
    "$@"
  )
}

run_in_dir "pbs-server: npm test" "pbs-server" npm test
run_in_dir "pbs-server: npm run build" "pbs-server" npm run build
run_in_dir "pbs-server: npm run sync:pbs-users -- --dry-run" "pbs-server" npm run sync:pbs-users -- --dry-run
run_in_dir "pbs-portal: npm test" "pbs-portal" npm test
run_in_dir "pbs-portal: npm run lint" "pbs-portal" npm run lint
run_in_dir "pbs-portal: npm run build" "pbs-portal" npm run build

if [[ "${WITH_E2E}" == "--with-e2e" ]]; then
  run_in_dir \
    "e2e: npm run test:pbs-portal -- --no-deps tests/pbs-portal/portal-smoke.spec.ts" \
    "e2e" \
    npm run test:pbs-portal -- --no-deps tests/pbs-portal/portal-smoke.spec.ts
fi

run_step "verify:pbs completed" echo "PBS verification finished successfully."
