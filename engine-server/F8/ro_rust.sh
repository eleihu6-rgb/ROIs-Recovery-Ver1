#!/usr/bin/env bash
# LOCAL RO pipeline using the RUST legality connector (mode=rust).
#
# Mirrors legacy_ro.sh but for this Mac: runs the pbs-engine solver
# with rule_engine.mode=rust so a
# UI-triggered run exercises the in-process Rust rule engine. Then converts the
# legacy ro_output.txt to the new ## CSV gz the gantt reads.
#
# Called by engine-server task_manager with: ro_rust.sh <working_dir> <input_gz>
# (cwd == working_dir). Set PG_PASSWORD in the env to pull rule params from PG
# workset 103 (else the connector uses its F8 fallback defaults, age=65).
set -euo pipefail

WORKING_DIR="$(pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# --- Solver connection — ALL configurable via env (for remote deployment). ---
# RO_SOLVER_DIR        where the PBS solver lives (the run_solver.py dir)
# RO_SOLVER_PYTHON     interpreter with ortools + the rust connector wheel
# RO_CONVERTER_PYTHON  interpreter with psycopg2 for legacy_ro_converter.py
# RO_EXPERIMENT        Hydra experiment name
# RO_RULE_ENGINE_MODE  internal | cpp | rust   (the legality engine)
# When this script is deployed on another host, point these at that host's paths.
#
# ⚠ ENV-SHADOWING PITFALL — rois_rule_engine_rs MUST resolve inside
# $RO_SOLVER_PYTHON's env. If the running user has a stale copy under their user
# site-packages (~/.local/lib/pythonX.Y/site-packages), Python prefers it over the
# solver env and the run dies in load_scenario with an obscure:
#   TypeError: Engine.__new__() got an unexpected keyword argument 'calendar_sdfd_rule_rows'
# Verify before running (must print under the solver env, NOT ~/.local):
#   $RO_SOLVER_PYTHON -c "import rois_rule_engine_rs as m; print(m.__file__)"
# Clean stray copies with:
#   rm -rf ~/.local/lib/python3.*/site-packages/rois_rule_engine_rs*
# UAT/SIT pre-install the solver outside the engine deployment tree. Keeping
# this fallback canonical prevents a relocated engine-server from silently
# invoking a stale or nonexistent <engine-root>/pbs-engine checkout.
SNAP="${RO_SOLVER_DIR:-/home/rois/PBS_column_based_algorithm-main}"
SOLVER_PY="${RO_SOLVER_PYTHON:-$SNAP/.venv/bin/python}"
CONV_PY="${RO_CONVERTER_PYTHON:-$REPO_ROOT/engine-server/.venv/bin/python}"
# Default deploy/sit matches conf/experiments/deploy/sit.yaml (exists in-tree).
# deploy/prod_0604 was moved under deploy/_0630_2/ and is NOT a valid Hydra group
# path — using it makes the solver exit immediately with "Could not find experiments/…".
# Override via RO_EXPERIMENT on each host (SIT env: RO_EXPERIMENT=deploy/sit).
EXPERIMENT="${RO_EXPERIMENT:-deploy/sit}"
RULE_MODE="${RO_RULE_ENGINE_MODE:-rust}"

OUTPUT_SUBDIR="${WORKING_DIR}/output"
RO_INPUT_TXT="${WORKING_DIR}/ro_input.txt"
RO_OUTPUT_TXT="${OUTPUT_SUBDIR}/ro_output.txt"
# task_manager passes $2 as a path relative to the engine-server root, but our cwd
# IS the working dir, so that relative path double-nests and misses. input.gz always
# lives in the working dir, so resolve it from $(pwd) (like legacy_ro.sh); only fall
# back to $2 if for some reason it's not there.
if [ -f "${WORKING_DIR}/input.gz" ]; then
  INPUT_GZ="${WORKING_DIR}/input.gz"
else
  INPUT_GZ="${2:-${WORKING_DIR}/input.gz}"
