# 开发上下文（2026-06-11）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-11 10:10:20 CST
- Wing：`pbs`
- Topic：`pairing-search-base-timezone-duty-calendar`
- Title：PBS Pairing Search Base 时区与 Duty Calendar 修复
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Pairing Search 结果卡片 base 时区和 duty calendar 口径修复。

关键结论：
- live 库 `*_utc` 字段按 UTC 业务语义读取，即使实际类型可能是 `timestamp without time zone`，也不能让 Node `pg` 直接按本机时区解析。
- Search Pairings 结果卡片展示统一按 pairing `base` 的 `airport.zone_id` 转换。
- `DATE` 使用 duty start（brief/report 优先）在 base 时区下的日期；duty report 早于第一段航班起飞导致前一天日期是合理业务结果。
- 右侧 mini calendar 不再由 `active_start_date + duration_days` 展开，而是由 duty 在 base 时区下实际覆盖日期生成；如果 duty 结束/签出跨到下一天，也点亮跨到的日期。
- 前端继续只渲染后端返回的完整 ISO `activeDates`，不在前端补算日期。

本轮代码改动：
- `pbs-server/src/services/pairing-search/pairing-search-preview-query.ts`
  - SQL 为展示用 timestamp 输出 UTC 字符串，避免隐式 Date 解析。
  - preview/details 查询带回 base airport `zone_id`。
  - mapper 新增 base-zone formatter，输出 `reportTime`、`dutyDate`、`departureTime`、`arrivalTime`。
  - `activeDates` 改为按 duty coverage 日期生成。
- `pbs-server/src/services/pairing-search/pairing-search-service.test.ts`
  - 更新旧 duration activeDates 预期。
  - 新增 YYC/base 时区回归：`2025-12-28 05:05 UTC` -> `0627 2205`，第一段起飞 `0024`，activeDates 点亮 duty 覆盖日期。
- `pbs-portal/src/features/pairing/components/pairing-search-panel.module.css`
  - 缩小 leg 表格列宽和 gap，常规桌面宽度下避免不必要横向滚动条。
- `pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx`
  - mini calendar 测试覆盖跨月 trailing cell ISO date 点亮。
- `docs/test-cases/pbs/pairing-search/2026-06-11-base-timezone-duty-calendar.md`
  - 新增人工 QA 用例。

验证结果：
- `pbs-server`: `node --import tsx --test src/services/pairing-search/pairing-search-service.test.ts` 通过。
- `pbs-server`: `npm test` 全量通过，385 tests passed。
- `pbs-server`: `npm run build` 通过。
- `pbs-portal`: `npm test -- src/features/pairing/pages/search-pairings-page.test.tsx` 通过，13 tests passed。
- `pbs-portal`: `npm run build` 通过；保留既有 chunk size warning。
- `pbs-portal`: `npm run lint` 退出码 0；有 6 个既有 Fast Refresh warning，位于 line/reserve 组件，和本轮无关。
- `pbs-portal`: `npm test` 全量有 3 个既有/无关失败，位于 `src/features/rule-bids/*`，原因是对象多出 `action: null`；本轮没有改 rule-bids，`git diff` 和 `git diff --cached` 对 rule-bids 均为空。
- `git diff --check` 通过。

注意事项：
- 当前工作区有上一轮已经 staged 的 PBS duty date / contract / mock 等改动，本轮没有回退或整理这些 staged 内容。
- 本轮未运行 `npm run verify:pbs`，因为脚本包含 `sync:pbs-users -- --dry-run`，会依赖本地数据库/外部状态。

## 当前工作树快照

### git status --short

```text
A  docs/dev-context/2026-06-10-pbs-pairing-duty-date-column.md
M  docs/dev-context/LATEST.md
M  docs/superpowers/specs/2026-06-10-pbs-pairing-search-result-card-layout-design.md
M  packages/contracts/pbs-search-pairings.d.ts
M  pbs-portal/src/app/layout/shared-bidding-workbench-layout.test-utils.tsx
M  pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx
M  pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx
M  pbs-portal/src/features/pairing/components/pairing-detail-card.tsx
MM pbs-portal/src/features/pairing/components/pairing-search-panel.module.css
M  pbs-portal/src/features/pairing/mock.ts
M  pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx
MM pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
M  pbs-portal/src/features/pairing/pairing-search-page-data.test.ts
M  pbs-portal/src/features/pairing/types.ts
M  pbs-portal/src/features/tier/components/tier-right-panel.test.tsx
M  pbs-server/src/routes/pairing-search.test.ts
MM pbs-server/src/services/pairing-search/pairing-search-preview-query.ts
MM pbs-server/src/services/pairing-search/pairing-search-service.test.ts
?? docs/superpowers/specs/2026-06-11-pbs-pairing-search-base-timezone-duty-calendar-design.md
?? docs/test-cases/pbs/pairing-search/
```

### unstaged changed files

```text
pbs-portal/src/features/pairing/components/pairing-search-panel.module.css
pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
pbs-server/src/services/pairing-search/pairing-search-preview-query.ts
pbs-server/src/services/pairing-search/pairing-search-service.test.ts
```

### staged files

```text
docs/dev-context/2026-06-10-pbs-pairing-duty-date-column.md
docs/dev-context/LATEST.md
docs/superpowers/specs/2026-06-10-pbs-pairing-search-result-card-layout-design.md
packages/contracts/pbs-search-pairings.d.ts
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test-utils.tsx
pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx
pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx
pbs-portal/src/features/pairing/components/pairing-detail-card.tsx
pbs-portal/src/features/pairing/components/pairing-search-panel.module.css
pbs-portal/src/features/pairing/mock.ts
pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
pbs-portal/src/features/pairing/pairing-search-page-data.test.ts
pbs-portal/src/features/pairing/types.ts
pbs-portal/src/features/tier/components/tier-right-panel.test.tsx
pbs-server/src/routes/pairing-search.test.ts
pbs-server/src/services/pairing-search/pairing-search-preview-query.ts
pbs-server/src/services/pairing-search/pairing-search-service.test.ts
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-06-11-pbs-pairing-search-base-timezone-duty-calendar.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
