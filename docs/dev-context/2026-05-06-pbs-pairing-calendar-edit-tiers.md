# 开发上下文（2026-05-06）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-06 11:19:27 CST
- Wing：`pbs`
- Topic：`pairing-calendar-edit-tiers`
- Title：pairing-calendar-edit-tiers
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Pairing 页面左侧日历蓝色 pairing bid 详情编辑 Tx：
- 规格文档：docs/superpowers/specs/2026-05-06-pbs-pairing-calendar-edit-tiers-design.md，状态已确认、已实施。
- 用户决定：不要在日历详情里加单独 Delete，而是像 Days Off 一样用 Tx checkbox 编辑覆盖范围；全部取消后 SAVE BID 等价于删除整条 pairing bid。
- 前端修改 pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx：点击 pairing_bid 详情后，通过 metadata.propertyGroupKey 查 pairing page data 的 existingProperties；弹窗新增 Apply to Tiers、Clear、SAVE BID；保存复用 pairingService.saveCurrentDraft，不新增后端 API。
- 保存语义：有选中 Tx 则更新该 Existing row 的 tiers；Tx 全空则从 existingProperties 里移除该 row；成功后 invalidate pairingPageDataQueryKey、biddingCalendarQueryKey、tierPageDataQueryKey 并关闭弹窗。
- 失败时保留弹窗并显示错误；找不到 propertyGroupKey/Existing row 时禁止保存并提示。
- 测试更新 pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx：覆盖从日历详情取消 T2 保存、Clear 后保存删除整条 bid。
- 验证：pbs-portal targeted test/build 通过；npm run verify:pbs 通过；git diff --check 通过。
- 注意：工作树仍混有 business time、pairing calendar date award bid、merge tiers 等上一轮未提交改动，不要随意回滚。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M packages/contracts/pbs-search-pairings.d.ts
 M packages/contracts/pbs-search-pairings.js
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.tsx
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
 M pbs-portal/src/features/pairing/hooks/use-pairing-page-data.ts
 M pbs-portal/src/shared/components/schedule/schedule-event-calendar.tsx
 M pbs-portal/src/shared/services/pairing-service.ts
 M pbs-portal/tsconfig.tsbuildinfo
 M pbs-server/package.json
 M pbs-server/src/app.ts
 M pbs-server/src/routes/pairing-search.test.ts
 M pbs-server/src/routes/pairing-search.ts
 M pbs-server/src/services/calendar/bidding-calendar-service.test.ts
 M pbs-server/src/services/calendar/bidding-calendar-service.ts
 M pbs-server/src/services/calendar/calendar-days-off-service.ts
 M pbs-server/src/services/days-off/days-off-bid-service.ts
 M pbs-server/src/services/line/line-bid-service.ts
 M pbs-server/src/services/lineholder/current-period-bid.test.ts
 M pbs-server/src/services/lineholder/lineholder-summary-service.ts
 M pbs-server/src/services/lineholder/shared.ts
 M pbs-server/src/services/pairing-search/pairing-occurrence-query.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.ts
 M pbs-server/src/services/pairing-search/types.ts
 M pbs-server/src/services/pairing/pairing-bid-service.ts
 M sql/migration/README.md
?? docs/dev-context/2026-05-01-pbs-business-time-cli.md
?? docs/dev-context/2026-05-01-pbs-business-time-override.md
?? docs/dev-context/2026-05-06-pbs-pairing-calendar-date-award-bid.md
?? docs/dev-context/2026-05-06-pbs-pairing-calendar-merge-tiers.md
?? docs/superpowers/specs/2026-05-01-pbs-business-time-cli-design.md
?? docs/superpowers/specs/2026-05-01-pbs-business-time-override-design.md
?? docs/superpowers/specs/2026-05-06-pbs-pairing-calendar-date-award-bid-design.md
?? docs/superpowers/specs/2026-05-06-pbs-pairing-calendar-edit-tiers-design.md
?? docs/superpowers/specs/2026-05-06-pbs-pairing-calendar-merge-tiers-design.md
?? pbs-portal/src/features/dashboard/components/pairing-calendar-bid-popover-content.tsx
?? pbs-server/src/scripts/pbs-business-time-core.ts
?? pbs-server/src/scripts/pbs-business-time.test.ts
?? pbs-server/src/scripts/pbs-business-time.ts
?? pbs-server/src/services/business-time/
?? pbs-server/src/services/pairing/pairing-bid-service.test.ts
?? sql/migration/2026-05-01-add-pbs-business-time-override-config.sql
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
packages/contracts/pbs-search-pairings.d.ts
packages/contracts/pbs-search-pairings.js
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/app/layout/shared-bidding-workbench-layout.tsx
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
pbs-portal/src/features/pairing/hooks/use-pairing-page-data.ts
pbs-portal/src/shared/components/schedule/schedule-event-calendar.tsx
pbs-portal/src/shared/services/pairing-service.ts
pbs-portal/tsconfig.tsbuildinfo
pbs-server/package.json
pbs-server/src/app.ts
pbs-server/src/routes/pairing-search.test.ts
pbs-server/src/routes/pairing-search.ts
pbs-server/src/services/calendar/bidding-calendar-service.test.ts
pbs-server/src/services/calendar/bidding-calendar-service.ts
pbs-server/src/services/calendar/calendar-days-off-service.ts
pbs-server/src/services/days-off/days-off-bid-service.ts
pbs-server/src/services/line/line-bid-service.ts
pbs-server/src/services/lineholder/current-period-bid.test.ts
pbs-server/src/services/lineholder/lineholder-summary-service.ts
pbs-server/src/services/lineholder/shared.ts
pbs-server/src/services/pairing-search/pairing-occurrence-query.ts
pbs-server/src/services/pairing-search/pairing-search-service.ts
pbs-server/src/services/pairing-search/types.ts
pbs-server/src/services/pairing/pairing-bid-service.ts
sql/migration/README.md
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-06-pbs-pairing-calendar-edit-tiers.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
