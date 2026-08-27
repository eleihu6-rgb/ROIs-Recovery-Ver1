#!/usr/bin/env bash
# validate-cleanup.sh — two assertions on the post-removal state:
#   1. Python rule engine directories and imports are GONE.
#   2. live-server successfully hot-reloads (TSC passes, no import errors).
#
# Run from repo root:  bash scripts/validate-cleanup.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0; FAIL=0

ok()   { echo "  [PASS] $*"; PASS=$((PASS+1)); }
fail() { echo "  [FAIL] $*"; FAIL=$((FAIL+1)); }
hdr()  { echo; echo "=== $* ==="; }

# ─── 1. Python rule engine directories deleted ────────────────────────────────
hdr "1. Python rule engine directories"

[ ! -d "$ROOT/rois-rule-engine" ] \
  && ok "rois-rule-engine/ gone" \
  || fail "rois-rule-engine/ still exists"

# rule-engine/ had both Python (main.py, src/) and TS dist — both deleted
[ ! -d "$ROOT/rule-engine" ] \
  && ok "rule-engine/ gone" \
  || fail "rule-engine/ still exists"

# ─── 2. No Python rule engine imports in engine-server ───────────────────────
hdr "2. engine-server: no rois_rule_engine imports"

if grep -r "rois_rule_engine" "$ROOT/engine-server/src/" --include="*.py" -l 2>/dev/null; then
  fail "rois_rule_engine import found in engine-server/src/"
else
  ok "no rois_rule_engine imports in engine-server/src/"
fi

if [ -f "$ROOT/engine-server/src/api/rule_session_routes.py" ]; then
  fail "rule_session_routes.py still exists"
else
  ok "rule_session_routes.py deleted"
fi

if [ -f "$ROOT/engine-server/src/services/rule_engine_service.py" ]; then
  fail "rule_engine_service.py still exists"
else
  ok "rule_engine_service.py deleted"
fi

if [ -f "$ROOT/engine-server/src/workers/violation_worker.py" ]; then
  fail "violation_worker.py still exists"
else
  ok "violation_worker.py deleted"
fi

# ─── 3. No live-server TS workers importing @rois/rule-engine ────────────────
hdr "3. live-server: no @rois/rule-engine or rule-engine-client imports"

if grep -r "@rois/rule-engine\|rule-engine-client" "$ROOT/live-server/src/" --include="*.ts" -l 2>/dev/null; then
  fail "@rois/rule-engine or rule-engine-client import found in live-server/src/"
else
  ok "no @rois/rule-engine imports in live-server/src/"
fi

# Specifically check the deleted workers are gone
for f in \
  "live-server/src/workers/violations-init-worker.ts" \
  "live-server/src/workers/check-pairing-worker.ts" \
  "live-server/src/workers/check-roster-worker.ts" \
  "live-server/src/routes/admin/violations-init.ts" \
  "live-server/src/services/rule-engine-client.ts" \
  "gantt/src/services/violations-init-api.ts"
do
  [ ! -f "$ROOT/$f" ] \
    && ok "$f deleted" \
    || fail "$f still exists"
done

# ─── 4. No references to port 3001 as a rule engine endpoint ─────────────────
hdr "4. No rule-engine:3001 references in active source"

RULE_ENGINE_3001=$(grep -r "localhost:3001\|:3001.*rule\|rule.*3001" \
  "$ROOT/live-server/src/" "$ROOT/gantt/src/" "$ROOT/engine-server/src/" \
  --include="*.ts" --include="*.py" -l 2>/dev/null || true)

if [ -n "$RULE_ENGINE_3001" ]; then
  fail "Found rule-engine:3001 references in: $RULE_ENGINE_3001"
else
  ok "no rule-engine:3001 references in source"
fi

# ─── 5. live-server tsc passes ───────────────────────────────────────────────
hdr "5. live-server TypeScript compiles without errors"

cd "$ROOT/live-server"
if npx tsc --noEmit 2>&1 | grep -v "^$" | grep -c "error TS" > /dev/null 2>&1; then
  TSC_ERRORS=$(npx tsc --noEmit 2>&1 | grep "error TS" | wc -l | tr -d ' ')
  if [ "$TSC_ERRORS" -eq 0 ]; then
    ok "live-server tsc: 0 errors"
  else
    fail "live-server tsc: $TSC_ERRORS errors"
    npx tsc --noEmit 2>&1 | grep "error TS" | head -5
  fi
else
  ok "live-server tsc: 0 errors"
fi
cd "$ROOT"

# ─── 6. Rust rule engine binaries built ──────────────────────────────────────
hdr "6. Rust rule engine binaries exist in target/release"

BIN_DIR="$ROOT/rule-engine-rs/target/release"
for bin in check-8002 check-8056 check-8030 check-8004 check-7505 check-7506 check-7508 check-7501 check-7503 check-7504 ruletool; do
  [ -f "$BIN_DIR/$bin" ] \
    && ok "binary: $bin" \
    || fail "binary MISSING: $BIN_DIR/$bin"
done

# ─── 7. Rust cold-start hook wired in live-server/src/index.ts ───────────────
hdr "7. Rust cold-start legality reload hook in live-server/src/index.ts"

if grep -q "live-legality\|runLegalityOnStartup\|cold.start" "$ROOT/live-server/src/index.ts"; then
  ok "cold-start hook present in live-server/src/index.ts"
else
  fail "cold-start hook NOT found in live-server/src/index.ts — run step 8 of this script to add it"
fi

# ─── 8. Summary ──────────────────────────────────────────────────────────────
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PASS: $PASS   FAIL: $FAIL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
[ "$FAIL" -eq 0 ] && echo "  All checks passed." && exit 0
echo "  Fix the items above, then re-run." && exit 1
