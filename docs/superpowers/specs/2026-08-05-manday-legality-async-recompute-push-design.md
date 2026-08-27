# Spec: Manday / 法规 / KPI 重算异步化 + 推送定向刷新（Live 与 Scenario 对齐）

> 日期：2026-08-05 · 状态：设计定稿 · 模块：live-server / gantt
> 关联：`docs/superpowers/specs/2026-07-20-manday-blh-base-midnight-split-design.md`、`docs/superpowers/specs/2026-06-15-scenario-persisted-legality-design.md`

## 1. 背景与问题

删除 scenario 的 DO 耗时 5–10s，实测根因（SIT `f8_sit_*` 库、部署 dist 直接测量）：

| 环节 | 耗时 | 说明 |
|------|------|------|
| `validateScenarioRosterPatches` | ~50ms | 校验 |
| `applyScenarioRosterPatches`（软删） | ~50ms | UPDATE |
| **`recomputeManday`（同步、全量）** | **~4549ms** | **主因** |
| `syncScenarioPairingKpisFromDb`（同步 KPI） | ~300–500ms | 全 scenario 聚合 |
| `ensureLegality`（异步 detached） | ~100ms | 不阻塞请求 |
| 前端保存后 `getGanttData` 全量重拉 | ~1–2s | 9k 行 roster 全量重建 |

`recomputeManday` 内部分解（28 条 SQL 共 ~760ms + Rust `ruletool` ~20ms + JS ~3.8s）：

- **JS 根因**：`manday-tool.ts` / `manday-blh-split.ts` / `zoned-time.ts` 的 `toLocalDate` / `offsetMinutes` **每次调用都 `new Intl.DateTimeFormat('en-CA',{timeZone})`**。场景 623 约 2 万次实例化 ≈ 1.8s（复用 formatter 仅 33ms，**53× 差距**）。
- **范围根因**：`applyScenarioRosterPatches` 调用 `recomputeManday(pool,{schema:'scenario',scenarioId})` **不传 crewIds**，导致一次删 DO 触发整个 scenario（148 机组 / 6647 每日行）全量重算。

设计目标：

1. **保存按钮点击后界面快速响应**——保存请求只应用变更 + 入队，立即返回。
2. **Manday / 法规 / KPI 重算全部异步**（Live 与 Scenario 两条链路一起改）。
3. **推送信号 + 定向刷新**——不再 `getGanttData` 全量重拉，不再轮询法规状态。
4. Live 与 Scenario 行为对齐。

## 2. 前置性能修复（工作区已完成，独立合入）

不依赖本次异步化，先落地（对异步 worker 同样受益）：

1. **Intl formatter 缓存**：`live-server/src/utils/zoned-time.ts` 新增 `localDateInZone` + 模块级 `cachedFormatter`（按 locale/zone/opts 缓存）；`manday-tool.ts`、`manday-blh-split.ts` 的 `toLocalDate` 改走该函数；`zoned-time.offsetMinutes` 复用缓存 formatter。输出逐字节不变（`en-CA` + `YYYY-MM-DD`）。
2. **范围重算**：`applyScenarioRosterPatches` 计算 `affectedCrewIds`（含 `reassign.toCrewId`）传给 `recomputeManday`。本次异步化后，这个 crewIds 集合直接作为 job payload。

## 3. 目标架构

### 3.1 异步基建：BullMQ worker（复用既有模式）

**manday 重算 → 新队列 `manday-recompute` + worker**（照 `workers/check-roster-worker.ts` 的 compute→`wsBroadcastAll` 模式）：

- Job payload：`{ schema: 'live' | 'scenario', scenarioId?: number, crewIds: string[], window?: { startDt: string; endDt: string } }`
- Worker 内调用现有 `recompute(pool, { schema, scenarioId, crewIds, startDt, endDt, updatedBy })`（范围重算，Intl 已缓存）
- 完成后 `fastify.wsBroadcastAll(schema, { type, crewIds })` 推送信号
- Worker 由 `workers/index.ts` 导出、live-server 启动时挂载（与既有 worker 一致）

**scenario KPI 重算 → 独立队列 `scenario-kpi-recompute` + worker**：

- Job payload：`{ scenarioId: number, strDtLoc, endDtLoc, filterParams, division, updatedBy }`
- 调用现有 `syncScenarioPairingKpisFromDb` 移入 worker；完成后推送 `scenario-kpi-updated` 信号
- 注：Live 没有「pairing 覆盖率 KPI」重算（Live draft 的「manday KPI」就是 manday 重算本身），故 KPI 异步化只涉及 scenario 的 `syncScenarioPairingKpisFromDb`

