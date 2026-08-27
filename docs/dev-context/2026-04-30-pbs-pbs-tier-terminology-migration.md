# 开发上下文（2026-04-30）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-04-30 10:03:47 CST
- Wing：`pbs`
- Topic：`pbs-tier-terminology-migration`
- Title：PBS Tier 术语全栈迁移
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS 全栈业务术语迁移：把申请层级相关的 `Layer / Layers / LAYERS / Lx` 统一改为 `Tier / Tiers / TIERS / Tx`。

关键需求与决策：
- 前后端、共享 contracts、Drizzle model、SQL schema/seed、migration、测试与开发规范全部统一使用 Tier 术语。
- `pbs-portal` 正式路由为 `/tier`，旧 `/layer` 不保留兼容入口，访问应进入 404；auth return-to 也会把 `/layer` 归一到 `/dashboard`。
- API contract 不保留旧 `layer/layers/Lx` 兼容层；旧字段或旧标签应通过校验失败暴露未迁移调用方。
- AA 原文如果使用 Layer，项目文档必须注明“AA 原文 Layer，对应本项目 Tier”，不能把 AA 原文术语带回项目代码。

主要实现范围：
- `pbs-portal/src/features/layer` 已迁移为 `pbs-portal/src/features/tier`。
- `LayerToggleGroup` 已迁移为 `TierToggleGroup`；`ScheduleLayerMatrix` 已迁移为 `ScheduleTierMatrix`。
- Portal 页面、mock、store、service、mapper、测试、导航、i18n、aria label、query/cache key 等相关命名已迁到 tier。
- `pbs-server` API route schema、service、mapper、validation、测试、错误文案均已迁到 `tier/tiers/Tx`。
- Drizzle model `pbsBidLayer` 已迁移为 `pbsBidTier`，业务字段改为 `tier/tiers/totalTiers/maxTiers` 等。
- 新增 migration `sql/migration/2026-04-30-rename-pbs-layer-to-tier.sql`，通过 rename 保留已有数据，并把 `PBS_MAX_LAYERS` 迁移为 `PBS_MAX_TIERS`。
- 更新 `pbs-portal/AGENTS.md` 与 `pbs-server/AGENTS.md`，写入 PBS Tier 术语规范和允许保留旧词的边界。
- 设计文档为 `docs/superpowers/specs/2026-04-30-pbs-tier-terminology-migration-design.md`。

验证结果：
- 根目录 `npm run verify:pbs` 通过。
- `pbs-server`: 117 tests passed，build passed。
- `pbs-server`: `npm run sync:pbs-users -- --dry-run` passed，summary 为 inserted 0 / updated 4 / deactivated 0 / skippedMissingCrewId 0，dry-run 未写库。
- `pbs-portal`: 38 test files passed，194 tests passed，lint passed，build passed。
- 残留扫描：业务代码、contracts、schema、seed 中旧 Layer 业务术语已清除；保留项仅限于旧 `/layer` 和旧 `Lx/layers` 的拒绝/404 回归测试、AGENTS/spec 说明、以及 rename migration 中的旧对象名。

