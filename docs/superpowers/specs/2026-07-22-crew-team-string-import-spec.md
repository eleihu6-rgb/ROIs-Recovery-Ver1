# Crew Team String Import Spec

Date: 2026-07-22

## Problem

Crew API already exposes `teams[]` as string-coded team memberships, with fields like `teamId`, `teamName`, `effDt`, `expDt`, and `isValid`.
Current import and maintenance paths still model `crew_team.team_id` as a numeric FK to `team.id`, which forces an unnecessary join and blocks direct ingestion of the upstream payload.

## Goal

Make `crew_team` store the team code directly as a string column `team`.

## Scope

1. Update `crew_team` schema so the membership column is `team varchar(...)`.
2. Remove the dependency on `team.id` for crew-team linkage.
3. Extend Crew import to write each upstream `teams[]` entry into `crew_team`.
4. Update live-server crew team model, services, history routes, data-save/validation paths, and data registry to use `team`.
5. Update legality query scripts that currently join `crew_team.team_id -> team.id`.
6. Keep the `team` master table available for users to manually add future team definitions; it is no longer the linkage authority for imported crew memberships.

## Data mapping

- Upstream `teams[].teamId` is the persisted value for `crew_team.team`.
- Upstream `teams[].teamName` is stored in `crew_team.remarks` for now.
- Preserve upstream `effDt`, `expDt`, and `isValid`.
- Do not collapse multiple team memberships into one row.
- Continue using `crew_id` + effective dates as the history grain.

## Migration behavior

- Existing `crew_team.team_id` data must be migrated to the new string column using the current team master lookup.
- After migration, new writes use `team` only.
- No new FK to `team` should remain on `crew_team`.

## Acceptance criteria

- Crew import writes team memberships from upstream `teams[]`.
- `crew_team` rows contain string team codes.
- Crew history CRUD reads/writes the string column without joining `team`.
- Gantt/data maintenance views still show crew team history correctly.
- Legal query scripts aggregate team strings directly.
- Tests cover transform/import and the updated crew-team CRUD/model path.

## Verification

- Focused unit tests for Crew transform/import.
- Focused tests for crew-team service and data-save/validation paths.
- Any affected UI/data-maintenance coverage updated if the team field surface changes.
