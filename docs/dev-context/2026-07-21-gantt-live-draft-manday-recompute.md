# 开发上下文（2026-07-21）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-21 09:22:23 UTC
- Wing：`gantt`
- Topic：`live-draft-manday-recompute`
- Title：live-draft-manday-recompute
- Git branch：`main`

## 本轮对话上下文

Continued the interrupted Live Gantt draft manday recompute task on 2026-07-21.

Problem: adding a DO ground task in draft mode rendered the mock item by mutating roster-store baseItems, so crewMandayDelta(baseItems, rosterItems, viewportYearMonth) saw no virtual-vs-base difference and MDO did not move until Save/refetch.

Implemented direction:
- Keep baseItems as committed server state only.
- Add draft mock roster entries through draft operations and recompute displayed rosterItems as draft.applyDraftOps(baseItems).
- Added gantt/src/stores/draft-roster-recompute.ts to hold the draft-store <-> roster-store recompute/promote callbacks without direct circular imports.
- roster-store now exposes recomputeDraftPane(paneId) and uses it for move/swap/add/addGroundTask/update/remove/removeTasksByPairingAndCrew draft branches.
- addTask stores raw create payload in op.task for commit, and UI-only mock roster item in op.mockItem for applyDraftOps display.
- addGroundTask already stores mockItems; it now no longer appends them into baseItems.
- draft-store applyDraftOps uses op.mockItem ?? op.task for add.

Tests added/updated:
- gantt/src/stores/__tests__/roster-store-draft-manday.test.ts proves addGroundTask keeps baseItems unchanged, puts DO in virtual rosterItems, and crewMandayDelta reports mdo/ydo +1.
- e2e/tests/gantt/ground-task-dialog.spec.ts adds GroundTask-3, driving the real Create Ground Task dialog with assignment DO and asserting rendered MDO/YDO increment before Save and Undo restores.

Verification run:
- cd gantt && npm test -- --run src/stores/__tests__/roster-store-draft-manday.test.ts src/utils/__tests__/manday-delta.test.ts => PASS, 2 files / 7 tests.
- cd gantt && npm run build => PASS. Vite emitted only existing dynamic/static import and chunk-size warnings.
- cd e2e && GANTT_TEST_USER/RUN env set, npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/ground-task-dialog.spec.ts --reporter=list => PASS, 3 tests.
- node .gitnexus/run.cjs detect_changes --scope all => low risk, tracked diff only; GitNexus does not include untracked new files.

Notes:
- live-server /api/draft/commit Zod object schemas strip unknown keys by default, so op.mockItem sent by the lock-protected batch path should not reach rosterService.create. Fallback no-lock path still uses op.task.
- Do not reintroduce add/addGroundTask mutations to baseItems; base = committed server state, virtual = base + draft ops.

## 当前工作树快照

### git status --short

```text
 M e2e/tests/gantt/ground-task-dialog.spec.ts
 M gantt/src/services/draft-api.ts
 M gantt/src/stores/draft-store.ts
 M gantt/src/stores/roster-store.ts
?? docs/superpowers/specs/2026-07-21-live-gantt-draft-manday-common-recompute.md
?? gantt/src/stores/__tests__/roster-store-draft-manday.test.ts
?? gantt/src/stores/draft-roster-recompute.ts
```

### unstaged changed files

```text
e2e/tests/gantt/ground-task-dialog.spec.ts
gantt/src/services/draft-api.ts
gantt/src/stores/draft-store.ts
gantt/src/stores/roster-store.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-21-gantt-live-draft-manday-recompute.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```
