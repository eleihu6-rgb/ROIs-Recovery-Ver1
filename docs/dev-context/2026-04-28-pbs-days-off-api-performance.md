# 开发上下文（2026-04-28）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-04-28 19:16:52 CST
- Wing：`pbs`
- Topic：`days-off-api-performance`
- Title：days-off-api-performance
- Git branch：`main`

## 本轮对话上下文

本轮完成 Days Off 接口性能优化，目标是把用户在 Network 看到的 /api/days-off-bids/current、favorite、delete 等接口从 2-8 秒降到常用路径 2 秒以内。

排查结论：稳定 id/key 解决的是“定位哪条记录”，但慢主要来自远程 PostgreSQL 多次 round trip。实测单次 DB 往返常见 300-800ms，冷连接可超过 2 秒；一个接口串行 5-8 次 DB 操作就会变成 2-8 秒。

已写 spec：docs/superpowers/specs/2026-04-28-pbs-days-off-api-performance-design.md，状态已确认并实现。

代码改动：
- pbs-server/src/services/days-off/days-off-bid-service.ts
  - GET current 在 existing bid 存在时并行读取 draft properties 和 favoriteProperties。
  - removeCurrentDraftProperty 改为单条 CTE SQL：一次 DB round trip 完成 target groups 查找、conditions/groups 删除、groupSeq 前移、空 layer 清理、layer totals、bid totalLayers/draftVersion 更新。
  - saveFavoriteProperty 在 request 带 draftKey/bidId 时走稳定 bid id 快路径，用单条 CTE update bid + upsert favorite；无 draftKey 时保留原有 ensure/create draft 路径。
  - removeFavoritePropertyByKey 在 request 带 draftKey/bidId 时直接按 favoriteKey + bidId + bidType 删除，避免先查 current bid；无 draftKey 时保留 fallback。
  - 新增本地 parseStableCurrentDraftBidId helper，并引入 pbsBidDayOff 供 CTE 清理空 layer 时保持 calendar day off 安全判断。

真实接口探测（localhost:3002，3002 测试 JWT）：
- GET /api/days-off-bids/current：2.106s / 0.353s / 0.811s，冷/抖动仍可能超过 2 秒，暖连接显著低于 2 秒。
- PUT favorite 212 with draftKey=2：0.517s。
- DELETE favorite by key with draftKey=2：0.463s。
- DELETE nonexistent property key with draftKey=2：0.234s，用于验证 CTE SQL 语法和非破坏性路径。
- 为测试 favorite 快路径曾临时取消 212 收藏，随后已重新收藏 212；favoriteKey 因重新插入从旧值变成新值，这是 dev 数据身份变化，但业务状态已恢复为 favorited。

验证：
- cd pbs-server && npm test -- src/routes/days-off-bids.test.ts 通过（脚本实际跑 pbs-server 33 tests）。
- cd pbs-server && npm run build 通过。
- 根目录 npm run verify:pbs 通过：pbs-server 33 tests passed，pbs-portal 136 tests passed，server build、portal lint/build、sync:pbs-users --dry-run 均通过。

仍需注意：
- 远程 DB 冷连接/网络抖动无法由本轮代码完全消除；若用户仍看到偶发 2s+，下一步要看本地 dev proxy、连接池预热、DB 部署位置或把 current period 空表查询继续做成更强缓存/配置。
- 本轮没有优化 add property 的多 round trip，因为 add 仍需要读取 existingProperties 做 AA validation；后续若 add 仍慢，可以单独把 add 的 validation 和 rowSeq 聚合改成更少 SQL。

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
?? docs/dev-context/2026-04-28-pbs-days-off-tab-footer-pagination.md
?? docs/superpowers/specs/2026-04-28-pbs-days-off-aa-alignment-design.md
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
2. 本文件：`docs/dev-context/2026-04-28-pbs-days-off-api-performance.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
