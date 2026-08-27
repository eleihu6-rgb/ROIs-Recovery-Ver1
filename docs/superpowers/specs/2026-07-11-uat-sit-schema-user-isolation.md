# UAT/SIT Schema and User Isolation Design

## Request

Create two isolated copies of the current F8 database areas:

| Source | UAT target | SIT target |
|---|---|---|
| `f8` | `f8_uat_live` | `f8_sit_live` |
| `f8_pbs` | `f8_uat_pbs` | `f8_sit_pbs` |
| `scenario` | `f8_uat_scenario` | `f8_sit_scenario` |

Then configure:

- Local repo at `/home/yuan.z/rois/rois-ai` to use the UAT set.
- SIT host `yuan.z@10.15.12.4`, app dir `/home/yuan.z/rois/sit`, to use the SIT set.

Assumption to confirm: the requested `f8_sit/scenario` means `f8_sit_scenario`; PostgreSQL schema names cannot contain `/` unless quoted, and quoted slash names would violate project naming rules.

## Current State Observed

Local database config:

- `live-server/.env`: `DATABASE_URL` uses user `f8`, DB `rois`, `search_path=f8`.
- `pbs-server/.env`: `DATABASE_URL` uses user `f8_pbs`, DB `rois`, `search_path=f8_pbs`.
- `pbs-server/.env`: `SOURCE_SCHEMA=f8`, `TARGET_SCHEMA=f8_pbs`.
- `engine-server/.env`: has legacy PG host/user fields, but no explicit `SCENARIO_DATABASE_URL` or `LEGACY_RO_DB_URL`.

SIT runtime config:

- `/home/yuan.z/rois/sit/env/live-server.env`: `DATABASE_URL` uses user `f8`, DB `rois`, `search_path=f8`.
- `/home/yuan.z/rois/sit/env/pbs-server.env`: `DATABASE_URL` uses user `f8_pbs`, DB `rois`, `search_path=f8_pbs`.
- `/home/yuan.z/rois/sit/env/pbs-server.env`: `SOURCE_SCHEMA=f8`, `TARGET_SCHEMA=f8_pbs`.
- `/home/yuan.z/rois/sit/env/engine-server.env`: `SCENARIO_DATABASE_URL` uses `search_path=scenario`; `LEGACY_RO_DB_URL` uses `search_path=f8`.

Database metadata checks:

- Both local and SIT DB targets currently have source schemas only: `f8`, `f8_pbs`, `scenario`.
- Target schemas/roles are not present yet.
- Current `f8` role is not `CREATEROLE`, so it cannot create login users. It can create schemas in the current database.

## Important Code Risk

Changing only env `search_path` is not enough for full isolation today.

Observed hard-coded schema references include:

- `live-server/src/routes/metadata/index.ts`: allowlist is `['f8', 'scenario']`.
- `live-server/src/services/manday/manday-tool.ts`: type is limited to `'f8' | 'scenario'`.
- Multiple live-server routes/workers call manday recompute with `schema: 'f8'`.
- Scenario services and scripts use literal `scenario.*`.
- Scenario legality/result loader scripts also join literal `f8.*`.

Therefore implementation must either:

1. Parameterize live/scenario schema names in affected runtime paths, or
2. Explicitly accept that some paths will still read/write source `f8`/`scenario`, which is not real isolation.

Recommended: parameterize runtime schema names before switching envs.

## Proposed Design

Add runtime schema env vars:

- `LIVE_SCHEMA`
- `SCENARIO_SCHEMA`
- Keep existing `PBS_SCHEMA`.

Expected values:

| Environment | `LIVE_SCHEMA` | `PBS_SCHEMA` | `SCENARIO_SCHEMA` |
|---|---|---|---|
| local UAT | `f8_uat_live` | `f8_uat_pbs` | `f8_uat_scenario` |
| SIT | `f8_sit_live` | `f8_sit_pbs` | `f8_sit_scenario` |

Connection strings:

- Live server `DATABASE_URL`: user/schema matching `LIVE_SCHEMA`.
- PBS server `DATABASE_URL` and `TARGET_DATABASE_URL`: user/schema matching `PBS_SCHEMA`.
- PBS server `SOURCE_DATABASE_URL` and `SOURCE_SCHEMA`: user/schema matching `LIVE_SCHEMA`.
- Engine server `LEGACY_RO_DB_URL`: user/schema matching `LIVE_SCHEMA`.
- Engine server `SCENARIO_DATABASE_URL`: user/schema matching `SCENARIO_SCHEMA`.

Role model:

- Create one login role per schema with matching name:
  - UAT: `f8_uat_live`, `f8_uat_pbs`, `f8_uat_scenario`
  - SIT: `f8_sit_live`, `f8_sit_pbs`, `f8_sit_scenario`
- Grant each role ownership/usage on its schema and required objects.
- Grant cross-schema read/write only where current app flows require it. For example, live-server may need both live and scenario access, and scenario flows may need to join live master data.

## Database Copy Method

Preferred copy method:

1. Use `pg_dump --schema=<source> --format=custom --no-owner --no-acl`.
2. Restore into target via a remapped dump or generated SQL where schema qualification is changed from source to target.
3. Run post-restore ownership and grants.
4. Validate object counts, table counts, sequence ownership, row counts for key tables, and current `search_path`.

Reasoning:

- `CREATE TABLE AS` would lose indexes, constraints, defaults, sequences, comments, and grants.
- `pg_dump` preserves DDL and data more safely.

## Implementation Steps After Approval

1. Confirm target naming and database boundary.
2. Obtain or use a PostgreSQL account with `CREATEROLE` or superuser rights.
3. Stop local and SIT services or confirm an acceptable maintenance window.
4. Create roles and schemas for UAT/SIT.
5. Copy `f8`, `f8_pbs`, and `scenario` into each target set.
6. Parameterize hard-coded live/scenario schema usage in runtime code.
7. Update local `.env` files to UAT schema/users.
8. Update SIT `/home/yuan.z/rois/sit/env/*.env` to SIT schema/users.
9. Restart services.
10. Verify:
    - `current_user`, `current_schema`, `search_path` for each service DSN.
    - Key table row counts match sources.
    - Live server health and core Gantt read.
    - PBS server health and period/bid read.
    - Scenario list/read and one scenario Gantt open.

## Open Questions

1. Should UAT and SIT remain in the existing `rois` database with schema/user isolation, or do you want separate PostgreSQL databases as well?
2. Please confirm `f8_sit_scenario` is the intended target name for the scenario schema.
3. Who should provide or run the `CREATEROLE`/superuser portion? Current `f8` credentials cannot create login users.
4. Should services be stopped during copy, or is a point-in-time copy while running acceptable?

## Rollback

- Keep original env files backed up before editing.
- Do not drop source `f8`, `f8_pbs`, or `scenario`.
- If verification fails, restore env files to source schema and restart services.
- Leave cloned target schemas in place for inspection unless explicitly approved to drop them.
