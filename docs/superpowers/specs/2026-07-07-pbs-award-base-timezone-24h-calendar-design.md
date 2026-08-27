# PBS Award Base 时区与横向 24h 跨日条设计

日期：2026-07-07
作者：Codex
状态：已按用户二次反馈修正 UI 口径，待用户确认后实施
范围：PBS Award 页面与 Award API；统一按 crew base local time 展示，并将 Award 月历改为横向 24h 时间比例跨日条布局。

## 纠正说明

上一版 spec 把 24 小时比例理解成“每个日期格子内的纵向时间轴”。这是错误方向。

用户确认的目标是：月历仍保持原来的横向日期网格，每个日期格子的横向宽度代表当天 `00:00 -> 24:00`，event 用横条按起止时间在周行内横向定位和跨日显示。用户截图只表达“横向按时间比例跨日”的方向，不代表要改成空心描边或细线 UI。

二次反馈明确：Award 月历的视觉样式必须继续接近原来的实心事件块 UI。也就是 `Off / T4520 / VAC` 仍应是原来的填充色横块、白色居中文案、稳定高度和轻微圆角；本轮只改变横块的起止位置和跨日长度，不改变成线框风格。

## 背景

Award 页面当前直接使用 `roster_publish` 的 UTC 语义时间生成 `pairing / day_off / activity`，再由前端按日期范围把事件铺到整天格子里。这样会让跨 UTC 午夜的 pairing 和次日 day off 看起来像同一天同时发生。

以 Mary Nasso 的 `Jun 2026` Award 截图为例，源数据实际是：

| 类型 | UTC 源数据 |
| --- | --- |
| `T4520` | `2026-06-02 13:51` - `2026-06-03 00:49` |
| `GDO` | `2026-06-03 04:01` - `2026-06-04 04:00` |

如果按 `YYZ` base local time（`America/Toronto`，6 月为 UTC-4）展示：

| 类型 | YYZ Local Time |
| --- | --- |
| `T4520` | `2026-06-02 09:51` - `2026-06-02 20:49` |
| `GDO` | `2026-06-03 00:01` - `2026-06-04 00:00` |

也就是说，Mary 并没有在同一时间又休息又飞行；问题来自页面的时间口径和视觉模型：

1. 日历按 UTC 日期范围铺整天事件，跨 UTC 午夜的 pairing 被画到次日。
2. Day off 在后端被压成 `startTime: null`，前端把 null 显示为 `00:00`，丢掉了真实 `04:01 UTC / 00:01 YYZ`。
3. 当前日历格子只表达“这一天有事件”，不能表达事件在一天内从几点开始、到几点结束。

## 目标

1. Award 页面所有日期和时间统一按当前 crew 的 base local time 展示。
2. 后端负责把 live schema 的 `*_utc` 时间按 UTC 语义读对，再转换到 base timezone；前端不猜测时区。
3. Award API 返回明确的 timezone metadata，例如 `base: "YYZ"`、`zoneId: "America/Toronto"`、`timezoneLabel: "YYZ Local Time"`。
4. Day off / activity 不再丢失真实开始结束时间；右侧列表、Selected Duty、日历都显示 base-local 时间。
5. Award 月历继续保持横向日期网格；每个日期格子的横向宽度代表当天 `00:00-24:00`。
6. Event 用横条按 base-local start/end time 横向定位：起点落在 start date cell 的分钟比例位置，终点落在 end date cell 的分钟比例位置。
7. Base-local 跨日的事件在同一周内横向跨多个日期格；跨周时按周拆成多个横条 segment。
8. 只有真实时间重叠的 event 才显示 conflict 视觉；不重叠的同周横条可以共用同一 lane。
9. Mary 这类 UTC 跨夜但 base-local 不跨夜的 pairing，只在 base-local 当天以一条短横条显示，不再错误延伸到次日。
10. 月历 event bar 视觉保持旧版 Award 日历的实心块风格，不使用空心描边条作为默认状态。

## 非目标

- 不修改 `roster_publish`、`roster_flight` 或 solver 输出数据。
- 不实现 Reason Report。
- 不改变 award result 的业务计算，只改变 Award 页面展示口径。
- 不按每段航班的出发/到达机场本地时间展示；本轮统一使用 crew base local time。
- 不重构 Dashboard / Bidding Calendar 的共享日历交互；Award 使用 feature-local 专用日历实现。
- 不引入新的日期时间依赖，优先使用现有 `Intl.DateTimeFormat` 和项目已有 helper。

