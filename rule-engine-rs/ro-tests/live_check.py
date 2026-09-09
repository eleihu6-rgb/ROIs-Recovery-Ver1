#!/usr/bin/env python3
"""
live_check.py — simulate Live Gantt crew assignment with full legality checks.

Reads from this directory:
  ro_input.txt      — scenario file (^-delimited section format)
  assignments.txt   — crew/pairing assignment blocks (see format below)

Uses Application::Editor (Live Gantt / real-time roster editor): every violation
on the merged line is reported — no RO optimizer PA-ignore and no baseline diff.

Workflow (batch mode):
  Phase 1 — assign every pairing in assignments.txt to each crew (no rule check).
  Phase 2 — one full-line Live rule check per crew after all assignments are done.

assignments.txt format (alternating lines, # comments allowed):
  crew: 1439
  pairing: 11352,11313,11258
  crew: 2001
  pairing: 99001,99002

Each pairing line is assigned to the crew on the preceding crew line, in comma order.

Build the PyO3 extension first:
  cd rule-engine-rs/py && maturin develop --release

Run from this directory:
  python live_check.py
"""

from pathlib import Path

from ro_check import run_check

HERE = Path(__file__).resolve().parent

if __name__ == "__main__":
    run_check(
        application="editor",
        assignments_path=HERE / "assignments.txt",
        results_path=HERE / "results_live.svg",
        report_title="Live Check",
        batch_assign_then_check=True,
    )
