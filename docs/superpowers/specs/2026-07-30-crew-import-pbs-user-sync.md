# Crew Import PBS User Projection Sync

## Context

F8 crew import currently flows through `connector-server` for fetch/transform/enqueue and is written by `live-server/src/workers/crew-inbound-worker.ts` from the BullMQ queue `connector.crew.inbound`.

The live `crew` table is the source for crew master data. The PBS subsystem keeps a separate projection table, `pbs_user`, in the runtime PBS schema (`env.PBS_SCHEMA`; schema names differ across local, SIT, UAT, and production environments). `pbs_user` has no FK to live `crew`; it is matched by business `crew_id` and has a unique index on both `crew_id` and `user_code`.

The existing `pbs-server/src/scripts/sync-pbs-users.ts` batch script syncs PBS accounts from live `users`, then enriches `pbs_user.division/base/rank` from `crew`, `crew_base`, and `crew_rank`. The requested behavior is narrower and immediate: when Crew import processes a `crew_id`, add or update the PBS `pbs_user` row by that `crew_id`.

## Requirement

When a Crew import job writes live crew data, also upsert the corresponding row in `${PBS_SCHEMA}.pbs_user` using `crew_id` as the conflict key.

The upsert should run inside the same per-record savepoint as the live `crew` and child-table writes, so one bad PBS projection write fails only that crew record and rolls back that crew's partial live writes, matching the worker's existing error accounting.

## Proposed Behavior

For every transformed `CrewImportRecord` successfully written by `processCrewImportJob`:

- Insert a `pbs_user` row when none exists for `crew_id`.
- Update an existing `pbs_user` row when `crew_id` already exists.
- Populate crew-derived projection fields from the import record and current import child records:
  - `crew_id`: `rec.crewId`
  - `user_code`: `rec.crewId`
  - `user_name`: prefer a readable name from `preferredName`, otherwise `firstName middleName lastName`, otherwise `crewId`
  - `email`: `rec.email` or null
  - `tel`: `rec.tel` or null
  - `gender`: `rec.gender`
  - `eff_dt`: `rec.emplDt` or `now()`
  - `exp_dt`: null
  - `division`: `rec.division`
  - `base`: primary current/open-ended imported base when available; otherwise first imported base; otherwise preserve existing on update / null on insert
  - `rank`: current/open-ended imported rank when available; otherwise latest imported rank; otherwise preserve existing on update / null on insert
  - audit fields: `created_by` / `updated_by` = `F8_IMPORT`, `updated_at = now()`

Required non-auth fields that have no crew source should use stable minimal defaults on insert:

- `password_hash`: a non-login placeholder value, not a real password
- `branch_code`: `rec.filiale` or `F8`
- `py_abbr`: `rec.crewId`
- `ad_active`: `0`
- `status`: `0`
- `is_admin`: `0`
- `is_first_login`: `Y`
- `password_access`: `N`
- `portal_access`: `Y`
- `app_access`: `Y`
- `failed_login_count`: `0`
- `token_version`: `0`

On update, preserve authentication/security state unless the imported crew record explicitly owns the field. In particular, do not overwrite `password_hash`, `failed_login_count`, `locked_until`, `password_changed_at`, `token_version`, `last_login_at`, or `last_login_ip`.

## Implementation Scope

Primary code change:

- `live-server/src/workers/crew-inbound-worker.ts`
  - Pass the PBS schema into `processCrewImportJob(...)` from the worker runtime config; do not hard-code a schema name in the worker or tests.
  - Add a small schema-name validator before using `sql.raw`.
  - Add `upsertPbsUser(tx, rec, pbsSchema)` and call it after `syncChildren(...)` in the existing savepoint.
  - Keep SQL parameterized for values; use raw SQL only for the validated PBS schema identifier.

Likely tests:

- `live-server/src/__tests__/unit/crew-inbound-worker.test.ts`
  - Assert crew import emits an `INSERT INTO <pbs_schema>.pbs_user ... ON CONFLICT (crew_id) DO UPDATE` statement.
  - Assert the update clause preserves auth/security fields and updates crew projection fields.
  - Use a non-default schema such as `sit_pbs` in the unit test to prove the SQL target is parameterized.

No connector-server code change is expected because connector-server does not perform the DB write; it transforms F8 payloads and enqueues the existing import job.

## Verification Plan

Smallest relevant automated checks:

```bash
npm --prefix live-server test -- src/__tests__/unit/crew-inbound-worker.test.ts
npm --prefix live-server run build
```

If implementation introduces dynamic SQL for schema qualification, also inspect the generated SQL in the unit test and keep the schema validator local to prevent unsafe identifiers.

## Risks And Open Decisions

- Existing batch `sync-pbs-users.ts` is user-account oriented and may later overwrite `pbs_user` rows by `user_code`. This change deliberately uses `crew_id` for immediate crew projection and preserves auth state to avoid breaking existing accounts.
- If the product expects `user_code` to come from live `users.user_code` rather than `crew_id`, the insert default should be revisited. The user request specifically says “根据 crew_id 去新增或更新数据”, so `crew_id` is the conservative default account code for new rows.
- GitNexus impact tools are mentioned in AGENTS.md, but this Codex session does not expose GitNexus MCP tools. Before code implementation I can only report this limitation and use code search/tests as the fallback.
