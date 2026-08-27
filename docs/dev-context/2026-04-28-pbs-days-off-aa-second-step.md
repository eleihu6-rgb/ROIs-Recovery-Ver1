# 开发上下文（2026-04-28）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-04-28 16:12:03 CST
- Wing：`pbs`
- Topic：`days-off-aa-second-step`
- Title：days-off-aa-second-step
- Git branch：`main`

## 本轮对话上下文

本轮继续 PBS /days-off AA 对齐第二步的一部分，用户明确暂不做 Clear Bids 和 Layer 页面展示。

已完成：
- RuleBid 通用右侧面板支持 Days Off modifier UI：All or Nothing(AON) 与 Minimum N。
- Days Off mapper/contract 已透传 allOrNothing、minimumN；新增/clone/保存都会保留这两个字段。
- pbs-server `PUT /api/days-off-bids/current` schema 接收 allOrNothing/minimumN。
- Days Off 后端读取 `pbs_bid_group.all_or_nothing`、`minimum_n` 并回写保存；保存时 allOrNothing=true 存 1，false 存 0，minimumN 为空存 null。
- Days Off 前后端都补了 `Minimum Days Off Between Work Blocks` 跨 layer restrictive 校验：后续 layer 的值不能大于前面已出现的更宽松值；例如 L1=2、L3=3 会被阻止，L1=3、L3=2 允许。
- Days Off 页面补 `Waive Minimum Days Off` persistent 提示：如果 L1-L6 有 waiver，会提示该 waiver 会影响后续 layer。
- RuleBidRightPanel 的 modifier 列仅在 `showModifiers=true` 时显示，避免影响 Line/Pairing 等复用页面布局。
- 补充前后端测试：route 接受 modifier、server restrictive 校验、portal modifier 保存、waiver 提示、restrictive 阻止保存。

未做：
- Clear Bids。
- Layer 页面展示。
- 最终 award/engine 语义。

验证：
- `cd pbs-server && npm test -- --test-name-pattern="days off"` 通过。
- `cd pbs-portal && npm test -- --run src/features/days-off/pages/days-off-page.test.tsx` 通过。
- `cd pbs-server && npm run build` 通过。
- `cd pbs-portal && npm run lint` 通过。
- `cd pbs-portal && npm run build` 通过。
- 根目录 `npm run verify:pbs` 通过，包含 pbs-server test/build/sync dry-run 与 pbs-portal test/lint/build。

注意：
- 当前工作树仍包含第一阶段大量未提交改动，以及本轮第二步改动。
- `pbs-portal/tsconfig.tsbuildinfo` 是 build 生成痕迹，之前已存在修改状态；本轮未主动清理。

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
 M pbs-portal/tsconfig.tsbuildinfo
 M pbs-server/src/routes/days-off-bids.test.ts
 M pbs-server/src/routes/days-off-bids.ts
 M pbs-server/src/routes/lineholder-route-utils.ts
 M pbs-server/src/services/calendar/calendar-days-off-service.ts
 M pbs-server/src/services/days-off/days-off-bid-service.ts
 M pbs-server/src/services/lineholder/rule-bid-value.test.ts
 M pbs-server/src/services/lineholder/rule-bid-value.ts
?? docs/dev-context/2026-04-28-pbs-days-off-aa-alignment.md
?? docs/superpowers/specs/2026-04-28-pbs-days-off-aa-alignment-design.md
?? pbs-portal/src/features/days-off/days-off-validation.ts
?? pbs-server/src/services/calendar/calendar-days-off-validation.test.ts
?? pbs-server/src/services/calendar/calendar-days-off-validation.ts
?? pbs-server/src/services/days-off/days-off-validation.test.ts
?? pbs-server/src/services/days-off/days-off-validation.ts
?? pbs-server/src/services/lineholder/date-utils.ts
?? sql/migration/2026-04-28-add-aa-days-off-properties.sql
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
pbs-portal/tsconfig.tsbuildinfo
pbs-server/src/routes/days-off-bids.test.ts
pbs-server/src/routes/days-off-bids.ts
pbs-server/src/routes/lineholder-route-utils.ts
pbs-server/src/services/calendar/calendar-days-off-service.ts
pbs-server/src/services/days-off/days-off-bid-service.ts
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
2. 本文件：`docs/dev-context/2026-04-28-pbs-days-off-aa-second-step.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
