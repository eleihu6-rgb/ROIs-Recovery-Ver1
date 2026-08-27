# PBS Period 按 Crew Base 解释本地墙上时间设计

## 1. 背景与决策

现有 PBS Period 生命周期已经统一以 Live `roster_period` 为配置来源，但当前时间字段和序列化方式仍混用了 `timestamp without time zone`、`timestamptz`、JavaScript `Date` 与 UTC ISO 字符串，导致管理页面出现日期提前 8 小时、不同浏览器时区显示不一致等问题。

本设计补充并修正《2026-08-05-pbs-period-lifecycle-design.md》的“时间语义”“数据库 migration”“实施顺序”和“Multi-Agent Parallelism Assessment”部分。发生冲突时，以本设计为准。

业务决策如下：

- Period 管理员配置的是不绑定单一时区的“墙上时间”，保留到秒。
- 同一个配置值应在每名 Crew 自己的 Base 当地按相同钟点生效。
- Crew 使用 `Roster Start` 当天生效的主 Base；Period 内后续调动 Base 不改变该 Period 的开放、截止和 Award 时间解释。
- Base 时区只读取 Live `airport.zone_id` 的 IANA 时区，不新增第二套时区配置。
- 历史 Award 没有可靠的实际发布时间来源；计划时间按 `Bid Close + 10 days` 回填，实际发布事实仍只认 `schedule_publish_record`。

## 2. 目标

- 消除 Period 管理页面的 UTC 偏移和浏览器时区漂移。
- 保证北京、洛杉矶等不同 Base 的 Crew 都在各自当地相同钟点进入 Bid/Award 阶段。
- Bid、Dashboard、Calendar、Pairing Search、Days Off、Reserve 和 Award 共用同一套 Base-local Period 时间解析。
- 保留现有 Period 生命周期：Bid 与 Award 使用不同 resolver，Award 继续执行“计划时间 + 实际发布记录”双重门禁。
- 修复开发、SIT、UAT 中能够可靠确认的历史 Period 配置，不伪造实际发布记录。

## 3. 非目标

- 不修改 PBS 优化算法或算法输入文件。
- 不新增按 Base 复制的 Period 配置记录。
- 不使用 `roster_publish.created_at`、`roster_publication_date` 或同步时间推断历史 Award 实际发布时间。
- 不把浏览器所在地当成 Crew Base。
- 不修改 `schedule_publish_record` 历史记录来制造已发布状态。

## 4. 时间模型

### 4.1 管理端配置

以下字段均为墙上时间，数据库使用 `timestamp without time zone`：

| 字段 | 示例 | 含义 |
|---|---|---|
| `rp_start` | `2026-01-01 00:00:00` | Roster Period 开始墙上时间 |
| `rp_end` | `2026-01-30 00:00:00` | Roster Period 结束墙上时间；保留航司已确认的实际边界，不擅自补成日末 |
| `pbs_bid_open_at` | `2025-12-05 00:00:00` | Bid 当地开放钟点 |
| `pbs_bid_close_at` | `2025-12-12 23:59:00` | Bid 当地截止钟点 |
| `pbs_award_publish_at` | `2025-12-22 23:59:00` | Award 当地计划开放钟点 |

管理 API 使用不带 `Z`、不带 offset 的固定格式传输，例如 `2026-01-01T00:00:00`。管理页面原样展示和编辑，不通过 JavaScript `Date` 转换，也不受操作员电脑时区影响。

### 4.2 Crew Base 的选择

对每个 Crew 和 Period：

1. 以 `roster_period.rp_start` 的墙上日期作为生效判断点。
2. 每条候选 `crew_base` 先关联该候选 Base 自己的 `airport.zone_id`，再在该 IANA 时区内判断 `eff_dt / exp_dt` 是否与 `Roster Start` 当地自然日相交，不能依赖数据库会话时区或浏览器时区。
3. 只选择 `is_prime_base = 1` 的有效记录。
4. 排序使用 `eff_dt DESC, id DESC`，确保脏数据下仍有确定结果。
5. 校验选中 Base 的 `airport.zone_id` 是否存在于 PostgreSQL `pg_timezone_names`。

Base 有效性按“当地自然日粒度”判断，边界谓词固定为：

```sql
crew_base.eff_dt < ((rp_start::date + 1)::timestamp at time zone base_zone_id)
and (
  crew_base.exp_dt is null
  or crew_base.exp_dt >= (rp_start::date::timestamp at time zone base_zone_id)
)
```

