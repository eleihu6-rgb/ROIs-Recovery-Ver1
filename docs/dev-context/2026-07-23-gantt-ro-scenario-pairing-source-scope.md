# 开发上下文（2026-07-23）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-23 04:37:07 UTC
- Wing：`gantt`
- Topic：`ro-scenario-pairing-source-scope`
- Title：ro-scenario-pairing-source-scope
- Git branch：`main`

## 本轮对话上下文

本轮完成 RO Scenario Pairing source scope 与 Pairing Sc. 下拉修正：
- 业务结论：scenario.id 保持为场景业务显示/引用 id；Pairing Sc. 下拉显示 `scenario.id - workset.name`，保存值为 PO scenario.id，不使用 workset.id。
- Live-backed RO (`pairing_scenario_id` 为空/0)：Gantt Pairing source 按 RO 场景时间段 + Pairing Filter 的 Base/Fleets + division 过滤 Live pairing，再合并 roster 已引用 pairing。
- PO-backed RO (`pairing_scenario_id` 非 0)：Gantt Pairing source 使用被引用 PO scenario 的 pairing 数据，再合并 Live roster 预占/引用 pairing；SBY/PRAM/PRPM 等 pairing-less ground rows 不再扩大 PO-backed RO 的 pairing universe。
- 代码改动集中在 live-server scenario gantt DB/seed builders、scenario import-targets/po route、gantt ScenarioBasicInfo 和 scenario-api。
- 覆盖：Vitest 前端 ScenarioBasicInfo/scenario-api；Vitest 后端 scenario-gantt-db-service 和 s3 import route；Playwright Scen-2036 真实 UI 断言 Pairing Sc. 显示 692 而不是 worksetId 721 并保存 pairingScenarioId=692。
- GitNexus detect-changes 最终为 HIGH：因 buildGanttDataFromDb/buildGanttDataSeed/buildGanttDataLiveRefresh 等核心 Scenario Gantt 数据流被改动，属于预期风险，需要以测试和 SIT 验证收口。

## 当前工作树快照

### git status --short

```text
 M e2e/tests/gantt/scenario-toolbar-buttons.spec.ts
 M gantt/src/components/scenario/__tests__/scenario-basic-info.test.tsx
 M gantt/src/components/scenario/scenario-basic-info.tsx
 M gantt/src/services/__tests__/scenario-api.test.ts
 M gantt/src/services/scenario-api.ts
 M live-server/src/__tests__/unit/scenario-s3-pairing-import-route.test.ts
 M live-server/src/routes/scenario/scenario.ts
 M live-server/src/services/scenario/__tests__/scenario-gantt-db-service.test.ts
 M live-server/src/services/scenario/scenario-gantt-db-service.ts
 M live-server/src/services/scenario/scenario-gantt-service.ts
 M pbs-engine
 M rule-engine-rs
?? docs/superpowers/specs/2026-07-22-roster-publish-update-identity-fix.md
?? docs/superpowers/specs/2026-07-23-ro-scenario-pairing-source-scope.md
```

### unstaged changed files

```text
e2e/tests/gantt/scenario-toolbar-buttons.spec.ts
gantt/src/components/scenario/__tests__/scenario-basic-info.test.tsx
gantt/src/components/scenario/scenario-basic-info.tsx
gantt/src/services/__tests__/scenario-api.test.ts
gantt/src/services/scenario-api.ts
live-server/src/__tests__/unit/scenario-s3-pairing-import-route.test.ts
live-server/src/routes/scenario/scenario.ts
live-server/src/services/scenario/__tests__/scenario-gantt-db-service.test.ts
live-server/src/services/scenario/scenario-gantt-db-service.ts
live-server/src/services/scenario/scenario-gantt-service.ts
pbs-engine
rule-engine-rs
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-23-gantt-ro-scenario-pairing-source-scope.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```