## 方案选择

### 推荐方案：周行横向 24h 跨日条

每个 week row 是一个 7 天横向时间轴。日期格子仍作为背景网格；event bar 作为 overlay 横条定位在 week row 上。

优点：
- 符合用户截图和直觉。
- 多日 duty / day off 能自然跨日期展示。
- 同一周内非重叠 event 可以共用 lane，信息密度更高。
- 不会把时间维度挤到格子内部纵向高度里。

代价：
- 需要重写上一轮的前端 segment 算法。
- 条形跨周时必须拆 segment，否则不能跨 CSS grid row 正确定位。

### 备选方案：日期格内纵向 24h 时间轴

上一轮实现方向。每个日期格子内部用纵向比例表达一天 24h。

结论：不采用。它和用户目标不一致，也会让整个月历变得像 35 个迷你日程表，信息密度高但不符合“横条跨日”的视觉需求。

### 备选方案：保持整天块，仅在 tooltip 显示时间

只补 base-local 时间和 tooltip，不改变月历条形布局。

结论：不采用。它能解释 Mary 为什么没有冲突，但不能在视觉上消除“同一天又休又飞”的误读。

## 关键口径

### Base 来源

Award 页使用当前登录 crew 的 actor base 作为整页时间口径，而不是 pairing 自带 base。

原因：

- Day off / VAC / ground activity 可能没有 pairing base。
- 员工查看自己的 Award，应看到自己的 base local day。
- 项目已有 `resolvePairingSearchActorBase`，它优先读取 `pbs_user.base`，再 fallback live `crew_base`，适合复用。

推荐流程：

1. 根据 authenticated actor 解析 base。
2. 根据 base 查 live schema `airport.zone_id`，并用 `pg_timezone_names` 校验 IANA zone。
3. 找不到 zone 时 fallback 到 `UTC`，并在响应 metadata 中体现 fallback。

### UTC 读取

Live 库字段名带 `_utc`，但数据库类型可能是 `timestamp without time zone`。实现时不能让 Node `pg` 按运行机器时区隐式解析。

Award 查询应把需要参与展示计算的时间字段显式格式化成 UTC ISO 字符串，例如：

