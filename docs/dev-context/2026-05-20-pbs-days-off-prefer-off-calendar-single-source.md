# 开发上下文（2026-05-20）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-20 16:35:55 CST
- Wing：`pbs`
- Topic：`days-off-prefer-off-calendar-single-source`
- Title：days-off-prefer-off-calendar-single-source
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS 左侧共享小日历 Days Off 单一数据源清理与连续 Prefer Off 连线修复。

用户确认的产品/技术结论：
- 左侧 BIDDING CALENDAR 是共享组件，Dashboard、Days Off 等页面都要遵守同一条数据路径。
- Days Off 的 Off 日期不再保留旧的独立 calendar-days-off 存储/API/前端 service；以 Days Off `Prefer Off` bid 作为唯一业务来源。
- 未上线旧链路不需要保守兼容；该清理的前后端代码、contract、测试和旧 QA 文档都清理。
- 连续 Prefer Off 日期在小日历中应连成横向绿色条，跨周自然拆成多条。

主要实现：
- 删除旧 `packages/contracts/pbs-calendar-days-off.*`。
- 删除前端旧 `calendar-days-off-service`、`use-calendar-days-off-draft`、`calendar-days-off-mappers`，Dashboard 不再 fallback 到旧 calendar draft。
- `CalendarDraftResponse` 改为 dashboard 本地类型，Days Off 页面继续从现有 page data 派生左侧日历 draft。
- `bidding-calendar-mappers.ts` 对 `day_off_bid` 且 label 为 `Off` 的同 row、同 tier、同 tone、相邻日期段进行合并；其他 event 仍要求同 source id，避免 Pairing/Leave 误合并。
- 后端删除 `/api/calendar-days-off/*` route/service/validation/patch query/app 注册；`bidding-calendar` 继续从 Prefer Off 构造 `day_off_bid` events。
- `prefer-off-calendar-events.ts` 提供 `loadPreferOffDayOffDatesByTier`，Pairing 特定日期冲突读取 Prefer Off，不再依赖旧 calendar helper。
- Tier summary / editing 删除 `Calendar` bid type 和 editable source；Prefer Off 通过 `DaysOff` property group 编辑 tiers。
- 删除旧 Tier Calendar Day Off QA 文档，新增 `docs/test-cases/pbs/days-off/2026-05-20-prefer-off-calendar-single-source.md`。

验证：
- `pnpm --dir pbs-portal test`：47 files / 305 tests passed。
- `pnpm --dir pbs-portal lint`：通过。
- `pnpm --dir pbs-portal build`：通过；Vite 仍提示既有大 chunk warning。
- `pnpm --dir pbs-server test`：185 tests passed。
- `pnpm --dir pbs-server build`：通过。
- `git diff --check`：通过。
- `npm run verify:pbs`：pbs-server test/build 通过，随后停在 `pbs-server: npm run sync:pbs-users -- --dry-run`，本地数据库账号 `f8_pbs` password authentication failed；因此脚本没有继续执行 portal 部分，portal test/lint/build 已单独通过。
- 浏览器检查：使用本地开发 JWT 只读进入 `http://localhost:3030/fpqe/pbs/dashboard` 和 `/days-off`，选取已有 Prefer Off 样本；Dashboard 与 Days Off 左侧小日历均显示连续 Off 横条；Network 过滤 `calendar-days-off` 无请求；console 无 error。

注意事项：
- 本轮没有改数据库 schema，也没有删除后端数据库表，只移除旧 runtime API/contract/code path。
- 工作树中还包含前一轮 Days Off Add Properties layout 的改动和文档，它们不是本任务新引入，但一起存在于当前未提交工作树。
- `pbs-portal/tsconfig.tsbuildinfo` 是 tracked build cache，当前因源码/构建变化仍为 modified；提交前应决定是否纳入或按项目习惯清理。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 D docs/test-cases/pbs/tier/2026-05-13-tier-calendar-day-off-editing.md
 D packages/contracts/pbs-calendar-days-off.d.ts
 D packages/contracts/pbs-calendar-days-off.js
 M packages/contracts/pbs-lineholder-summary.d.ts
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test-utils.tsx
 M pbs-portal/src/app/router/app-routes.test.tsx
 M pbs-portal/src/features/dashboard/bidding-calendar-mappers.test.ts
 M pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts
 D pbs-portal/src/features/dashboard/calendar-days-off-mappers.test.ts
 D pbs-portal/src/features/dashboard/calendar-days-off-mappers.ts
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
 M pbs-portal/src/features/dashboard/dashboard-calendar-state.test.ts
 M pbs-portal/src/features/dashboard/dashboard-calendar-state.ts
 D pbs-portal/src/features/dashboard/hooks/use-calendar-days-off-draft.ts
 M pbs-portal/src/features/days-off/days-off-calendar-prefer-off.ts
 M pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
 M pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
 M pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx
 M pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
 M pbs-portal/src/features/rule-bids/rule-bid-right-panel-layout.test.ts
 M pbs-portal/src/features/rule-bids/rule-bid-right-panel-layout.ts
 M pbs-portal/src/features/tier/components/tier-bid-type-badge.tsx
 M pbs-portal/src/features/tier/components/tier-detail-actions.tsx
 M pbs-portal/src/features/tier/components/tier-detail-dialog.tsx
 M pbs-portal/src/features/tier/components/tier-right-panel.test.tsx
 M pbs-portal/src/features/tier/components/tier-right-panel.tsx
 M pbs-portal/src/features/tier/components/tier-summary-sections.tsx
 M pbs-portal/src/features/tier/mock.ts
 M pbs-portal/src/features/tier/tier-draft-mappers.test.ts
 M pbs-portal/src/features/tier/tier-draft-mappers.ts
 M pbs-portal/src/features/tier/tier-editing-actions.ts
 M pbs-portal/src/features/tier/types.ts
 D pbs-portal/src/shared/services/calendar-days-off-service.ts
 M pbs-portal/tsconfig.tsbuildinfo
 M pbs-server/src/app.ts
 M pbs-server/src/routes/bidding-calendar.test.ts
 D pbs-server/src/routes/calendar-days-off.test.ts
 D pbs-server/src/routes/calendar-days-off.ts
 M pbs-server/src/routes/lineholder-summary.test.ts
 M pbs-server/src/scripts/pbs-performance-baseline-core.ts
 M pbs-server/src/services/calendar/bidding-calendar-service.ts
 D pbs-server/src/services/calendar/calendar-days-off-draft-state.ts
 D pbs-server/src/services/calendar/calendar-days-off-patch-queries.ts
 D pbs-server/src/services/calendar/calendar-days-off-service.ts
 D pbs-server/src/services/calendar/calendar-days-off-validation.test.ts
 D pbs-server/src/services/calendar/calendar-days-off-validation.ts
 D pbs-server/src/services/calendar/calendar-prefer-off-draft.test.ts
 D pbs-server/src/services/calendar/calendar-prefer-off-draft.ts
 M pbs-server/src/services/calendar/prefer-off-calendar-events.ts
 M pbs-server/src/services/calendar/types.ts
 M pbs-server/src/services/lineholder/lineholder-summary-service.test.ts
 M pbs-server/src/services/lineholder/lineholder-summary-service.ts
 M pbs-server/src/services/pairing/pairing-specific-date.ts
