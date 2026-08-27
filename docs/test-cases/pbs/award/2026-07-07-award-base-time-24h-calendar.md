# PBS Award Base Time + 横向 24h 跨日条 QA

## 目标

验证 Award 页面使用机组 base local time 展示 roster，并且月历按横向 24 小时时间比例渲染 duty / day off / activity。每个日期格子的横向宽度代表当天 `00:00-24:00`，event 横条按真实起止时间跨日期显示，避免同一天既有飞行又有休息时被误读为全日重叠。

## 范围

- 页面：PBS Portal `/pbs/award`
- 后端：`GET /api/award/current`
- 数据：已发布 award roster，包含跨 UTC 日期的 pairing、day off、activity

## 前置条件

- pbs-server 与 pbs-portal 正常启动。
- 当前登录用户有已发布的 Award 数据。
- 用户 base 在 `airport` 表中有可解析的 IANA timezone。

## 测试用例

### 1. 页面显示 base local time 标识

1. 登录 PBS Portal。
2. 打开 Award 页面。
3. 查看 `Roster Details` 标题区域。

预期：
- 页面显示类似 `YYZ Local Time` / `YVR Local Time` 的时间标识。
- Period、Roster Details、Selected Duty 中的日期时间都按同一 base local time 解释。

### 2. 同一天飞行 + Day Off 不再被误读为整天冲突

1. 选择一个跨 UTC 日期但 base local 仍落在同一天的 pairing。
2. 查看月历中该 pairing 的蓝色段条。
3. 查看同一天附近的 Day Off 绿色段条。

预期：
- 蓝色 pairing 横条按实际 start/end time 占据日期格子的横向对应位置。
- 如果 pairing 跨 base-local 日期且仍在同一周，横条横向跨过多个日期格。
- Day Off 不再强制显示为 `00:00 - 23:59`，而是显示后端返回的真实 base-local 起止时间。
- 如果 pairing 与 Day Off 真实时间没有交叠，不应产生视觉上的整天重叠误导。

### 3. Selected Duty 使用后端真实时间

1. 在 `Roster Details` 中点击 pairing 行。
2. 查看 `Selected Duty` 卡片的 `DATE`、`TIME`、legs。
3. 点击 Day Off 行。

预期：
- Pairing 的 `TIME` 与 legs 起降时间均为 base local time。
- Day Off 的 `TIME` 使用真实 `startTime - endTime`，不再由前端伪造全天范围。

### 4. 时间段重叠可识别

1. 使用测试数据或 mock 数据制造两个同一天相互重叠的 calendar event。
2. 打开 Award 页面。

预期：
- 横向重叠的条会分 lane 显示，不互相完全遮挡。
- 真实时间重叠的条有冲突视觉标识。

### 5. 次日 00:00 终点不生成空条

1. 使用一个 `start=Jun 03 00:01`、`end=Jun 04 00:00` 的 Day Off。
2. 打开 Award 页面。

预期：
- 绿色横条从 Jun 03 日期格左侧稍后位置开始。
- 横条终点停在 Jun 04 日期格左边界。
- Jun 04 不生成额外 0 宽度空段。

## 回归关注

- 页面不应出现横向滚动条。
- `Award Calendar` 不应挤压或覆盖右侧 `Roster Details`。
- 跨午夜 duty 到次日 `00:00` 时，不应在次日生成空段。
