# PBS Bidding Calendar Pairing Number 按当前用户 Base 过滤设计

日期：2026-06-15  
状态：已确认，已实现  
范围：PBS Server `/bidding-calendar/current`；PBS Portal 左侧共享 `BIDDING CALENDAR`

## 背景

用户在 `/fpqe/pbs/pairing` 页面发现两个相关入口都和 Pairing Number 有关：

- 左侧共享 `BIDDING CALENDAR` 上的已保存 Pairing Number bid 事件，点击后展示 pairing bid detail。
- 右侧 `Pairing Number` 条件配置里的 autocomplete / occurrence 选择。

前一轮已经为 `/pairing-search` 系列接口接入当前用户 base：

- Pairing Number autocomplete：后端 `searchPairingIdOptions(...)` 已经使用 `actorBase`，SQL 中有 `p.base = $4::varchar`。
- Pairing Number occurrence：后端 `searchPairingOccurrences(...)` / `loadPairingOccurrences(...)` 已支持 `actorBase`，传入后会加 `p.base = :actorBase`。
- Pairing detail：后端 `getPairingDetails(...)` 也已经走 actor base 过滤。

但左侧 `BIDDING CALENDAR` 的 Pairing Number bid event 由 `/bidding-calendar/current` 生成。当前实现中：

- `loadPairingEvents(...)` 会读取已保存的 Pairing Number bid rows。
- 然后调用 `loadPairingOccurrences(...)` 去 live `pairing` 表补 occurrence 日期。
- 这里没有传 `actorBase`，因此会按保存的 pairing ids 直接找 live pairing，而不是按当前用户 base 再过滤。

这会导致一个口径不一致：右侧新增/搜索 Pairing Number 已按当前用户 base 过滤，但左侧日历渲染历史已保存 Pairing Number bid 时，仍可能展示非当前用户 base 的 pairing event。

## 目标

`/bidding-calendar/current` 生成左侧 `BIDDING CALENDAR` 的 Pairing Number bid event 时，必须按当前登录用户 base 过滤 live pairing occurrence。

具体目标：

- 复用当前用户 base 解析逻辑，优先取 `pbs_user.base`，缺失时回退 live `crew_base` 当前主基地。
- 左侧日历中的 `pairing_bid` event 只展示 `live.pairing.base = 当前用户base` 的 pairing occurrence。
- 如果已保存的 Pairing Number bid 指向其他 base 的 pairing，日历不展示该 pairing event。
- 点击日历 pairing event 后，detail popup 只基于已过滤后的 event metadata 发起详情查询。
- 右侧 Pairing Number autocomplete / occurrence / detail 现有 base 过滤不回退。

## 非目标

- 不改前端 URL、route、query string 或 UI 控件。
- 不让前端传 `base` 参数。
- 不新增用户可选 base 筛选器。
- 不修改已保存 bid 数据；本次只影响读取和展示。
- 不过滤 weekend、Prefer Off、planned absence 等非 Pairing Number event。
- 不改变 `SEARCH PAIRINGS`、pairing search preview、current rules counts 的现有逻辑。
- 不新增数据库字段或 migration。

## 当前实现观察

### 右侧 Pairing Number 已经正确过滤

文件：

- `pbs-server/src/services/pairing-search/pairing-search-service.ts`
- `pbs-server/src/services/pairing-search/actor-base.ts`
- `pbs-server/src/services/pairing-search/pairing-id-search-query.ts`
- `pbs-server/src/services/pairing-search/pairing-occurrence-query.ts`

当前路径：

1. route 调用 `buildActorFromRequest(request)`。
2. `pairing-search-service` 调用 `resolvePairingSearchActorBase(...)`。
3. `searchPairingIdOptions(...)` 查询 `live.pairing` 时加 `p.base = actorBase`。
4. `searchPairingOccurrences(...)` 通过 `loadPairingOccurrences(..., actorBase)` 加 base 过滤。

结论：右侧 Pairing Number 入口不需要前端改动。

### 左侧 Bidding Calendar 仍缺少 base 过滤

文件：

- `pbs-server/src/services/calendar/bidding-calendar-service.ts`
- `pbs-server/src/services/calendar/bidding-calendar-pairing-events.ts`

当前路径：

1. `/bidding-calendar/current` route 构造 actor。
2. `createPbsBiddingCalendarService(...).getCurrentCalendar(actor)` 加载当前 bid。
3. `loadPairingEvents(...)` 调 `loadSpecificPairingBidRows(...)` 找到已保存的 Pairing Number bid。
4. `loadPairingEvents(...)` 调 `loadPairingOccurrences(...)`：

```ts
const occurrencesByPairingId = await loadPairingOccurrences({
  pgPool,
  schema,
  pairingIds: requestedPairingIds,
  periodCode,
});
```

这里没有传 `actorBase`，所以 `loadPairingOccurrences(...)` 内部的 `actorBaseFilter` 不会生效。

## 方案选择

