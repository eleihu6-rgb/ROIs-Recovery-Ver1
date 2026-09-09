"""Bind F8 official Rust legality Engine: rust_checker base ∪ shared extras.

Used by ro_check / live_check to match ro_rust.sh → ro_solver_wrapper → RustRuleChecker.
Does not modify pbs-engine — Editor vs Optimizer is injected by wrapping
``rois_rule_engine_rs.Engine`` during ``bind_problem``.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any


def _repo_root() -> Path:
    # rule-engine-rs/ro-tests/ → rule-engine-rs → rois-ai
    return Path(__file__).resolve().parents[2]


def bind_f8_rust_checker(
    ro_input_path: Path,
    *,
    application: str = "optimizer",
) -> Any:
    """Load problem, inject extras, return bound RustRuleChecker.

    Call order matches formal RO:
      set_next_engine_extras(**extras)  then  RustRuleChecker.bind_problem(problem)

    application:
      "optimizer" — RO PA-ignore (default, formal solver)
      "editor"    — Live Gantt full-line legality (no PA-ignore)

    RustRuleChecker always constructs Engine without an application kwarg
    (pbs-engine stays untouched). We temporarily wrap ``rre.Engine`` so the
    constructed Engine gets the requested application.
    """
    root = _repo_root()
    snap = root / "pbs-engine"
    f8 = root / "engine-server" / "F8"
    for p in (str(snap), str(f8)):
        if p not in sys.path:
            sys.path.insert(0, p)

    from ColumnModelSolver_python.io.loader import load_from_ro_input
    from ColumnModelSolver_python.io.ro_input_parser import parse_ro_input
    from ColumnModelSolver_python.rules.rust import RustRuleChecker
    from rust_legality_extras import align_store_for_rust_checker, build_engine_extras
    import rois_rule_engine_rs as rre

    ro_path = Path(ro_input_path).resolve()
    problem, _ = load_from_ro_input(str(ro_path))
    sections = parse_ro_input(ro_path)
    crews, pairings, crew_bases = align_store_for_rust_checker(problem, ro_path)
    extras = build_engine_extras(crews, pairings, sections, crew_bases)
    rre.set_next_engine_extras(**extras)

    orig_engine = rre.Engine

    def _engine_with_app(*args: Any, **kwargs: Any) -> Any:
        kwargs["application"] = application
        return orig_engine(*args, **kwargs)

    checker = RustRuleChecker(
        working_directory=str(ro_path.parent),
        ro_input_path=str(ro_path),
    )
    rre.Engine = _engine_with_app  # type: ignore[misc, assignment]
    try:
        checker.bind_problem(problem)
    finally:
        rre.Engine = orig_engine  # type: ignore[misc, assignment]
    return checker
