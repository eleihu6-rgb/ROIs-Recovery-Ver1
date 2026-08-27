# Live / Scenario Gantt 实时数据同步规范

> 状态：架构约束  
> 适用范围：`gantt/` 的 Live Gantt、Scenario Gantt，以及为其提供数据的 WebSocket 通道。

## 1. 核心规则

- 首次打开 Gantt、切换 Live/Scenario、切换日期/RP/服务端筛选时，允许通过 HTTP/数据库建立基线。
- 基线建立后，**任务新增、任务更新、任务删除**必须通过 WebSocket 推送增量数据；适用对象包括 `roster_flight`、`pairing`、`pairing_segment`、ground task 及其派生的 fill、MCred、违规状态。
- WebSocket 消息必须直接更新前端 store；禁止因单个任务变化重新查询全量 Roster、Pairing 或 crew。
- 只有断线后发现消息丢失、版本不连续、上下文不匹配，或消息缺少结构变化所需数据时，才允许按受影响实体定向 reload；禁止默认全量 reload。

## 2. WebSocket 增量消息

```ts
interface GanttDataUpdateMessage {
  type:
    | 'roster-updated'
    | 'pairing-updated'
    | 'crew-stats-updated'
    | 'violations-updated'
    | 'scenario-updated'
  context: 'live' | { scenarioId: number }
  entityIds: number[] | string[]
  version: number
  payload: unknown
}
```

要求：

- `payload` 必须包含前端应用变化所需的数据，避免收到消息后再次查询数据库。
- 消息按 `version` 幂等处理，旧消息不能覆盖新状态。
- 应用顺序为：更新 authoritative/base store → 计算 draft delta → 更新派生 store → `markDirty()` 触发 Canvas 重绘。
- 消息只更新当前 Gantt 已加载的实体，不得为首屏之外的数据制造全量加载。
- 服务端在事务及派生聚合计算完成后广播，确保 `fill`、MCred 和违规状态来自同一提交版本。

## 3. Pairing header fill

1. 初始 Pairing 查询提供服务端 authoritative `composition.fill`。
2. 未保存 roster draft 通过 `displayed roster - base roster` 计算增量并叠加到 authoritative fill。
3. 保存成功后，将当前显示的 fill 提升为本地 authoritative baseline，不重新拉取 Pairing 列表。
4. 其他用户保存后，通过 WebSocket payload 更新受影响 pairing 的 fill。
5. 只有消息缺失、版本不连续、上下文不匹配，或结构变化消息缺少足够 payload 时，才允许受影响实体定向重新加载，不能默认全量刷新。

fill 必须按 `pairingId + rank + crewId` 去重。一个 pairing 展开的多个 segment 只能计为一个 crew 的填充，不能按 segment 行数累加。

## 4. Live 与 Scenario

- **Live**：roster draft、保存结果、跨用户 roster 更新通过同一套增量应用路径刷新 Pairing fill、Roster 行和相关统计。
- **Scenario**：Scenario patch、优化结果回写和协作更新必须通过 `scenarioId` 隔离的消息上下文更新对应 Scenario store，不得污染 Live 或其他 Scenario。
- 共享 Pane 只消费 source/store 的最新状态，不直接发起数据库查询。

## 5. 断线与异常

WebSocket 断线时保留当前显示数据并标记同步状态。重连后校验 `context`、`version` 和服务端 snapshot/version；只有版本不连续或无法补齐消息时，才重建当前查询上下文的基线。任何 fallback reload 都必须记录原因、上下文和实体范围。

## 6. 验证要求

至少验证：首次打开加载基线；roster assign/remove 未保存时 fill 立即变化；Save 后 fill 正确且不触发全量 Pairing reload；Undo/Redo 可恢复 fill；WebSocket 更新另一用户 roster 时只更新受影响数据；旧消息、重复消息和断线重连不会回退 fill；Playwright 网络断言确认增量场景没有全量 Pairing 查询。
