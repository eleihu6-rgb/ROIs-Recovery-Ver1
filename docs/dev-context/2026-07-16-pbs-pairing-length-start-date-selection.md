# 开发上下文（2026-07-16）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-16 15:28:36 CST
- Wing：`pbs`
- Topic：`pairing-length-start-date-selection`
- Title：Pairing Length 起始日期选择对齐
- Git branch：`main`

## 本轮对话上下文

## 用户目标

将 Pairing Length 的 LIMIT TO PAIRING START DATE 对齐 Airport Preference 的 LIMIT TO EVENT DATE 交互：
- 默认进入 Specific Dates。
- Specific Dates 支持单选与多选。
- 支持切换 Date Range。
- 模式切换时清除另一模式的日期值。
- Pairing Length 原有 Min / Max 天数语义保持不变。

## 关键设计决定

- 复用 pbs-portal 的 OptionalEventDateScopeEditor，通过可选 label、switchAriaLabel、dateAriaLabel 支持 Pairing Length 专属文案。
- Pairing Length 日期范围契约统一为 specific_dates | date_range。
- specific_dates 在规则签名前进行 trim、去重和排序，保证收藏与条件身份稳定。
- pbs-server 校验日期格式和当前 bid period；搜索使用 pairing occurrence start date。
- live-server 补齐 JSON 序列化、反序列化、深克隆、摘要和算法评分链路。
- Work Day Preference 等共享工作区并行改动不属于本提交，采用逐 hunk 暂存隔离。

## 文档与提交

- 设计 spec：docs/superpowers/specs/2026-07-16-pbs-pairing-length-start-date-selection-alignment-design.md
- spec commit：b7867668
- 实施计划：docs/superpowers/plans/2026-07-16-pbs-pairing-length-start-date-selection-implementation-plan.md
- QA 用例：docs/test-cases/pbs/pairing/2026-07-16-pairing-length-start-date-selection.md
- 实现 commit：a8d7e78f feat: align Pairing Length start date selection

## 验证结果

工作区验证：
- pbs-portal focused Vitest：26 PASS。
- pbs-server Pairing Length：9 PASS。
- live-server focused Vitest：12 PASS。
- Playwright PBS-3522：2 PASS。
- pbs-portal TypeScript、ESLint、production build：PASS。
- live-server / pbs-server TypeScript：PASS。
- npm run check:ui：PASS，0 hard violations。
- git diff --check：PASS。

仅暂存内容隔离快照验证：
- pbs-portal focused Vitest：26 PASS。
- pbs-server Pairing Length：9 PASS。
- live-server focused Vitest：7 PASS。
- GitNexus detect-changes --scope staged：32 files、66 symbols、19 affected processes、CRITICAL；高风险来自共享 clone/serialize/search 链路，与实施前影响分析一致。
- 隔离快照的 pbs-portal 全量 tsc 被当前 HEAD 已存在的 Work Day Preference 合同不完整状态阻断，共 8 个无关错误；完整共享工作区的 tsc 已通过，未把并行修复混入 Pairing Length 提交。

## 后续注意

- 当前共享工作区仍有未提交的 Work Day Preference、Check-Time 等其他改动，不要回退或误提交。
- Pairing Length 的功能提交已完成，不要重复实现。
- 如继续修改相邻日期控件，优先复用 OptionalEventDateScopeEditor，并保留 specific_dates 的集合身份语义。

## 当前工作树快照

### git status --short

