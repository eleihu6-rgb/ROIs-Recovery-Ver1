# 开发上下文（2026-07-21）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-21 14:55:46 CST
- Wing：`pbs`
- Topic：`current-rules-counts-linearization`
- Title：PBS Current Rules Counts 线性化性能修复
- Git branch：`main`

## 本轮对话上下文

用户批准按正式 spec 修复 POST /api/pairing-search/current-rules/counts 的超时问题，要求未来 10–20 条条件仍保持现有业务行为且不延长 Portal 10 秒 timeout。

根因：旧实现为 N 个 row counts 与 M 个 funnel counts 生成 N+M 个完整 UNION ALL 分支，用户 19 的 7 条 existing/6 条 T1 active 产生 13 个全量分支，冷请求约 34–35 秒。第一阶段 candidate/evaluated 线性化将 7 条降至约 7.5 秒，但 20 条包含 Airport/Check-Time/Flight Legs 的重条件仍约 22.7 秒。最终增加 current-rules 专用 facts：候选 segments、机场/城市、本地 check event、duty legs、airport events 一次物化；三个现有条件生成器只在 useCurrentRulesFacts context 下读取 facts。普通 Preview、Tier Pool 与算法导出仍走原路径。

共享 buildCurrentRulesExpression 复用原 conflict、union-find、multi/forced OR 与组间 AND 规则。API contract、row/funnel 范围、Award/Avoid、Any/Every、日期/时区、cache/stampede、数据库 schema 均未改变。

验证：focused condition/service 145 PASS；generated SQL coverage 103 PASS；远端 PostgreSQL 90 case preflight PASS；pbs-server build PASS。用户 19 真实 7 条规则 5 个冷样本约 3.60–3.95 秒，rule counts 3/2/4/34/15/13/16、funnel 0/2/0/0/0/0/0 与改前一致。20 条重条件 5 个冷样本约 5.90–6.34 秒，median 约 5.92 秒；5 个相同冷 key 并发均约 6.0 秒且 HTTP 200。PBS-3502/3503/3504 Playwright 3 PASS，真实 /pbs/bid 不再显示 Try refresh again。

完整 pbs-server npm test 共 676 tests，674 PASS、2 个与本任务无关的既有失败：reserve-score-export 的 SBY row count 1!=3；pairing-property-catalog clone 多出 numericBounds undefined。本任务涉及文件未包含这两个失败文件。

正式文档：docs/superpowers/specs/2026-07-21-pbs-current-rules-counts-linearization-design.md；计划：docs/superpowers/plans/2026-07-21-pbs-current-rules-counts-linearization-implementation-plan.md；QA：docs/test-cases/pbs/pairing/2026-07-21-current-rules-counts-performance.md。

当前工作树还有用户此前的 calendar popover 及 AGENTS/CLAUDE/GitNexus skill 改动，不得混入本任务提交。用户尚未要求提交本任务。

## 当前工作树快照

### git status --short