?? docs/dev-context/2026-05-20-pbs-days-off-add-properties-layout.md
?? docs/superpowers/specs/2026-05-20-pbs-days-off-add-properties-layout-design.md
?? docs/superpowers/specs/2026-05-20-pbs-days-off-calendar-new-path-continuous-off-design.md
?? docs/test-cases/pbs/days-off/
?? pbs-portal/src/features/dashboard/dashboard-calendar-grid.ts
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
docs/test-cases/pbs/tier/2026-05-13-tier-calendar-day-off-editing.md
packages/contracts/pbs-calendar-days-off.d.ts
packages/contracts/pbs-calendar-days-off.js
packages/contracts/pbs-lineholder-summary.d.ts
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test-utils.tsx
pbs-portal/src/app/router/app-routes.test.tsx
pbs-portal/src/features/dashboard/bidding-calendar-mappers.test.ts
pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts
pbs-portal/src/features/dashboard/calendar-days-off-mappers.test.ts
pbs-portal/src/features/dashboard/calendar-days-off-mappers.ts
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
pbs-portal/src/features/dashboard/dashboard-calendar-state.test.ts
pbs-portal/src/features/dashboard/dashboard-calendar-state.ts
pbs-portal/src/features/dashboard/hooks/use-calendar-days-off-draft.ts
pbs-portal/src/features/days-off/days-off-calendar-prefer-off.ts
pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx
pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
pbs-portal/src/features/rule-bids/rule-bid-right-panel-layout.test.ts
pbs-portal/src/features/rule-bids/rule-bid-right-panel-layout.ts
pbs-portal/src/features/tier/components/tier-bid-type-badge.tsx
pbs-portal/src/features/tier/components/tier-detail-actions.tsx
pbs-portal/src/features/tier/components/tier-detail-dialog.tsx
pbs-portal/src/features/tier/components/tier-right-panel.test.tsx
pbs-portal/src/features/tier/components/tier-right-panel.tsx
pbs-portal/src/features/tier/components/tier-summary-sections.tsx
pbs-portal/src/features/tier/mock.ts
pbs-portal/src/features/tier/tier-draft-mappers.test.ts
pbs-portal/src/features/tier/tier-draft-mappers.ts
pbs-portal/src/features/tier/tier-editing-actions.ts
pbs-portal/src/features/tier/types.ts
pbs-portal/src/shared/services/calendar-days-off-service.ts
pbs-portal/tsconfig.tsbuildinfo
pbs-server/src/app.ts
pbs-server/src/routes/bidding-calendar.test.ts
pbs-server/src/routes/calendar-days-off.test.ts
pbs-server/src/routes/calendar-days-off.ts
pbs-server/src/routes/lineholder-summary.test.ts
pbs-server/src/scripts/pbs-performance-baseline-core.ts
pbs-server/src/services/calendar/bidding-calendar-service.ts
pbs-server/src/services/calendar/calendar-days-off-draft-state.ts
pbs-server/src/services/calendar/calendar-days-off-patch-queries.ts
pbs-server/src/services/calendar/calendar-days-off-service.ts
pbs-server/src/services/calendar/calendar-days-off-validation.test.ts
pbs-server/src/services/calendar/calendar-days-off-validation.ts
pbs-server/src/services/calendar/calendar-prefer-off-draft.test.ts
pbs-server/src/services/calendar/calendar-prefer-off-draft.ts
pbs-server/src/services/calendar/prefer-off-calendar-events.ts
pbs-server/src/services/calendar/types.ts
pbs-server/src/services/lineholder/lineholder-summary-service.test.ts
pbs-server/src/services/lineholder/lineholder-summary-service.ts
pbs-server/src/services/pairing/pairing-specific-date.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-20-pbs-days-off-prefer-off-calendar-single-source.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
