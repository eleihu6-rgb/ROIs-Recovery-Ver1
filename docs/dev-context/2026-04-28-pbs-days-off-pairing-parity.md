# 开发上下文（2026-04-28）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-04-28 16:53:42 CST
- Wing：`pbs`
- Topic：`days-off-pairing-parity`
- Title：days-off-pairing-parity
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS /days-off 向 Pairing 页面靠齐的质量补强，用户关注的是 /api/days-off-bids/current 请求频繁/慢、Days Off 收藏和 add/delete 不应整份刷新、modifier 应放到 bid 设置展开区，以及右侧样式/按钮状态接近 Pairing。

已确认并实现的范围：
- 新增设计文档 docs/superpowers/specs/2026-04-28-pbs-days-off-pairing-parity-design.md，状态已改为“已确认并实现”。
- contracts 扩展 days-off routes/types：currentProperties、currentPropertyByKey、favoriteByCode、favoriteByKey；draft properties 返回 propertyGroupKey；GET current 返回 favoriteProperties/favoritePropertyCodes；mutation response 改为 saved + draft identity。
- pbs-server DaysOff service 增加 period/catalog TTL cache、stable propertyGroupKey、按 key 合并/删除 property group、add/delete/favorite/unfavorite 细粒度接口；favorite 用新增通用表 pbs_bid_property_favorite。
- 新增 migration sql/migration/2026-04-28-add-pbs-bid-property-favorite.sql 和 Drizzle model pbs-server/src/models/pbs/pbs-bid-property-favorite.ts。
- 已在当前本地 PBS schema 执行该 migration，确认 pbs_bid_property_favorite 表和 uq_pbs_bid_property_favorite_bid_type_property 唯一索引存在。
- pbs-server 已重启，3002 当前是 `npm run dev` / `tsx watch src/index.ts` 新进程。
- pbs-portal DaysOffPage 接入细粒度 add/delete/favorite/unfavorite service，并同步 TanStack Query cache 的 draftMeta/existingProperties/availableProperties，避免成功后被旧缓存 hydrate 回去。
- RuleBidRightPanel 增加 pending 禁用、toast、红色实心收藏心形、收藏失败回滚；add 前做客户端 validation，避免明显冲突还打 add 接口；modifier 从常驻列移动到 pencil 展开 EDIT BID 区域。
- days-off mapper 移除了默认假收藏，改从后端 favoriteProperties/favoritePropertyCodes 建收藏态；available 带 favoriteKey/propertyId。
- 前端 days-off 测试更新为细粒度接口、modifier 先点 pencil 再编辑、冲突 add 不调用 add/save。

验证结果：
- `cd pbs-server && npm run build` 通过。
- `cd pbs-portal && npm run build` 通过。
- `cd pbs-server && npm test -- --test-name-pattern="days off"` 通过。
- `cd pbs-portal && npm test -- --run src/features/days-off/pages/days-off-page.test.tsx` 通过。
- `cd pbs-portal && npm run lint` 通过。
- 根目录 `npm run verify:pbs` 通过，包含 pbs-server 全量 test/build/sync dry-run 与 pbs-portal 全量 test/lint/build。

实际浏览器检查：
- 打开 http://localhost:3030/days-off 时到登录页；没有代填账号密码，所以未做登录后的 Network 计数观察。用户可用已有登录态看：进入 /days-off 应只有一次 GET /api/days-off-bids/current，add/delete/favorite 走细粒度接口，不再整份刷新。

仍未做（按前面约定暂缓）：
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
2. 本文件：`docs/dev-context/2026-04-28-pbs-days-off-pairing-parity.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