后续注意：
- 不要再新增 PBS 业务含义的 Layer 命名；新增申请层级相关代码必须用 Tier/Tx。
- 不要把旧 `/layer` 做 redirect 兼容，当前结论是旧入口 404。
- 不要删除 migration 里的旧对象名引用，那是 rename 和数据保留所必需。
- `pbs-portal/tsconfig.tsbuildinfo` 是 tracked 文件，portal build 会更新它；不要无故删除。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M packages/contracts/pbs-calendar-days-off.d.ts
 M packages/contracts/pbs-days-off-bids.d.ts
 M packages/contracts/pbs-days-off-bids.js
 M packages/contracts/pbs-line-bids.d.ts
 M packages/contracts/pbs-lineholder-summary.d.ts
 M packages/contracts/pbs-pairing-bids.d.ts
 M packages/contracts/pbs-pairing-bids.js
 M packages/contracts/pbs-search-pairings.d.ts
 M pbs-portal/AGENTS.md
 M pbs-portal/src/app/layout/dashboard-top-nav.test.tsx
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
 M pbs-portal/src/app/router/app-routes.test.tsx
 M pbs-portal/src/app/router/app-routes.tsx
 M pbs-portal/src/app/router/auth-return-to.ts
 M pbs-portal/src/app/router/legacy-route-redirects.tsx
 M pbs-portal/src/features/award/components/award-right-panel.tsx
 M pbs-portal/src/features/award/mock.ts
 M pbs-portal/src/features/award/types.ts
 M pbs-portal/src/features/dashboard/calendar-days-off-mappers.test.ts
 M pbs-portal/src/features/dashboard/calendar-days-off-mappers.ts
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
 M pbs-portal/src/features/dashboard/mock.ts
 M pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx
 M pbs-portal/src/features/dashboard/types.ts
 M pbs-portal/src/features/days-off/days-off-validation.ts
 M pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
 M pbs-portal/src/features/days-off/pages/days-off-page.tsx
 D pbs-portal/src/features/layer/components/layer-right-panel-loading.tsx
 D pbs-portal/src/features/layer/components/layer-right-panel.test.tsx
 D pbs-portal/src/features/layer/components/layer-right-panel.tsx
 D pbs-portal/src/features/layer/hooks/use-layer-page-data.ts
 D pbs-portal/src/features/layer/layer-draft-mappers.test.ts
 D pbs-portal/src/features/layer/layer-draft-mappers.ts
 D pbs-portal/src/features/layer/mock.ts
 D pbs-portal/src/features/layer/pages/layer-page.test.tsx
 D pbs-portal/src/features/layer/pages/layer-page.tsx
 D pbs-portal/src/features/layer/types.ts
 M pbs-portal/src/features/line/pages/line-page.test.tsx
 M pbs-portal/src/features/line/pages/line-page.tsx
 M pbs-portal/src/features/pairing/components/pairing-property-table.tsx
 M pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
 M pbs-portal/src/features/pairing/components/pairing-search-panel.module.css
 M pbs-portal/src/features/pairing/components/pairing-search-panel.tsx
 M pbs-portal/src/features/pairing/mock.ts
 M pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
 M pbs-portal/src/features/pairing/pairing-draft-mappers.ts
 M pbs-portal/src/features/pairing/pairing-page-cache.test.ts
 M pbs-portal/src/features/pairing/pairing-property-equality.test.ts
 M pbs-portal/src/features/pairing/pairing-property-equality.ts
 M pbs-portal/src/features/pairing/pairing-property-list.test.ts
 M pbs-portal/src/features/pairing/pairing-property-transform.test.ts
 M pbs-portal/src/features/pairing/pairing-property-transform.ts
 M pbs-portal/src/features/pairing/pairing-rule-logic.ts
 M pbs-portal/src/features/pairing/pairing-search-criteria.test.ts
 M pbs-portal/src/features/pairing/pairing-search-criteria.ts
 M pbs-portal/src/features/pairing/pairing-search-page-data.test.ts
 M pbs-portal/src/features/pairing/types.ts
 M pbs-portal/src/features/reserve/components/reserve-right-panel.test.tsx
 M pbs-portal/src/features/reserve/components/reserve-right-panel.tsx
 M pbs-portal/src/features/reserve/mock.ts
 M pbs-portal/src/features/reserve/types.ts
 M pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx
 M pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
 M pbs-portal/src/features/rule-bids/rule-bid-draft-mappers.ts
 M pbs-portal/src/features/rule-bids/rule-bid-page-cache.test.ts
 M pbs-portal/src/features/rule-bids/types.ts
 M pbs-portal/src/features/rule-bids/utils.test.ts
 M pbs-portal/src/features/rule-bids/utils.ts
 D pbs-portal/src/shared/components/layers/index.ts
 D pbs-portal/src/shared/components/layers/layer-toggle-group.test.tsx
 D pbs-portal/src/shared/components/layers/layer-toggle-group.tsx
 M pbs-portal/src/shared/components/schedule/builders.ts
 M pbs-portal/src/shared/components/schedule/index.ts
 M pbs-portal/src/shared/components/schedule/schedule-event-calendar.test.tsx
 M pbs-portal/src/shared/components/schedule/schedule-event-calendar.tsx
 D pbs-portal/src/shared/components/schedule/schedule-layer-matrix.test.tsx
 D pbs-portal/src/shared/components/schedule/schedule-layer-matrix.tsx
 M pbs-portal/src/shared/components/schedule/types.ts
 M pbs-portal/src/shared/constants/top-nav-items.ts
 M pbs-portal/src/shared/i18n/locales/en.ts
 M pbs-portal/src/shared/services/days-off-service.ts
 D pbs-portal/src/shared/services/layer-service.ts
 M pbs-portal/src/shared/services/pairing-service.ts
 M pbs-portal/src/shared/store/use-bidding-calendar-store.ts
 M pbs-portal/tsconfig.tsbuildinfo
 M pbs-server/AGENTS.md
 M pbs-server/src/app.test.ts
 M pbs-server/src/models/index.ts
 M pbs-server/src/models/pbs/pbs-award-item.ts
 M pbs-server/src/models/pbs/pbs-award-result.ts
 M pbs-server/src/models/pbs/pbs-bid-day-off.ts
 M pbs-server/src/models/pbs/pbs-bid-group.ts
 D pbs-server/src/models/pbs/pbs-bid-layer.ts
 M pbs-server/src/models/pbs/pbs-bid.ts
 M pbs-server/src/models/pbs/pbs-period.ts
 M pbs-server/src/routes/calendar-days-off.test.ts
 M pbs-server/src/routes/calendar-days-off.ts
 M pbs-server/src/routes/days-off-bids.test.ts
 M pbs-server/src/routes/days-off-bids.ts
 M pbs-server/src/routes/line-bids.test.ts
 M pbs-server/src/routes/line-bids.ts
 M pbs-server/src/routes/lineholder-summary.test.ts
 M pbs-server/src/routes/pairing-bids.test.ts
 M pbs-server/src/routes/pairing-bids.ts
 M pbs-server/src/routes/pairing-search.test.ts
 M pbs-server/src/routes/pairing-search.ts
 M pbs-server/src/services/calendar/calendar-days-off-service.ts
 M pbs-server/src/services/calendar/calendar-days-off-validation.test.ts
 M pbs-server/src/services/calendar/calendar-days-off-validation.ts
 M pbs-server/src/services/days-off/days-off-bid-service.ts
 M pbs-server/src/services/days-off/days-off-draft-mappers.test.ts
 M pbs-server/src/services/days-off/days-off-draft-mappers.ts
 M pbs-server/src/services/days-off/days-off-persistence-mappers.test.ts
 M pbs-server/src/services/days-off/days-off-persistence-mappers.ts
 M pbs-server/src/services/days-off/days-off-validation.test.ts
 M pbs-server/src/services/days-off/days-off-validation.ts
 M pbs-server/src/services/line/line-bid-service.ts
 M pbs-server/src/services/lineholder/current-period-bid.test.ts
 M pbs-server/src/services/lineholder/lineholder-summary-service.ts
 M pbs-server/src/services/lineholder/shared.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts
 M pbs-server/src/services/pairing-search/pairing-search-preview-query.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.ts
 M pbs-server/src/services/pairing/pairing-bid-service.ts
 M pbs-server/src/services/pairing/pairing-rule-validation.test.ts
 M sql/schema/03-pbs_pg.sql
 M sql/seed/01-dictionary.sql
