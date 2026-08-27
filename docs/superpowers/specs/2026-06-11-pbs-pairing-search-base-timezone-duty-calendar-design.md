# PBS Pairing Search Base 时区与 Duty Calendar 点亮口径设计

日期：2026-06-11  
范围：PBS Portal `/fpqe/pbs/pairing/search` 任务环搜索结果卡片

## 背景

`/fpqe/pbs/pairing/search` 结果卡片新增 duty 级 `DATE` 后，发现左侧 duty 日期与右侧 mini calendar 点亮日期存在不一致：

- 左侧 `DATE` 可能显示 `0627 / 0701 / 0703`。
- 右侧 mini calendar 却从 `0628` 开始点亮，或最后一天 `0701 / 0703` 没有点亮。

进一步查库并对齐业务口径后，问题需要拆成两类：

1. `0627` 本身不一定是错误。Duty start 包含 brief/report，可能早于第一段航班起飞；如果 `2025-12-28 05:05 UTC` 按 `YYC` base 时区转换后是 `2025-12-27 22:05`，那么映射到 6 月 period 后显示 `0627` 是正确的 duty 日期。
2. 右侧 mini calendar 当前按 `active_start_date + duration_days` 生成 `activeDates`，更接近 pairing active/第一段飞行日期口径，没有直接使用 duty 在 base 时区下的实际覆盖日期。这样会出现左侧 duty `DATE` 是 `0627`，右侧却从 `0628` 开始亮，或最后 duty/签出落到 `0701 / 0703` 但右侧没亮。
3. Live 库时间字段业务含义是 UTC，例如 `duty_sch_str_dt_utc`、`brief_start_utc`、`sch_str_dt_utc`，但实际 PostgreSQL 类型是 `timestamp without time zone`。实现时仍必须避免 Node `pg` 按本机时区隐式解析，否则会造成时间小时数和日期边界的错误。只是不能再把“出现 `0627`”本身当成解析错误证据。

本设计更新并取代旧文档中“active dates 只由 `active_start_date + duration_days` 展开”的展示口径。旧文档仍可作为历史修复背景参考：`docs/superpowers/specs/2026-06-10-pbs-pairing-mini-calendar-active-dates-design.md`。

## 数据观察

截图中可定位到以下 live pairing 数据：

| pairing label | pairing.id | base | duration_days | duty_count |
| --- | ---: | --- | ---: | ---: |
| `YYC/YVR/MEX/YVR/YYC/YVR/YYC` | `202` | `YYC` | `3` | `5` |
| `YYC/YVR/YYC/YVR/YYC/YVR/CUN/YVR/YYC/YVR/YYC` | `203` | `YYC` | `5` | `5` |
| `YVR/MEX/YYZ/YVR` | `211` | `YVR` | `2` | `3` |
| `YEG/YVR/CUN/YVR/YEG` | `213` | `YEG` | `2` | `2` |

以 `pairing.id = 202` 为例：

| 字段 | 数据库原始值 |
| --- | --- |
| pairing `sch_str_dt_utc` | `2025-12-28 07:24` |
| pairing `duration_days` | `3` |
| duty 1 `duty_sch_str_dt_utc` | `2025-12-28 05:05` |
| duty 5 `duty_sch_str_dt_utc` | `2026-01-01 02:50` |

按 `YYC` base 时区理解时：

| 事件 | UTC | YYC base |
| --- | --- | --- |
| duty 1 brief/report | `2025-12-28 05:05` | `2025-12-27 22:05` |
| 第一段航班起飞 / pairing `sch_str_dt_utc` | `2025-12-28 07:24` | `2025-12-28 00:24` |

这个例子说明：duty 日期早于第一段航班起飞日期是合理的，因为 duty 从 brief/report 开始，不是从第一段航班起飞开始。`pairing.sch_str_dt_utc` 在当前数据里更像第一段飞行/active start，不应被当作整个 pairing 的最早工作开始时间。

如果把 `timestamp without time zone` 错误交给 Node 自动按本机时区解析，`2025-12-28 05:05` 可能被偏成另一个 UTC instant，例如 `2025-12-27T21:05:00.000Z`。这是实现层面的解析错误，会影响 `HHMM` 和日期边界；但 `0627` 这个日期本身在 base 口径下可能是正确结果。

## 目标

