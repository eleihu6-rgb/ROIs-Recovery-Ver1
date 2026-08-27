# 开发上下文（2026-05-06）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-06 10:46:04 CST
- Wing：`pbs`
- Topic：`pairing-calendar-date-award-bid`
- Title：pairing-calendar-date-award-bid
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Pairing 页面左侧 BIDDING CALENDAR 点击日期添加 Award specific pairing bid：
- 已完成 brainstorming 并写入规格文档：docs/superpowers/specs/2026-05-06-pbs-pairing-calendar-date-award-bid-design.md。
- Pairing 页面点击某个日期时，只查询 originDate = 点击日期 的 live pairing occurrence；跨月/跨日 pairing 按 originate date 归属，点结束日期不会重复出现。
- 用户可以在弹窗中多选 Pairing Number、多选 Tx；保存固定为 Award，不展示 Award/Avoid。
- 保存数据仍使用旧库规则 propertyCode=102 Pairing Number，bid.type=tag-list-date，bid.values 保存业务 Pairing Number，不保存/搜索 live 内部 id 作为用户条件。
- 后端新增 GET /api/pairing-search/pairing-occurrences/by-date?originDate=YYYY-MM-DD&periodCode=...，在数据库侧按日期过滤，不在前端扫全量。
- pairing addCurrentDraftProperty 增加服务端合并：同 propertyCode=102、action=award、bid.type=tag-list-date、同 bid.date、同 tiers 集合时，合并 values 去重排序，避免 Existing Pairing Properties 出多条重复 Tx 行。
- Bidding calendar specific-date pairing bid 合并展示：同一 row 内多个 pairing 显示为 M4959 +2，metadata 保留 pairingNumbers、pairingIds、requestedPairingIds、pairingDateRanges、pairingCount，点击蓝色条能看详情。
- 前端新增 PairingCalendarBidPopoverContent，小弹窗沿用 Days Off 的 Tx 选择习惯，支持 Clear / Cancel / ADD BID。
- Pairing 页面启用日期点击入口；Days Off 页面仍保持原 Day Off 编辑语义，Tier 等其他页面不启用日期编辑。
- 已验证：git diff --check 通过；pbs-server npm test -- src/routes/pairing-search.test.ts src/services/calendar/bidding-calendar-service.test.ts 实际 145 tests 全过；pbs-portal 相关 3 个测试文件 23 tests 全过；pbs-portal npm run lint 通过；pbs-server npm run build 通过；pbs-portal npm run build 通过。
- 注意：工作树里仍混有上一轮 business time 相关未提交改动，不属于本功能，不要随意回滚。

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
?? docs/superpowers/specs/2026-05-01-pbs-business-time-cli-design.md
?? docs/superpowers/specs/2026-05-01-pbs-business-time-override-design.md
?? docs/superpowers/specs/2026-05-06-pbs-pairing-calendar-date-award-bid-design.md
?? pbs-portal/src/features/dashboard/components/pairing-calendar-bid-popover-content.tsx
?? pbs-server/src/scripts/pbs-business-time-core.ts
?? pbs-server/src/scripts/pbs-business-time.test.ts
?? pbs-server/src/scripts/pbs-business-time.ts
?? pbs-server/src/services/business-time/
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
2. 本文件：`docs/dev-context/2026-05-06-pbs-pairing-calendar-date-award-bid.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
