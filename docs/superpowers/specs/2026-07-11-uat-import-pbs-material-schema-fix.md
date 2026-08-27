# UAT Import PBS Material Schema Fix

## Problem

Opening the Scenario `Import PBS Material` dialog in UAT shows:

```text
permission denied for schema f8
```

The dialog loads roster-period options from live-server:

```text
GET /api/scenario/import-pbs-material/roster-periods
```

That route queries `${request.authUser.schema}.roster_period`.

## Root Cause

Local UAT env already points live-server at the isolated live schema:

```text
LIVE_SCHEMA=f8_uat_live
DATABASE_URL user=f8_uat_live
```

But `live-server/src/services/auth/session-auth.ts` still hard-codes the authenticated schema as `f8`:

```ts
export const LIVE_AUTH_SCHEMA = 'f8'
```

So fresh login tokens still carry `schema: 'f8'`. The Import PBS roster-period route then queries
`f8.roster_period` while connected as the UAT role, which does not have permission on source `f8`.

## Proposed Fix

1. Change live auth session schema to come from runtime config: `env.LIVE_SCHEMA`.
2. Keep JWT validation strict: tokens are valid only when `payload.schema === env.LIVE_SCHEMA`.
   This intentionally invalidates old tokens minted for `f8` after UAT switches to `f8_uat_live`.
3. Update auth route tests to assert login and `/me` use `LIVE_SCHEMA` from env.
4. Update Import PBS material route unit coverage to prove the roster-period SQL uses `authUser.schema`
   from the UAT schema.
5. Keep connector codes based on `FILIALE` rather than the physical live schema name. For UAT,
   SQL should read `f8_uat_live.roster_period`, but connector codes should remain `f8-crew`,
   `f8-flight`, `f8-pairing`, and `f8-roster-flight`.

## Risk / Blast Radius

This is an auth-path change, so risk is high even though the code diff is small.

Affected behavior:

- Login token payload schema.
- `/api/auth/me` token validation.
- All routes that use `request.authUser.schema` for schema-qualified SQL.
- WebSocket auth subscribe schema comparison.

Expected operational effect:

- Users must log in again after deployment because existing tokens with `schema=f8` will be rejected
  when `LIVE_SCHEMA=f8_uat_live`.

## Verification Plan

Run the smallest focused tests first:

```bash
cd live-server
npm test -- src/routes/auth/auth.test.ts src/__tests__/unit/scenario-import-pbs-material-route.test.ts
```

Then manually verify the endpoint with a fresh login token:

```text
GET /api/scenario/import-pbs-material/roster-periods
```

Expected result: 200 with roster-period items, no query against `f8.roster_period`.

## Out Of Scope

- Connector-server UAT migration. `connector-server/.env` still uses user `f8`; that can affect the
  later Confirm/import step, but it is not needed to fix the dialog-open roster-period load.
- Full hard-coded schema cleanup beyond the auth payload path.
