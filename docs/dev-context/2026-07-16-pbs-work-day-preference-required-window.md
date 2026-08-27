# 开发上下文（2026-07-16）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-16 16:28:14 CST
- Wing：`pbs`
- Topic：`work-day-preference-required-window`
- Title：Work Day Preference 必填 Check-In Window
- Git branch：`main`

## 本轮对话上下文

## 用户目标

统一 Work Day Preference 的必填语义：选中工作日后，每一天都必须填写完整的本地 Check-In From/To。界面仍使用现有 PBS Portal UI，不参考标准答案项目的视觉样式；旧的不完整语义直接删除，不把缺失时间兼容为 Any time。

## 已确认产品规则

- Work Day Preference 固定为 Award，不显示 Award/Avoid 选择。
- 每个选中的 weekday 都必须有 Check-In From 和 Check-In To。
- 任一端点缺失时，Add Bid 和 Save Favorite 必须禁用。
- 空输入只有在用户触碰/离开该输入框后才显示红色错误。
- 允许跨夜区间，例如 22:00–04:00。
- From 与 To 相同属于无效零宽区间。
- LIMIT TO EVENT DATE 默认关闭，表示不限制事件日期；打开后可选择 Specific Dates 或 Date Range。
- 旧的 Any/Every Duty On 导入数据不能继续映射成没有时间窗口的 Work Day Preference，需跳过并返回明确 warning。
- 旧的不完整摘要不能显示为 Any time，应显示 Incomplete check-in window。

## 实现结果

- Portal 增加统一完整性判断、触碰态红框和按钮禁用逻辑。
- pbs-server 路由 schema 与 property validation 拒绝缺失、非法或相同的时间端点。
- pbs-server/live-server 搜索条件对遗留不完整值返回 false，避免意外扩大匹配。
- 两端导入器拒绝 Legacy Duty On 到 Work Day Preference 的旧映射，issue code 为 work_day_preference_requires_complete_check_in_windows。
- Portal、pbs-server、live-server 摘要统一显示不完整窗口诊断。
- property 110 catalog metadata 和 tooltip 已更新为 required From/To。
- 新增清理 migration、隔离 fixture 和 verifier，用于删除无效 tier-copy group/condition/favorite 并重算 tier/bid 计数。
- 更新 E2E PBS-3516 和人工 QA 文档。

## Git

- Spec commits：4610a71f、108d8b06、cc17209a。
- 实现 commit：22c647a9（fix: require Work Day check-in windows）。
- 不要把当前工作树中的 AGENTS.md、CLAUDE.md、.playwright-mcp/ 或 Flight Number implementation plan 误认为本任务改动；它们没有进入 22c647a9。

## 验证

- pbs-portal 全量：84 files / 590 tests PASS。
- Playwright PBS-3516：2/2 PASS。
- pbs-portal lint/build PASS。
- pbs-server build、相关路由/validation/import/search/formatter 定向测试 PASS。
- live-server build、相关 import/search/formatter 定向测试 PASS。
- UI Standard Gate PASS，0 hard violations。
- git diff --check PASS。
- GitNexus staged detect-changes：30 files、33 symbols、0 affected processes、low risk。
- pbs-server 全量仍有两个与本次无关的既有失败：reserve-score-export 数量断言、pairing-property-catalog numericBounds undefined 深比较。
- live-server 全量存在既有环境/基线失败，包括缺少 rule-engine-rs release binary、真实 DB 依赖和其他旧断言；本次触及测试均通过。
- migration 尚未在数据库执行：当前环境没有 psql/TEST_DATABASE_URL。上线或部署前需在隔离 PBS test schema 依次执行 fixture、migration、verifier，再执行正式 migration。

## 后续不要推翻的结论

- 不恢复 Any time、单边 From/To 或旧 Duty On 兼容。
- Parser 可以继续防御性读取遗留值，但写入、导入、搜索和 UI 提交必须按完整窗口契约执行。
- 不要把这次改动扩展成无关 UI 重构。

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
 M live-server/src/services/lineholder/rule-bid-value.ts
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
 M pbs-server/src/routes/pairing-bid-route-schemas.ts
 M pbs-server/src/routes/pairing-bids.test.ts
 M pbs-server/src/services/algorithm-export/pairing-score-export.test.ts
 M pbs-server/src/services/lineholder/rule-bid-clone.ts
 M pbs-server/src/services/lineholder/rule-bid-format.ts
 M pbs-server/src/services/lineholder/rule-bid-types.ts
 M pbs-server/src/services/lineholder/rule-bid-value.test.ts
 M pbs-server/src/services/lineholder/rule-bid-value.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-detail-conditions.ts
 M pbs-server/src/services/pairing/pairing-property-validation.test.ts
 M pbs-server/src/services/pairing/pairing-property-validation.ts
 M sql/seed/10-pbs-bid-property.sql
?? .playwright-mcp/
?? docs/superpowers/plans/2026-07-16-pbs-flight-number-preference-standard-answer-alignment-implementation-plan.md
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
live-server/src/services/lineholder/rule-bid-value.ts
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
pbs-server/src/routes/pairing-bid-route-schemas.ts
pbs-server/src/routes/pairing-bids.test.ts
pbs-server/src/services/algorithm-export/pairing-score-export.test.ts
pbs-server/src/services/lineholder/rule-bid-clone.ts
pbs-server/src/services/lineholder/rule-bid-format.ts
pbs-server/src/services/lineholder/rule-bid-types.ts
pbs-server/src/services/lineholder/rule-bid-value.test.ts
pbs-server/src/services/lineholder/rule-bid-value.ts
pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
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
2. 本文件：`docs/dev-context/2026-07-16-pbs-work-day-preference-required-window.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
