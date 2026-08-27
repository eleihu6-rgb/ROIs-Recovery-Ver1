# 开发上下文（2026-05-06）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-06 16:02:40 CST
- Wing：`pbs`
- Topic：`specific-date-pairing-off-conflict`
- Title：specific-date-pairing-off-conflict
- Git branch：`main`

## 本轮对话上下文

本轮在上一轮 Pairing Entire Month / Days Off 冲突基础上补齐双向冲突闭环，并更新 spec：docs/superpowers/specs/2026-05-06-pbs-specific-date-pairing-off-conflict-design.md。

用户发现的问题：
- Days Off 添加 Off 已经能被 pairing 拦住，但 Pairing 页面添加 Specific Date pairing 仍能覆盖已有 Off。
- Days Off 页面点击星期表头批量添加 Off 时，pairing 覆盖的 date + Tx 没有被正确排除。
- 左侧 BIDDING CALENDAR 标题下方红色 inline error 影响视觉，项目已有全局 message，要求移除。

实现语义：
- Specific Date Pairing 添加时，按 selected occurrence 的 startDate-endDate 完整范围检查 existing Off；只要 touch same-Tx Off，则该 Tx 禁用，后端保存也返回 409。
- 多选 pairing 时，任一 selected occurrence touch 某 Tx Off，该 Tx 即 blocked。
- Entire Month 不整条禁止，继续沿用“展开时排除 touch Off occurrence”。
- Days Off 星期表头批量添加时，applyDatesToSelectedTiers 会跳过 pairing 覆盖的 date + Tx，无冲突项继续保存，并 message.warning 提示 skipped 数量。
- Days Off 保存失败不再在左侧日历标题下方渲染红色 inline error，只保留 message.error。

后端改动：
- pbs-server/src/services/pairing/pairing-bid-service.ts：createPbsPairingBidService 增加 pgPool/liveSchema；新增 findSpecificDatePairingDayOffConflicts 与保存前校验；saveCurrentDraft 和 addCurrentDraftProperty 均覆盖。
- pbs-server/src/app.ts：给 pairingBidService 注入 pgPool/liveSchema。
- pbs-server/src/services/pairing/pairing-bid-service.test.ts：新增 same-Tx Off conflict、other-Tx/Entire Month ignore 测试。

前端改动：
- pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx：新增 dayOffTiersByDate、selected occurrence blocked tiers；Pairing calendar popover 自动移除/禁用 blocked Tx；保存时过滤 blocked tiers；移除 calendarSaveError inline 渲染。
- pbs-portal/src/features/dashboard/components/pairing-calendar-bid-popover-content.tsx：支持 blockedTiers/blockedMessage，禁用对应 Tx checkbox。
- pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx：更新 Pairing calendar 添加测试为 T1 blocked、T2 可保存；新增 weekday header 跳过 pairing-covered tier/date；新增 no inline alert 断言。

验证：
- pbs-server: DATABASE_URL=postgresql://test:test@localhost:5432/rois PBS_SCHEMA=f8_pbs JWT_SECRET=test-secret CORS_ORIGIN=http://localhost:3030 node --import tsx --test src/services/pairing/pairing-bid-service.test.ts src/services/calendar/bidding-calendar-service.test.ts 通过，13 tests passed。
- pbs-server targeted type-check: npx tsc --noEmit --target ES2022 --module Node16 --moduleResolution Node16 --strict --esModuleInterop --skipLibCheck src/services/calendar/bidding-calendar-service.ts src/services/calendar/calendar-days-off-service.ts src/services/pairing/pairing-bid-service.ts src/app.ts 通过。
- pbs-portal: npm test -- --run src/app/layout/shared-bidding-workbench-layout.test.tsx 通过，22 tests passed。
- pbs-portal: npm run lint 通过。
- pbs-portal: npm run build 通过；tsconfig.tsbuildinfo 已恢复。
- git diff --check 通过。

已知限制：
- pbs-server npm run build 仍会因既有 src/__tests__/plugins/metrics.test.ts 引用 vitest 但 pbs-server package.json 未声明 vitest 而失败；这不是本轮新增问题。本轮继续用 targeted node tests 和 targeted tsc 验证新增后端改动。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
 M pbs-portal/src/features/dashboard/components/pairing-calendar-bid-popover-content.tsx
 M pbs-server/src/app.ts
 M pbs-server/src/services/calendar/bidding-calendar-service.test.ts
 M pbs-server/src/services/calendar/bidding-calendar-service.ts
 M pbs-server/src/services/calendar/calendar-days-off-service.ts
 M pbs-server/src/services/pairing/pairing-bid-service.test.ts
 M pbs-server/src/services/pairing/pairing-bid-service.ts
?? docs/dev-context/2026-05-06-pbs-pairing-entire-month-day-off-conflict.md
?? docs/superpowers/specs/2026-05-06-pbs-pairing-calendar-popover-search-design.md
?? docs/superpowers/specs/2026-05-06-pbs-pairing-entire-month-day-off-conflict-design.md
?? docs/superpowers/specs/2026-05-06-pbs-specific-date-pairing-off-conflict-design.md
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
pbs-portal/src/features/dashboard/components/pairing-calendar-bid-popover-content.tsx
pbs-server/src/app.ts
pbs-server/src/services/calendar/bidding-calendar-service.test.ts
pbs-server/src/services/calendar/bidding-calendar-service.ts
pbs-server/src/services/calendar/calendar-days-off-service.ts
pbs-server/src/services/pairing/pairing-bid-service.test.ts
pbs-server/src/services/pairing/pairing-bid-service.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-06-pbs-specific-date-pairing-off-conflict.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
