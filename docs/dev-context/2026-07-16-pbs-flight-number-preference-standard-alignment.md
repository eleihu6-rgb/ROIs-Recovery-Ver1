# 开发上下文（2026-07-16）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-16 16:36:45 CST
- Wing：`pbs`
- Topic：`flight-number-preference-standard-alignment`
- Title：Flight Number Preference 标准答案语义对齐
- Git branch：`main`

## 本轮对话上下文

本轮已完成 PBS Flight Number Preference（property 116）标准答案语义对齐。

关键决定：
- 完全删除 MATCHING FLIGHTS、minimumRequired、maximumRequired，不兼容旧 payload。
- FLIGHT DATE 改为默认关闭的 LIMIT TO FLIGHT DATE；开启后支持 Specific Dates 多选或 Date Range。
- 正向命中条件为 pairing 中存在至少一个 flight number 命中且 seg_assignment 为 FLT/FLY 的实际飞行航段；DHD 排除。
- 日期匹配使用 pairing_segment.flt_dt，并要求日期位于当前 bid period。
- Search Pairings 的 Avoid 显示正向集合补集；算法评分始终查询正向命中集合，再由 Award/Avoid 写入对应 counter，避免双重取反。
- 项目未上线，新增破坏性幂等迁移，清除 property 116 的 bid group、condition、occurrence、三类 favorite，并重算 tier/bid 汇总。

实现范围：
- packages/contracts、pbs-portal、pbs-server、live-server。
- property 116 seed、新 SQL migration、Portal Vitest、server focused tests、Playwright PBS-3523/PBS-3524、人工 QA 文档。

验证结果：
- Portal Pairing 271 tests PASS。
- PBS focused 165 tests PASS，pairing-score export 10 tests PASS。
- Live focused tests和 TypeScript PASS。
- Playwright 3 PASS。
- Portal production build PASS。
- UI Standard Gate PASS，0 hard violations。
- git diff --check PASS。
- pbs-server 全量 652/654，通过；2 个既有失败分别为 Reserve 时间相关和 catalog numericBounds，与本任务无关。
- live-server 全量受缺少 Rust release binary、DATABASE_URL 以及既有测试失败影响；本任务 focused tests 均通过。

注意：工作区中 AGENTS.md、CLAUDE.md、.playwright-mcp/ 和 pairing-calendar-detail-viewport spec 属于其他工作，不应纳入本任务提交。

## 当前工作树快照

### git status --short

```text
 M AGENTS.md
 M CLAUDE.md
 M e2e/tests/pbs-portal/condition-default-favorites.spec.ts
 M live-server/src/services/lineholder/rule-bid-clone.ts
 M live-server/src/services/lineholder/rule-bid-format.ts
 M live-server/src/services/lineholder/rule-bid-serialize.ts
 M live-server/src/services/lineholder/rule-bid-types.ts
 M live-server/src/services/lineholder/rule-bid-value.test.ts
 M live-server/src/services/lineholder/rule-bid-value.ts
 M live-server/src/services/pairing-search/pairing-search-condition-builder.ts
 M live-server/src/services/pairing-search/pairing-search-detail-conditions.ts
 M packages/contracts/pbs-pairing-bids.d.ts
 M packages/contracts/pbs-pairing-bids.js
 M pbs-portal/src/features/pairing/components/flight-number-preference-editor.test.tsx
 M pbs-portal/src/features/pairing/components/flight-number-preference-editor.tsx
 M pbs-portal/src/features/pairing/pairing-bid-control-logic.ts
 M pbs-portal/src/features/pairing/pairing-bid-summary.ts
 M pbs-portal/src/features/pairing/pairing-draft-mappers.ts
 M pbs-portal/src/features/pairing/pairing-property-catalog.test.ts
 M pbs-portal/src/features/pairing/pairing-property-catalog.ts
 M pbs-portal/src/features/pairing/types.ts
 M pbs-server/src/routes/pairing-bid-route-schemas.test.ts
 M pbs-server/src/routes/pairing-bid-route-schemas.ts
 M pbs-server/src/routes/pairing-bids.test.ts
 M pbs-server/src/services/algorithm-export/pairing-score-export.test.ts
 M pbs-server/src/services/lineholder/rule-bid-clone.ts
 M pbs-server/src/services/lineholder/rule-bid-format.ts
 M pbs-server/src/services/lineholder/rule-bid-types.ts
 M pbs-server/src/services/lineholder/rule-bid-value.test.ts
 M pbs-server/src/services/lineholder/rule-bid-value.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts
 M pbs-server/src/services/pairing-search/pairing-search-detail-conditions.ts
 M pbs-server/src/services/pairing/pairing-property-validation.test.ts
 M pbs-server/src/services/pairing/pairing-property-validation.ts
 M sql/seed/10-pbs-bid-property.sql
?? .playwright-mcp/
?? docs/superpowers/plans/2026-07-16-pbs-flight-number-preference-standard-answer-alignment-implementation-plan.md
?? docs/superpowers/specs/2026-07-16-pbs-pairing-calendar-detail-viewport-portal-design.md
?? docs/test-cases/pbs/pairing/2026-07-16-flight-number-preference-standard-alignment.md
?? sql/migration/2026-07-16-pbs-flight-number-preference-standard-answer-semantics.sql
```

### unstaged changed files

```text
AGENTS.md
CLAUDE.md
e2e/tests/pbs-portal/condition-default-favorites.spec.ts
live-server/src/services/lineholder/rule-bid-clone.ts
live-server/src/services/lineholder/rule-bid-format.ts
live-server/src/services/lineholder/rule-bid-serialize.ts
live-server/src/services/lineholder/rule-bid-types.ts
live-server/src/services/lineholder/rule-bid-value.test.ts
live-server/src/services/lineholder/rule-bid-value.ts
live-server/src/services/pairing-search/pairing-search-condition-builder.ts
live-server/src/services/pairing-search/pairing-search-detail-conditions.ts
packages/contracts/pbs-pairing-bids.d.ts
packages/contracts/pbs-pairing-bids.js
pbs-portal/src/features/pairing/components/flight-number-preference-editor.test.tsx
pbs-portal/src/features/pairing/components/flight-number-preference-editor.tsx
pbs-portal/src/features/pairing/pairing-bid-control-logic.ts
pbs-portal/src/features/pairing/pairing-bid-summary.ts
pbs-portal/src/features/pairing/pairing-draft-mappers.ts
pbs-portal/src/features/pairing/pairing-property-catalog.test.ts
pbs-portal/src/features/pairing/pairing-property-catalog.ts
pbs-portal/src/features/pairing/types.ts
pbs-server/src/routes/pairing-bid-route-schemas.test.ts
pbs-server/src/routes/pairing-bid-route-schemas.ts
pbs-server/src/routes/pairing-bids.test.ts
pbs-server/src/services/algorithm-export/pairing-score-export.test.ts
pbs-server/src/services/lineholder/rule-bid-clone.ts
pbs-server/src/services/lineholder/rule-bid-format.ts
pbs-server/src/services/lineholder/rule-bid-types.ts
pbs-server/src/services/lineholder/rule-bid-value.test.ts
pbs-server/src/services/lineholder/rule-bid-value.ts
pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts
pbs-server/src/services/pairing-search/pairing-search-detail-conditions.ts
pbs-server/src/services/pairing/pairing-property-validation.test.ts
pbs-server/src/services/pairing/pairing-property-validation.ts
sql/seed/10-pbs-bid-property.sql
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-16-pbs-flight-number-preference-standard-alignment.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