因此，只要 Base 记录与 `Roster Start` 当地日期有交集，就属于当日候选；若旧 Base 当天失效、新 Base 当天生效，则使用 `eff_dt DESC, id DESC` 选择当天较晚生效的新 Base。`exp_dt` 与当地零点相等仍视为覆盖边界。

`pbs_user.base` 仅可用于个人资料快照或兼容展示，不得覆盖 `Roster Start` 当天的历史有效 Base。

如果没有有效主 Base 或 Base 没有合法 IANA 时区，Period 对该 Crew 返回 `INCOMPLETE`，并给出可操作的业务错误；不得静默按浏览器时区解释。UTC fallback 只允许用于非门禁展示，不能用于决定 Bid/Award 是否开放。

### 4.3 墙上时间转换为真实时刻

PBS Server 将墙上时间与 Crew Base 的 `zone_id` 组合成可比较的 UTC instant：

```text
resolvedInstant = configuredWallTime AT TIME ZONE base.zone_id
```

示例，管理员均配置 `2026-01-01 00:00:00`：

| Crew Base | `zone_id` | 对应真实 UTC 时刻 | Crew 看到的时间 |
|---|---|---|---|
| 北京 | `Asia/Shanghai` | `2025-12-31T16:00:00Z` | `2026-01-01 00:00:00` |
| 洛杉矶 | `America/Los_Angeles` | `2026-01-01T08:00:00Z` | `2026-01-01 00:00:00` |

Portal API 可以继续返回解析后的 ISO instant，但必须同时返回 Base/时区信息；Portal 使用该 `zone_id` 格式化，不能使用浏览器默认时区。管理 API 则始终返回原始墙上时间字符串。

夏令时转换使用 PostgreSQL IANA 时区规则，不新增前端时区依赖。Period 常用的午夜和 `23:59` 不处于典型 DST 跳变窗口；若配置落入某 Base 不存在或重复的当地钟点，后端采用 PostgreSQL 的确定性转换，并通过测试固定行为。本阶段不新增管理端全 Base DST 预检。

## 5. Period 生命周期解析

### 5.1 Current Bid Period

现有全局 `resolveCurrentPeriod(db, businessNow)` 必须升级为包含 Crew/Period Base 上下文的解析器。每个候选 Period 先解析该 Crew 的 Base-local `bidOpenAt` 和 `bidCloseAt`，再与 `businessNow` 比较：

- 缺少配置或 Base/时区：`INCOMPLETE`
- `businessNow < resolvedBidOpenAt`：`NOT_OPEN`
- `resolvedBidOpenAt <= businessNow < resolvedBidCloseAt`：`OPEN`
- `businessNow >= resolvedBidCloseAt`：`CLOSED`

原有排序规则保持不变。所有 Bid 相关服务必须传入当前 actor，不能继续使用不区分 Crew/Base 的全局 Period 结果。

### 5.2 Current Award Period

Award resolver 使用同一个 `Roster Start` 有效 Base，把 `pbs_award_publish_at` 转成该 Crew 的计划开放 instant。`schedule_publish_record.base` 有值时，也必须与这个 Roster-Start effective Base 比较；不得继续优先使用 `pbs_user.base`。

Award 可见仍必须同时满足：

```text
businessNow >= resolvedAwardPublishAt
AND 存在覆盖当前 Period 与该 Crew 范围的 schedule_publish_record.published = 1
```

没有 `schedule_publish_record` 时，即使 `roster_publish` 已存在数据，也只能返回 `PUBLISH_PENDING`，不能展示为已发布。

### 5.3 缓存边界

现有 Current Period 全局缓存不能继续跨 Crew 复用。最小安全实现先按以下键缓存完整 Current Period 上下文：

```text
airline/schema + crewId
```

不得直接按 `schema + effectiveBase` 缓存完整结果，因为同一 Crew 在不同 Period 可能使用不同历史 Base。若后续仅缓存纯墙上时间转换，键必须完整包含 `periodId/updatedAt + zoneId + configuredWallTime`。

最小方案保留现有 60 秒短 TTL：Period 配置、`crew_base` 或 `airport.zone_id` 变化最迟在 60 秒后生效。本阶段不假设存在跨 `live-server` / `pbs-server` 的主动失效机制，也不新建该机制；如果产品后续要求保存后立即生效，再单独设计跨服务失效事件。

## 6. API 合同

### 6.1 Live Period Admin API

- 输入/输出墙上时间格式：`YYYY-MM-DDTHH:mm:ss`，无 `Z`、无 offset。
- 保留秒，前端控件必须支持时分秒。
- 不调用 `new Date(value).toISOString()` 处理管理字段。
- 列表中的 Roster Range、Bid Open、Bid Close、Award Publish 原样展示。

