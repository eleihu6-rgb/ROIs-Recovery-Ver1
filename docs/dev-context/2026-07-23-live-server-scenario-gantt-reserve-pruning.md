# 开发上下文（2026-07-23）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-23 08:35:57 UTC
- Wing：`live-server`
- Topic：`scenario-gantt-reserve-pruning`
- Title：scenario-gantt-reserve-pruning
- Git branch：`main`

## 本轮对话上下文

本轮修复了 Scenario Gantt seed/live-refresh/DB 路径中的 reserve pairing 泄漏问题。

关键结论：
- 696 上看到的 PRAM/PRPM 不是来自 PO 692；PO 692 的 gantt-data 是 776 条、全 FLY。
- 696 seed 路径原来会在 PO geometry 为空时回退到 RO input.gz 的整包 pairing universe，导致 Live RO input 中的 RES/PRAM/PRPM 被带进来。
- injectSbyAssignments() 只处理 assignmentGroup='SBY' 的 ground rows，不会裁掉 assignmentGroup='RES' 的 pairing；所以 unreferenced RES pairing 会留在 Pairing pane。

实现：
- 在 live-server/src/services/scenario/scenario-gantt-service.ts 新增 pruneUnreferencedReservePairings()，统一裁剪 RES/SBY pairing：只保留被 roster assignments 引用的 reserve pairing，并同步裁剪 segments/flights。
- buildGanttDataSeed() 在 RO 场景引用 PO pairing_scenario_id 时，不再回退到 RO input 的 pairing universe；直接使用 PO geometry（可为空），再由 live lead-in PA assignments 补位。
- buildGanttDataSnapshot() / buildGanttDataLiveRefresh() / buildGanttDataFromDb() 也统一接入 reserve prune，避免同类泄漏在其他场景路径重现。

验证：
- npm test -- --run src/__tests__/services/scenario-gantt-service.test.ts src/services/scenario/__tests__/scenario-gantt-db-service.test.ts
  - scenario-gantt-service.test.ts PASS
  - db-service.test.ts 需要 DATABASE_URL 才能跑；单独用 DATABASE_URL=postgresql://test:test@localhost:5432/test 运行后 PASS
- npm run build PASS

## 当前工作树快照

### git status --short

```text
 M live-server/src/__tests__/services/scenario-gantt-service.test.ts
 M live-server/src/services/scenario/scenario-gantt-db-service.ts
 M live-server/src/services/scenario/scenario-gantt-service.ts
 M pbs-engine
```

### unstaged changed files

```text
live-server/src/__tests__/services/scenario-gantt-service.test.ts
live-server/src/services/scenario/scenario-gantt-db-service.ts
live-server/src/services/scenario/scenario-gantt-service.ts
pbs-engine
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-23-live-server-scenario-gantt-reserve-pruning.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh live-server
git status --short
```
