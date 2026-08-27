# 开发上下文（2026-05-01）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-01 17:55:09 CST
- Wing：`pbs`
- Topic：`pairing-id-search-label-only`
- Title：pairing-id-search-label-only
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Pairing Number 搜索语义修正：用户侧 `Pairing ID / Pairing Number` 不再按 live 数据库内部 `pairing.id` 搜索或匹配，只认业务 Pairing Number，也就是 live `pairing.pairing_label`。

关键业务结论：
- AA 文档里的 `Pairing ID` 对应乘务员可见的 Pairing Number，例如 `V4146`。
- live `pairing.id`，例如 `4501`，只是内部行 id，不应给用户搜，不应作为 bid 保存值，也不应用来匹配 occurrence。
- `V4146 (2026-04-30 - 2026-05-01)` 按 originate 日期仍算 `2026-04-30`，不是 `2026-05-01`。
- 本轮不改 `/pairing-search/pairing-ids` route 名、`pairingIdCount` contract 字段等兼容字段；后续如要完全改名，应单独做 API 兼容迁移。

实现要点：
- pbs-server/src/services/pairing-search/pairing-id-search-query.ts：autocomplete 只匹配 `upper(p.pairing_label) like ...`，并过滤空 pairing_label；返回 value 仍是 pairing_label，内部 `pairingId` 只作 metadata。
- pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts：`propertyCode=102 Pairing Number` 条件只生成 `upper(p.pairing_label) = any(...)`，不再使用 `coalesce(p.pairing_label, p.id::text)`。
- pbs-server/src/services/pairing-search/pairing-occurrence-query.ts：occurrence 查询只按 `pairing_label` 匹配，不再允许 `p.id::text = any(...)`。
- pbs-portal/src/features/pairing/pairing-number-autocomplete.ts：前端 autocomplete 文案改为 Pairing Number，并复用 `PAIRING_NUMBER_PROPERTY_CODE`。
- 前端 Search Pairings 结果汇总文案从 `pairing IDs` 改为 `pairing numbers`。
- 左侧日历 pairing 详情中内部 live 行 id 不再叫 `Pairing ID`，改为 `Internal ID`，避免和业务 Pairing Number 混淆。
- 设计文档：docs/superpowers/specs/2026-05-01-pbs-pairing-id-autocomplete-display-design.md，状态已更新为“已确认，已实施”。

验证：
- `cd pbs-server && npm test -- src/services/pairing-search/pairing-search-service.test.ts src/services/pairing-search/pairing-search-condition-builder.test.ts src/routes/pairing-search.test.ts` 通过；项目 test script 实际跑了 pbs-server 全量 131 tests。
- `cd pbs-portal && npm test -- pairing-bid-control.test.tsx pairing-search-page-data.test.ts search-pairings-page.test.tsx shared-bidding-workbench-layout.test.tsx` 通过，4 files / 39 tests。
- `npm run verify:pbs` 通过：pbs-server 131 tests/build/sync dry-run、pbs-portal 205 tests/lint/build 全部成功。
- verify 后已恢复 `pbs-portal/tsconfig.tsbuildinfo` build 缓存。

注意：
- 当前工作树还包含此前 occurrence bid、calendar pairing detail 等 PBS 未提交改动，不要误认为都是本轮 Pairing Number 搜索语义改动。
- 如果用户后续继续问 `4501 为什么选不到`，大白话解释：因为 `4501` 是数据库内部 id，不是业务 Pairing Number；应该搜 `V4146` 这类 `pairing_label`。

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
 M pbs-portal/src/features/pairing/components/pairing-bid-control.test.tsx
 M pbs-portal/src/features/pairing/components/pairing-property-table.tsx
 M pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
 M pbs-portal/src/features/pairing/components/pairing-search-panel.tsx
 M pbs-portal/src/features/pairing/mock.ts
 M pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
 D pbs-portal/src/features/pairing/pairing-id-autocomplete.ts
 M pbs-portal/src/features/pairing/pairing-search-page-data.test.ts
 M pbs-portal/src/features/pairing/pairing-search-page-data.ts
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
 M pbs-server/src/services/pairing-search/pairing-id-search-query.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-shared.ts
 M pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.ts
 M pbs-server/src/services/pairing-search/types.ts
 M pbs-server/src/services/pairing/pairing-bid-service.ts
?? docs/dev-context/2026-05-01-pbs-calendar-pairing-event-detail.md
?? docs/dev-context/2026-05-01-pbs-pairing-number-occurrence-bid.md
?? docs/superpowers/specs/2026-05-01-pbs-calendar-pairing-event-detail-design.md
?? docs/superpowers/specs/2026-05-01-pbs-pairing-id-autocomplete-display-design.md
?? docs/superpowers/specs/2026-05-01-pbs-pairing-number-occurrence-bid-design.md
?? pbs-portal/src/features/pairing/components/pairing-occurrence-bid-dialog.tsx
?? pbs-portal/src/features/pairing/pairing-number-autocomplete.ts
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
pbs-portal/src/features/pairing/components/pairing-bid-control.test.tsx
pbs-portal/src/features/pairing/components/pairing-property-table.tsx
pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
pbs-portal/src/features/pairing/components/pairing-search-panel.tsx
pbs-portal/src/features/pairing/mock.ts
pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
pbs-portal/src/features/pairing/pairing-id-autocomplete.ts
pbs-portal/src/features/pairing/pairing-search-page-data.test.ts
pbs-portal/src/features/pairing/pairing-search-page-data.ts
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
pbs-server/src/services/pairing-search/pairing-id-search-query.ts
pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
pbs-server/src/services/pairing-search/pairing-search-condition-shared.ts
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
2. 本文件：`docs/dev-context/2026-05-01-pbs-pairing-id-search-label-only.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
