"""
PO Engine v2 — black-box CLI entry point.
Usage: python -m src --input /path/input.gz --output /path/out.gz
Exit codes: 0=DONE  1=INFEASIBLE  2=TIMEOUT  3=INTERNAL_ERROR
"""
import argparse
import signal
import sys
from pathlib import Path

from src.io.job_io import read_input_gz, write_output_gz
from src.optimizer.pipeline import OptimizationPipeline
from src.utils.progress import progress, done, error

_stop_requested = False


def _handle_sigterm(signum: int, frame: object) -> None:
    """On SIGTERM: set flag. Pipeline checks this before MIP solve and reduces time limit to 1s,
    allowing CBC to return its current best feasible solution quickly."""
    global _stop_requested
    _stop_requested = True


signal.signal(signal.SIGTERM, _handle_sigterm)


def main() -> int:
    parser = argparse.ArgumentParser(description="PO Engine v2 — black-box optimizer")
    parser.add_argument("--input", required=True, type=Path, help="Path to input.gz")
    parser.add_argument("--output", required=True, type=Path, help="Path to out.gz")
    args = parser.parse_args()

    # 1. Read input
    progress("loading", 2, f"Reading {args.input}")
    try:
        with open(args.input, "rb") as f:
            sections = read_input_gz(f)
    except Exception as exc:
        error("PARSE_ERROR", f"Failed to read input.gz: {exc}")
        return 3

    if "FLIGHTS" not in sections or not sections["FLIGHTS"]:
        error("NO_FLIGHTS", "No flights found in input.gz FLIGHTS section")
        return 3

    # 2. Run pipeline
    try:
        pipeline = OptimizationPipeline()
        result_sections = pipeline.run(sections, is_stop_requested=lambda: _stop_requested)
    except Exception as exc:
        error("INTERNAL_ERROR", str(exc))
        _write_failure(args.output, str(exc))
        return 3

    # 3. Write output
    progress("extracting", 95, f"Writing {args.output}")
    try:
        with open(args.output, "wb") as f:
            write_output_gz(f, result_sections)
    except Exception as exc:
        error("IO_ERROR", f"Failed to write out.gz: {exc}")
        return 3

    status = result_sections.get("RESULT_META", [{}])[0].get("status", "FAILED")
    total = result_sections.get("KPI", [{}])[0].get("total_pairings", "0")
    done(status, f"Optimization complete: {total} pairings")

    exit_map = {"DONE": 0, "INFEASIBLE": 1, "TIMEOUT": 2}
    return exit_map.get(status, 3)


def _write_failure(output_path: Path, msg: str) -> None:
    try:
        with open(output_path, "wb") as f:
            write_output_gz(f, {
                "RESULT_META": [{"status": "FAILED", "error": msg,
                                 "solve_time_sec": "0", "total_pairings": "0"}],
                "KPI": [],
                "PAIRINGS": [],
            })
    except Exception:
        pass


if __name__ == "__main__":
    sys.exit(main())
