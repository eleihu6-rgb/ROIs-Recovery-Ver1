# 开发上下文（2026-05-01）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-01 16:22:09 CST
- Wing：`pbs`
- Topic：`calendar-pairing-event-detail`
- Title：calendar-pairing-event-detail
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS 左侧 BIDDING CALENDAR 蓝色 pairing event readonly 详情弹窗。

前置上下文：
- 上一轮已完成 Pairing Number / Pairing ID occurrence bid 第一阶段：Entire Month 展开全部 occurrence，Specific Date 只展开选中 occurrence。
- 后端 bidding-calendar-service 已在 pairing_bid.metadata 返回 propertyGroupKey/groupSeq/pairingNumber/pairingId/requestedPairingId/originDate/occurrenceMode/actionId。

本轮业务结论：
- 左侧日历蓝色 pairing_bid event 可以点击查看只读详情。
- 弹窗展示 Pairing Bid、Pairing Number、Tier、Pairing ID、Origin Date、Date Range、Mode。
- Mode 根据 metadata.occurrenceMode 显示 Specific Date 或 Entire Month。
- 不新增后端 API，不查 legs，不做删除，不做改 Tier，不改保存语义，不改数据库。
- 绿色 Off event 不新增点击详情，避免和 Days Off 日期/星期头编辑冲突。

实现要点：
- pbs-portal/src/shared/components/schedule/types.ts 扩展 ScheduleCalendarEvent：ariaLabel/selectable/sourceEvent。
- pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts 在可视 segment 中保留 sourceEvent；只有 pairing_bid 标记 selectable；merge adjacent segment 时要求 sourceEvent.id 相同，避免不同 occurrence 被误合并。
- pbs-portal/src/shared/components/schedule/schedule-event-calendar.tsx 增加 onEventSelect；可选 event 渲染为 button；事件层 pointer-events 只放开 selectable event；action popover z-index 提高避免被 event 覆盖。
- pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx 增加 selectedPairingEvent 状态和只读详情弹窗；只响应 sourceEvent.type === pairing_bid。
- 补测试：schedule-event-calendar event select、bidding-calendar-mappers 保留 sourceEvent、shared-bidding-workbench-layout 点击蓝色 M4959 查看详情。
- 设计文档：docs/superpowers/specs/2026-05-01-pbs-calendar-pairing-event-detail-design.md，状态已更新为“已确认，已实施”。

验证：
- npm test -- schedule-event-calendar.test.tsx 通过。
- npm test -- bidding-calendar-mappers.test.ts 通过。
- npm test -- shared-bidding-workbench-layout.test.tsx 通过。
- npm run verify:pbs 通过：pbs-server 129 tests/build/sync dry-run、pbs-portal 205 tests/lint/build 全部成功。

注意：
- npm run verify:pbs 会改 pbs-portal/tsconfig.tsbuildinfo，本轮已恢复该 build 缓存，避免混入无关变更。
- 当前工作树仍包含上一轮 occurrence bid 的未提交改动，本轮没有回滚或覆盖它们。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M packages/contracts/pbs-search-pairings.d.ts
 M packages/contracts/pbs-search-pairings.js
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
 M pbs-portal/src/features/dashboard/bidding-calendar-mappers.test.ts
 M pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
 M pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
 M pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
 M pbs-portal/src/shared/components/schedule/index.ts
 M pbs-portal/src/shared/components/schedule/schedule-event-calendar.test.tsx
 M pbs-portal/src/shared/components/schedule/schedule-event-calendar.tsx
 M pbs-portal/src/shared/components/schedule/types.ts
 M pbs-portal/src/shared/i18n/locales/en.ts
 M pbs-portal/src/shared/services/pairing-service.ts
 M pbs-server/src/app.ts
 M pbs-server/src/routes/pairing-search.test.ts
 M pbs-server/src/routes/pairing-search.ts
 M pbs-server/src/services/calendar/bidding-calendar-service.ts
 M pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.ts
 M pbs-server/src/services/pairing-search/types.ts
 M pbs-server/src/services/pairing/pairing-bid-service.ts
?? docs/dev-context/2026-05-01-pbs-pairing-number-occurrence-bid.md
?? docs/superpowers/specs/2026-05-01-pbs-calendar-pairing-event-detail-design.md
?? docs/superpowers/specs/2026-05-01-pbs-pairing-number-occurrence-bid-design.md
?? pbs-portal/src/features/pairing/components/pairing-occurrence-bid-dialog.tsx
?? pbs-portal/src/features/pairing/pairing-number-occurrences.ts
?? pbs-server/src/services/calendar/bidding-calendar-service.test.ts
?? pbs-server/src/services/pairing-search/pairing-occurrence-query.ts
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
packages/contracts/pbs-search-pairings.d.ts
packages/contracts/pbs-search-pairings.js
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/features/dashboard/bidding-calendar-mappers.test.ts
pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
pbs-portal/src/shared/components/schedule/index.ts
pbs-portal/src/shared/components/schedule/schedule-event-calendar.test.tsx
pbs-portal/src/shared/components/schedule/schedule-event-calendar.tsx
pbs-portal/src/shared/components/schedule/types.ts
pbs-portal/src/shared/i18n/locales/en.ts
pbs-portal/src/shared/services/pairing-service.ts
pbs-server/src/app.ts
pbs-server/src/routes/pairing-search.test.ts
pbs-server/src/routes/pairing-search.ts
pbs-server/src/services/calendar/bidding-calendar-service.ts
pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts
pbs-server/src/services/pairing-search/pairing-search-service.test.ts
pbs-server/src/services/pairing-search/pairing-search-service.ts
pbs-server/src/services/pairing-search/types.ts
pbs-server/src/services/pairing/pairing-bid-service.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-01-pbs-calendar-pairing-event-detail.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
