# PBS 左侧日历 Pairing Event 详情设计

日期：2026-05-01  
作者：Codex  
状态：已确认，已实施

## 背景

上一阶段已经完成 `Pairing Number / Pairing ID` 的 occurrence bid 第一阶段：

- `Entire Month` 会把当前 bid period 内同一个 pairing number 的全部运行 occurrence 加入 bid。
- `Specific Date` 只会加入用户选择的那一次 occurrence。
- 左侧 `BIDDING CALENDAR` 已经能把这些 pairing bid 展示成蓝色 event。

现在缺口是：蓝色 pairing event 只显示在日历上，用户不能点击查看这条 event 对应的是哪一个 pairing、哪一天运行、属于哪个 `Tx`、是 `Entire Month` 还是 `Specific Date`。

## 目标

1. 用户点击左侧 `BIDDING CALENDAR` 中的蓝色 `pairing_bid` event，可以打开一个只读详情弹窗。
2. 弹窗展示这条 pairing event 的基础信息：
   - `Tier`
   - `Pairing Number`
   - `Pairing ID`
   - `Origin Date`
   - `Date Range`
   - `Mode`：`Entire Month` 或 `Specific Date`
3. 不请求新的详情接口，不展示完整 legs，不做编辑、删除或改 Tier。
4. 保持左侧日历当前 Days Off 操作不被破坏：绿色 `Off` 的日期/星期头编辑仍走现有逻辑。
5. 代码要顺着当前共享日历和 mapper 的写法扩展，避免把 PBS 业务细节硬塞进纯 UI 组件。

## 不做范围

- 不做 pairing event 删除。
- 不做 pairing event 改 `Tx`。
- 不做点击后查询完整 pairing legs。
- 不做 Days Off 与 Pairing 的冲突/override 规则。
- 不做 planned absence 禁用或橙色冲突逻辑。
- 不改变后端日历接口契约。

## 方案对比

### 方案 A：前端 mapper 保留原始 calendar event，日历组件暴露点击回调

在 `buildDashboardScheduleDataFromBiddingCalendar` 的 mapper 中，把后端返回的 `PbsBiddingCalendarEvent` 关键字段保留到 `ScheduleCalendarEvent` 上。`ScheduleEventCalendar` 只知道自己有一个可点击 event 和 `onEventSelect` 回调，不理解 pairing 业务。

优点：

- 不需要新增 API。
- 日历共享组件仍然保持通用，只负责点击事件和基础渲染。
- 后续 `planned_absence` 或其他 event 要弹详情，也可以复用同一条链路。
- 测试边界清楚：mapper 测数据保留，日历组件测点击，业务面板测弹窗内容。

缺点：

- `ScheduleCalendarEvent` 类型会变宽一点，需要谨慎命名，避免它变成业务大杂烩。

### 方案 B：点击时按 label/date 回查后端

用户点击日历蓝条后，用 `pairingNumber + date` 调接口查详情。

优点：

- 可以拿到更完整的实时信息。

缺点：

- 当前只读详情不需要新接口。
- 增加请求链路、loading、失败态和缓存维护。
- 对第一阶段来说成本偏高，容易把 legs 详情和编辑能力提前卷进来。

### 方案 C：只在 DOM 上拼接展示文本，不保留结构化 event

在渲染蓝条时用 label、日期范围拼一个 title 或简单 tooltip。

优点：

- 改动最小。

缺点：

- 信息太少，无法可靠展示 `Tier / Pairing ID / Origin Date / Mode`。
- 不利于后续删除、改 Tier、详情升级。
- 容易把展示字符串当数据源，维护成本高。

## 推荐方案

采用方案 A。

这一步只打通“日历 event 可以被选中，并能读取原始事件信息”的基础能力。业务弹窗放在 `DashboardSchedulePanel` 附近，纯日历组件不直接认识 PBS pairing。

## 数据流

1. `pbs-server` 的 `bidding-calendar-service` 已经在 `pairing_bid.metadata` 中返回：
   - `propertyGroupKey`
   - `groupSeq`
   - `pairingNumber`
   - `pairingId`
   - `requestedPairingId`
   - `originDate`
   - `occurrenceMode`
   - `actionId`
2. `pbs-portal` 的 `buildDashboardScheduleDataFromBiddingCalendar` 负责把后端 event 分段渲染成 `ScheduleCalendarEvent`。
3. mapper 在生成每个可视 segment 时保留一个结构化 `sourceEvent` 或等价字段。
4. `ScheduleEventCalendar` 增加 `onEventSelect?: (event) => void`。
5. 用户点击蓝色 event 后，`DashboardSchedulePanel` 判断 `event.sourceEvent.type === "pairing_bid"`，打开只读详情弹窗。
6. 弹窗关闭后不触发任何保存，也不刷新 query。

## UI 设计

详情弹窗采用当前 PBS Portal 面板风格：

- 标题：`Pairing Bid`
- 主标题或醒目信息：pairing number，例如 `M4959`
- 字段列表：
  - `Tier`：例如 `T1`
  - `Pairing ID`：metadata 中的 `pairingId`
  - `Origin Date`：metadata 中的 `originDate`
  - `Date Range`：event 的 `startDate - endDate`
  - `Mode`：`occurrenceMode === "specific_date"` 显示 `Specific Date`，否则显示 `Entire Month`
- 底部只有 `Close`，不出现 `Save`、`Delete` 或 `Edit`。

如果 metadata 缺字段，弹窗仍打开，但缺失字段显示 `-`，避免前端崩溃。

## 交互规则

- 只有 `pairing_bid` event 点击后打开详情。
- 绿色 `Off` event 第一阶段不新增点击详情，避免和当前日期编辑操作打架。
- 可点击 event 应有 `cursor-pointer` 和可访问名称，例如 `View pairing bid M4959`。
- 日历 cell 的 day-off 编辑 overlay 仍可工作。
- event 横跨多天或跨周被拆成 segment 时，点击任意 segment 都展示同一条原始 event 信息。

## 测试计划

前端：

1. `bidding-calendar-mappers.test.ts`
   - 确认 `pairing_bid` 映射后的 calendar event 保留原始 `id/type/tier/startDate/endDate/metadata`。
2. `schedule-event-calendar.test.tsx`
   - 传入 `onEventSelect` 时，event 渲染为可点击元素并调用回调。
   - 未传 `onEventSelect` 时，保持只读展示。
3. `shared-bidding-workbench-layout.test.tsx` 或 `dashboard-schedule-panel` 相关测试
   - 点击蓝色 `M4959` 后展示 `Pairing Number / Pairing ID / Origin Date / Mode`。
   - 绿色 `Off` 的现有 day-off 操作不受影响。

验证：

- 优先跑相关单测。
- 完成后跑 `npm run verify:pbs`。

## 验收标准

1. 左侧 `BIDDING CALENDAR` 中蓝色 pairing event 可以点击。
2. 点击后弹出只读详情，能看到 `Tier / Pairing Number / Pairing ID / Origin Date / Date Range / Mode`。
3. `Entire Month` 与 `Specific Date` 显示语义正确。
4. 不新增后端 API，不改数据库，不改 pairing 保存语义。
5. Days Off 日期编辑和星期头编辑不回归。
6. PBS 相关测试和 `npm run verify:pbs` 通过。
