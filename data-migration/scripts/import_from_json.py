"""Full API fetch + DB import timing — measure F8 API fetch time vs MySQL import time.

Usage:
    cd data-migration
    python3 scripts/import_from_json.py
"""
import sys
import time
import logging
import logging.handlers
from pathlib import Path

# Ensure project root is on path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Configure logging (file + console) BEFORE importing any sync modules
_log_dir = Path(__file__).resolve().parent.parent.parent / "logs"
_log_dir.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
_file_handler = logging.handlers.RotatingFileHandler(
    _log_dir / "data-migration.log",
    maxBytes=100 * 1024 * 1024,
    backupCount=5,
    encoding="utf-8",
)
_file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
logging.getLogger().addHandler(_file_handler)


def main():
    print("=" * 64)
    print("  FULL CYCLE: F8 API FETCH + JSON SAVE + DB IMPORT TIMING")
    print("=" * 64)

    from f8.crew import sync_crew
    from f8.flight import sync_flight
    from f8.pairing import sync_pairing
    from f8.roster_flight import sync_roster_flight
    from f8.roster_ground import sync_roster_ground
    from f8.manday import sync_manday

    entities = [
        ("crew",           None,                              sync_crew),
        ("flight",         ("2025-12-01", "2026-07-31"),      sync_flight),
        ("pairing",        ("2026-01-01", "2026-06-30"),      sync_pairing),
        ("roster_flight",  ("2026-01-01", "2026-06-30"),      sync_roster_flight),
        ("roster_ground",  ("2026-01-01", "2026-06-30"),      sync_roster_ground),
        ("manday",         ("2026-01-01", "2026-06-30"),      sync_manday),
    ]

    results = []

    for entity_name, date_range, run_fn in entities:
        print(f"\n  >>> {entity_name} starting ...", flush=True)

        skw = {}
        if date_range:
            skw["start_dt"] = date_range[0]
            skw["end_dt"] = date_range[1]

        wall_t0 = time.perf_counter()
        result = run_fn(**skw)
        wall_t1 = time.perf_counter()
        wall_s = wall_t1 - wall_t0

        print(f"\n{'='*64}")
        print(f"  {entity_name.upper()}")
        print(f"{'='*64}")
        print(f"  API fetch  : {result.fetch_s:.1f}s")
        print(f"  DB import  : {result.import_s:.1f}s")
        print(f"  Total      : {result.total_s:.1f}s (wall: {wall_s:.1f}s)")
        print(f"  Records    : {result.imported:,}")
        print(f"  Warnings   : {len(result.warnings)}")

        results.append({
            "entity": entity_name,
            "fetch_s": result.fetch_s,
            "import_s": result.import_s,
            "total_s": result.total_s,
            "records": result.imported,
            "warnings": len(result.warnings),
        })

    # Summary table
    print(f"\n\n{'='*90}")
    print(f"  TIMING SUMMARY — F8 API Fetch vs DB Import")
    print(f"{'='*90}")
    print(f"  {'Entity':<18s} {'API Fetch':>10s} {'DB Import':>10s} {'Total':>10s} {'Records':>10s} {'Warn':>6s}")
    print(f"  {'-'*66}")
    for r in results:
        print(f"  {r['entity']:<18s} {r['fetch_s']:>7.1f}s {r['import_s']:>7.1f}s {r['total_s']:>7.1f}s {r['records']:>10,} {r['warnings']:>6}")
    print(f"  {'-'*66}")
    t_fetch = sum(r['fetch_s'] for r in results)
    t_import = sum(r['import_s'] for r in results)
    t_total = sum(r['total_s'] for r in results)
    t_recs = sum(r['records'] for r in results)
    print(f"  {'TOTAL':<18s} {t_fetch:>7.1f}s {t_import:>7.1f}s {t_total:>7.1f}s {t_recs:>10,}")


if __name__ == "__main__":
    main()
