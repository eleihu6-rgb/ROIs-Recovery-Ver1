"""Update pairing records from a cached JSON batch directory.

Reads all chunk JSON files, deduplicates by pairingId, then for each pairing
that already exists in MySQL runs _update_pairing (UPDATE only, no child-table
changes). New pairings that don't exist yet are written with _write_pairing.

Usage:
    cd data-migration

    # Use latest pairing batch from today:
    .venv/bin/python3 scripts/reimport_pairing_from_json.py

    # Specify a batch dir:
    .venv/bin/python3 scripts/reimport_pairing_from_json.py storage/raw/2026-06-11/pairing_20260611_145055_094

    # UPDATE-only mode (skip writing new pairings):
    .venv/bin/python3 scripts/reimport_pairing_from_json.py --update-only
"""
import json
import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


def _find_latest_batch_dir() -> Path:
    from storage.json_store import STORAGE_BASE
    from datetime import date

    today = date.today().isoformat()
    today_dir = STORAGE_BASE / today
    if not today_dir.exists():
        raise FileNotFoundError(f"No storage directory for today: {today_dir}")
    candidates = sorted(today_dir.glob("pairing_*"), key=lambda p: p.name)
    if not candidates:
        raise FileNotFoundError(f"No pairing batch dirs found under {today_dir}")
    latest = candidates[-1]
    logger.info("Auto-detected latest pairing batch: %s", latest)
    return latest


def load_unique_raws(batch_dir: Path) -> list[dict]:
    """Load all chunk files, deduplicating by pairingId (keep first occurrence)."""
    all_raw: list[dict] = []
    seen: set[str] = set()
    dup_count = 0
    file_count = 0

    for fpath in sorted(batch_dir.glob("*.json")):
        with open(fpath, encoding="utf-8") as f:
            chunk: list[dict] = json.load(f)
        file_count += 1
        for record in chunk:
            pid = str(record.get("pairingId") or record.get("pairing_id") or "")
            if not pid:
                continue
            if pid in seen:
                dup_count += 1
                continue
            seen.add(pid)
            all_raw.append(record)

    logger.info(
        "Loaded %d unique pairings from %d chunk files (%d cross-chunk duplicates skipped)",
        len(all_raw), file_count, dup_count,
    )
    return all_raw


def main() -> None:
    update_only = "--update-only" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]

    if args:
        batch_dir = Path(args[0])
        if not batch_dir.is_absolute():
            batch_dir = Path(__file__).resolve().parent.parent / batch_dir
    else:
        batch_dir = _find_latest_batch_dir()

    if not batch_dir.is_dir():
        logger.error("Batch directory not found: %s", batch_dir)
        sys.exit(1)

    logger.info("Batch dir : %s", batch_dir)
    logger.info("Update-only: %s", update_only)

    all_raw = load_unique_raws(batch_dir)
    if not all_raw:
        logger.error("No pairings found in batch dir.")
        sys.exit(1)

    from f8.pairing import (
        _COMMIT_BATCH,
        _load_pairing_lookup,
        _update_pairing,
        _write_pairing,
        transform_pairing_row,
    )
    from db.mysql import db_cursor, batch_nextval

    t0 = time.perf_counter()
    updated = inserted = skipped = 0
    warnings: list[str] = []

    # Load lookup once before batches
    with db_cursor() as (cur, _):
        pairing_lookup = _load_pairing_lookup(cur)
    logger.info("Existing pairings in DB: %d", len(pairing_lookup))

    for batch_offset in range(0, len(all_raw), _COMMIT_BATCH):
        raw_batch = all_raw[batch_offset: batch_offset + _COMMIT_BATCH]
        batch_end = batch_offset + len(raw_batch)
        logger.info("Processing %d-%d / %d ...", batch_offset + 1, batch_end, len(all_raw))

        with db_cursor() as (cursor, conn):
            # Pre-allocate IDs for any INSERT in this batch
            new_count = sum(
                1 for r in raw_batch
                if str(r.get("pairingId") or r.get("pairing_id") or "") not in pairing_lookup
            )
            new_ids = batch_nextval("PAIRING_SEQ", new_count, cursor) if new_count > 0 else []
            new_id_iter = iter(new_ids)

            for raw in raw_batch:
                pid = str(raw.get("pairingId") or raw.get("pairing_id") or "")
                cursor.execute("SAVEPOINT sp")
                try:
                    row = transform_pairing_row(raw)
                    existing_id = pairing_lookup.get(pid)

                    if existing_id:
                        _update_pairing(cursor, existing_id, row)
                        updated += 1
                    elif update_only:
                        skipped += 1
                    else:
                        new_db_id = next(new_id_iter)
                        _write_pairing(cursor, new_db_id, row)
                        pairing_lookup[pid] = new_db_id
                        inserted += 1

                    cursor.execute("RELEASE SAVEPOINT sp")
                except Exception as e:
                    cursor.execute("ROLLBACK TO SAVEPOINT sp")
                    msg = f"pairingId={pid}: {e}"
                    logger.exception(msg)
                    warnings.append(msg)

    elapsed = time.perf_counter() - t0
    print(f"\n{'='*60}")
    print(f"  PAIRING REIMPORT COMPLETE")
    print(f"{'='*60}")
    print(f"  Batch dir  : {batch_dir}")
    print(f"  Updated    : {updated:,}")
    print(f"  Inserted   : {inserted:,}")
    print(f"  Skipped    : {skipped:,}  (--update-only)")
    print(f"  Warnings   : {len(warnings)}")
    print(f"  Elapsed    : {elapsed:.1f}s")
    if warnings:
        print(f"\n  First 20 warnings:")
        for w in warnings[:20]:
            print(f"    {w}")
        if len(warnings) > 20:
            print(f"    ... and {len(warnings) - 20} more")


if __name__ == "__main__":
    main()