```text
 M AGENTS.md
 M CLAUDE.md
 M docs/superpowers/specs/2026-07-16-pbs-work-day-preference-standard-answer-alignment-design.md
 M docs/test-cases/pbs/pairing/2026-07-13-work-day-preference.md
 M e2e/tests/pbs-portal/condition-default-favorites.spec.ts
 M live-server/src/services/lineholder/rule-bid-clone.ts
 M live-server/src/services/lineholder/rule-bid-format.ts
 M live-server/src/services/lineholder/rule-bid-serialize.ts
 M live-server/src/services/lineholder/rule-bid-types.ts
 M live-server/src/services/lineholder/rule-bid-value.test.ts
 M live-server/src/services/lineholder/rule-bid-value.ts
 M live-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
 M live-server/src/services/pairing-search/pairing-search-detail-conditions.ts
 M pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
 M pbs-portal/src/features/line/line-draft-mappers.ts
 M pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
 M pbs-portal/src/features/pairing/components/pairing-check-time-editor.test.tsx
 M pbs-portal/src/features/pairing/components/pairing-check-time-editor.tsx
 M pbs-portal/src/features/pairing/components/work-day-preference-editor.test.tsx
 M pbs-portal/src/features/pairing/components/work-day-preference-editor.tsx
 M pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
 M pbs-portal/src/features/pairing/pairing-bid-control-logic.test.ts
 M pbs-portal/src/features/pairing/pairing-bid-control-logic.ts
 M pbs-portal/src/features/pairing/pairing-bid-summary.ts
 M pbs-portal/src/features/pairing/pairing-property-catalog.test.ts
 M pbs-portal/src/features/pairing/pairing-property-catalog.ts
 M pbs-portal/src/shared/services/days-off-service.ts
 M pbs-portal/src/shared/services/line-service.ts
 M pbs-server/src/routes/pairing-bids.test.ts
 M pbs-server/src/services/lineholder/rule-bid-value.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-detail-conditions.ts
 M pbs-server/src/services/pairing/pairing-property-validation.test.ts
 M pbs-server/src/services/pairing/pairing-property-validation.ts
 M sql/seed/10-pbs-bid-property.sql
?? docs/superpowers/plans/2026-07-16-pbs-work-day-preference-standard-alignment-implementation-plan.md
?? docs/superpowers/specs/2026-07-16-pbs-pairing-check-time-dialog-spacing-design.md
?? sql/migration/2026-07-16-pbs-work-day-preference-standard-answer-semantics.sql
```

### unstaged changed files

```text
AGENTS.md
CLAUDE.md
docs/superpowers/specs/2026-07-16-pbs-work-day-preference-standard-answer-alignment-design.md
docs/test-cases/pbs/pairing/2026-07-13-work-day-preference.md
e2e/tests/pbs-portal/condition-default-favorites.spec.ts
live-server/src/services/lineholder/rule-bid-clone.ts
live-server/src/services/lineholder/rule-bid-format.ts
live-server/src/services/lineholder/rule-bid-serialize.ts
live-server/src/services/lineholder/rule-bid-types.ts
live-server/src/services/lineholder/rule-bid-value.test.ts
live-server/src/services/lineholder/rule-bid-value.ts
live-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
live-server/src/services/pairing-search/pairing-search-detail-conditions.ts
pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
pbs-portal/src/features/line/line-draft-mappers.ts
pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
pbs-portal/src/features/pairing/components/pairing-check-time-editor.test.tsx
pbs-portal/src/features/pairing/components/pairing-check-time-editor.tsx
pbs-portal/src/features/pairing/components/work-day-preference-editor.test.tsx
pbs-portal/src/features/pairing/components/work-day-preference-editor.tsx
pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
pbs-portal/src/features/pairing/pairing-bid-control-logic.test.ts
pbs-portal/src/features/pairing/pairing-bid-control-logic.ts
pbs-portal/src/features/pairing/pairing-bid-summary.ts
pbs-portal/src/features/pairing/pairing-property-catalog.test.ts
pbs-portal/src/features/pairing/pairing-property-catalog.ts
pbs-portal/src/shared/services/days-off-service.ts
pbs-portal/src/shared/services/line-service.ts
pbs-server/src/routes/pairing-bids.test.ts
pbs-server/src/services/lineholder/rule-bid-value.test.ts
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
2. 本文件：`docs/dev-context/2026-07-16-pbs-pairing-length-start-date-selection.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