?? docs/dev-context/2026-04-30-pbs-pbs-simplify-refactor-testing-handoff.md
?? docs/superpowers/specs/2026-04-30-pbs-tier-terminology-migration-design.md
?? pbs-portal/src/features/tier/
?? pbs-portal/src/shared/components/schedule/schedule-tier-matrix.test.tsx
?? pbs-portal/src/shared/components/schedule/schedule-tier-matrix.tsx
?? pbs-portal/src/shared/components/tiers/
?? pbs-portal/src/shared/services/tier-service.ts
?? pbs-server/src/models/pbs/pbs-bid-tier.ts
?? sql/migration/2026-04-30-rename-pbs-layer-to-tier.sql
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
packages/contracts/pbs-calendar-days-off.d.ts
packages/contracts/pbs-days-off-bids.d.ts
packages/contracts/pbs-days-off-bids.js
packages/contracts/pbs-line-bids.d.ts
packages/contracts/pbs-lineholder-summary.d.ts
packages/contracts/pbs-pairing-bids.d.ts
packages/contracts/pbs-pairing-bids.js
packages/contracts/pbs-search-pairings.d.ts
pbs-portal/AGENTS.md
pbs-portal/src/app/layout/dashboard-top-nav.test.tsx
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/app/router/app-routes.test.tsx
pbs-portal/src/app/router/app-routes.tsx
pbs-portal/src/app/router/auth-return-to.ts
pbs-portal/src/app/router/legacy-route-redirects.tsx
pbs-portal/src/features/award/components/award-right-panel.tsx
pbs-portal/src/features/award/mock.ts
pbs-portal/src/features/award/types.ts
pbs-portal/src/features/dashboard/calendar-days-off-mappers.test.ts
pbs-portal/src/features/dashboard/calendar-days-off-mappers.ts
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
pbs-portal/src/features/dashboard/mock.ts
pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx
pbs-portal/src/features/dashboard/types.ts
pbs-portal/src/features/days-off/days-off-validation.ts
pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
pbs-portal/src/features/days-off/pages/days-off-page.tsx
pbs-portal/src/features/layer/components/layer-right-panel-loading.tsx
pbs-portal/src/features/layer/components/layer-right-panel.test.tsx
pbs-portal/src/features/layer/components/layer-right-panel.tsx
pbs-portal/src/features/layer/hooks/use-layer-page-data.ts
pbs-portal/src/features/layer/layer-draft-mappers.test.ts
pbs-portal/src/features/layer/layer-draft-mappers.ts
pbs-portal/src/features/layer/mock.ts
pbs-portal/src/features/layer/pages/layer-page.test.tsx
pbs-portal/src/features/layer/pages/layer-page.tsx
pbs-portal/src/features/layer/types.ts
pbs-portal/src/features/line/pages/line-page.test.tsx
pbs-portal/src/features/line/pages/line-page.tsx
pbs-portal/src/features/pairing/components/pairing-property-table.tsx
pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
pbs-portal/src/features/pairing/components/pairing-search-panel.module.css
pbs-portal/src/features/pairing/components/pairing-search-panel.tsx
pbs-portal/src/features/pairing/mock.ts
pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
pbs-portal/src/features/pairing/pairing-draft-mappers.ts
pbs-portal/src/features/pairing/pairing-page-cache.test.ts
pbs-portal/src/features/pairing/pairing-property-equality.test.ts
pbs-portal/src/features/pairing/pairing-property-equality.ts
pbs-portal/src/features/pairing/pairing-property-list.test.ts
pbs-portal/src/features/pairing/pairing-property-transform.test.ts
pbs-portal/src/features/pairing/pairing-property-transform.ts
pbs-portal/src/features/pairing/pairing-rule-logic.ts
pbs-portal/src/features/pairing/pairing-search-criteria.test.ts
pbs-portal/src/features/pairing/pairing-search-criteria.ts
pbs-portal/src/features/pairing/pairing-search-page-data.test.ts
pbs-portal/src/features/pairing/types.ts
pbs-portal/src/features/reserve/components/reserve-right-panel.test.tsx
pbs-portal/src/features/reserve/components/reserve-right-panel.tsx
pbs-portal/src/features/reserve/mock.ts
pbs-portal/src/features/reserve/types.ts
pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx
pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
pbs-portal/src/features/rule-bids/rule-bid-draft-mappers.ts
pbs-portal/src/features/rule-bids/rule-bid-page-cache.test.ts
pbs-portal/src/features/rule-bids/types.ts
pbs-portal/src/features/rule-bids/utils.test.ts
pbs-portal/src/features/rule-bids/utils.ts
pbs-portal/src/shared/components/layers/index.ts
pbs-portal/src/shared/components/layers/layer-toggle-group.test.tsx
pbs-portal/src/shared/components/layers/layer-toggle-group.tsx
pbs-portal/src/shared/components/schedule/builders.ts
pbs-portal/src/shared/components/schedule/index.ts
pbs-portal/src/shared/components/schedule/schedule-event-calendar.test.tsx
pbs-portal/src/shared/components/schedule/schedule-event-calendar.tsx
pbs-portal/src/shared/components/schedule/schedule-layer-matrix.test.tsx
pbs-portal/src/shared/components/schedule/schedule-layer-matrix.tsx
pbs-portal/src/shared/components/schedule/types.ts
pbs-portal/src/shared/constants/top-nav-items.ts
pbs-portal/src/shared/i18n/locales/en.ts
pbs-portal/src/shared/services/days-off-service.ts
pbs-portal/src/shared/services/layer-service.ts
pbs-portal/src/shared/services/pairing-service.ts
pbs-portal/src/shared/store/use-bidding-calendar-store.ts
pbs-portal/tsconfig.tsbuildinfo
pbs-server/AGENTS.md
pbs-server/src/app.test.ts
pbs-server/src/models/index.ts
pbs-server/src/models/pbs/pbs-award-item.ts
pbs-server/src/models/pbs/pbs-award-result.ts
pbs-server/src/models/pbs/pbs-bid-day-off.ts
pbs-server/src/models/pbs/pbs-bid-group.ts
pbs-server/src/models/pbs/pbs-bid-layer.ts
pbs-server/src/models/pbs/pbs-bid.ts
pbs-server/src/models/pbs/pbs-period.ts
pbs-server/src/routes/calendar-days-off.test.ts
pbs-server/src/routes/calendar-days-off.ts
pbs-server/src/routes/days-off-bids.test.ts
pbs-server/src/routes/days-off-bids.ts
pbs-server/src/routes/line-bids.test.ts
pbs-server/src/routes/line-bids.ts
pbs-server/src/routes/lineholder-summary.test.ts
pbs-server/src/routes/pairing-bids.test.ts
pbs-server/src/routes/pairing-bids.ts
pbs-server/src/routes/pairing-search.test.ts
pbs-server/src/routes/pairing-search.ts
pbs-server/src/services/calendar/calendar-days-off-service.ts
pbs-server/src/services/calendar/calendar-days-off-validation.test.ts
pbs-server/src/services/calendar/calendar-days-off-validation.ts
pbs-server/src/services/days-off/days-off-bid-service.ts
pbs-server/src/services/days-off/days-off-draft-mappers.test.ts
pbs-server/src/services/days-off/days-off-draft-mappers.ts
pbs-server/src/services/days-off/days-off-persistence-mappers.test.ts
pbs-server/src/services/days-off/days-off-persistence-mappers.ts
pbs-server/src/services/days-off/days-off-validation.test.ts
pbs-server/src/services/days-off/days-off-validation.ts
pbs-server/src/services/line/line-bid-service.ts
pbs-server/src/services/lineholder/current-period-bid.test.ts
pbs-server/src/services/lineholder/lineholder-summary-service.ts
pbs-server/src/services/lineholder/shared.ts
pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts
pbs-server/src/services/pairing-search/pairing-search-preview-query.ts
pbs-server/src/services/pairing-search/pairing-search-service.ts
pbs-server/src/services/pairing/pairing-bid-service.ts
pbs-server/src/services/pairing/pairing-rule-validation.test.ts
sql/schema/03-pbs_pg.sql
sql/seed/01-dictionary.sql
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-04-30-pbs-pbs-tier-terminology-migration.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
