#!/usr/bin/env bash
set -euo pipefail

cat >&2 <<'MSG'
The embedded PBS solver copy has been removed.

Use the pbs-engine submodule instead:
  git submodule update --init --recursive pbs-engine
  git -C pbs-engine pull --ff-only

Solver source now lives at: pbs-engine
MSG

exit 1