### 6.2 PBS Portal API

Bid/Award 当前 Period 响应应包含：

- `periodCode`
- `rosterPeriodId`
- 解析后的 `bidOpenAt / bidCloseAt / awardPublishAt` ISO instant
- `base`
- `zoneId`
- `timezoneLabel`，例如 `YYZ Local Time`
- `rpStartLocal / rpEndLocal`，格式为不带时区的本地墙上时间；业务范围查询使用其日期部分
- 生命周期状态与只读原因

`rp_start / rp_end` 是包含式业务日期范围，不作为 Bid/Award 门禁 instant 使用。例如 `rp_end = 2026-01-30 00:00:00` 仍表示 1 月 30 日整天属于该 RP，范围查询必须使用 `event_local_date >= rpStartLocal::date AND event_local_date <= rpEndLocal::date`，不能解释成 1 月 30 日零点立即结束。

前端只消费后端解析结果，不自行查询 `crew_base`，不从 Period Code 推算范围，也不依赖浏览器时区决定门禁。

## 7. 历史数据与 migration

### 7.1 字段类型归一

新增向前 migration，将以下字段统一为 `timestamp without time zone`：

- `roster_period.rp_start`
- `roster_period.rp_end`
- `roster_period.pbs_bid_open_at`
- `roster_period.pbs_bid_close_at`
- `roster_period.pbs_award_publish_at`

DEV/SIT/UAT 的真实 `rp_start / rp_end` 已是 `timestamp without time zone`，因此正常执行时只验证、不重写这些值；checked-in schema 中错误的 `timestamptz` 声明和各模块 Drizzle model 必须一并归一。如果某环境预检发现仍为 `timestamptz`，migration 才进行条件式类型转换。

现有 `timestamptz` 数据本来保存的是预期墙上钟点。转换时必须显式保留 UTC 字面钟点，例如使用 `AT TIME ZONE 'UTC'`，确保 `00:00Z` 转换后仍为墙上时间 `00:00:00`，不能受 migration 会话时区影响。

更新 Drizzle model 和 checked-in schema，使其与真实数据库类型一致。migration 必须幂等，并在事务中执行预检、转换和结果验证。

### 7.2 Award 计划时间回填

对 `pbs_award_publish_at IS NULL` 且 `pbs_bid_close_at IS NOT NULL` 的 Period：

```text
pbs_award_publish_at = pbs_bid_close_at + interval '10 days'
```

该值是“计划开放墙上时间”，不是实际发布时间。已有非空 Award 计划值不覆盖。

### 7.3 Roster Range 校正

- SIT/UAT 已核实的 2026 年边界符合 Flair 定义，保留不变。
- DEV 的 Jan/Feb 边界与 SIT/UAT 及已确认业务规则不一致，应通过受控数据修复同步为已确认边界。
- 其余 Period 只在三库对比能唯一确认时修复；不能确认的记录列入核查清单，不猜测修改。
- 业务规则：2026 年前三个 RP 分别为 `01-01～01-30`、`01-31～03-01`、`03-02～03-31`；2026 年 4 月起按自然月。

### 7.4 不允许的历史回填

- 不根据 `roster_publish.created_at` 回填实际发布时间。
- 不根据 `roster_publication_date` 回填 Award Publish。
- 不新增或修改 `schedule_publish_record.published=1` 来伪造历史发布。
- Actual Published 没有可信记录时继续显示 `-`。

## 8. 数据源迁移门禁

实施前必须按 `docs/architecture/source-of-truth-migration-gate.md` 完成消费者清单和双读/切换评估：

- 旧语义：Period 时间被当作全局 UTC instant。
- 新语义：Period 保存全局墙上时间，由 PBS Server 按 Crew 在 `Roster Start` 的 Base 解析。
- 唯一 Base 来源：Live `crew_base` 有效历史。
- 唯一时区来源：Live `airport.zone_id`。
- 唯一实际 Award 发布事实：Live `schedule_publish_record`。

必须审计并统一以下消费者：

- Live Period Admin 年度生成、列表、新建、编辑。
- PBS Dashboard、Bid、Line、Pairing、Days Off、Reserve、Calendar。
- PBS Award Period resolver 和 Award 页面。
- Portal bootstrap/current-period 缓存和所有共享 current-period cache。
- 相关 contracts、fixtures、测试与 QA 文档。
- 全仓所有 `roster_period.rp_start / rp_end` 读写路径，包括 Live/Gantt roster、manday、publish、Scenario 范围、数据导出及其测试。类型归一前必须证明这些路径继续按包含式业务日期工作；尚未核查的路径必须在实施报告中列为残余风险，不能只审计 PBS 消费者。

