# Roster Soft-Delete Retention Cleanup

## Decision

Run a dedicated BullMQ cleanup worker every seven days through the live-server scheduler. The worker physically removes rows whose `is_deleted = 1` and whose `updated_at` is older than the configured retention period (one month by default).

## Safety Rules

- Hold a PostgreSQL session advisory lock so only one cleanup instance runs at a time.
- Delete in bounded batches, defaulting to 1,000 rows per statement.
- Delete children before parents: `roster_flight`, `pairing_composition`, `pairing_segment`, pairing memos, `pairing`, flight compositions, then `flight`.
- Do not delete a roster row referenced by `roster_publish`, `roster_publish_adjust`, or Scenario `roster_flight.live_id`.
- Delete a pairing or flight only when all live and Scenario references and FK children are gone.
- Keep lock and statement timeouts bounded so imports are not held indefinitely.

## Configuration

- `ROSTER_SOFT_DELETE_RETENTION_MONTHS=1`
- `ROSTER_SOFT_DELETE_CLEANUP_BATCH_SIZE=1000`
- `ROSTER_SOFT_DELETE_CLEANUP_INTERVAL_MS=604800000`

The scheduler run record and worker log provide the candidate result, per-table deletion counts, batch size, retention, and failure status.
