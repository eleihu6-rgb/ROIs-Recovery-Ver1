"""
RO Engine — black-box CLI entry point.
Usage: python -m src --input /path/input.gz --output /path/out.gz
Exit codes: 0=DONE  1=INFEASIBLE  2=TIMEOUT  3=INTERNAL_ERROR
"""
import argparse
import signal
import sys
from pathlib import Path

from src.io.job_io import read_input_gz, write_output_gz
from src.optimizer.pipeline import AllocationPipeline
from src.utils.progress import done, error, progress

_stop_requested = False


def _handle_sigterm(signum: int, frame: object) -> None:
    """On SIGTERM: set flag so pipeline stops after the current Lagrangian iteration."""
    global _stop_requested
    _stop_requested = True


signal.signal(signal.SIGTERM, _handle_sigterm)


def main() -> int:
    parser = argparse.ArgumentParser(description="RO Engine — black-box crew allocation optimizer")
    parser.add_argument("--input", required=True, type=Path, help="Path to input.gz")
    parser.add_argument("--output", required=True, type=Path, help="Path to out.gz")
    args = parser.parse_args()

    # 1. Read input
    progress("loading", 1, f"Reading {args.input}")
    try:
        with open(args.input, "rb") as f:
            sections = read_input_gz(f)
    except Exception as exc:
        error("PARSE_ERROR", f"Failed to read input.gz: {exc}")
        return 3

    if not sections.get("PAIRINGS"):
        error("NO_PAIRINGS", "No pairings found in PAIRINGS section")
        return 3

    if not sections.get("CREWS"):
        error("NO_CREWS", "No crews found in CREWS section")
        return 3

    # 2. Run allocation pipeline
    try:
        pipeline = AllocationPipeline()
        result_sections = pipeline.run(sections, is_stop=lambda: _stop_requested)
    except Exception as exc:
        error("INTERNAL_ERROR", str(exc))
        _write_failure(args.output, str(exc))
        return 3

    # 3. Write output
    progress("extracting", 99, f"Writing {args.output}")
    try:
        with open(args.output, "wb") as f:
            write_output_gz(f, result_sections)
    except Exception as exc:
        error("IO_ERROR", f"Failed to write out.gz: {exc}")
        return 3

    status = result_sections.get("RESULT_META", [{}])[0].get("status", "FAILED")
    total = result_sections.get("KPI", [{}])[0].get("total_assignments", "0")
    done(status, f"Allocation complete: {total} assignments")

    exit_map = {"DONE": 0, "INFEASIBLE": 1, "TIMEOUT": 2}
    return exit_map.get(status, 3)


def _write_failure(output_path: Path, msg: str) -> None:
    try:
        with open(output_path, "wb") as f:
            write_output_gz(f, {
                "RESULT_META": [{
                    "status": "FAILED",
                    "error": msg,
                    "solve_time_sec": "0",
                    "total_assignments": "0",
                    "total_pairings": "0",
                    "total_crews": "0",
                    "generated_at": "",
                }],
                "KPI": [],
                "ASSIGNMENTS": [],
            })
    except Exception:
        pass


if __name__ == "__main__":
    sys.exit(main())
