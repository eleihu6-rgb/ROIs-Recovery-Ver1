# 开发上下文（2026-07-13）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-13 20:12:53 CST
- Wing：`pbs`
- Topic：`redeye-preference`
- Title：redeye-preference
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Pairing 条件 Redeye Preference 的项目落地，用户已批准 spec `/Users/lei/Codehub/rois-ai/docs/superpowers/specs/2026-07-13-pbs-redeye-preference-design.md` 后实施。

关键产品结论：
- propertyCode=117 从旧 `Any Leg Is Redeye` 升级为 `Redeye Preference`。
- UI 显示公司定义 `03:30-05:30 local time`，员工不可编辑 time window；后续管理端再配置。
- 日期模式：`Any date` 默认、`Specific date`、`Date range`。
- 新 payload：`{ type: "redeye-preference", dateScope: null | { mode:"specific_date", date } | { mode:"date_range", from, to } }`。
- 旧 `{ type:"flag" }` bid 继续兼容；打开编辑器会归一化为新 payload。

主要代码改动：
- contracts: `packages/contracts/pbs-pairing-bids.js/.d.ts` 新增 Redeye definition、bid 类型和 catalog 默认 bid。
- portal: 新增 `redeye-preference-editor.tsx`，接入 `pairing-property-config-dialog.tsx`，补 summary、complete check、read-only display、draft clone/mapping、DaysOff/Line exclusion。
- server: `pairing-bid-route-schemas.ts` 增加 schema；`pairing-property-validation.ts` 支持新旧 payload；`pairing-search-detail-conditions.ts` 改成 local operating window overlap，不再用简单跨日期；rule bid clone/serialize/deserialize/format 支持 JSON round-trip。
- SQL: 更新 seed legacy alignment 的 117，新增 migration `sql/migration/2026-07-13-pbs-redeye-preference.sql`。
- E2E/NPBS: NPBS old text `Any Leg Is Redeye` 映射为新的 Redeye Preference payload；Playwright 新增 PBS-3525 主流程。
- QA: 新增 `docs/test-cases/pbs/pairing/2026-07-13-redeye-preference.md`。

Redeye SQL 语义：
- 单个有效 `pairing_segment` 的 `sch_str_dt_utc/sch_end_dt_utc` 与出发机场本地 `03:30-05:30` 窗口重叠即命中。
- SQL 使用 `generate_series(local_start_date, local_end_date, interval '1 day')` 生成 Redeye window date，再用 `tstzrange(...) && tstzrange(...)` 判断 overlap。
- `Specific date` / `Date range` 过滤 `redeye_windows.redeye_date`，所以 `22:30-05:10` 归到凌晨窗口日期。

验证结果：
- `cd pbs-portal && npm run test -- src/features/pairing/components/redeye-preference-editor.test.tsx src/features/pairing/components/pairing-bid-control.test.tsx src/features/pairing/pairing-property-catalog.test.ts` PASS，55 tests。
- `cd pbs-server && DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/routes/pairing-bids.test.ts src/services/pairing/pairing-property-validation.test.ts src/services/pairing-search/pairing-search-condition-builder.test.ts src/services/lineholder/rule-bid-value.test.ts` PASS，215 tests。
- `cd pbs-server && npm run build` PASS。
- `cd pbs-portal && npm run build` PASS；Vite 有既有 chunk size warning。
- `npm run check:ui` PASS，0 hard violations，133 warnings。
- `cd pbs-portal && npm run lint` PASS，0 errors，16 react-refresh warnings（包含既有同类 editor helper export 模式）。
- `cd pbs-portal && npm run test -- src/features/days-off/pages/days-off-page.test.tsx` PASS，25 tests。
- `cd e2e && npx playwright test --config=config/playwright.config.ts --project=pbs-portal --no-deps tests/pbs-portal/condition-default-favorites.spec.ts -g "Redeye Preference" --reporter=list` PASS，1 test。
- `git diff --check` PASS。

注意事项：
- 本轮未提交 git；用户之前明确要求未允许不提交。
- 工作树中 `AGENTS.md` / `CLAUDE.md` 已有改动不是本轮 Redeye 目标，不要擅自回滚。

