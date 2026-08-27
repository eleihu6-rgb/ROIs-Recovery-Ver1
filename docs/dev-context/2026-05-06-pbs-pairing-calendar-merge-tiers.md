# 开发上下文（2026-05-06）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-06 11:06:22 CST
- Wing：`pbs`
- Topic：`pairing-calendar-merge-tiers`
- Title：pairing-calendar-merge-tiers
- Git branch：`main`

## 本轮对话上下文

本轮修复 Pairing 页面左侧日历重复添加同一 specific-date Pairing Number 到不同 Tx 时出现重复 row 的问题。
- 规格文档：docs/superpowers/specs/2026-05-06-pbs-pairing-calendar-merge-tiers-design.md，状态已确认。
- 后端修改 pbs-server/src/services/pairing/pairing-bid-service.ts 的 buildMergedPairingNumberSpecificDateProperty：同 propertyCode=102、action=award、bid.type=tag-list-date、bid.date 相同，并且 bid.values 完全相同时，合并 tiers 并集。
- 保留原有同 Tx 同日期添加多个 Pairing Number 时合并 values 的能力。
- 保守边界：如果 values 和 tiers 都不相同，例如已有 C4103 T1，新加 C4103+M4959 T2，不自动合并，避免把 M4959 误扩散到 T1。
- 新增 pbs-server/src/services/pairing/pairing-bid-service.test.ts 覆盖：同 pairing/date 合并 Tx、同 tier/date 合并 values、mixed values+mixed tiers 不合并。
- 验证：targeted pbs-server tests/build 通过；npm run verify:pbs 通过；git diff --check 通过。
- 工作树仍混有上一轮 business time 和 pairing calendar date award bid 的未提交改动，不要随意回滚。

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
?? docs/superpowers/specs/2026-05-01-pbs-business-time-cli-design.md
?? docs/superpowers/specs/2026-05-01-pbs-business-time-override-design.md
?? docs/superpowers/specs/2026-05-06-pbs-pairing-calendar-date-award-bid-design.md
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
2. 本文件：`docs/dev-context/2026-05-06-pbs-pairing-calendar-merge-tiers.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
