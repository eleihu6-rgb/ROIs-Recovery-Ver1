# 开发上下文（2026-05-22）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-22 15:48:50 CST
- Wing：`pbs`
- Topic：`pairing-occurrence-list`
- Title：pairing-occurrence-list
- Git branch：`main`

## 本轮对话上下文

# PBS Pairing Number occurrence-list 开发上下文

## 用户确认
- Pairing Number 需要支持一个 bid 内保存多个 pairing number 与多个 run date 的对应关系。
- 不把结构硬塞进旧 `tag-list-date` / `param_a,param_b,param_c`，采用新 bid 类型和明细表。
- 右侧 `ADD PAIRING PROPERTIES -> Pairing Number` 与左侧 `BIDDING CALENDAR` 快速添加必须写同一套结构。
- 所有相关接口目标 < 2s。
- 代码必须模块化清晰，单元测试、回归测试、QA 测试案例都要补齐，不能破坏既有 Days Off / Pairing / Dashboard / Favorite 功能。

## 已形成文档
- Spec: `docs/superpowers/specs/2026-05-22-pbs-pairing-occurrence-list-bid-design.md`
- QA: `docs/test-cases/pbs/pairing/2026-05-22-pairing-occurrence-list-regression.md`

## 关键实现
- 新增 bid 类型：`pairing-occurrence-list`。
- 新增表：`pbs_bid_pairing_occurrence`，用于保存 `(bid_id, property_group_key, tier, pairing_number, origin_date)` 明细。
- 新增 migration: `sql/migration/2026-05-22-pbs-pairing-occurrence-list.sql`。
- 后端新增模块：`pbs-server/src/services/pairing/pairing-occurrence-list.ts`。
- 后端 Pairing route 专用 schema 支持 occurrence list；Days Off / Line 不允许该 Pairing 专用 bid 类型。
- 当前 draft 读取批量加载 occurrence rows，避免按 propertyGroupKey N+1。
- 保存 / 编辑 / full save 在同事务写入父 `pbs_bid_group` 与 occurrence 明细。
- 左侧日历快速添加 pairing 改为构造 `pairing-occurrence-list`。
- Dashboard / 左侧日历读取新结构展开 pairing calendar event。
- configured favorite 保存完整 occurrence list 快照。

## 验证结果
- `npm --prefix pbs-server test`：194 tests passed。
- `npm --prefix pbs-server run build`：passed。
- `npm --prefix pbs-portal test`：334 tests passed。
- `npm --prefix pbs-portal run lint`：passed。
- `npm --prefix pbs-portal run build`：passed。
- `git diff --check`：passed。
- Browser smoke：`http://localhost:5174/fpqe/pbs/pairing` 能打开并按未登录状态重定向到 login。

## 注意事项
- 开发库需要执行 migration 后，真实数据库才有 `pbs_bid_pairing_occurrence` 表和索引。
- Vite base path 是 `/fpqe/pbs/`，直接访问 `/pairing` 会提示应访问 `/fpqe/pbs/pairing`。

## 当前工作树快照

### git status --short

```text
 M packages/contracts/pbs-pairing-bids.d.ts
 M packages/contracts/pbs-pairing-bids.js
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
 M pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
 M pbs-portal/src/features/line/line-draft-mappers.ts
 M pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
 M pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx
 M pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
 M pbs-portal/src/features/pairing/pairing-bid-control-logic.ts
 M pbs-portal/src/features/pairing/pairing-bid-summary.ts
 M pbs-portal/src/features/pairing/pairing-number-occurrences.ts
 M pbs-portal/src/features/pairing/pairing-property-catalog.ts
 M pbs-portal/src/features/pairing/types.ts
 M pbs-portal/src/features/rule-bids/utils.ts
 M pbs-portal/src/shared/i18n/locales/en.ts
 M pbs-portal/src/shared/services/days-off-service.ts
 M pbs-portal/src/shared/services/line-service.ts
 M pbs-server/src/models/index.ts
 M pbs-server/src/routes/pairing-bids.ts
 M pbs-server/src/services/calendar/bidding-calendar-service.test.ts
 M pbs-server/src/services/calendar/bidding-calendar-service.ts
 M pbs-server/src/services/lineholder/rule-bid-value.ts
 M pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts
 M pbs-server/src/services/pairing/pairing-bid-normalization.ts
 M pbs-server/src/services/pairing/pairing-bid-service.test.ts
 M pbs-server/src/services/pairing/pairing-bid-service.ts
 M pbs-server/src/services/pairing/pairing-specific-date.ts
 M sql/schema/03-pbs_pg.sql
?? .playwright-mcp/page-2026-05-22T07-47-12-113Z.yml
?? .playwright-mcp/page-2026-05-22T07-47-37-592Z.yml
?? docs/superpowers/specs/2026-05-22-pbs-pairing-occurrence-list-bid-design.md
?? docs/test-cases/pbs/pairing/2026-05-22-pairing-occurrence-list-regression.md
?? pbs-server/src/models/pbs/pbs-bid-pairing-occurrence.ts
?? pbs-server/src/services/pairing/pairing-occurrence-list.ts
?? sql/migration/2026-05-22-pbs-pairing-occurrence-list.sql
```

### unstaged changed files

```text
packages/contracts/pbs-pairing-bids.d.ts
packages/contracts/pbs-pairing-bids.js
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
pbs-portal/src/features/line/line-draft-mappers.ts
pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx
pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
pbs-portal/src/features/pairing/pairing-bid-control-logic.ts
pbs-portal/src/features/pairing/pairing-bid-summary.ts
pbs-portal/src/features/pairing/pairing-number-occurrences.ts
pbs-portal/src/features/pairing/pairing-property-catalog.ts
pbs-portal/src/features/pairing/types.ts
pbs-portal/src/features/rule-bids/utils.ts
pbs-portal/src/shared/i18n/locales/en.ts
pbs-portal/src/shared/services/days-off-service.ts
pbs-portal/src/shared/services/line-service.ts
pbs-server/src/models/index.ts
pbs-server/src/routes/pairing-bids.ts
pbs-server/src/services/calendar/bidding-calendar-service.test.ts
pbs-server/src/services/calendar/bidding-calendar-service.ts
pbs-server/src/services/lineholder/rule-bid-value.ts
pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts
pbs-server/src/services/pairing/pairing-bid-normalization.ts
pbs-server/src/services/pairing/pairing-bid-service.test.ts
pbs-server/src/services/pairing/pairing-bid-service.ts
pbs-server/src/services/pairing/pairing-specific-date.ts
sql/schema/03-pbs_pg.sql
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-22-pbs-pairing-occurrence-list.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