**法规重算 → 保持 detached 脚本**（不改为 worker，因能跨 live-server 重启存活、已有 FAILED 兜底）：

- Scenario：`scripts/scenario-legality.mjs`（现有）
- Live：`spawnLiveRecheck`（现有）
- 两者都在完成后新增**完成信号**（见 §3.4 推送机制）

### 3.2 保存流程（非阻塞）

**Live `draft.ts` commit**：

```
应用操作 → 计算 mandayMutationWindow → 入队 manday job → 入队(无 KPI) → spawn 法规 → 返回
```

- 删除现有同步 `await recomputeManday(...)`（保留 `mandayMutationWindow` 计算，作为 job window）
- `notifyRosterTasksChanged`（广播 `roster-updated`）保留——它负责 roster 变更的跨端刷新

**Scenario `scenario.ts` `POST /:id/patch-output`**：

```
校验 → 应用 patches（含 legality roster_version+1）→ 入队 manday job(crewIds) → 入队 KPI job → ensureLegality(spawn) → 返回 { patched }
```

- 删除现有同步 `await recomputeManday(...)` 与 `await syncScenarioPairingKpisFromDb(...)`
- `applyScenarioRosterPatches` 内改为**入队**（不再直接调 recompute）

### 3.3 WS 推送契约（信号 + 定向刷新）

复用现有 `/ws/locks` schema channel（`wsBroadcastAll`）。新增消息类型：

| 类型 | payload | 定向刷新动作 |
|------|---------|--------------|
| `manday-updated` | `{ crewIds }`（live） | `GET /api/crew/manday-daily?crewId=...` |
| `scenario-manday-updated` | `{ scenarioId, crewIds }` | `GET /api/scenario/:id/manday-daily?crewId=...` |
| `scenario-kpi-updated` | `{ scenarioId }` | `GET /api/scenario/:id/kpi` |
| `legality-updated` | `{ groupCode }`（live） | live legality status 端点 |
| `scenario-legality-updated` | `{ scenarioId }` | `GET /api/scenario/:id/legality` |

推送是**信号**（不带数据），前端收到后按现有 GET 端点定向刷新，与 Live `roster-updated` 一致。`getGanttData` 不再由保存触发。

### 3.4 detached 脚本 → live-server 推送的机制

detached 脚本（scenario-legality.mjs / live-legality 脚本）完成后**经 Redis pub/sub 发完成信号**，live-server 的 WS 插件订阅并转发——扩展现有 `websocket.ts` 的 `pSubscribe('violations:*', ...)` 模式：

- 脚本完成后 `PUBLISH scenario-recompute:{schema}:{scope}`（如 `scenario-legality:{scenarioId}`、`manday-recompute:{...}`）
- live-server WS 插件 `pSubscribe('scenario-recompute:*')` → 解析 schema/scope → `wsBroadcastAll(schema, { type: 'scenario-legality-updated' | 'scenario-manday-updated', scenarioId, crewIds })`
- 脚本的 Redis 连接串来自 `live-server/.env` 的 `REDIS_URL`（与读 DATABASE_URL 同源，§信息安全规范无明文密码）

> 备选（不采用）：脚本调 live-server 内部 HTTP 端点触发推送——引入新的认证/端口面，优先 Redis pub/sub。

### 3.5 前端

**Scenario gantt `save()`（`scenario-gantt-store.ts`）**：

```
patchOutput 成功 →
  1. 本地应用 patch 到 data（删除 ground item / assignment / reassign / add，见 scenario-roster-edit）
  2. 清 pendingChanges / redoStack，bump dataRevision
  3. 不再调用 getGanttData
```

- 订阅 WS（`wsClient.onMessage`）：收到 `scenario-manday-updated` → 定向刷新受影响机组 crewStats；`scenario-kpi-updated` → 刷新 KPI section；`scenario-legality-updated` → 刷新 legality status + violations
- 删除 `pollScenarioLegality` 轮询路径，改等推送（保留初次 mount 拉取）
- **Tier-1 乐观 RP Credit（对齐 Live）**：编辑时（addPatch）复用 `crewMandayDelta(baseItems, virtualItems, rp, rpItems)` 计算受影响机组 delta，叠加到 `data.crewStats` 显示；保存后权威值经 `scenario-manday-updated` 定向刷新替换。场景 items 由 `buildScenarioRosterItems` 产出（需确认 RosterItem 携带 `dutyActCreditedMinutes` 等 credit 字段——spec 假设成立，plan 阶段验证）

