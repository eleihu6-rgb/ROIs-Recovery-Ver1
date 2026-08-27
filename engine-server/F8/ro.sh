#!/usr/bin/env bash
# F8 RO optimizer entry point (invoked by engine-server with: ro.sh <working_dir> <input_gz>,
# cwd == working_dir).
#
# To revert to the Rust-connector pipeline:
#   exec bash "$SCRIPT_DIR/ro_rust.sh" "$1" "$2"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/ro_pipeline.sh" "$1" "$2"