- 所有来自 live 库的 `*_utc` 时间字段都按 UTC 语义读取，禁止被 Node 本机时区隐式偏移。
- Search Pairings 结果卡片中的日期和时间展示统一按 pairing `base` 所在机场时区转换。
- `DATE` 列展示 duty start 在 base 时区下的日期，格式为 `MMDD`。
- `REPORT`、`DEP`、`ARR` 等卡片内时间展示也统一按 base 时区格式化为 `HHMM`。
- 右侧 mini calendar 点亮日期由 duty 在 base 时区下实际覆盖的日期决定，而不是只按 `duration_days` 从开始日推算。
- 前后端 contract 保持清晰：后端直接返回已按 base 时区格式化/映射后的展示字段，前端不再猜测时区或补算 active dates。
- 保留完整 ISO date string 的 `activeDates` contract，继续避免同日号跨月误亮。

## 非目标

- 不修改数据库 schema，不把 `timestamp without time zone` 改为 `timestamptz`。
- 不修改 pairing 搜索条件匹配逻辑。
- 不修改 duty KPI 的取值口径，只修改其所在行的日期/时间展示口径。
- 不修改 Award 页面自己的 trip card。
- 不引入旧字段兼容层；字段要么按新口径正确返回，要么由测试暴露后继续修。

## 设计原则

1. 数据库存储按 UTC 理解。
2. 页面展示按 pairing base 时区理解。
3. 左侧 `DATE` 和右侧 mini calendar 使用同一套日期来源。
4. 后端负责时间转换，前端只负责渲染。
5. 不让运行机器时区影响业务结果。
6. 只在同一口径下比较时间：UTC 跟 UTC 比，base 跟 base 比；不要拿 base 下的 duty date 去和未转换或不同语义的 pairing start 直接判断异常。

## 后端设计

### UTC timestamp 读取

`pairing-search-preview-query` 查询 live 时间字段时，不能直接把 `timestamp without time zone` 返回给 Node `pg` 解析成 `Date`。

推荐做法是在 SQL 中把需要参与展示计算的时间字段显式格式化为 UTC 字符串，例如：

- `to_char(s.duty_sch_str_dt_utc, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')`
- `to_char(s.brief_start_utc, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')`
- `to_char(s.sch_str_dt_utc, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')`
- `to_char(s.sch_end_dt_utc, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')`

Node 侧再按这个字符串构造 UTC Date，避免本机时区参与解析。

### Base 时区来源

后端根据 pairing `base` 查 `airport.zone_id`：

- `YYC` -> `America/Edmonton`
- `YVR` -> `America/Vancouver`
- `YEG` -> `America/Edmonton`

若 base 未查到 zone，fallback 到 UTC，并在测试中覆盖 fallback 行为。

### 展示时间格式

后端新增或复用统一 formatter：

- 输入：UTC timestamp string + base zone id。
- 输出日期：`MMDD`。
- 输出时间：`HHMM`。
- 输出 ISO date：base 时区下的 `YYYY-MM-DD`。

卡片字段口径：

| 字段 | 新口径 |
| --- | --- |
| `reportTime` | pairing report/brief time 转 base 时区后 `HHMM` |
| `leg.dutyDate` | duty start 转 base 时区后 `MMDD` |
| `leg.departureTime` | segment start 转 base 时区后 `HHMM` |
| `leg.arrivalTime` | segment end 转 base 时区后 `HHMM` |
| `activeDates` | duty 覆盖日期按 base 时区生成完整 ISO date string |

> 注意：这里选择统一 base 时区，而不是每段分别按出发/到达机场本地时区显示。原因是用户当前要求“前端展示统一按照 base 显示”，并且右侧 mini calendar 只能有一个日期口径。

### Mini calendar 点亮日期

右侧 mini calendar 不再只用 `active_start_date + duration_days` 生成日期范围。

推荐口径：

1. 对每个 duty 分组。
2. 每个 duty 取 duty start：
   - 优先 `duty_sch_str_dt_utc`
   - fallback `brief_start_utc`
   - fallback 该 duty 第一段 `sch_str_dt_utc`
3. 将 duty start 转成 base 时区下的 ISO date。
4. 对同一个 duty，如果其最后一段 `sch_end_dt_utc` 或 `debrief_end_utc` 在 base 时区跨到下一天，需要把跨到的日期也纳入 active dates，避免最后一天有飞行/签出却不亮。
5. 对所有 duty 日期去重排序，作为 `activeDates` 返回。

这样：

- 左侧 `DATE` 显示哪些 duty 起始日期，右侧就能看到这些日期被点亮。
- 如果第一个 duty brief/report 在 base 时区落到第一段航班起飞前一天，例如 `0627 2205` report、`0628 0024` 起飞，右侧也应点亮 `0627`。
- 如果最后一个 duty 起始日是 `0702`，但最后一段飞行/签出落到 `0703`，右侧 `0703` 也会点亮。
- 不再由 `duration_days` 决定点亮天数；`duration_days` 仍可用于 `P3/P5` 等已有展示，但不作为 calendar 唯一日期来源。