fi
OUTPUT_GZ="${WORKING_DIR}/output.gz"

echo "PROGRESS:5"
echo "[RustRO] working_dir=${WORKING_DIR}" >&2
echo "[RustRO] solver=${SOLVER_PY}" >&2
echo "[RustRO] input.gz: $([ -f "$INPUT_GZ" ] && echo exists || echo MISSING)" >&2

# -- Step 1: decompress input.gz → ro_input.txt (caret format, as legacy_ro) --
# Use `gzip -dc` (macOS `zcat` only handles .Z, not .gz).
mkdir -p "$OUTPUT_SUBDIR"
gzip -dc "$INPUT_GZ" > "$RO_INPUT_TXT"
echo "[RustRO] ro_input.txt $(wc -l < "$RO_INPUT_TXT") lines" >&2
echo "PROGRESS:10"

# -- Step 2: run the PBS solver with the Rust legality connector --
# Paths are wrapped in Hydra single-quotes because the repo lives under an iCloud
# path with spaces + '~' that the Hydra override grammar would otherwise reject.
# Crew division for problem.crew_type: the solver filters crews by division and the
# deploy experiment hardcodes 'P' (pilot). engine-server sets RO_CREW_TYPE from the
# scenario's own division (P/C/…) so cabin-crew scenarios solve too. Default 'P' keeps
# pilot runs unchanged.
CREW_TYPE="${RO_CREW_TYPE:-P}"
echo "[RustRO] running solver (mode=$RULE_MODE, crew_type=$CREW_TYPE) at $SNAP" >&2
"$SOLVER_PY" "$SCRIPT_DIR/ro_solver_wrapper.py" "$SNAP" "$RO_INPUT_TXT" \
  +experiments="$EXPERIMENT" \
  "data='$RO_INPUT_TXT'" \
  "pref_dir='$WORKING_DIR'" \
  "problem.crew_type=$CREW_TYPE" \
  "rule_engine.working_directory='$WORKING_DIR'" \
  "rule_engine.mode=$RULE_MODE" \
  "hydra.run.dir='$OUTPUT_SUBDIR'" \
  2>&1 | while IFS= read -r line; do echo "$line"; done
echo "PROGRESS:78"

# -- Step 3: verify optimizer output --
if [ ! -f "$RO_OUTPUT_TXT" ]; then
  echo "[RustRO] ERROR: solver did not produce ro_output.txt" >&2
  ls -la "$OUTPUT_SUBDIR" >&2
  exit 1
fi
echo "[RustRO] ro_output.txt $(wc -l < "$RO_OUTPUT_TXT") lines" >&2

# -- Step 4: convert legacy txt → new ## CSV gz (the gantt-readable format) --
# We always use the REMOTE PG (the local f8 schema is empty). The converter's
# pairing-id mapping / roster writes require $LEGACY_RO_DB_URL (env, never
# hardcoded). Set LEGACY_RO_DB_URL in the engine-server env to the target live
# schema DSN.
echo "PROGRESS:80"
CONV_ARGS=(
  --input-txt  "$RO_INPUT_TXT"
  --output-txt "$RO_OUTPUT_TXT"
  --input-gz   "$INPUT_GZ"
  --output-gz  "$OUTPUT_GZ"
)
if [ -n "${LEGACY_RO_DB_URL:-}" ]; then
  CONV_ARGS+=(--db-url "$LEGACY_RO_DB_URL")
  echo "[RustRO] converter using remote PG via LEGACY_RO_DB_URL" >&2
else
  echo "[RustRO] ERROR: LEGACY_RO_DB_URL unset; converter requires an explicit DB URL" >&2
fi
"$CONV_PY" "$SCRIPT_DIR/legacy_ro_converter.py" "${CONV_ARGS[@]}"

echo "[RustRO] done: output.gz=$([ -f "$OUTPUT_GZ" ] && du -sh "$OUTPUT_GZ"|cut -f1 || echo MISSING)" >&2
echo "PROGRESS:98"
exit 0
