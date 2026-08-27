# Roster Publish Adjust Audit

## Requirement

When a planner applies selected Publish Roster diff rows, the system records one or more `roster_publish_adjust` rows for the same publish batch. These rows are pending outbound callback material for a later scheduled task.

The existing `roster_publish_adjust` table has no data and may be dropped and recreated in `f8`, `f8_sit_live`, and `f8_uat_live`.

## Scope

- Recreate `roster_publish_adjust` with the new old/new snapshot columns provided by the user.
- Keep schema scripts, Drizzle model, publish service, and focused tests aligned.
- In `applyDiff`, record adjust rows inside the same transaction before mutating `roster_publish`.
- Use `published = 0` for newly recorded adjust rows so the future callback job can claim pending records.
- Use one `batch_id` for all adjust rows created by a single apply request.
- Store the selected roster period window in `rp_start` / `rp_end`.
- Store old/new external pairing ids from `pairing.interface_id` in `old_pair_interface_id` / `new_pair_interface_id`.
- Run a live-server background scanner every 5 minutes to post pending batches to the rosterFlight callback endpoint.

## Notes

- `roster_publish` does not store every target old field, such as old crew base and old actual times. Those fields remain null when the old publish snapshot cannot authoritatively supply them.
- No frontend behavior change is required for this audit write; the existing Publish Roster apply call remains the trigger.
- The outbound scanner claims rows by setting `published = 2`, posts one payload per batch, marks success as `published = 1`, and resets failed attempts to `published = 0`.
- Callback rosters are assembled from adjust rows:
  - Flying duties are de-duplicated by crew plus selected old/new pairing interface id.
  - Ground duties are sent one row per adjust record using selected old/new roster snapshot fields.
- Passwords and connection secrets must not be written to this file or any repository artifact.

## Verification

- Execute the migration in `f8`, `f8_sit_live`, and `f8_uat_live`.
- Verify the recreated table columns/constraints in all three schemas.
- Run focused live-server tests for `roster-publish-service`.
- Run TypeScript build or the smallest module verification that covers the touched model/service.
