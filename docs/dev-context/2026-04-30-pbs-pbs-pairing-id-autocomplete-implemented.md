# 开发上下文（2026-04-30）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-04-30 11:36:12 CST
- Wing：`pbs`
- Topic：`pbs-pairing-id-autocomplete-implemented`
- Title：pbs-pairing-id-autocomplete-implemented
- Git branch：`main`

## 本轮对话上下文

# PBS Pairing ID autocomplete 实施上下文

日期：2026-04-30
范围：pbs-server、pbs-portal、packages/contracts

## 用户诉求
- Search Pairings 中 `Pairing ID(propertyCode=128)` 不能只靠手动输入，需要基于当前 live pairing 数据做可输入模糊搜索的下拉选择。
- 所有可加且有数据的 Pairing ID 都应能搜到，不限制当前 bid month。
- 搜索需要防抖/节流，遵循当前优化后的代码风格并注意性能。
- 仍要保留手动输入能力，避免数据延迟或特殊 ID 阻塞用户。

## 设计文档
- 已产出并确认：`docs/superpowers/specs/2026-04-30-pbs-pairing-id-autocomplete-design.md`
- 状态：已确认，实施中/已实施。

## 实施内容
- 新增后端接口：`GET /api/pairing-search/pairing-ids?query=M49&limit=20`
- 更新 contract：`packages/contracts/pbs-search-pairings.js` 与 `.d.ts`
- 后端 route/service/query：
  - `pbs-server/src/routes/pairing-search.ts`
  - `pbs-server/src/services/pairing-search/pairing-search-service.ts`
  - `pbs-server/src/services/pairing-search/pairing-id-search-query.ts`
- 前端 service：`pbs-portal/src/shared/services/pairing-service.ts` 新增 `searchPairingIds(query, limit)`
- 前端配置：`pbs-portal/src/features/pairing/pairing-id-autocomplete.ts`
- `PairingBidControl` 支持可选 `tagListAutocomplete`，只在 `propertyCode=128` 时启用。
- Search Pairings 页面和 Pairing 右侧属性编辑共用该 autocomplete。

## 性能与行为决策
- 查询所有 live pairing，不限制当前 bid month。
- 空 query 直接返回空 options，避免扫全表。
- 后端默认 limit 20，最大 50。
- 前端 debounce 为 300ms。
- 查询匹配 `pairing_label` 和 `id::text`。
- 选项写入值优先 `pairing_label`，没有 label 时使用 `id::text`。
- option label 使用 ASCII 格式：`M4959 (2026-02-24 - 2026-03-02)`。
- 保留 Enter 手动添加 token；不改变现有 tag-list bid value contract。
- 不新增第三方依赖。

## 验证
- 已运行 `npm run verify:pbs`，结果通过。
- pbs-server：121 tests passed。
- pbs-portal：198 tests passed。
- pbs-portal lint/build 通过。

## 后续提醒
- 如果继续处理 DO/Off/Pairing 日历，注意：`pbs_bid_day_off` 表达的是 Off，不是 DO，不能把 DO 从 Off 派生。
- Pairing ID autocomplete 已接入保存后的 calendar/tier cache 刷新路径；若真实浏览器发现不刷新，优先检查 query invalidation 和保存路径。

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
 M packages/contracts/pbs-search-pairings.js
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
 M pbs-portal/src/features/pairing/components/pairing-bid-control.test.tsx
 M pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
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
 M pbs-server/src/services/pairing-search/pairing-search-service.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.ts
 M pbs-server/src/services/pairing-search/types.ts
 M pbs-server/src/services/pairing/pairing-bid-service.ts
 M pbs-server/src/services/pairing/pairing-rule-validation.test.ts
 M sql/schema/03-pbs_pg.sql
 M sql/seed/01-dictionary.sql
?? docs/dev-context/2026-04-30-pbs-pbs-bidding-calendar-aa-data-sources-implemented.md
?? docs/dev-context/2026-04-30-pbs-pbs-bidding-calendar-off-do-semantics-restored.md
?? docs/dev-context/2026-04-30-pbs-pbs-simplify-refactor-testing-handoff.md
?? docs/dev-context/2026-04-30-pbs-pbs-tier-db-migration-applied.md
?? docs/dev-context/2026-04-30-pbs-pbs-tier-terminology-migration.md
?? docs/superpowers/specs/2026-04-30-pbs-bidding-calendar-aa-data-sources-design.md
?? docs/superpowers/specs/2026-04-30-pbs-pairing-id-autocomplete-design.md
?? docs/superpowers/specs/2026-04-30-pbs-tier-terminology-migration-design.md
?? packages/contracts/pbs-bidding-calendar.d.ts
?? packages/contracts/pbs-bidding-calendar.js
?? pbs-portal/src/features/dashboard/bidding-calendar-mappers.test.ts
?? pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts
?? pbs-portal/src/features/dashboard/hooks/use-bidding-calendar.ts
?? pbs-portal/src/features/pairing/pairing-id-autocomplete.ts
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
?? pbs-server/src/services/pairing-search/pairing-id-search-query.ts
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
packages/contracts/pbs-search-pairings.js
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
pbs-portal/src/features/pairing/components/pairing-bid-control.test.tsx
pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
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
pbs-server/src/services/pairing-search/pairing-search-service.test.ts
pbs-server/src/services/pairing-search/pairing-search-service.ts
pbs-server/src/services/pairing-search/types.ts
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
2. 本文件：`docs/dev-context/2026-04-30-pbs-pbs-pairing-id-autocomplete-implemented.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
