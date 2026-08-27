# Roster Publish Drop Legacy Fields

## Request

Remove legacy ambiguous columns from `roster_publish` now that the clear snapshot columns exist.

Columns to drop:

- `roster_id` -> use `roster_flight_id`
- `duty_id` -> use `duty_seq`
- `acting_rank` -> use `flight_acting_rank`
- `roster_rank` -> use `roster_acting_rank`

## Rationale

`roster_publish` is now defined as a published snapshot of `roster_flight` plus `pairing_segment`
time windows. Keeping old ambiguous aliases makes future diff and outbound logic easy to misread.

PBS must read published task details only from `roster_publish`. Removing legacy aliases makes the
published snapshot contract explicit.

## Impact Found

The legacy fields are still referenced in:

- `sql/schema/live/02-crew-roster.sql`
- `live-server/src/models/roster/roster-publish.ts`
- `live-server/src/services/roster/roster-publish-service.ts`
- `pbs-server/src/scripts/sync-roster-publish-from-roster-flight-core.ts`
- `pbs-server/src/scripts/sync-roster-publish-from-roster-flight.test.ts`
- `pbs-server/src/services/award/award-results-service.ts`
- `pbs-server/src/services/award/types.ts`
- `live-server/src/__tests__/services/roster/roster-publish-service.test.ts`

## Proposed Implementation

1. Add a migration that drops old indexes and columns:
   - drop `uq_roster_publish_roster_id`
   - drop columns `roster_id`, `duty_id`, `acting_rank`, `roster_rank`
2. Update `sql/schema/live/02-crew-roster.sql` to remove the old columns and comments.
3. Update Drizzle model to remove old fields.
4. Update Live Publish SQL:
   - source and publish diff use `roster_flight_id`, `duty_seq`, `flight_acting_rank`,
     `roster_acting_rank`
   - ground keys and deletes use `roster_flight_id`
   - insert no longer writes old aliases
   - adjust snapshots read old published rows from new fields only
5. Update PBS Award Results:
   - `roster_id` API/internal row field should be sourced from `roster_flight_id`
   - no live joins are reintroduced
6. Update PBS sync script:
   - idempotency uses `roster_flight_id`
   - conflict/update SQL uses the new unique index
   - duplicate sample output can keep the user-facing label `rosterIds` if desired, but the SQL source
     must be `roster_flight_id`
7. Update focused tests.

## Database Execution

After merge, run the drop migration in all three live schemas:

- `f8`
- `f8_sit_live`
- `f8_uat_live`

Before dropping, verify every row has:

- `roster_flight_id is not null`
- `duty_seq` is not null where `duty_id` was meaningful
- `flight_acting_rank` is populated where `acting_rank` was required

## Verification

- `live-server`: `npm test -- --run src/__tests__/services/roster/roster-publish-service.test.ts`
- `pbs-server`: `DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/services/award/award-results-service.test.ts src/scripts/sync-roster-publish-from-roster-flight.test.ts`
- `live-server`: `npm run build`
- `pbs-server`: `npm run build`
- Remote DB validation in `f8`, `f8_sit_live`, `f8_uat_live`:
  - old columns absent from `information_schema.columns`
  - new unique index exists
  - basic Award roster query still runs without joining live operational tables

## Risks

- This is a breaking schema change. Any unsearched external SQL that still selects old columns will fail.
- Existing untracked or in-progress agents may still have code based on the compatibility fields.
- The current branch is behind `origin/main`; implementation should first integrate latest `main` cleanly.
