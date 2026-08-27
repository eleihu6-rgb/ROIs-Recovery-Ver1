# Live Publish Roster SIT Fixes

Date: 2026-07-27
Status: Approved
Scope: Live Gantt `Publish Roster` dialog and live-server diff/apply behavior.

## Problems

SIT server: `yuan.z@10.15.12.4`, live-server on `:3000`, schema `f8_sit_live`.

1. `Status = All changes` currently sends only `ADD`, `UPDATE`, and `DELETE`, so `NO_CHANGE` rows are excluded. SIT users expect `All changes` to show all diff statuses, including `No change`.
2. Crew `857` has a ground row `roster_flight.id = 892087` from `2026-06-30 00:01` to `2026-07-01 00:00` in YVR local time. Because the query treats the local end date as inclusive, this row is returned for RP07. Business expectation: a ground duty that ends exactly at local `00:00` belongs to the previous day, so this row belongs to RP06 only.
3. Crew `857`, pairing `14915`, has two source `roster_flight` rows on `2026-07-31` and no `roster_publish` rows. The diff can show it as unpublished, but publish apply inserts zero rows because the apply SQL filters by raw UTC `rp_end = 2026-07-31 00:00Z`. The UI reports success without surfacing that zero rows were written.

## Design

- Change the dialog's default `All changes` request to include all statuses: `ADD`, `UPDATE`, `DELETE`, and `NO_CHANGE`.
- Keep `NO_CHANGE` rows non-actionable and unselected by default.
- In live-server diff filtering, use a business-date overlap helper:
  - For ground rows only, when the base-local end time is exactly `00:00`, compute the end business date as one minute before the end timestamp.
  - Otherwise keep the existing local start/end dates.
  - Apply this consistently to `roster_flight` and `roster_publish` source rows so RP06/RP07 boundaries match.
- In publish apply, remove the raw UTC period-window mismatch for selected rows:
  - Flying writes should be keyed by the selected `crew_id + pairing_id` and not be blocked by raw `rp_end`.
  - Ground writes are already keyed by exact `roster_flight.id`; keep that identity and avoid excluding the row with raw UTC period bounds.
  - Snapshot rows should use the same selected identity, not a looser raw UTC window.
- If an apply selection produces zero inserted/deleted rows for an actionable row, surface it as skipped/stale rather than a silent success.

## Verification

- Add/update live-server Vitest coverage for:
  - `All changes` / status filtering includes `NO_CHANGE`.
  - Ground row ending at local midnight is not included in the next RP.
  - Flying apply for a July 31 pairing with `rp_end` at July 31 midnight still inserts source rows.
- Add/update Gantt component coverage proving the dialog sends `NO_CHANGE` for `All changes` while still auto-selecting only actionable rows.
- If feasible, run a no-write or controlled SIT API/SQL smoke for crew `857`, RP06/RP07, and pairing `14915`.

## Approval Gate

Per root `AGENTS.md`, implementation should begin only after the user approves this spec.
