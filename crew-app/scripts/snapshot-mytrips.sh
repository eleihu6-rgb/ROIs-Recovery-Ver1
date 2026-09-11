#!/usr/bin/env bash
# Capture a PNG snapshot of the running app (My Trips / Add Trip feature) and
# save it to the repo's image/ folder as <FunctionName>-<timestamp>.png, per
# doc/Add Trip Ver1. Requires the app already running in a booted iOS Simulator.
#
# Usage:  ./scripts/snapshot-mytrips.sh [FunctionName]
#   e.g.  ./scripts/snapshot-mytrips.sh MyTripsScreen
set -euo pipefail

FUNC_NAME="${1:-MyTripsScreen}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
IMAGE_DIR="$(cd "$(dirname "$0")/../.." && pwd)/image"
OUT="$IMAGE_DIR/${FUNC_NAME}-${TIMESTAMP}.png"

mkdir -p "$IMAGE_DIR"

if ! xcrun simctl list devices booted | grep -q "Booted"; then
  echo "No booted simulator found. Start the app first (npm run ios)." >&2
  exit 1
fi

xcrun simctl io booted screenshot "$OUT"
echo "Saved snapshot: $OUT"
