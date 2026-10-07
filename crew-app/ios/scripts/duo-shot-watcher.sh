#!/bin/bash
# Host-side helper for DuoFitUITests: XCUITest cannot screenshot the iPhone Duo's
# inner display, so the test drops <name>.request files in SHOT_DIR and this loop
# captures display 3 (the inner screen) with simctl, then writes <name>.done.
# Usage: duo-shot-watcher.sh <simulator-udid> <shot-dir>   (stop with Ctrl-C / kill)
set -u
UDID="$1"; DIR="$2"; mkdir -p "$DIR"
while true; do
  for req in "$DIR"/*.request; do
    [ -e "$req" ] || continue
    name=$(basename "$req" .request)
    xcrun simctl io "$UDID" screenshot --display=3 "$DIR/$name.png" >/dev/null 2>&1
    rm -f "$req"; touch "$DIR/$name.done"
  done
  sleep 0.3
done
