# 开发上下文（2026-04-30）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-04-30 11:11:50 CST
- Wing：`pbs`
- Topic：`pbs-bidding-calendar-off-do-semantics-restored`
- Title：pbs-bidding-calendar-off-do-semantics-restored
- Git branch：`main`

## 本轮对话上下文

本轮在 PBS BIDDING CALENDAR 综合日历实现后做语义恢复：
- 用户明确指出 DO 与 Off 是两个不同业务概念，不能混用。
- `pbs_bid_day_off` 只代表用户提交的 specific day-off bid，应映射为 `day_off_bid`，前后端显示 label 使用 `Off`。
- 暂不从 `pbs_bid_day_off` 派生或显示 `DO`；DO 需要后续确认 AA 文档对应的数据源后单独实现。
- 已恢复后端 `bidding-calendar-service` 和前端 `bidding-calendar-mappers` 中 day-off label 为 `Off`，并同步更新相关测试。
- Pairing 写入成功后会同时 invalidate `tierPageDataQueryKey` 和 `biddingCalendarQueryKey`，避免新增 Pairing ID 后左侧综合日历缓存不刷新。
- 已更新 `docs/superpowers/specs/2026-04-30-pbs-bidding-calendar-aa-data-sources-design.md`，记录 Off/DO 不能混用。
- 验证通过：pbs-server npm test/build，pbs-portal npm test/lint/build，根目录 `npm run verify:pbs`。

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
 M pbs-portal/src/features/dashboard/hooks/use-calendar-days-off-draft.ts
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
 M pbs-server/src/app.ts
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
 M pbs-server/src/services/calendar/types.ts
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
?? docs/dev-context/2026-04-30-pbs-pbs-bidding-calendar-aa-data-sources-implemented.md
?? docs/dev-context/2026-04-30-pbs-pbs-simplify-refactor-testing-handoff.md
?? docs/dev-context/2026-04-30-pbs-pbs-tier-db-migration-applied.md
?? docs/dev-context/2026-04-30-pbs-pbs-tier-terminology-migration.md
?? docs/superpowers/specs/2026-04-30-pbs-bidding-calendar-aa-data-sources-design.md
?? docs/superpowers/specs/2026-04-30-pbs-tier-terminology-migration-design.md
?? packages/contracts/pbs-bidding-calendar.d.ts
?? packages/contracts/pbs-bidding-calendar.js
?? pbs-portal/src/features/dashboard/bidding-calendar-mappers.test.ts
?? pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts
?? pbs-portal/src/features/dashboard/hooks/use-bidding-calendar.ts
?? pbs-portal/src/features/tier/
?? pbs-portal/src/shared/components/schedule/schedule-tier-matrix.test.tsx
?? pbs-portal/src/shared/components/schedule/schedule-tier-matrix.tsx
?? pbs-portal/src/shared/components/tiers/
?? pbs-portal/src/shared/services/bidding-calendar-service.ts
?? pbs-portal/src/shared/services/tier-service.ts
?? pbs-server/src/models/pbs/pbs-bid-tier.ts
?? pbs-server/src/routes/bidding-calendar.test.ts
?? pbs-server/src/routes/bidding-calendar.ts
?? pbs-server/src/services/calendar/bidding-calendar-service.ts
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
pbs-portal/src/features/dashboard/hooks/use-calendar-days-off-draft.ts
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
pbs-server/src/app.ts
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
pbs-server/src/services/calendar/types.ts
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
2. 本文件：`docs/dev-context/2026-04-30-pbs-pbs-bidding-calendar-off-do-semantics-restored.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