**Live `draft-store.ts` commit**：

- 保留本地应用 + `roster-updated` 定向刷新
- 保存后**不再立即** `crewStore.loadCrewStats`（manday 未就绪），改为等 `manday-updated` 推送再刷 crew stats
- 删除法规轮询，改等 `legality-updated` 推送

### 3.6 并发与去重

- `recompute()` 幂等（从当前 DB 状态重算）；同一机组重复 job 结果一致
- BullMQ 固定 `jobId`（如 `manday:{schema}:{crewId}` / `manday:scenario:{scenarioId}:{crewId}`），pending 未执行时重复入队被忽略，避免快速连存堆积
- 法规并发沿用现有 `pg_advisory_xact_lock` + `roster_version` 比较（`legality-status.ts`），无需新机制
- 推送幂等：前端按 `crewIds` / `scenarioId` 合并，重复推送无害

## 4. 数据流示例（场景删一个 DO）

```
用户右键删 DO → addPatch（乐观 delta 立即反映 RP Credit）
   → 点 Save → POST /patch-output
       ├─ 校验 + 软删 roster_flight（<100ms）
       ├─ 入队 manday job(crewIds=[该机组])、入队 KPI job
       ├─ ensureLegality spawn（detached）
       └─ 返回 { patched:1 }（~150ms，界面立即响应）
worker: recompute(该机组) → wsBroadcastAll {type:'scenario-manday-updated', scenarioId, crewIds}
   前端 → GET /api/scenario/:id/manday-daily → 更新 crewStats（乐观值被权威值替换）
legality 脚本完成 → Redis publish → WS 转发 {type:'scenario-legality-updated', scenarioId}
   前端 → GET /api/scenario/:id/legality → 更新 violations + status
KPI worker → wsBroadcastAll {type:'scenario-kpi-updated', scenarioId}
   前端 → GET /api/scenario/:id/kpi → 更新 KPI section
```

## 5. 错误处理

- worker 失败：BullMQ `attempts/backoff`（与既有队列一致）+ `worker.on('failed')` 记日志；manday 失败不影响已应用的 patch（数据已在库），前端 crewStats 保持乐观/旧值，下次重算或手动刷新兜底
- 法规失败：沿用现有 `legality_status=FAILED` + `error_text`，推送带 FAILED 状态信号，前端提示（复用现有 recheck 失败通知）
- WS 断线：`wsClient` 已有自动重连 + `roster-updated` 静默失败兜底；定向刷新失败 `catch` 后 `markDirty` 重绘

## 6. 测试

**后端（Vitest）**：

- `scenario-patch-service.test.ts`：patch-output 改为断言「入队 job 携带 crewIds」而非同步 recompute；更新 `applyScenarioRosterPatches` 用例
- `manday-recompute-worker` 单测：mock `recompute` + `wsBroadcastAll`，断言 job 处理正确、失败记日志
- `scenario-kpi-recompute-worker` 单测：mock `syncScenarioPairingKpisFromDb`，断言完成推送
- 既有 `manday-tool-scenario.test.ts` / `manday-blh-split.test.ts` / golden 测试必须继续通过（Intl 缓存输出不变）

**前端（Playwright，§Playwright-Required）**：

- 场景删 DO：断言任务消失（本地应用）、保存后不出现全量 loading、`scenario-manday-updated` 到达后 crewStats 更新（可用 WS mock 或真实后端）
- 法规推送：保存后 legality 状态随推送变为 COMPUTING→READY（不再依赖轮询断言）
- Live 对齐用例：保存后 manday 推送到达前旧值、到达后新值

**性能验收**：SIT 实测删除 DO 的 `patch-output` 响应 < 500ms（原 5–10s）；前端保存后无 `getGanttData` 请求。

## 7. 实施阶段（供 writing-plans 拆分）

1. **P0 前置合入**：Intl 缓存 + 范围重算（工作区已完成，补测试合入）
2. **P1 异步 worker**：`manday-recompute` 队列 + worker；live + scenario 保存入队替代同步 recompute
3. **P2 KPI 异步**：`scenario-kpi-recompute` worker；patch-output 去同步 KPI
4. **P3 推送机制**：WS 新消息类型 + detached 脚本完成信号（Redis pub/sub）+ 前端订阅
5. **P4 前端保存重构**：scenario save 本地应用 + 去 getGanttData + 乐观 delta；live draft 对齐 + 去轮询
