# 开发上下文（2026-07-09）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-09 16:31:13 UTC
- Wing：`gantt`
- Topic：`import-pbs-material-connector`
- Title：import-pbs-material-connector
- Git branch：`main`

## 本轮对话上下文

本轮完成 Import PBS Material 与 connector-server F8 import 对齐：
- Gantt Scenario Import PBS Material 弹框改为 RosterPeriod 下拉，默认当前 RP 前5后5，显示禁用 rp_start/rp_end；移除 Base/Rank/Fleet/Mode；Material 增加 Crew 与 RosterGround。
- Gantt confirm 调 live-server 代理 `/api/scenario/import-pbs-material`，不直接暴露 connector id；`/roster-periods` 从 live `roster_period` 取当前 RP 窗口。
- live-server 代理按 connector code 调 connector-server admin trigger，转发 live admin Authorization；`roster` / `rosterGround` 通过 `f8-roster-flight` connector 传显式 scope。
- connector-server admin trigger 支持显式 F8 scope query；`runF8ImportSync` 在显式 scope 下各 Material 独立入队，不自动扩展依赖。Roster 仍由 live-server roster worker 写入，找不到 pairingInterfaceId 对应 pairing.interface_id 时跳过该 roster_flight 并 warning。
- connector-server `fetchWithChunkRetry` 支持 row cap 检测，默认 F8 cap=1000；成功返回 >= cap 会继续切分，单日仍 >= cap 时抛错，避免静默截断。
- 验证通过：connector-server build；live-server build；gantt build；npm run check:ui PASS 0 hard violations；connector chunk-date unit；live-server scenario import route unit；gantt ImportPbsDialog unit；e2e Scenario toolbar Playwright spec。

## 当前工作树快照

### git status --short

```text
 M .agents/skills/126-noc-integration/SKILL.md
 M connector-server/src/__tests__/unit/chunk-date.test.ts
 M connector-server/src/models/connector-config.ts
 M connector-server/src/plugins/bullmq.ts
 M connector-server/src/routes/admin/connector.ts
 M connector-server/src/services/sync/f8/f8-sync-orchestrator.ts
 M connector-server/src/utils/chunk-date.ts
 M e2e/tests/gantt/scenario-toolbar-buttons.spec.ts
 M gantt/src/components/dev/dev-skills-data.generated.ts
 M gantt/src/components/scenario/import-pbs-dialog.tsx
 M gantt/src/components/scenario/scenario-list-panel.tsx
 M live-server/src/config/env.ts
 M live-server/src/routes/scenario/index.ts
?? docs/superpowers/specs/2026-07-09-import-pbs-material-connector-design.md
?? gantt/src/components/scenario/__tests__/import-pbs-dialog.test.tsx
?? gantt/src/services/import-pbs-material-api.ts
?? live-server/src/__tests__/unit/scenario-import-pbs-material-route.test.ts
?? live-server/src/routes/scenario/import-pbs-material.ts
```

### unstaged changed files

```text
.agents/skills/126-noc-integration/SKILL.md
connector-server/src/__tests__/unit/chunk-date.test.ts
connector-server/src/models/connector-config.ts
connector-server/src/plugins/bullmq.ts
connector-server/src/routes/admin/connector.ts
connector-server/src/services/sync/f8/f8-sync-orchestrator.ts
connector-server/src/utils/chunk-date.ts
e2e/tests/gantt/scenario-toolbar-buttons.spec.ts
gantt/src/components/dev/dev-skills-data.generated.ts
gantt/src/components/scenario/import-pbs-dialog.tsx
gantt/src/components/scenario/scenario-list-panel.tsx
live-server/src/config/env.ts
live-server/src/routes/scenario/index.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-09-gantt-import-pbs-material-connector.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```
