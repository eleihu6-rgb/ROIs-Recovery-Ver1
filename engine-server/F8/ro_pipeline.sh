#!/usr/bin/env bash
# F8 RO pipeline — calls /home/rois/PBS_column_based_algorithm-main/run_pipeline.sh
#
# Called by engine-server task_manager with: ro_pipeline.sh <working_dir> <input_gz>
# (cwd == working_dir)
#
# Steps:
#   1. Decompress input.gz → ro_input.txt
#   2. Run PBS solver (two modes):
#      UAT: PBS_VENV_PYTHON set → run_solver.py directly with existing venv (no conda)
#      SIT: PBS_VENV_PYTHON unset → sudo env PATH (conda in /root/miniforge3)
#   3. Verify ro_output.txt produced
#   4. Convert ro_output.txt → output.gz via legacy_ro_converter.py
set -euo pipefail

WORKING_DIR="$(pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PBS_PIPELINE="${PBS_PIPELINE_SCRIPT:-/home/rois/PBS_column_based_algorithm-main/run_pipeline.sh}"
CONV_PY="${RO_CONVERTER_PYTHON:-$REPO_ROOT/engine-server/.venv/bin/python}"

OUTPUT_SUBDIR="${WORKING_DIR}/output"
RO_INPUT_TXT="${WORKING_DIR}/ro_input.txt"
RO_OUTPUT_TXT="${OUTPUT_SUBDIR}/ro_output.txt"

if [ -f "${WORKING_DIR}/input.gz" ]; then
    INPUT_GZ="${WORKING_DIR}/input.gz"
else
    INPUT_GZ="${2:-${WORKING_DIR}/input.gz}"
fi
OUTPUT_GZ="${WORKING_DIR}/output.gz"

echo "PROGRESS:5"
echo "[PBSPipeline] working_dir=${WORKING_DIR}" >&2
echo "[PBSPipeline] pipeline=${PBS_PIPELINE}" >&2
echo "[PBSPipeline] input.gz: $([ -f "$INPUT_GZ" ] && echo exists || echo MISSING)" >&2

# -- Step 1: decompress input.gz → ro_input.txt --
mkdir -p "$OUTPUT_SUBDIR"
gzip -dc "$INPUT_GZ" > "$RO_INPUT_TXT"
echo "[PBSPipeline] ro_input.txt $(wc -l < "$RO_INPUT_TXT") lines" >&2
echo "PROGRESS:10"

# -- Step 2: run PBS column-based pipeline --
PBS_PROJECT_DIR="$(dirname "$PBS_PIPELINE")"
PBS_EXPERIMENT="${PBS_EXPERIMENT:-deploy/sit}"
# 法规引擎模式（勿改回 internal）：PBS 优化必须调用 RUST 法规。
# 项目最新标准 = rust-hybrid（Python 首轮过滤，Rust 兜底），默认值见
# conf/experiments/deploy/{uat,sit}.yaml 的 rule_engine.mode。internal 会禁用
# Rust 法规调用，属旧值，改此值前先与负责法规引擎的成员确认。
PBS_RULE_ENGINE_MODE="${RO_RULE_ENGINE_MODE:-${PBS_RULE_ENGINE_MODE:-}}"
RULE_ENGINE_ARGS=()
if [ -n "$PBS_RULE_ENGINE_MODE" ]; then
    RULE_ENGINE_ARGS+=("rule_engine.mode=$PBS_RULE_ENGINE_MODE")
fi
ALGORITHM_ARGS=()
if [ -f "${WORKING_DIR}/algorithm_args.txt" ]; then
    mapfile -t ALGORITHM_ARGS < "${WORKING_DIR}/algorithm_args.txt"
    echo "[PBSPipeline] algorithm_args=${#ALGORITHM_ARGS[@]}" >&2
fi

if [ -n "${PBS_VENV_PYTHON:-}" ]; then
    # UAT mode: venv has ortools + rust wheel; no conda needed
    echo "[PBSPipeline] mode=venv python=$PBS_VENV_PYTHON experiment=$PBS_EXPERIMENT rule_engine=${PBS_RULE_ENGINE_MODE:-config-default}" >&2
    "$PBS_VENV_PYTHON" "$PBS_PROJECT_DIR/run_solver.py" \
        +experiments="$PBS_EXPERIMENT" \
        "data=$RO_INPUT_TXT" \
        "pref_dir=$WORKING_DIR" \
        "rule_engine.working_directory=$WORKING_DIR" \
        "hydra.run.dir=$OUTPUT_SUBDIR" \
        "${RULE_ENGINE_ARGS[@]}" \
        "${ALGORITHM_ARGS[@]}" \
        2>&1 | while IFS= read -r line; do echo "$line"; done
else
    # SIT mode: conda in /root/miniforge3 (inaccessible to yuan.z); use sudo env PATH
    CONDA_BIN="/root/miniforge3/bin"
    echo "[PBSPipeline] mode=conda (sudo env PATH) experiment=$PBS_EXPERIMENT rule_engine=${PBS_RULE_ENGINE_MODE:-config-default}" >&2
    sudo env PATH="${CONDA_BIN}:/usr/local/bin:/usr/bin:/bin" \
        bash "$PBS_PIPELINE" "$RO_INPUT_TXT" "$OUTPUT_SUBDIR" \
        "${RULE_ENGINE_ARGS[@]}" \
        "${ALGORITHM_ARGS[@]}" \
        2>&1 | while IFS= read -r line; do echo "$line"; done
fi
echo "PROGRESS:78"

# -- Step 3: verify optimizer output --
if [ ! -f "$RO_OUTPUT_TXT" ]; then
    echo "[PBSPipeline] ERROR: solver did not produce ro_output.txt" >&2
    ls -la "$OUTPUT_SUBDIR" >&2
    exit 1
fi
echo "[PBSPipeline] ro_output.txt $(wc -l < "$RO_OUTPUT_TXT") lines" >&2

# -- Step 4: convert legacy txt → ## CSV gz (gantt-readable format) --
echo "PROGRESS:80"
CONV_ARGS=(
    --input-txt  "$RO_INPUT_TXT"
    --output-txt "$RO_OUTPUT_TXT"
    --input-gz   "$INPUT_GZ"
    --output-gz  "$OUTPUT_GZ"
)
if [ -n "${LEGACY_RO_DB_URL:-}" ]; then
    CONV_ARGS+=(--db-url "$LEGACY_RO_DB_URL")
    echo "[PBSPipeline] converter using remote PG via LEGACY_RO_DB_URL" >&2
else
    echo "[PBSPipeline] ERROR: LEGACY_RO_DB_URL unset; converter requires an explicit DB URL" >&2
fi
"$CONV_PY" "$SCRIPT_DIR/legacy_ro_converter.py" "${CONV_ARGS[@]}"

echo "[PBSPipeline] done: output.gz=$([ -f "$OUTPUT_GZ" ] && du -sh "$OUTPUT_GZ" | cut -f1 || echo MISSING)" >&2
echo "PROGRESS:98"
exit 0
