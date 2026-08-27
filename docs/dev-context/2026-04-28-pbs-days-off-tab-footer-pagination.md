# 开发上下文（2026-04-28）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-04-28 18:45:47 CST
- Wing：`pbs`
- Topic：`days-off-tab-footer-pagination`
- Title：days-off-tab-footer-pagination
- Git branch：`main`

## 本轮对话上下文

本轮在 Days Off Pairing parity 基础上修复右侧 RuleBid 面板的 tab/search/page 状态保留与 footer 分页体验。

用户反馈：/days-off 点击收藏、添加、删除会回跳到 FAVORITED tab；默认 tab 应该跟 Pairing 一样是 ALL；底部按钮和分页应贴在右侧卡片底部，available 列表内容多时在 footer 上方滚动/分页，不撑高页面。

已实现：
- RuleBidRightPanel 默认 activeTab 改为 all，available properties 增加 10/Page 分页和 Pairing 风格 footer。
- 添加区使用 flex/min-height/overflow 布局，available 列表在 footer 上方滚动，footer 使用 mt-auto 固定在卡片底部。
- add/delete/favorite/unfavorite/cache hydration 后不再重置当前 tab、search keyword、page、编辑展开状态。
- 关键修复：buildViewResetKey 只保留 periodCode/bidContext 和 UI label 上下文，不再把 draftKey/bidId/periodId/draftVersion 这类 mutation 后会变化的身份字段作为视图重置条件。
- Days Off 页面测试补充默认 ALL、add 后保持 ALL/search、favorite/delete 后保持 ALL/search、11 条 available property 分页 footer 的回归。

验证结果：
- cd pbs-portal && npm test -- --run src/features/days-off/pages/days-off-page.test.tsx 通过，8 tests passed。
- cd pbs-portal && npm run lint 通过。
- cd pbs-portal && npm run build 通过，仅有既有 Vite chunk size warning。
- 根目录 npm run verify:pbs 通过，pbs-server 33 tests passed，pbs-portal 136 tests passed，server build、portal lint/build、sync:pbs-users --dry-run 均通过。

仍未做（按前面范围暂缓）：
- Clear Bids。
- Layer 页面展示 Days Off 最终规则。
- Reserve Days Off / Standing Bid Days Off。
- award/engine 语义。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M packages/contracts/pbs-days-off-bids.d.ts
 M packages/contracts/pbs-days-off-bids.js
 M packages/contracts/pbs-line-bids.d.ts
 M packages/contracts/pbs-pairing-bids.d.ts
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.tsx
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
 M pbs-portal/src/features/days-off/days-off-draft-mappers.ts
 M pbs-portal/src/features/days-off/mock.ts
 M pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
 M pbs-portal/src/features/days-off/pages/days-off-page.tsx
 M pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
 M pbs-portal/src/features/pairing/pairing-bid-summary.ts
 M pbs-portal/src/features/pairing/types.ts
 M pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
 M pbs-portal/src/features/rule-bids/rule-bid-draft-mappers.ts
 M pbs-portal/src/features/rule-bids/types.ts
 M pbs-portal/src/features/rule-bids/utils.ts
 M pbs-portal/src/shared/components/schedule/schedule-event-calendar.test.tsx
 M pbs-portal/src/shared/components/schedule/schedule-event-calendar.tsx
 M pbs-portal/src/shared/services/days-off-service.ts
 M pbs-portal/tsconfig.tsbuildinfo
 M pbs-server/src/models/index.ts
 M pbs-server/src/routes/days-off-bids.test.ts
 M pbs-server/src/routes/days-off-bids.ts
 M pbs-server/src/routes/lineholder-route-utils.ts
 M pbs-server/src/services/calendar/calendar-days-off-service.ts
 M pbs-server/src/services/days-off/days-off-bid-service.ts
 M pbs-server/src/services/days-off/types.ts
 M pbs-server/src/services/lineholder/rule-bid-value.test.ts
 M pbs-server/src/services/lineholder/rule-bid-value.ts
?? docs/dev-context/2026-04-28-pbs-days-off-aa-alignment.md
?? docs/dev-context/2026-04-28-pbs-days-off-aa-second-step.md
?? docs/dev-context/2026-04-28-pbs-days-off-pairing-parity.md
?? docs/superpowers/specs/2026-04-28-pbs-days-off-aa-alignment-design.md
?? docs/superpowers/specs/2026-04-28-pbs-days-off-pairing-parity-design.md
?? pbs-portal/src/features/days-off/days-off-validation.ts
?? pbs-server/src/models/pbs/pbs-bid-property-favorite.ts
?? pbs-server/src/services/calendar/calendar-days-off-validation.test.ts
?? pbs-server/src/services/calendar/calendar-days-off-validation.ts
?? pbs-server/src/services/days-off/days-off-validation.test.ts
?? pbs-server/src/services/days-off/days-off-validation.ts
?? pbs-server/src/services/lineholder/date-utils.ts
?? sql/migration/2026-04-28-add-aa-days-off-properties.sql
?? sql/migration/2026-04-28-add-pbs-bid-property-favorite.sql
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
packages/contracts/pbs-days-off-bids.d.ts
packages/contracts/pbs-days-off-bids.js
packages/contracts/pbs-line-bids.d.ts
packages/contracts/pbs-pairing-bids.d.ts
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/app/layout/shared-bidding-workbench-layout.tsx
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
pbs-portal/src/features/days-off/days-off-draft-mappers.ts
pbs-portal/src/features/days-off/mock.ts
pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
pbs-portal/src/features/days-off/pages/days-off-page.tsx
pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
pbs-portal/src/features/pairing/pairing-bid-summary.ts
pbs-portal/src/features/pairing/types.ts
pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
pbs-portal/src/features/rule-bids/rule-bid-draft-mappers.ts
pbs-portal/src/features/rule-bids/types.ts
pbs-portal/src/features/rule-bids/utils.ts
pbs-portal/src/shared/components/schedule/schedule-event-calendar.test.tsx
pbs-portal/src/shared/components/schedule/schedule-event-calendar.tsx
pbs-portal/src/shared/services/days-off-service.ts
pbs-portal/tsconfig.tsbuildinfo
pbs-server/src/models/index.ts
pbs-server/src/routes/days-off-bids.test.ts
pbs-server/src/routes/days-off-bids.ts
pbs-server/src/routes/lineholder-route-utils.ts
pbs-server/src/services/calendar/calendar-days-off-service.ts
pbs-server/src/services/days-off/days-off-bid-service.ts
pbs-server/src/services/days-off/types.ts
pbs-server/src/services/lineholder/rule-bid-value.test.ts
pbs-server/src/services/lineholder/rule-bid-value.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-04-28-pbs-days-off-tab-footer-pagination.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