## 当前工作树快照

### git status --short

```text
 M AGENTS.md
 M CLAUDE.md
 M e2e/tests/pbs-portal/condition-default-favorites.spec.ts
 M e2e/utils/npbs/mapping.mjs
 M packages/contracts/pbs-pairing-bids.d.ts
 M packages/contracts/pbs-pairing-bids.js
 M pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
 M pbs-portal/src/features/line/line-draft-mappers.ts
 M pbs-portal/src/features/pairing/components/pairing-bid-control.test.tsx
 M pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
 M pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx
 M pbs-portal/src/features/pairing/pairing-bid-control-logic.ts
 M pbs-portal/src/features/pairing/pairing-bid-summary.ts
 M pbs-portal/src/features/pairing/pairing-draft-mappers.ts
 M pbs-portal/src/features/pairing/pairing-property-catalog.test.ts
 M pbs-portal/src/features/pairing/pairing-property-catalog.ts
 M pbs-portal/src/features/pairing/types.ts
 M pbs-portal/src/shared/services/days-off-service.ts
 M pbs-portal/src/shared/services/line-service.ts
 M pbs-server/src/routes/pairing-bid-route-schemas.ts
 M pbs-server/src/routes/pairing-bids.test.ts
 M pbs-server/src/services/lineholder/rule-bid-clone.ts
 M pbs-server/src/services/lineholder/rule-bid-format.ts
 M pbs-server/src/services/lineholder/rule-bid-serialize.ts
 M pbs-server/src/services/lineholder/rule-bid-types.ts
 M pbs-server/src/services/lineholder/rule-bid-value.test.ts
 M pbs-server/src/services/lineholder/rule-bid-value.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-detail-conditions.ts
 M pbs-server/src/services/pairing/pairing-property-validation.test.ts
 M pbs-server/src/services/pairing/pairing-property-validation.ts
 M sql/seed/10-pbs-bid-property.sql
?? docs/superpowers/specs/2026-07-13-pbs-redeye-preference-design.md
?? docs/test-cases/pbs/pairing/2026-07-13-redeye-preference.md
?? pbs-portal/src/features/pairing/components/redeye-preference-editor.test.tsx
?? pbs-portal/src/features/pairing/components/redeye-preference-editor.tsx
?? sql/migration/2026-07-13-pbs-redeye-preference.sql
```

### unstaged changed files

```text
AGENTS.md
CLAUDE.md
e2e/tests/pbs-portal/condition-default-favorites.spec.ts
e2e/utils/npbs/mapping.mjs
packages/contracts/pbs-pairing-bids.d.ts
packages/contracts/pbs-pairing-bids.js
pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
pbs-portal/src/features/line/line-draft-mappers.ts
pbs-portal/src/features/pairing/components/pairing-bid-control.test.tsx
pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx
pbs-portal/src/features/pairing/pairing-bid-control-logic.ts
pbs-portal/src/features/pairing/pairing-bid-summary.ts
pbs-portal/src/features/pairing/pairing-draft-mappers.ts
pbs-portal/src/features/pairing/pairing-property-catalog.test.ts
pbs-portal/src/features/pairing/pairing-property-catalog.ts
pbs-portal/src/features/pairing/types.ts
pbs-portal/src/shared/services/days-off-service.ts
pbs-portal/src/shared/services/line-service.ts
pbs-server/src/routes/pairing-bid-route-schemas.ts
pbs-server/src/routes/pairing-bids.test.ts
pbs-server/src/services/lineholder/rule-bid-clone.ts
pbs-server/src/services/lineholder/rule-bid-format.ts
pbs-server/src/services/lineholder/rule-bid-serialize.ts
pbs-server/src/services/lineholder/rule-bid-types.ts
pbs-server/src/services/lineholder/rule-bid-value.test.ts
pbs-server/src/services/lineholder/rule-bid-value.ts
pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
pbs-server/src/services/pairing-search/pairing-search-detail-conditions.ts
pbs-server/src/services/pairing/pairing-property-validation.test.ts
pbs-server/src/services/pairing/pairing-property-validation.ts
sql/seed/10-pbs-bid-property.sql
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-13-pbs-redeye-preference.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