### 方案 A：在 Bidding Calendar 服务复用 actor base resolver（推荐）

为 `createPbsBiddingCalendarService(...)` 增加 `pbsSchema` 配置，复用现有 actor base 解析逻辑。

数据流：

1. `app.ts` 创建 `biddingCalendarService` 时传入：
   - `liveSchema: env.PBS_SCHEMA.replace(/_pbs$/i, "")`
   - `pbsSchema: env.PBS_SCHEMA`
2. `getCurrentCalendar(actor)` 在需要加载 Pairing Number bid event 时解析当前 actor base。
3. `loadPairingEvents(...)` 把 `actorBase` 传给 `loadPairingOccurrences(...)`。
4. `loadPairingOccurrences(...)` 用已有 `actorBaseFilter` 加 `p.base = :actorBase`。

优点：

- 复用已验证的 base 解析逻辑。
- 不需要前端传 base，安全边界留在后端。
- 不改 API contract。
- 和右侧 Pairing Number 搜索保持同一口径。

注意：

- 当前 resolver 文件名在 `pairing-search/actor-base.ts`，如果直接复用会出现 calendar 依赖 pairing-search 命名的问题。
- 实现时可以先复用现有 resolver，保持改动小；后续如继续有更多模块需要 actor base，再单独抽到中性目录，例如 `services/actor-base/actor-base.ts`。

### 方案 B：在 Bidding Calendar 内重复写一份 actor base 查询

优点：

- 文件依赖看起来更局部。

问题：

- 会复制 `pbs_user.base -> crew_base` fallback 规则。
- 未来 base 解析规则变化时容易漏改。
- 不符合项目“相似逻辑必须复用”的要求。

### 方案 C：只依赖保存 Pairing Number 时已经按 base 过滤

问题：

- 不能处理历史数据、导入数据、测试数据或旧版本保存的数据。
- 读取展示侧仍可能泄漏非当前 base pairing。
- 不能解决用户现在看到的左侧日历口径问题。

## 推荐设计

采用方案 A。

后端在 `/bidding-calendar/current` 生成 `pairing_bid` event 时，使用当前 actor base 过滤 live pairing occurrence。前端不新增参数、不新增 UI、不做本地过滤。

## 服务设计

### `createPbsBiddingCalendarService` options

增加 `pbsSchema`：

```ts
type CreatePbsBiddingCalendarServiceOptions = {
  db: Database;
  pgPool: Pool;
  liveSchema: string;
  pbsSchema: string;
};
```

并对 `pbsSchema` 做和 `liveSchema` 一样的 SQL identifier 校验。

### `app.ts` 装配

当前：

```ts
server.decorate("biddingCalendarService", createPbsBiddingCalendarService({
  db: server.db,
  pgPool: server.pgPool,
  liveSchema: env.PBS_SCHEMA.replace(/_pbs$/i, ""),
}));
```

改为：

```ts
server.decorate("biddingCalendarService", createPbsBiddingCalendarService({
  db: server.db,
  pgPool: server.pgPool,
  liveSchema: env.PBS_SCHEMA.replace(/_pbs$/i, ""),
  pbsSchema: env.PBS_SCHEMA,
}));
```

### `loadPairingEvents`

增加 actor base 输入：

```ts
const loadPairingEvents = async (
  db,
  pgPool,
  schema,
  bidId,
  periodCode,
  dayOffDatesByTier,
  actorBase,
) => {
  ...
  const occurrencesByPairingId = await loadPairingOccurrences({
    pgPool,
    schema,
    pairingIds: requestedPairingIds,
    periodCode,
    actorBase,
  });
}
```

为了避免没有 Pairing Number bid 时也额外查 base，可以在 `loadPairingEvents(...)` 读取 `requestedPairingIds` 后再决定是否解析 actor base：

- `requestedPairingIds.length === 0`：直接返回空 pairing events，不解析 base。
- `requestedPairingIds.length > 0`：解析 actor base，再查 occurrences。

### 错误处理

如果 actor base 无法解析：

- 不允许退回无 base 过滤。
- 不展示 pairing bid event。
- 保持现有 calendar 容错口径：`loadPairingEvents(...)` 失败时返回空 pairing events，并附加 warning。

建议 warning：

```text
Specific pairing bids could not be loaded because current user base is not available.
```

如果实现为了保持改动更小，也可以复用现有 generic warning：

```text
Specific pairing bids could not be loaded from live pairing data.
```

但不能无过滤地继续展示 pairing events。

## 数据流

```text
GET /bidding-calendar/current
  -> buildActorFromRequest(request)
  -> getCurrentCalendar(actor)
  -> loadExistingBid(actor, period)
  -> loadPreferOffCalendarRows(existingBid.id)
  -> loadSpecificPairingBidRows(existingBid.id)
  -> resolve actor base
  -> loadPairingOccurrences(pairingIds, periodCode, actorBase)
  -> live.pairing where base = actorBase
  -> buildPairingEvents(...)
  -> return calendar events
```

