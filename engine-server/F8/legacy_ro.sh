#!/usr/bin/env bash
# LegacyRO pipeline:
#   1. Decompress input.gz → ro_input.txt
#   2. Run PBS rostering optimizer (run_pipeline.sh)
#   3. Convert results to new ## CSV gz format (input.gz + output.gz)
#
# Called by engine-server task_manager with: legacy_ro.sh <working_dir> <input_gz_path>
set -euo pipefail

# subprocess already runs with cwd=working_dir, so $(pwd) IS the absolute working dir
WORKING_DIR="$(pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

OPTIMIZER_DIR="/home/piercrew/software/rostering_algorithm/PBS_column_based_algorithm"
# Use the ro-engine venv which has ortools + numpy required by the PBS optimizer
PYTHON="/home/yuan.z/rois/rois-ai/ro-engine/.venv/bin/python"
OUTPUT_SUBDIR="${WORKING_DIR}/output"
RO_INPUT_TXT="${WORKING_DIR}/ro_input.txt"
RO_OUTPUT_TXT="${OUTPUT_SUBDIR}/ro_output.txt"
INPUT_GZ="${WORKING_DIR}/input.gz"
OUTPUT_GZ="${WORKING_DIR}/output.gz"

echo "PROGRESS:5"
echo "[LegacyRO] working_dir=${WORKING_DIR}" >&2
echo "[LegacyRO] python=${PYTHON}" >&2
echo "[LegacyRO] input.gz: $([ -f "$INPUT_GZ" ] && echo "exists ($(du -sh "$INPUT_GZ"|cut -f1))" || echo "MISSING")" >&2

# -- Step 1: decompress input.gz → ro_input.txt --
mkdir -p "$OUTPUT_SUBDIR"
zcat "$INPUT_GZ" > "$RO_INPUT_TXT"
echo "[LegacyRO] decompressed ro_input.txt ($(wc -l < "$RO_INPUT_TXT") lines)" >&2
echo "PROGRESS:10"

# -- Step 2: run PBS optimizer with the correct Python environment --
echo "PROGRESS:12"
echo "[LegacyRO] running optimizer..." >&2

# run_pipeline.sh uses `conda run -n flair-pbs-env` which is only accessible via root's
# miniconda3. We replicate its logic directly here using the absolute conda path.
CONDA="/root/miniconda3/bin/conda"
EXPERIMENT="deploy/prod_0604"
ALGORITHM_ARGS=()
if [ -f "${WORKING_DIR}/algorithm_args.txt" ]; then
  mapfile -t ALGORITHM_ARGS < "${WORKING_DIR}/algorithm_args.txt"
  echo "[LegacyRO] algorithm_args=${#ALGORITHM_ARGS[@]}" >&2
fi
mkdir -p "$OUTPUT_SUBDIR"

sudo "$CONDA" run -n flair-pbs-env \
  python "${OPTIMIZER_DIR}/run_solver.py" \
  +experiments="$EXPERIMENT" \
  data="$RO_INPUT_TXT" \
  pref_dir="$WORKING_DIR" \
  rule_engine.working_directory="$WORKING_DIR" \
  "hydra.run.dir=$OUTPUT_SUBDIR" \
  "${ALGORITHM_ARGS[@]}" \
  2>&1 | while IFS= read -r line; do
    echo "$line"
  done

# Fix ownership: sudo conda run creates files as root; restore to current user
sudo chown -R "$(id -un):$(id -gn)" "$OUTPUT_SUBDIR"

echo "PROGRESS:78"

# -- Step 3: verify optimizer output exists --
if [ ! -f "$RO_OUTPUT_TXT" ]; then
  echo "[LegacyRO] ERROR: optimizer did not produce ro_output.txt" >&2
  ls -la "$OUTPUT_SUBDIR" >&2
  exit 1
fi
echo "[LegacyRO] ro_output.txt: $(wc -l < "$RO_OUTPUT_TXT") lines" >&2

# -- Step 4: convert old format txt → new ## CSV gz --
echo "PROGRESS:80"
"$PYTHON" "${SCRIPT_DIR}/legacy_ro_converter.py" \
  --input-txt  "$RO_INPUT_TXT" \
  --output-txt "$RO_OUTPUT_TXT" \
  --input-gz   "$INPUT_GZ" \
  --output-gz  "$OUTPUT_GZ"

echo "[LegacyRO] done: input.gz=$(du -sh "$INPUT_GZ"|cut -f1) output.gz=$(du -sh "$OUTPUT_GZ"|cut -f1)" >&2
echo "PROGRESS:98"
exit 0
