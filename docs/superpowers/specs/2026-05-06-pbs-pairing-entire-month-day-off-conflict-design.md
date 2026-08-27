# PBS Pairing Entire Month 与 Days Off 冲突规则设计

日期：2026-05-06  
作者：Codex  
状态：待用户 review，未实施

## 背景

PBS Portal 当前已经支持：

- 在 `Pairing` 页面通过 `Pairing Number` 添加 `Entire Month` 或 `Specific Date` bid。
- 在左侧 `BIDDING CALENDAR` 展示蓝色 `pairing_bid` 与绿色 `day_off_bid`。
- 在 `Days Off` 页面点击日历格子添加或删除 specific day-off bid。

现在发现两个业务语义缺口：

1. `Pairing Number - Entire Month` 展开时没有排除同 `Tx` 已经设置的 `Off`，导致用户不想飞的休息日仍可能显示 pairing。
2. `Days Off` 页面在某个日期格已经有 pairing 时，仍允许加 `Off`，这会产生同一 `Tx` 同一天既想飞又想休息的冲突。

本项目术语统一使用 `Tier / Tx`。AA 原文中的 `Layer / Lx` 在本项目中对应 `Tier / Tx`，不得进入代码和 UI。

## 目标

1. `Entire Month` pairing bid 展开日历事件时，自动排除与同 `Tx` day-off bid 冲突的 occurrence。
2. `Days Off` 页面添加 `Off` 时，禁止给同 `Tx` 已有 pairing bid 覆盖的日期加 `Off`。
3. 前端给出明确 disabled / message 反馈，避免用户点保存后才迷糊。
4. 后端保存接口也做校验，避免绕过前端写出冲突数据。
5. 保持现有代码风格：复用当前日历 service、draft mapper、query invalidation，不引入大而散的新状态。

## 不做范围

- 不实现 `Specific Date pairing override existing Off` 的完整语义。
- 不实现 planned absence 橙色不可点。
- 不实现 `View Pairing Set` 最终 pairing pool。
- 不新增数据库表或字段。
- 不把跨月 carry-out 信息重新显示到左侧日历。

## 业务规则

### 1. Entire Month 排除 Day Off

对于 `Pairing Number - Entire Month`：

- 后端先按现有逻辑查出该 pairing number 在当前 bid period 内的所有 occurrence。
- 再按同一 bid、同一 `Tx` 读取 `pbs_bid_day_off`。
- 如果 occurrence 的日期范围 `[startDate, endDate]` 中任意一天命中同 `Tx` 的 day-off date，则该 occurrence 从 `pairing_bid` 日历事件中排除。

示例：

```text
T1 Off: 2026-04-05
M4959 occurrence: 2026-04-04 - 2026-04-06
结果：T1 不展示这条 Entire Month occurrence
```

`Specific Date` 本轮不自动排除。它属于用户显式选择某一次 pairing 的动作，后续要单独设计是否允许 override existing Off。

### 2. Days Off 禁止覆盖已有 Pairing

在 `Days Off` 页面保存 day-off draft 时：

- 如果目标 `date + Tx` 已有 `pairing_bid` 覆盖该日期，则该 `Tx` 不允许新增 `Off`。
- 判断 pairing 覆盖时使用 `startDate <= date <= endDate`。
- 已存在的 day off 仍允许取消勾选，也就是“删除 Off”不应被 pairing 冲突阻止。

示例：

```text
T1 pairing: 2026-04-04 - 2026-04-06
用户点 2026-04-05
结果：T1 不能加 Off；T2 如果无 pairing 仍可加 Off
```

### 3. 星期头批量操作

`Days Off` 页面点星期头批量编辑时同样适用冲突规则：

- 对每个 `date + Tx` 独立判断。
- 可保存的无冲突项正常保存。
- 有冲突的 `date + Tx` 不写入，并在弹窗或保存前提示冲突数量。
- 如果本次操作所有目标都冲突，则 `SAVE BID` 禁用。

## 后端设计

### `bidding-calendar-service`

当前 `buildPairingEvents(bidRows, occurrencesByPairingId)` 只接收 pairing bid rows 和 occurrence map。

计划增加一个轻量 day-off 冲突输入，例如：

```ts
type DayOffDatesByTier = Map<number, Set<string>>;
```

`loadPairingEvents` 在同一 bid 内加载 pairing rows 时，同时读取 `pbs_bid_day_off` 并构造 `DayOffDatesByTier`。

`buildPairingEvents` 处理 `Entire Month` 时：

