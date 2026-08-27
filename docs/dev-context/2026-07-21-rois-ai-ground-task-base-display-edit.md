# 开发上下文（2026-07-21）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-21 16:32:49 UTC
- Wing：`rois-ai`
- Topic：`ground-task-base-display-edit`
- Title：ground-task-base-display-edit
- Git branch：`main`

## 本轮对话上下文

Completed ground-task base display/edit work across Live and Scenario Gantt.

Decisions:
- Shared status-line formatter now renders pairing-less tasks as "Pairing #— · Base <base>" and is used by Live, Scenario, and the gantt test hook.
- Live edit Ground Task dialog now shows an editable Base select in edit mode, defaulting to editItem.base; create mode remains unchanged.
- Scenario ground items now carry base through parsing/lead-in mapping and into buildScenarioRosterItems.

Verification:
- gantt: npx tsc --noEmit
- gantt: npm test -- --run src/utils/__tests__/format-ground-task-status-line.test.ts src/components/scenario-gantt/__tests__/build-scenario-roster-items.test.ts
- live-server: npm test -- --run src/__tests__/services/scenario-gantt-service.test.ts
- e2e: npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/ground-task-dialog.spec.ts --reporter=list
- repo: npm run check:ui (PASS, 0 hard violations)
- repo: node .gitnexus/run.cjs detect_changes --scope compare --base-ref main (low risk)

## 当前工作树快照

### git status --short

```text
 M e2e/tests/gantt/ground-task-dialog.spec.ts
 M gantt/src/components/gantt/source/live-gantt-source.ts
 M gantt/src/components/gantt/source/scenario-gantt-source.ts
 M gantt/src/components/roster/ground-task-dialog.tsx
 M gantt/src/components/scenario-gantt/__tests__/build-scenario-roster-items.test.ts
 M gantt/src/components/scenario-gantt/build-scenario-roster-items.ts
 M gantt/src/types/roster.ts
 M gantt/src/types/scenario-gantt.ts
 M gantt/src/utils/gantt-test-hook.ts
 M live-server/src/__tests__/services/scenario-gantt-service.test.ts
 M live-server/src/services/scenario/scenario-gantt-db-service.ts
 M live-server/src/services/scenario/scenario-gantt-service.ts
?? docs/superpowers/specs/2026-07-21-ground-task-base-display-edit.md
?? gantt/src/utils/__tests__/format-ground-task-status-line.test.ts
?? gantt/src/utils/format-ground-task-status-line.ts
```

### unstaged changed files

```text
e2e/tests/gantt/ground-task-dialog.spec.ts
gantt/src/components/gantt/source/live-gantt-source.ts
gantt/src/components/gantt/source/scenario-gantt-source.ts
gantt/src/components/roster/ground-task-dialog.tsx
gantt/src/components/scenario-gantt/__tests__/build-scenario-roster-items.test.ts
gantt/src/components/scenario-gantt/build-scenario-roster-items.ts
gantt/src/types/roster.ts
gantt/src/types/scenario-gantt.ts
gantt/src/utils/gantt-test-hook.ts
live-server/src/__tests__/services/scenario-gantt-service.test.ts
live-server/src/services/scenario/scenario-gantt-db-service.ts
live-server/src/services/scenario/scenario-gantt-service.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-21-rois-ai-ground-task-base-display-edit.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh rois-ai
git status --short
```