- `to_char(rp.sch_str_dt_utc, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
- `to_char(rp.sch_end_dt_utc, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`

Node 侧只解析带 `Z` 的 UTC ISO string。

### Period 查询范围

当前 Award 查询按 UTC 月份过滤：

```sql
rp.sch_str_dt_utc >= period_start::date
and rp.sch_str_dt_utc < next_period_start::date
```

改成 base-local 展示后，单纯按 UTC 月份截断会有边界风险：

- base-local `Jun 01 00:30` 可能对应 UTC `May 31`。
- base-local `Jun 30 23:30` 可能对应 UTC `Jul 01`。

推荐做法：

1. 后端查询 UTC 范围向前和向后各扩展 2 天。
2. Mapper 转成 base-local 时间后，再按当前 period 的 base-local interval 过滤 item。
3. Summary count 仍来自当前 period 内应展示的 item 口径，不能因为 buffer 重复计数。

### Period inclusion 规则

查询 buffer 只用于防止月初/月末漏数据，不代表所有 buffer row 都进入 Award 结果。

推荐规则：

1. 先用 UTC instant 聚合出 logical item，例如一个 pairing、一个 day off、一个 activity。
2. 把 logical item 的 start/end 转成 base-local interval。
3. 只有 base-local interval 与当前 Award period 有交集时，item 才进入 `items` 和 summary。
4. 日历 segment 可以渲染在 month grid 的 leading / trailing muted cells 中，用于表达跨边界延续；但 summary 的 `duties / daysOff / pairings / activities` 不因 muted trailing segment 重复计数。
5. 如果 item 完全落在 buffer 但不与当前 base-local period 相交，应丢弃。

## API Contract 设计

扩展 `packages/contracts/pbs-award-results.*`。

### Response metadata

新增：

```ts
export type PbsAwardTimeZoneInfo = {
  base: string | null;
  zoneId: string;
  timezoneLabel: string;
  fallback: boolean;
};
```

`PbsAwardCurrentResponse` 增加：

```ts
timeZone: PbsAwardTimeZoneInfo;
```

### Item 时间语义

现有字段继续保留，但语义改为 base-local 展示字段：

| 字段 | 新语义 |
| --- | --- |
| `startDate` | base local start date，`YYYY-MM-DD` |
| `endDate` | base local end date，`YYYY-MM-DD` |
| `startTime` | base local start time，`HHMM`；day off 不再强制为 null |
| `endTime` | base local end time，`HHMM` |
| `legs[].day` | base local day-of-month |
| `legs[].depTime` | base local departure/start time |
| `legs[].arrTime` | base local arrival/end time |

如果源数据没有可靠时间，字段仍可为 null；前端应显示 `--` 或类型化 label，不能再把缺失时间默认渲染成 `00:00`。

### Calendar event 时间字段

`PbsAwardCalendarEvent` 增加 base-local 时间字段：

```ts
startTime: string | null;
endTime: string | null;
```

`startDate / endDate` 仍为 base-local date。前端据此把一个 logical event 拆成一个或多个 week-row horizontal segment。

## 后端设计

### 服务流程

`createPbsAwardResultsService.getCurrentAward` 调整为：

1. 解析 current period。
2. 解析 actor base。
3. 解析 base timezone。
4. 按 period UTC buffer 读取 `roster_publish`。
5. 按 UTC instant 构建 pairing / day_off / activity item。
6. 把 item 的起止时间、leg 时间转换为 base-local date/time。
7. 根据 base-local item 生成 calendar events。
8. 返回 `timeZone` metadata 和 warnings。

### Mapper 规则

#### Pairing

- 仍按 `pairing_id` 聚合 legs。
- logical pairing start = 最早 leg start UTC。
- logical pairing end = 最晚 leg end UTC。
- start/end 转 base local 后写入 item。
- 如果 UTC 跨夜但 base-local 不跨夜，`startDate` 和 `endDate` 应相同。

#### Day Off

- 仍按 `DO / GDO / OFF` 判定 day off。
- 不再把 day off 时间丢弃。
- start/end 使用 `roster_publish.sch_str_dt_utc / sch_end_dt_utc` 转 base local。
- 若 end 落在次日 `00:00`，横向条应停在次日 cell 的左边界；不生成次日 0 宽度 segment。

#### Activity / Leave

- `VAC / SIM / ILL / RES` 等 activity 使用真实起止时间转 base local。
- 颜色语义保持 yellow。

## 前端设计

### Award 专用横向时间条 Calendar

新增或替换为 feature-local 组件，例如：

- `pbs-portal/src/features/award/components/award-time-calendar.tsx`

不建议直接改共享 `ScheduleEventCalendar` 默认行为，因为它也服务 Dashboard / Bidding Calendar。Award 的横向时间条布局是不同模式，应先局部实现，后续确认复用价值后再上提。

### Week row 横向坐标

月历仍按 7 列日期格子渲染，日期格是背景和边界。每个 week row 上方 overlay 横条层。

坐标规则：

- `dayColumnStart = colIndex`
- `startFraction = startMinuteOfDay / 1440`
- `endFraction = endMinuteOfDay / 1440`
- `xStart = (startCol + startFraction) / 7`
- `xEnd = (endCol + endFraction) / 7`
- `width = xEnd - xStart`

其中 `colIndex` 为 week row 内 `0..6`。如果 event 在同一周跨多天，`xEnd` 会自然落到后面日期格子的某个位置。

### Segment 拆分

前端把 `calendar.events` 拆成 week-row horizontal segment：

| 场景 | 展示 |
| --- | --- |
| 同日事件 | 一条横条，位于该日期格子的 start/end time 比例之间 |
| base-local 跨夜且仍在同一周 | 一条横条，横向跨多个日期格 |
| 跨周事件 | 按周拆成多条横条，每周一段 |
| 从前一周延续到本周 | 本周段从周首 cell 左边界开始，可 label 为 `continues` / `until HH:MM` |
| 从本周延续到下一周 | 本周段到周末 cell 右边界结束，可 label 为 `from HH:MM` / `continues` |
| endTime 为次日 `00:00` | 横条终点是次日 cell 左边界，不生成 0 宽度次日条 |
| full-day / near full-day off | 绿色横条覆盖一个日期格几乎完整宽度 |

### Lane 排布

Lane 的纵向位置只用于避免横条互相遮挡，不代表时间。

规则：

- 同一 week row 内，两个 horizontal segment 如果横向区间不重叠，可以共用同一 lane。
- 如果横向区间重叠，分配到不同 lane。
- 真实时间重叠时显示 conflict 视觉；只是同周同 lane 不代表 conflict。
- 每个 lane 使用固定高度，例如 `16-18px`，lane gap `4px`。
- Week row 高度可以保持现有月历视觉比例；如果某周 lane 数较多，只在该周内部增加可用条形区或使用压缩高度，不让右侧 panel 被挤出。

### 条形视觉

推荐保留旧版 Award 月历的视觉语言，只把横向长度改成按时间比例：

- 横条默认使用实心填充，不使用空心描边条。
- Pairing：沿用旧 UI 的 cyan / blue 实心块。
- Day Off：沿用旧 UI 的 green 实心块。
- Activity / Leave：沿用旧 UI 的 yellow / amber 实心块。
- 条高、圆角、字号、字重、白色居中文案尽量贴近原来的 calendar event block。
- 选中、hover 或 conflict 可以增加边框 / ring / 阴影，但默认静态状态仍是实心块。
- 条内文字优先显示 code，例如 `T4520`、`Off`、`VAC`；空间足够时可以显示 `T4520 09:51-20:49`，但不能破坏旧 UI 的简洁感。
- 窄条文字可隐藏，只保留 `title / aria-label`，避免文字溢出。
- 不画明显 24 小时刻度线；日期格宽度本身就是 24h。必要时只用 tooltip 解释精确时间。

### Label 示例

- 同日：`T4520 09:51-20:49`
- 跨日：`Off 00:01-24:00` 或 `Off 00:01-Jun04 00:00`
- 延续段：`T4520 until 00:49`
- 窄条：只显示 `T4520`

### Roster Details

右侧表格和 Selected Duty 也统一使用 base-local 时间：

- `Start` 不再把 null 时间显示成 `00:00`。
- Day Off 显示真实 start，如 `Jun 03 00:01`。
- Selected Duty 的 `DATE`、`TIME`、leg `DEP / ARR` 使用 base-local。
- 面板顶部或 Award 标题附近显示 `YYZ Local Time`，让用户知道全页时间口径。

### Overlap / Conflict 检测

推荐在前端 segment 层检测，因为视觉冲突取决于最终横向分段。

规则：

- 同一 week row 内，segment 横向区间重叠时必须分 lane。
- 同一 base-local date 或相邻日期中，两个 logical event 的真实时间区间满足 `a.start < b.end && b.start < a.end` 才显示 conflict。
- 时间相邻，例如 `pairing end = 20:49`、`day off start = next day 00:01`，不显示 conflict。

## Mary Nasso 验收样例

输入源数据：

| Row | UTC |
| --- | --- |
| T4520 leg 1 | `2026-06-02 13:51` - `2026-06-02 18:37` |
| T4520 leg 2 | `2026-06-02 19:54` - `2026-06-03 00:49` |
| GDO | `2026-06-03 04:01` - `2026-06-04 04:00` |

期望 YYZ local 展示：

| Row | YYZ Local |
| --- | --- |
| T4520 | `2026-06-02 09:51` - `2026-06-02 20:49` |
| GDO | `2026-06-03 00:01` - `2026-06-04 00:00` |

页面期望：

1. `Jun 02` 背景日期格内，`T4520` 横条从该 cell 约 41% 位置开始，到约 87% 位置结束。
2. `Jun 03` 不再显示 `T4520` 延伸；`Off` 横条从 `Jun 03` cell 左侧稍后位置开始，到 `Jun 04` cell 左边界结束。
3. 如果 `Off` 的终点是 `Jun 04 00:00`，不生成 `Jun 04` 的 0 宽度条。
4. 右侧 Roster Details 的 day off start 为 `Jun 03 00:01`，不是默认 `Jun 03 00:00`。
5. 不出现 conflict badge。
6. 页面显示 `YYZ Local Time`。

## 验收标准

1. Award 页面所有日期/时间使用 actor base local time。
2. `PbsAwardCurrentResponse.timeZone` 返回 base、zoneId、timezoneLabel 和 fallback 状态。
3. Day off / activity item 保留真实 base-local start/end time。
4. UTC 跨夜但 base-local 不跨夜的 pairing 只显示在 base-local 当天。
5. Base-local 真跨夜的事件在同一周内以横向跨日条显示；跨周才拆成多个 week-row segment。
6. Calendar event 横条按横向 24h 比例定位，不再按整天堆叠，也不使用日期格内纵向时间轴。
7. Calendar event 横条默认视觉是旧版 Award 日历的实心色块，不是空心描边条。
8. 真实重叠才显示 conflict；非重叠的同周 event 不报警。
9. Dashboard / Bidding Calendar 现有共享日历行为不受影响。
10. 常规 `1920x1080` 工作台下 Award 页面不出现文字重叠、不可读事件条、横向溢出或底部裁切。
11. 没有新增硬编码航司逻辑；base zone 通过数据库配置解析。

## 测试计划

### 后端自动化

更新 / 新增 `pbs-server` 测试：

- `award-results-mapper`：UTC string 按 UTC 语义解析，不受运行机器时区影响。
- `award-results-mapper`：Mary 样例从 UTC 转 YYZ local 后，T4520 落在 Jun 02，GDO 从 Jun 03 00:01 开始。
- `award-results-mapper`：day off 不再输出 null time。
- `award-results-mapper`：base-local 真跨夜 item 的 start/end date 正确。
- `award-results-service`：Award 查询使用 period buffer，避免 base-local 月初/月末漏数据。
- timezone fallback：机场 zone 缺失时返回 UTC metadata 和 fallback 状态。

### 前端自动化

更新 / 新增 `pbs-portal` 测试：

- Award mapper 根据 base-local event 生成 week-row horizontal segment。
- 同日事件按 start/end minute 计算 `xStart / xEnd / width`。
- 同周跨日事件生成一条横向跨日 segment。
- 跨周事件拆成多个 week-row segment。
- `endTime = 0000` 的次日边界不生成 0 宽度 segment。
- 同周非重叠 segment 可以共用 lane。
- 真重叠 segment 分 lane 并标 conflict。
- Award 页面显示 `YYZ Local Time`。
- Roster Details 不把 day off null / missing time 误显示为默认 `00:00`。
- Selected Duty 的 date/time 与 event label 使用同一 base-local 口径。

### Playwright / QA

实现阶段必须补真实 UI 验证：

- 登录 PBS Portal，打开 Award 页面。
- 验证 Mary Nasso 或等价 fixture crew 的 Jun 2026 页面：
  - Jun 02 的 `T4520` 是 cell 内横向短条，不延伸到 Jun 03。
  - Jun 03 的 `Off` 是横向条，跨到 Jun 04 左边界。
  - 页面 timezone label 为 crew base local time。
- 截图检查横条没有遮挡、没有横向页面溢出，短条仍可识别。
- QA 人工测试案例写入 `docs/test-cases/pbs/award/`。

## 风险与处理

- **Contract 变更风险**：`PbsAwardItem.startDate/startTime` 语义从 UTC-derived display 改成 base-local display。需要同步更新 server、portal 和测试。
- **边界数据遗漏风险**：按 base local 展示后必须扩展 UTC 查询范围，再做本地日期过滤。
- **DST 风险**：横向视觉按 wall-clock `00:00-24:00` 比例绘制；DST 切换日可能不是实际 1440 分钟，但员工认知通常仍是本地钟面时间。测试至少覆盖普通日，DST 可作为后续增强。
- **共享组件风险**：避免直接重写 `ScheduleEventCalendar` 默认布局，先用 Award 专用组件隔离。
- **数据质量风险**：如果源数据本身真实重叠，本设计会如实显示 conflict，不自动修数据。
- **短事件可读性风险**：横向比例可能让短 event 宽度很窄；需要最小可点击宽度、tooltip 和短 label 兜底，但不能改变真实起止位置的视觉含义。
- **Lane 高度风险**：同一周 event 很多时 lane 可能增多；优先压缩条高/字号和 tooltip，不引入整页横向滚动。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 后端时间口径、API contract、前端横向 segment 算法和测试强耦合，拆分会增加 contract 同步成本。
- Suggested split: 不拆；由主 agent 连续完成 spec、实现、测试和 Playwright 验证。
- Write boundaries: `pbs-server/src/services/award/**`、`packages/contracts/pbs-award-results.*`、`pbs-portal/src/features/award/**`、对应测试与 QA 文档。
- Conflict risk: 中等。当前工作区已有 standing-bid 相关未跟踪 spec，本任务实施时必须只 touch Award / contract 相关文件，提交时只 stage 本任务文件。
- Execution gate: 用户确认本纠正版 spec 后，再进入 implementation；未确认前不改运行代码。