- 对每个 occurrence 枚举 `startDate` 到 `endDate`。
- 如果任意日期在 `dayOffDatesByTier.get(row.tier)` 中存在，则跳过该 occurrence。
- `Specific Date` 保持当前显示语义不变。

性能要求：

- 读取 day-off dates 只按当前 `bidId` 一次查询。
- occurrence 已经是按当前 bid 的 pairing numbers 批量查询，不能退回 N+1。
- 日期范围枚举只在当前 occurrence 覆盖天数内执行，通常很小。

### `calendar-days-off-service`

`saveCurrentDraft` 当前会整批替换 `pbs_bid_day_off`。

计划在事务内、写入前做冲突校验：

1. 根据 normalized draft 取出所有待保存的 `date + Tx`。
2. 查询当前 bid 中 pairing bid rows，并复用 occurrence 查询能力获取对应 occurrences。
3. 只检查会新增或保留为 `Off` 的目标。
4. 如果发现同 `Tx` pairing 覆盖目标日期，抛出 `LineholderBidServiceError(409, "...")`。

错误语义建议：

```text
Cannot add day off because T1 has a pairing bid on 2026-04-05.
```

如果存在多个冲突，返回一条压缩 message，避免把 UI 撑乱：

```text
Cannot add day off because 3 selected tier/date entries have pairing bids.
```

## 前端设计

### 冲突索引

`DashboardSchedulePanel` 已经持有综合日历 `serverBiddingCalendar` 和当前 `activeTierLabel`。

新增一个 memoized helper，从 `serverBiddingCalendar.events` 里构造冲突索引：

```ts
Map<string, Set<string>>
// key: isoDate
// value: tiers that have pairing_bid covering this date
```

仅处理：

- `event.type === "pairing_bid"`
- `event.tier` 存在
- `startDate/endDate` 有效

### Days Off 单日弹窗

打开 `Days Off` 日期弹窗时：

- 默认选中的 `Tx` 仍沿用当前规则：如果已有 Off，则显示已有 tiers；否则默认当前 active `Tx` 到 `T7`。
- 如果某个 `Tx` 在该日期已有 pairing，则该 checkbox disabled。
- 如果默认选中里包含冲突 `Tx`，打开时自动移除冲突项，并显示提示。
- `SAVE BID` 只在存在至少一个可保存变化时可用。

### Days Off 星期头批量弹窗

批量弹窗继续复用同一弹窗形态：

- checkbox 仍表示要应用到哪些 `Tx`。
- 保存时只写入无冲突的 `date + Tx`。
- 弹窗中显示简短提示，例如 `2 entries blocked by pairing bids.`。
- 如果所有目标都被 blocked，禁用 `SAVE BID`。

### 保存失败反馈

即使前端已经过滤，后端仍可能因为数据刷新或并发变化返回 409。

前端需要：

- 显示 `message.error(...)`。
- 保留现有内联错误区域。
- invalidate `biddingCalendarQueryKey` 与 `calendarDaysOffDraftQueryKey`，让 UI 回到最新服务端状态。

## 测试计划

后端：

- `buildPairingEvents`：Entire Month occurrence touch same-Tx Off 时被过滤。
- `buildPairingEvents`：Entire Month occurrence touch other-Tx Off 时不受影响。
- `buildPairingEvents`：Specific Date 不因 Off 自动过滤。
- `calendar-days-off-service`：保存同 `date + Tx` 与 pairing 冲突的 Off 返回 409。
- `calendar-days-off-service`：删除 Off 不因 pairing 冲突失败。

前端：

- Days Off 页面点已有 pairing 覆盖的日期时，对应 `Tx` checkbox disabled。
- 有可用 `Tx` 时仍能保存无冲突的 Off。
- 所有目标都冲突时 `SAVE BID` disabled。
- 后端保存冲突失败时显示 message 和 inline error。

回归：

- Pairing 页面日历点击添加 pairing bid 不受影响。
- Pairing blue event 详情保存 Tx 不受影响。
- Days Off 原有点日期加删 Off、Clear、Cancel 操作习惯不变。

## 验收标准

1. T1 有 Off 时，T1 的 `Entire Month` pairing 不再显示 touch 该 Off 的 occurrence。
2. T2 没有 Off 时，同一 occurrence 仍可在 T2 显示。
3. Days Off 页面不能给已有 pairing 覆盖的同 `Tx` 日期新增 Off。
4. 用户能看到明确提示，不会静默失败。
5. 不新增 schema / migration。
6. `pbs-server` targeted tests、`pbs-portal` targeted tests、lint/build 或根目录 `npm run verify:pbs` 通过。
