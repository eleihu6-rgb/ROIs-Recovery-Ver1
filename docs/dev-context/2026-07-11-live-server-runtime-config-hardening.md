# 开发上下文（2026-07-11）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-11 15:20:42 UTC
- Wing：`live-server`
- Topic：`runtime-config-hardening`
- Title：runtime-config-hardening
- Git branch：`main`

## 本轮对话上下文

Runtime config hardening continued on 2026-07-11.

Additional user requirement: env.FILIALE must not default to a literal F8/f8. Default business filiale/airline should come from the live schema dictionary table: parent_code='DEFAULT', code='AIRLINE'.

Implemented decision:
- env.FILIALE is now optional, not defaulted to f8.
- Added live-server/src/utils/filiale.ts with resolveFiliale()/resolveFilialeLower().
- Resolver order: explicit FILIALE env override first; otherwise read live dictionary DEFAULT/AIRLINE.
- Resolver has process-local TTL cache (5 minutes) and in-flight Promise coalescing, so normal runtime does NOT query dictionary on every route call. At most one query per process per 5-minute TTL when no env override is set.
- If neither explicit env nor dictionary DEFAULT/AIRLINE exists, resolver throws a configuration error instead of silently falling back to f8 or physical schema names.

Updated runtime call sites to use the cached resolver instead of env.FILIALE:
- live-server index cold-start legality Redis keys/logging.
- public-config default airline.
- rule-check route and mutation trigger filiale fields.
- legality workset create/copy and recheck status keys.
- legality-recheck child --airline and Redis keys.
- Import PBS Material connector code prefix.
- PBS period admin route registration.
- violations-init job payload/status keys.
- RES pairing segment airline.
- scenario result loader airline fallback.

Verification after this change:
- cd live-server && npm test -- src/__tests__/services/rule/legality-recheck.test.ts src/services/res-pairing/__tests__/res-pairing-service.test.ts src/routes/auth/auth.test.ts src/__tests__/unit/scenario-import-pbs-material-route.test.ts src/__tests__/workers/check-pairing-worker.test.ts src/__tests__/services/scenario/scenario-result-service.test.ts
  PASS: 6 files, 26 tests.
- cd live-server && npm run build
  PASS.
- Restarted live-server, new node dist/index.js pid 1585013 on :3000.
- Runtime smoke: health 200, /api/public/config airline F8 (from live dictionary), login schema f8_uat_live, Import PBS Material roster-periods 200 / 11 items / first 2026RP02.

GitNexus detect-changes now reports CRITICAL because the cumulative diff spans auth, roster/draft/lock, rule-check, legality, RES pairing, public config, PBS admin, and Gantt metadata/lock flows. This is expected for this config hardening pass; tests/build/smoke above are the current coverage.

Residual hardcoded F8 scan items intentionally not changed yet:
- roster-ground-inbound-worker source='F8' / F8_IMPORT external ownership markers.
- scenario s3-pairing-prg-parser F8 parser defaults/carrier handling.
- PBS static mock/demo data and UI placeholders/comments.

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M gantt/src/components/auth/login-page.tsx
 M gantt/src/components/data/metadata-view.tsx
 M gantt/src/components/flight-navi/use-flight-navi-data.ts
 M gantt/src/components/shell/shell-sidebar.tsx
 M gantt/src/services/public-config-service.ts
 M gantt/src/stores/lock-store.ts
 M gantt/src/stores/metadata-store.ts
 M live-server/src/__tests__/services/rule/legality-recheck.test.ts
 M live-server/src/__tests__/services/scenario/scenario-result-service.test.ts
 M live-server/src/__tests__/unit/scenario-import-pbs-material-route.test.ts
 M live-server/src/__tests__/workers/check-pairing-worker.test.ts
 M live-server/src/config/env.ts
 M live-server/src/index.ts
 M live-server/src/routes/admin/scenario-kpi-backfill.ts
 M live-server/src/routes/admin/violations-init.ts
 M live-server/src/routes/auth/auth.test.ts
 M live-server/src/routes/draft/draft.ts
 M live-server/src/routes/lock/lock.ts
 M live-server/src/routes/pbs/period-admin.ts
 M live-server/src/routes/public-config.ts
 M live-server/src/routes/roster/roster.ts
 M live-server/src/routes/rule-check/rule-check-routes.ts
 M live-server/src/routes/rule/legality.ts
 M live-server/src/routes/scenario/import-pbs-material.ts
 M live-server/src/routes/scenario/scenario.ts
 M live-server/src/services/auth/session-auth.ts
 M live-server/src/services/res-pairing/__tests__/res-pairing-service.test.ts
 M live-server/src/services/res-pairing/res-pairing-service.ts
 M live-server/src/services/rule-check/rule-check-trigger.ts
 M live-server/src/services/rule/legality-recheck.ts
 M live-server/src/services/scenario/scenario-result-service.ts
 M live-server/src/workers/check-pairing-worker.ts
 M live-server/src/workers/check-roster-worker.ts
 M pbs-engine
?? docs/dev-context/2026-07-11-live-server-runtime-config-hardening.md
?? docs/superpowers/specs/2026-07-11-runtime-config-hardening.md
?? docs/superpowers/specs/2026-07-11-uat-import-pbs-material-schema-fix.md
?? live-server/src/utils/filiale.ts
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
gantt/src/components/auth/login-page.tsx
gantt/src/components/data/metadata-view.tsx
gantt/src/components/flight-navi/use-flight-navi-data.ts
gantt/src/components/shell/shell-sidebar.tsx
gantt/src/services/public-config-service.ts
gantt/src/stores/lock-store.ts
gantt/src/stores/metadata-store.ts
live-server/src/__tests__/services/rule/legality-recheck.test.ts
live-server/src/__tests__/services/scenario/scenario-result-service.test.ts
live-server/src/__tests__/unit/scenario-import-pbs-material-route.test.ts
live-server/src/__tests__/workers/check-pairing-worker.test.ts
live-server/src/config/env.ts
live-server/src/index.ts
live-server/src/routes/admin/scenario-kpi-backfill.ts
live-server/src/routes/admin/violations-init.ts
live-server/src/routes/auth/auth.test.ts
live-server/src/routes/draft/draft.ts
live-server/src/routes/lock/lock.ts
live-server/src/routes/pbs/period-admin.ts
live-server/src/routes/public-config.ts
live-server/src/routes/roster/roster.ts
live-server/src/routes/rule-check/rule-check-routes.ts
live-server/src/routes/rule/legality.ts
live-server/src/routes/scenario/import-pbs-material.ts
live-server/src/routes/scenario/scenario.ts
live-server/src/services/auth/session-auth.ts
live-server/src/services/res-pairing/__tests__/res-pairing-service.test.ts
live-server/src/services/res-pairing/res-pairing-service.ts
live-server/src/services/rule-check/rule-check-trigger.ts
live-server/src/services/rule/legality-recheck.ts
live-server/src/services/scenario/scenario-result-service.ts
live-server/src/workers/check-pairing-worker.ts
live-server/src/workers/check-roster-worker.ts
pbs-engine
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-11-live-server-runtime-config-hardening.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh live-server
git status --short
```