## 9. 错误处理

- 缺少有效 Base：返回“当前排班周期找不到有效主基地，请联系管理员维护 Crew Base”。
- Base 缺少合法时区：返回“基地时区未配置，当前周期暂不可用”。
- 管理字段顺序错误继续使用字段级校验。
- 不向用户暴露 PostgreSQL、Axios、JavaScript Date 或堆栈错误。
- 重复加载失败使用项目统一错误入口并去重；门禁类错误保留为可持续查看的页面状态。

## 10. 验收标准

### 10.1 数据与后端

- 管理员保存 `2026-01-01 00:00:00` 后重新打开仍显示完全相同的值。
- 同一 Period、同一墙上时间：上海 Base 和洛杉矶 Base 分别在各自当地 `00:00:00` 开放。
- Crew 在 Period 中途换 Base，仍使用 `Roster Start` 当天的 Base。
- Crew 在下一个 Period 的 `Roster Start` 前已换 Base，下一个 Period 使用新 Base。
- 旧 Base 在 Roster Start 当天失效、新 Base 当天生效时，确定性选择较晚生效的新 Base。
- 缺少 Base/时区时不错误开放 Bid/Award。
- Bid、Dashboard、Calendar、Pairing、Days Off、Reserve 对同一 Crew 返回相同 Period 和阶段。
- Award 计划时间已到但无成功发布记录时为 `PUBLISH_PENDING`；存在有效发布记录后为 `AVAILABLE`。
- `schedule_publish_record.base` 仅与 Roster-Start effective Base 匹配，不受 `pbs_user.base` 快照影响。
- `rp_end = 2026-01-30 00:00:00` 的范围查询仍包含 1 月 30 日整天。
- `pbs_award_publish_at` 空值按 `Bid Close + 10 days` 回填，已有值不覆盖。
- migration 后三个 PBS 时间字段在 DEV/SIT/UAT 类型一致，钟点没有发生 `+8/-8` 漂移。

### 10.2 UI 与 Playwright

- Period Admin 新建、编辑、列表均保留时分秒且不发生时区偏移。
- 模拟两个不同 Base 的 Crew，在相同墙上钟点边界前后验证 Bid 状态。
- Award 页面验证 `SCHEDULED → PUBLISH_PENDING → AVAILABLE`。
- 浏览器系统时区切换后，管理页面原始配置值不变，Portal 仍按 Crew Base 显示。
- 前端变更通过 `npm run check:ui`，并提供真实 UI Playwright 运行回执。

### 10.3 migration 验证

每个环境执行前后记录：

- 字段类型。
- 非空/空值数量。
- 每个 Period 转换前后的字面钟点。
- Award 回填数量。
- Roster Range 差异和修复行数。

先在 DEV 验证，再执行 SIT，最后执行 UAT；任一环境验证不通过则停止后续环境。数据库凭据只从受控环境变量读取，不写入脚本、文档或日志。

## 11. 实施顺序

1. 完成数据源迁移消费者审计和影响分析。
2. 新增幂等 migration，统一类型并回填计划 Award 时间。
3. 修改 Live Period Admin API/表单的墙上时间序列化。
4. 新增 PBS Server 的 effective Base + zone resolver，并升级 Bid/Award resolver。
5. 调整缓存键与失效逻辑。
6. 更新 contracts 和 Portal 的 Base-local 展示。
7. 增补 Vitest、Playwright 和 PBS QA 用例。
8. DEV → SIT → UAT 依次执行 migration 与 smoke 验证。

## 12. Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: migration/后端解析、Live 管理端、Portal/E2E 可在合同冻结后独立开发。
- Suggested split:
  - Agent A：数据库 migration、数据核验脚本、PBS Server Base-local resolver 与后端测试。
  - Agent B：Live Period Admin 墙上时间合同、表单与测试。
  - Agent C：PBS Portal 展示、Playwright 和 QA 文档。
- Write boundaries: A 不改 Gantt/Portal；B 不改 PBS Server；C 不改数据库与 Live Server。
- Conflict risk: Medium，公共 contracts 与 resolver 返回结构必须由主 Agent 先确定并统一集成。
- Execution gate: 用户审核并明确批准本 spec 后才能开始实现；是否启用并行开发由用户另行决定。