### Period 映射

当前 live 数据可能来自模板月份，例如数据库原始日期是 Dec/Jan，但页面 period 是 Jun/Jul。需要继续保留 period 映射能力，并且映射前后的日期口径要一致：

- 先把数据库 UTC timestamp 按 UTC 语义读对。
- 再转换到 pairing base 时区，得到 base-local 的日期、时间和相对日期关系。
- 再以请求 `periodCode` 的年月作为展示锚点。
- 映射时保持相对 day offset，而不是只替换 month/day。

示例：

- 原始 duty start：`2025-12-28 05:05 UTC`
- 转 `YYC` base 后：`2025-12-27 22:05`
- 当前 period：`Jun 2026`
- 映射后 duty date：`2026-06-27`

若 duty 在 base 时区跨到原始 `2026-01-01`，映射后应跨到 `2026-07-01`，而不是被限制在 Jun 月内。

## 前端设计

### Pairing detail card

- 继续渲染后端返回的 `result.activeDates`。
- `PairingMiniCalendar` 继续用完整 ISO date string 精准匹配 `data-date`。
- 不在前端根据 `duration_days` 或 `leg.dutyDate` 临时补算点亮日期。
- 常规宽度下不应出现横向滚动条：
  - 缩小 leg grid column width。
  - 缩小 `column-gap`。
  - 保留极窄宽度下的 `overflow-x: auto` 兜底，避免小屏文字重叠。

### 表格展示

表头保持：

`DUTY / DATE / FDP / F/H / D/H / CRD / FLTN / DPS / ARS / DEP / ARR / BLKT / EQP`

其中：

- `DUTY` 仍显示 `duty_seq`。
- `DATE` 显示 base 时区 duty start 的 `MMDD`。
- 同一 duty 的后续 leg 行继续留空 `DATE / FDP / F/H / D/H / CRD`，保持 duty 分组。

## 验收标准

- `pairing.id = 202` 这类 pairing，如果第一个 duty report 在 base 时区落到 `0627`，左侧 `DATE` 和右侧 mini calendar 都应体现 `0627`，不能右侧从 `0628` 才开始亮。
- `pairing.id = 203` 中最后 duty/最后 segment 落到 `0703` 时，右侧 `03` 应点亮。
- 左侧 `DATE` 允许因 base 时区和 brief/report 口径显示为第一段航班起飞前一天；但不允许因为 Node 本机时区解析错误导致 `HHMM` 或日期边界偏移。
- `DATE`、`REPORT`、`DEP`、`ARR` 在 Search Pairings 结果卡片内统一按 base 时区显示。
- `activeDates` 返回完整 ISO date strings，并与 mini calendar `data-date` 精准匹配。
- 常规桌面宽度下 leg 表不出现横向滚动条，字段不重叠。
- `pbs-server` pairing search mapper 测试覆盖：
  - `timestamp without time zone` 作为 UTC 读取。
  - base 时区转换。
  - duty 起始日期点亮。
  - duty 跨到下一天时最后一天点亮。
  - period 跨月映射。
- `pbs-portal` search pairing 页面测试覆盖：
  - `DUTY / DATE` 表头仍存在。
  - mini calendar 使用 ISO date 点亮跨月 trailing cell。
  - 常规卡片表格没有不必要的横向滚动布局断言或快照。

## 风险与注意事项

- 如果其他 PBS 页面复用同一个 preview contract，也会接收 base 时区后的展示字段；这是期望行为，因为 contract 是展示型 preview contract。
- 如果未来要展示“出发机场本地时间 / 到达机场本地时间”，需要新增明确字段，不能混入当前 base 时区口径。
- `duration_days` 可能仍然保留为原始 pairing 表统计字段，不再强制要求它与点亮天数完全一致。
- `pairing.sch_str_dt_utc` 可能代表第一段飞行/active start，而不是完整任务环的 report start；判断 duty 是否异常时不能只看它是否早于该字段。
- 数据库字段名包含 `_utc` 但类型不是 `timestamptz`，实现时要避免任何会让 Node `pg` 自动按本机时区解析的路径。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是同一个 preview mapper 和同一个结果卡片展示口径的修复，后端和前端改动紧耦合，拆分会增加合同同步成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server/src/services/pairing-search/`、`packages/contracts/pbs-search-pairings.d.ts`、`pbs-portal/src/features/pairing/`、相关测试与本 spec。
- Conflict risk: 中。当前工作区已有上一轮 duty date 改动，本轮应在其基础上继续，不能回退。
- Execution gate: 用户确认本 spec 后再实施。
