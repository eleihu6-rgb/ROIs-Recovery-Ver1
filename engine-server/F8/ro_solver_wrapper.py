#!/usr/bin/env python3
"""PBS solver wrapper — injects segment/manday/duty arrays into rre.Engine
without monkey-patching solver Python objects in pbs-engine.

Usage (called by ro_rust.sh):
  python ro_solver_wrapper.py <SNAP_PATH> <RO_INPUT_TXT> [hydra overrides...]
where SNAP_PATH = .../pbs-engine

Extras builders live in rust_legality_extras.py (shared with ro_check).

IMPORTANT: extras must be built against the *filtered* crew list the solver
uses when constructing Engine (after type/rank filters). Building them on the
pre-filter load_from_ro_input crew set (e.g. 148) then injecting before bind
fails cabin scenarios with:
  ValueError: pairing_seg_crew_offset_min must be empty or length 143 (crews), got 148
So we install extras only at bind_problem time, aligned to problem.crews.
"""
import sys
from pathlib import Path

SNAP = Path(sys.argv[1])              # pbs-engine/
RO_INPUT = Path(sys.argv[2])          # ro_input.txt (full path)
sys.argv = [sys.argv[0]] + sys.argv[3:]   # strip our 2 args; leave Hydra overrides
sys.path.insert(0, str(SNAP))         # so ColumnModelSolver_python is importable

# Shared extras module lives next to this script (engine-server/F8/).
_F8_DIR = Path(__file__).resolve().parent
if str(_F8_DIR) not in sys.path:
    sys.path.insert(0, str(_F8_DIR))

from rust_legality_extras import (  # noqa: E402
    align_store_for_rust_checker,
    build_engine_extras,
)

from ColumnModelSolver_python.io.ro_input_parser import parse_ro_input  # noqa: E402
try:  # noqa: E402
    from ColumnModelSolver_python.rules import rust as _rust_checker_mod
except ImportError:  # pragma: no cover - compatibility with older SIT pbs-engine deploys
    from ColumnModelSolver_python.rules import rust_checker as _rust_checker_mod  # type: ignore[attr-defined]

import rois_rule_engine_rs as rre  # noqa: E402

# Environment-reference guard. `rois_rule_engine_rs` is a compiled wheel the solver
# must load from ITS OWN interpreter (the RO_SOLVER_PYTHON env). A stale copy under
# the *running user's* site-packages (e.g. an earlier `pip install --user` as yuan.z
# → ~/.local/lib/python3.11/site-packages) is searched BEFORE the solver env and
# silently wins, surfacing much later as an obscure:
#   TypeError: Engine.__new__() got an unexpected keyword argument 'calendar_sdfd_rule_rows'
# because the old wheel predates the new Engine kwarg. Fail loudly here at module
# load instead of letting the run die three stages in with a cryptic error.
_RRE_FILE = str(getattr(rre, "__file__", "") or "").replace("\\", "/")
if "/.local/" in _RRE_FILE:
    sys.exit(
        "rois_rule_engine_rs loaded from USER SITE, not the solver env: "
        f"{rre.__file__}\n"
        "A stale copy is shadowing the intended wheel. Remove it and re-run, e.g.\n"
        f"  rm -rf ~/.local/lib/python3.{sys.version_info.major}.{sys.version_info.minor}"
        "/site-packages/rois_rule_engine_rs*\n"
    )

# Parse sections once (cheap vs rebuild); crews/pairings rebuilt at bind time.
_SECTIONS = parse_ro_input(RO_INPUT)
_ORIG_BIND = _rust_checker_mod.RustRuleChecker.bind_problem


def _bind_problem_with_extras(self, problem):
    """Build F8 extras on the filtered problem.crews, then set_next before Engine."""
    crews, pairings, crew_bases = align_store_for_rust_checker(problem, RO_INPUT)
    extras = build_engine_extras(crews, pairings, _SECTIONS, crew_bases)
    rre.set_next_engine_extras(**extras)
    return _ORIG_BIND(self, problem)


_rust_checker_mod.RustRuleChecker.bind_problem = _bind_problem_with_extras  # type: ignore[method-assign]

# The solver loads ro_input again (with type/rank filters), then bind_problem
# builds Engine with extras length == filtered crew count.
import runpy  # noqa: E402

runpy.run_path(str(SNAP / "run_solver.py"), run_name="__main__")