```text
 M .claude/skills/gitnexus/gitnexus-debugging/SKILL.md
 M .claude/skills/gitnexus/gitnexus-exploring/SKILL.md
 M .claude/skills/gitnexus/gitnexus-guide/SKILL.md
 M .claude/skills/gitnexus/gitnexus-refactoring/SKILL.md
 M AGENTS.md
 M CLAUDE.md
 M e2e/test-results/.last-run.json
 D e2e/test-results/tests-gantt-scenario-selec-298e5-h-scenario-composition-fill/error-context.md
 D e2e/test-results/tests-gantt-scenario-selec-81b86-e-row-selection-regression-/error-context.md
 D e2e/test-results/tests-gantt-scenario-selec-9bcef-is-maintained-after-seeding/error-context.md
 D e2e/test-results/tests-gantt-scenario-selec-a5390-ate-background-click-clears/error-context.md
 D e2e/test-results/tests-gantt-scenario-selec-ad772--shows-hovered-pairing-info/error-context.md
 M e2e/tests/pbs-portal/bid-merged-workbench.spec.ts
 M e2e/tests/pbs-portal/pairing-search-perf.spec.ts
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
 M pbs-portal/src/features/dashboard/components/pairing-calendar-bid-popover-content.tsx
 M pbs-portal/src/shared/components/schedule/schedule-event-calendar.tsx
 M pbs-server/scripts/verify-generated-pairing-sql.mjs
 M pbs-server/src/services/pairing-search/generated-sql-preflight-cases.ts
 M pbs-server/src/services/pairing-search/generated-sql-preflight-manifest.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-context.ts
 M pbs-server/src/services/pairing-search/pairing-search-detail-conditions.ts
 M pbs-server/src/services/pairing-search/pairing-search-preview-query.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.ts
 M pbs-server/src/services/pairing-search/pairing-search-time-conditions.ts
?? docs/superpowers/plans/2026-07-21-pbs-current-rules-counts-linearization-implementation-plan.md
?? docs/superpowers/specs/2026-07-21-pbs-calendar-action-popover-positioning-design.md
?? docs/superpowers/specs/2026-07-21-pbs-current-rules-counts-linearization-design.md
?? docs/test-cases/pbs/bid/2026-07-21-calendar-action-popover-positioning.md
?? docs/test-cases/pbs/pairing/2026-07-21-current-rules-counts-performance.md
?? e2e/test-results/tests-pbs-portal-pairing-s-5ecd8-ess-not-error-after-REFRESH-repeat1/
?? e2e/test-results/tests-pbs-portal-pairing-s-5ecd8-ess-not-error-after-REFRESH-repeat2/
?? e2e/test-results/tests-pbs-portal-pairing-s-5ecd8-ess-not-error-after-REFRESH-repeat3/
?? e2e/test-results/tests-pbs-portal-pairing-s-5ecd8-ess-not-error-after-REFRESH-repeat4/
?? e2e/test-results/tests-pbs-portal-pairing-s-5ecd8-ess-not-error-after-REFRESH-repeat5/
?? e2e/test-results/tests-pbs-portal-pairing-s-5ecd8-ess-not-error-after-REFRESH-repeat6/
?? e2e/test-results/tests-pbs-portal-pairing-s-5ecd8-ess-not-error-after-REFRESH-repeat7/
?? e2e/test-results/tests-pbs-portal-pairing-s-5ecd8-ess-not-error-after-REFRESH-repeat8/
?? e2e/test-results/tests-pbs-portal-pairing-s-5ecd8-ess-not-error-after-REFRESH-repeat9/
?? e2e/test-results/tests-pbs-portal-pairing-s-5ecd8-ess-not-error-after-REFRESH/
?? pbs-portal/src/shared/components/schedule/schedule-action-popover-position.test.ts
?? pbs-portal/src/shared/components/schedule/schedule-action-popover-position.ts
```

### unstaged changed files

```text
.claude/skills/gitnexus/gitnexus-debugging/SKILL.md
.claude/skills/gitnexus/gitnexus-exploring/SKILL.md
.claude/skills/gitnexus/gitnexus-guide/SKILL.md
.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md
AGENTS.md
CLAUDE.md
e2e/test-results/.last-run.json
e2e/test-results/tests-gantt-scenario-selec-298e5-h-scenario-composition-fill/error-context.md
e2e/test-results/tests-gantt-scenario-selec-81b86-e-row-selection-regression-/error-context.md
e2e/test-results/tests-gantt-scenario-selec-9bcef-is-maintained-after-seeding/error-context.md
e2e/test-results/tests-gantt-scenario-selec-a5390-ate-background-click-clears/error-context.md
e2e/test-results/tests-gantt-scenario-selec-ad772--shows-hovered-pairing-info/error-context.md
e2e/tests/pbs-portal/bid-merged-workbench.spec.ts
e2e/tests/pbs-portal/pairing-search-perf.spec.ts
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/features/dashboard/components/pairing-calendar-bid-popover-content.tsx
pbs-portal/src/shared/components/schedule/schedule-event-calendar.tsx
pbs-server/scripts/verify-generated-pairing-sql.mjs
pbs-server/src/services/pairing-search/generated-sql-preflight-cases.ts
pbs-server/src/services/pairing-search/generated-sql-preflight-manifest.ts
pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts
pbs-server/src/services/pairing-search/pairing-search-condition-context.ts
pbs-server/src/services/pairing-search/pairing-search-detail-conditions.ts
pbs-server/src/services/pairing-search/pairing-search-preview-query.ts
pbs-server/src/services/pairing-search/pairing-search-service.test.ts
pbs-server/src/services/pairing-search/pairing-search-service.ts
pbs-server/src/services/pairing-search/pairing-search-time-conditions.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-21-pbs-current-rules-counts-linearization.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
