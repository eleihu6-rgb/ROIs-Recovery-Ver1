# Runtime Config Hardening

## Problem

UAT schema isolation exposed several code paths that still default to source schema names such as
`f8` or assume that a physical schema name is also the business airline code. These paths are latent
runtime bugs for UAT/SIT and any future DB/Redis environment split.

## Scope

This pass only hardens runtime schema/channel fallbacks in live-server and the Gantt client.

Included:

- live-server WebSocket lock / draft broadcasts.
- live-server routes that fallback `request.authUser.schema` to literal `f8`.
- Gantt lock store fallback schema.
- Gantt metadata store live/scenario schema keys, so UAT can request `f8_uat_live` /
  `f8_uat_scenario` metadata instead of hard-coded `f8` / `scenario`.

Excluded:

- Long-running scripts under `live-server/scripts` / `pbs-server/src/scripts`.
- Unit-test fixture literals.
- Connector-server DB user/env migration. That needs a separate deployment/config step.
- UI copy changes beyond using runtime schema labels where the UI already displays schema names.

## Design

1. Treat `env.LIVE_SCHEMA` and `env.SCENARIO_SCHEMA` as the authoritative physical schema names.
2. Treat `env.FILIALE` as the business airline code for connector/rule labels where needed.
3. Never use literal `f8` as an authenticated schema fallback in production route code.
4. For WebSocket broadcast channels, use the same schema as the authenticated client token.
5. Keep compatibility for legacy callers by letting `logicalSchema('f8')` and `logicalSchema('scenario')`
   continue mapping to runtime physical schemas.

## Verification Plan

Focused checks:

```bash
cd live-server
npm test -- src/routes/auth/auth.test.ts src/__tests__/unit/scenario-import-pbs-material-route.test.ts
npm run build
```

Frontend static check after Gantt type changes:

```bash
cd gantt
npm run check:ui
```

Runtime smoke:

```text
GET /api/health
POST /api/auth/login -> schema is f8_uat_live
GET /api/scenario/import-pbs-material/roster-periods -> 200
```

## Risk

Medium. These are config-path changes in authenticated live-server routes and WebSocket channels.
Expected impact is to align runtime behavior with UAT/SIT schema env. Existing users should log in
again after deployment so tokens carry the current schema.
