# engine-server complete retention cleanup

## Goal

Reduce disk usage by removing stale files under `engine-server/complete` after they are older than 5 days, and make the cleanup run automatically when an optimization finishes.

## Scope

- Add a dedicated retention setting for `complete` cleanup, defaulting to 5 days.
- Add a compression threshold for `complete`, defaulting to 1 day.
- Add a reusable file cleanup routine for `complete/<airline>/...` trees.
- Invoke the cleanup:
  - from the periodic background cleanup loop
  - after optimization completion / result archival
- Add focused tests for the new retention behavior.

## Non-goals

- Do not change `archive` retention behavior.
- Do not delete active workspace files.
- Do not change task lifecycle semantics.

## Proposed behavior

- Any file under `complete` whose mtime is older than the configured retention window is deleted.
- Any top-level `complete/<airline>/<entry>` directory or plain file older than 1 day is compressed to `tar.gz` first.
- Any `complete/<airline>/<entry>.tar.gz` older than 5 days is deleted.
- Empty directories left behind by deleted files are removed.
- Cleanup failures are non-fatal and only logged.

## Implementation notes

- Keep the policy configurable in `file_management` instead of hardcoding the retention window in code.
- Reuse the existing `FileManager` lock so archive/cleanup operations remain serialized.
- Add the completion-time cleanup hook in the task completion path so stale `complete` trees are pruned as runs finish.

## Verification

- Unit tests for:
  - deleting stale `complete` files
  - keeping fresh `complete` files
  - existing archive cleanup still passing
- Runtime check:
  - optimization completion triggers cleanup without failing the task
