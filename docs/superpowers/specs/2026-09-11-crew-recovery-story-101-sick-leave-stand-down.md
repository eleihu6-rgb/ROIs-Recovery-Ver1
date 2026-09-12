# Crew Recovery Story 101 — Sick leave from crew app → Live auto stand-down

Status: steps 1–4 in implementation (2026-09-11). Steps 5 (absence window) and 6 (best-fit) need separate design.

## Story

1. Crew submits sick leave from the crew app (Quick actions → Absence).
2. Crew app sends the request to Live.
3. Live auto stands the crew down: de-assigns every flying pairing that overlaps the sick range, and adds the sick-leave code (`ILL`) on the roster line for each day.
4. Live notifies the crew: original flight duty removed, sick leave added.
5. Live needs a UI window listing all crew absences — **not in this slice**.
6. Live fills the open pairing with best-fit — **not in this slice (ranking needs design)**.

## Decisions (defaults confirmed by Ryan on 2026-09-11)

| # | Decision | Choice |
|---|---|---|
| 1 | Approval gate | None. Sick leave is trusted; stand-down is immediate. The `crew_absence` row carries `status` so planners can cancel later. |
| 2 | Roster code | `ILL` (F8 real data: 3,813 imported rows, group `GRD`, one row per local day at base, 240 fixed credit). `SL` exists only in seed. |
| 3 | Partial overlap | The **whole** overlapping pairing is de-assigned (crew×leg rows are not a legal unit on their own). |
| 4 | Types | v1 accepts `sick` only. `emergency` / `personal` are shown in the app but return `400 … not supported yet` until their codes/approval flow is designed. |

## Data model

New table `crew_absence` (`sql/migration/2026-09-11-crew-absence.sql`): one row per submission — `airline`, `crew_id`, `absence_type` (`sick`), `assignment` (`ILL`), `from_date`/`to_date` (crew-base local dates), `start_utc`/`end_utc`, `note`, `status` (`active`/`cancelled`), `source` (`CREW_APP`), `removed_pairing_ids bigint[]`, audit columns.

`roster_flight` rows touched by the stand-down are stamped with the existing legacy columns `request_source = 'CREW_APP'`, `request_id = crew_absence.id` (both the soft-deleted flying rows and the inserted ILL rows) so the absence window (step 5) can trace them without a new link table.

No `sql/schema` edits; the migration is additive and idempotent.

## API

`POST /api/crew-app/v1/absence` — public path (body credentials, same gate as notifications: `verifyMobileCrewCredentials`).

```json
{ "airline": "F8", "crewId": "113", "password": "…",
  "type": "sick", "fromDate": "2026-09-14", "toDate": "2026-09-15", "note": "flu" }
```

Response `data`:
```json
{ "absenceId": 12, "assignment": "ILL", "fromDate": "…", "toDate": "…",
  "removedPairingIds": [151614], "groundDays": 2, "notificationId": "absence-12" }
```

Errors: 400 invalid range / unsupported type / range > 30 days; 401/403 credentials; 409 an active absence already covers any day in the range.

## Live-side flow (`live-server/src/services/absence/crew-absence-service.ts`)

Inside one transaction:
1. Resolve crew base effective on `fromDate` (`crew_base`) and its `airport.zone_id`; window = local 00:00 fromDate → local 23:59:59 toDate.
2. Reject 409 if an `active` `crew_absence` overlaps the range.
3. Insert `crew_absence`.
4. Find distinct `pairing_id` in `roster_flight` (crew, `pairing_id not null`, `is_deleted=0`, `sch_str_dt_utc <= end and sch_end_dt_utc >= start`); soft-delete all rows of those pairings for this crew (`is_deleted=1`, `request_source/request_id`).
5. Insert one `ILL` ground row per local day (same shape as `rosterService.createGroundTask`: base=dep=arv, group `GRD`, `fixed_credit_min`, `source='MA'`).

After commit (never inside the tx, mirrors `routes/roster` + `draft` post-commit order):
- `bumpCrewChunkVersions`, `refreshPairingCompositionFillBulk`, pairing cache invalidation (reopens the slot);
- `recheckLiveRosterMutation` (Rust legality, ±31d), manday recompute + `manday-updated`;
- `notifyRosterTasksChanged` → `roster-updated` websocket;
- `appendNotification(type:'roster_change', notifId:'absence-<id>')` — failures are logged, never fail the request.

## Crew app

`SpecPage` `absence` case becomes a real screen: type radio (sick enabled; other two disabled with "coming soon"), From/To date, note, "Affects" preview computed from the loaded roster, Submit → `POST …/absence` → success toast with removed duties count; failure surfaces the server message. Alerts feed renders `roster_change` cards (already generic).

## Verification

- Vitest `live-server/src/services/absence/__tests__/crew-absence-service.test.ts`: multi-leg base→base pairing overlapping day 2 of a 2-day range → whole pairing soft-deleted, 2 ILL rows, post-commit hooks called in order, notification appended; unsupported type → 400; overlap → 409.
- Route smoke against SIT with crew `113`.
- Jest for the crew-app form + API client; `tsc --noEmit`; APP_VERSION bump; Maestro flow screenshot.
- Gantt Playwright on cr.rois.one (submit via API seed, then assert the crew row shows ILL and the pairing is open) — required before sign-off, versioned screenshot.

## Risks

- Crew-app auth is password-in-body (no per-crew token) — acceptable for SIT, flag for UAT.
- Shared `f8_sit_live`: tests must use whitelisted crew/dates and clean up (`is_deleted` rows are physical; absence rows deleted by test teardown).
- Notifications are poll-on-focus; no push until Firebase credentials exist.
