# 开发上下文（2026-04-28）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-04-28 20:20:13 CST
- Wing：`pbs`
- Topic：`days-off-all-apis-under-2s`
- Title：days-off-all-apis-under-2s
- Git branch：`main`

## 本轮对话上下文

本轮继续 Days Off 全接口性能优化，目标是用户在 /days-off 页面正常热连接操作下所有 Days Off 相关接口低于 2 秒，并把添加冲突条件的提示改为全局 message。

已确认并实现的 spec：docs/superpowers/specs/2026-04-28-pbs-days-off-all-apis-under-2s-design.md，状态已更新为“已确认并实现”。

关键实现：
- pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx：add 前 Days Off validation 失败时改用 message.error，不再占用页面顶部 alert。对应测试在 pbs-portal/src/features/days-off/pages/days-off-page.test.tsx 覆盖。
- pbs-server/src/services/days-off/days-off-bid-service.ts：
  - POST /api/days-off-bids/current/properties 在有稳定 draftKey/bidId 时不再解析 current period、不再完整 loadDraftProperties；改为轻量读取校验快照，再用单条 CTE 锁 bid、重算 rowSeq、插入 group、同步 layer、递增 draftVersion。
  - PUT /api/days-off-bids/current 在有稳定 draftKey/bidId 时新增完整保存快路径：单条 CTE 删除旧 DaysOff groups/conditions、按当前 draft 重建 groups、同步 layers、递增 draftVersion，并保留 draftVersion 409 语义。
  - Calendar days off service 已有 current period TTL cache，calendar PUT 实测仍在 2 秒内。

真实接口热连接探测（localhost:3002，3002 测试 JWT，服务已启动、连接池已热）：
- days GET current：0.358s
- days PUT current：0.183s
- days POST property：0.420s
- days DELETE property：0.247s
- days PUT favorite：0.200s
- days DELETE favorite：0.173s
- calendar GET current：0.356s
- calendar PUT current：1.662s

验证：
- cd pbs-server && npm run build 通过。
- cd pbs-server && npm test -- src/routes/days-off-bids.test.ts src/routes/calendar-days-off.test.ts 通过（实际 33 tests）。
- cd pbs-portal && npm test -- --run src/features/days-off/pages/days-off-page.test.tsx 通过。
- 根目录 npm run verify:pbs 通过：pbs-server tests/build/sync dry-run，pbs-portal 全量 tests/lint/build 均通过。

注意：真实探测过程中为了验证 add/delete、favorite/unfavorite、PUT current、calendar PUT，临时新增的 217 property 与 217 favorite 都已删除；PUT current/calendar PUT 保存的是同一份数据，会递增 dev draftVersion，但不改变业务内容。

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
?? docs/dev-context/2026-04-28-pbs-days-off-api-performance.md
?? docs/dev-context/2026-04-28-pbs-days-off-pairing-parity.md
?? docs/dev-context/2026-04-28-pbs-days-off-tab-footer-pagination.md
?? docs/superpowers/specs/2026-04-28-pbs-days-off-aa-alignment-design.md
?? docs/superpowers/specs/2026-04-28-pbs-days-off-all-apis-under-2s-design.md
?? docs/superpowers/specs/2026-04-28-pbs-days-off-api-performance-design.md
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
2. 本文件：`docs/dev-context/2026-04-28-pbs-days-off-all-apis-under-2s.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
