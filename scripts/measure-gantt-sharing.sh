#!/usr/bin/env bash
# Live vs Scenario Gantt — code-sharing measurement.
# Run from anywhere. Prints the shared-% for the gantt VIEW layer.
# Append the result to docs/architecture/live-scenario-code-sharing-tracker.md
#
# Metric definition (keep stable so the trend is comparable over time):
#   SHARED        = components/gantt/**            (canvas, renderers, interactions, source abstraction)
#   LIVE-ONLY     = components/panes/** + components/layout/**
#   SCENARIO-ONLY = components/scenario-gantt/**
#   shared%       = SHARED / (SHARED + LIVE-ONLY + SCENARIO-ONLY)
#
# Files with a " 2." in the name (iCloud dup copies) are excluded.

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../gantt/src" && pwd)"
cd "$SRC"  # use relative paths — the repo lives under an iCloud path containing spaces

# Sum lines across .ts/.tsx in the given dirs, excluding " 2." iCloud dup copies.
count() {
  find "$@" \( -name '*.ts' -o -name '*.tsx' \) ! -name '* 2.*' -exec cat {} + 2>/dev/null | wc -l | tr -d ' '
}

SHARED=$(count components/gantt)
LIVE=$(( $(count components/panes) + $(count components/layout) ))
SCEN=$(count components/scenario-gantt)
TOTAL=$(( SHARED + LIVE + SCEN ))
PCT=$(awk "BEGIN{printf \"%.1f\", $SHARED*100/$TOTAL}")

echo "date            : $(date +%Y-%m-%d)"
echo "shared (gantt/) : $SHARED"
echo "live-only       : $LIVE   (panes + layout)"
echo "scenario-only   : $SCEN   (scenario-gantt)"
echo "total view layer: $TOTAL"
echo "SHARED %        : ${PCT}%"
