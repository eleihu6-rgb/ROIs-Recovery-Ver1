# Legality Ruleset Workset Fields Design

## Goal

Fix the Legality page rule-set creation bug where clicking `+` creates a `workset` row with incorrect classification fields. New legality rule sets must persist as `workset.category = 'RULE'` and `workset.type = 'R'`, and already-created bad rows must be repairable so they reappear after refresh.

## Root Cause

`gantt/src/components/legality/rule-set-dialogs.tsx` only sends `name` and `division` when creating a new rule set. The backend route `POST /api/legality/rulesets` in `live-server/src/routes/rule/legality.ts` currently defaults missing fields to `category = null` and `type = 'CU'`.

The canonical seed and normalization migration already establish the expected model:

- `sql/seed/07-rule.sql` creates ruleset worksets as `category = 'RULE'`, `type = 'R'`.
- `sql/migration/2026-06-23-workset-field-fixups.sql` normalizes rule worksets to `type = 'R'` and `category = 'RULE'`.

## Scope

In scope:

- Change the legality ruleset create API to default to `RULE/R` when callers omit `category/type`.
- Change the legality ruleset list API to return every `RULE/R` workset, including empty sets with `ruleCount = 0`.
- Add an idempotent SQL migration to repair existing bad Legality-page worksets.
- Add a focused Vitest regression test for the route defaults.
- Bump `BACKEND_VERSION` because live-server runtime behavior changes.

Out of scope:

- Changing the Legality dialog UI.
- Changing optimizer scenario worksets or PO/RO/TO workset semantics.
- Broad cleanup of the legacy `workset.type` schema comments.

## Existing Data Repair

The data repair must be conservative. It should update only worksets that look like Legality-page rule sets, namely rows that either already map to `rule_set` or are empty rows created through the Legality rule-set UI and currently have the bad `CU`/missing classification. It must not touch optimizer worksets with `type in ('PO', 'RO', 'TO')`.

## Testing

Add or update `live-server/src/__tests__/unit/legality-ruleset-crud.test.ts` so a request with only `{ name, division }` proves the backend INSERT parameters include `category = 'RULE'` and `type = 'R'`.

Add a second regression check for `GET /api/legality/rulesets`: the route must use `LEFT JOIN` membership counting and filter by `workset.category = 'RULE'` plus `workset.type = 'R'`, not `HAVING count > 0`. This preserves newly-created empty rule sets after a page refresh.

Run the smallest relevant live-server Vitest command for this route test after implementation.