## 验收标准

- 当前用户 base 为 `YYZ` 时，左侧 `BIDDING CALENDAR` 只展示 live `pairing.base = YYZ` 的 Pairing Number bid event。
- 已保存 bid 中如果包含其他 base 的 pairing id，该 pairing 不出现在日历上。
- 被过滤掉的 pairing 不会出现在日历 event metadata，也不会被点击弹窗拿去查 detail。
- 没有 Pairing Number bid 时，不因为 actor base 缺失影响 weekend / Prefer Off / planned absence 日历展示。
- actor base 缺失时，不退回无过滤展示 pairing event。
- 右侧 Pairing Number autocomplete / occurrence / detail 行为不回退。

## 测试计划

### 后端单元测试

更新或新增 `pbs-server/src/services/calendar/bidding-calendar-service.test.ts`：

- 覆盖 `loadPairingEvents` / `getCurrentCalendar` 调用 `loadPairingOccurrences` 时传入 `actorBase`。
- 模拟当前 actor base 为 `YYZ`，live pairing occurrence query 必须包含 `p.base = ...` 并带 `YYZ` 参数。
- 模拟一个已保存 Pairing Number bid 指向非当前 base pairing，结果 events 为空或该 pairing 被加入 missing/skipped 口径。
- 模拟没有 Pairing Number bid 时，不解析 actor base、不因为 base 缺失导致 calendar 失败。

更新或补充现有 pairing occurrence 测试：

- 确认 `loadPairingOccurrences(..., actorBase)` 已经生成 `p.base = :actorBase`。
- 确认不传 `actorBase` 的兼容路径只保留给内部明确允许的调用；Bidding Calendar 不再使用无 base 路径。

### 后端 route 测试

更新 `pbs-server/src/routes/bidding-calendar.test.ts` 或新增 service-level 测试：

- route 继续用 `buildActorFromRequest(request)` 调 service。
- 如果 service 因 base 缺失返回 warning，route 仍按统一响应格式返回。

### 前端测试

原则上不需要改前端代码。

如果需要补前端回归，可在现有 calendar fixture 中验证：

- 前端只渲染后端返回的 filtered `pairing_bid` event。
- 点击 event 后 detail targets 来自 event metadata，不会自行补回被后端过滤的 pairing。

### 验证命令

```bash
cd pbs-server
npm test -- --run src/services/calendar/bidding-calendar-service.test.ts src/services/pairing-search/pairing-search-service.test.ts
npm test -- --run src/routes/bidding-calendar.test.ts
npm run build
```

如实现触及前端 fixture 或共享 calendar mapper，再额外运行：

```bash
cd pbs-portal
npm test -- --run src/features/dashboard/bidding-calendar-mappers.test.tsx src/features/dashboard/pairing-calendar-detail.test.ts
npm run build
```

## 风险与注意事项

- 历史保存的 Pairing Number bid 如果包含其他 base pairing，修复后会从左侧日历消失。这是预期行为，因为这些 pairing 对当前用户没有意义。
- 如果当前用户 base 资料缺失，Pairing Number bid event 会被隐藏并给 warning；这比无过滤展示更安全。
- `loadPairingOccurrences(...)` 目前仍保留 `actorBase?: string` 的可选参数。本次只要求 Bidding Calendar 调用时必须传 base；是否后续把参数改成必填，可以单独评估。
- 如果多个 PBS 模块未来都需要 actor base，应把 resolver 从 `pairing-search/actor-base.ts` 提升为中性共享 helper，避免跨服务命名混乱。

## 实现结果

- `createPbsBiddingCalendarService(...)` 增加 `pbsSchema` 注入，并在 `app.ts` 装配时传入 `env.PBS_SCHEMA`。
- Bidding Calendar 复用 `resolvePairingSearchActorBase(...)` 解析当前 actor base。
- `loadPairingEvents(...)` 在存在 saved Pairing Number ids 时解析 actor base，并把 `actorBase` 传给 `loadPairingOccurrences(...)`。
- `loadPairingOccurrences(...)` 复用既有 `actorBaseFilter`，因此 live pairing 查询会增加 `p.base = :actorBase`。
- 没有 saved Pairing Number ids 时不解析 actor base，也不查询 live pairing occurrences。
- 前端没有改动，API contract 没有改动。
- 后端单测新增覆盖：
  - saved Pairing Number bid event 查询 live occurrence 时带 `p.base = $4::varchar` 和当前 base 参数。
  - 没有 saved pairing ids 时不解析 actor base。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是后端局部行为修正，主要集中在 `bidding-calendar-service` 调用链和对应测试；拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server/src/services/calendar/`、`pbs-server/src/app.ts`、必要时 `pbs-server/src/services/pairing-search/actor-base.ts` 或共享 helper、后端测试；通常不需要改 `pbs-portal`。
- Conflict risk: 中低。需要注意不要回退刚完成的 pairing-search actor base 过滤。
- Execution gate: 用户确认本 spec 后再进入实现。
