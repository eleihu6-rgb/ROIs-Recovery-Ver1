# PBS Period 生命周期与 Award 发布设计

## 1. 背景

当前 Live 的 PBS Period 管理只配置 `Period Code`、`Bid Open` 和 `Bid Close`。PBS Server 又让 Bid、Dashboard、Calendar 和 Award 共用同一个“当前 Period”解析结果。

这会产生两个核心问题：

1. Bid 关闭后，共用解析器可能提前切换到下一个尚未开放的 Period，导致 Award 页面无法继续定位刚结束并已发布的 Period。
2. 部分查询根据 `Period Code` 推算自然月，没有始终使用 `roster_period.rp_start / rp_end`，无法正确覆盖 Flair 的非自然月 RP，例如 2026 年第二个周期为 1 月 31 日至 3 月 1 日。

本设计以 Live 的 `roster_period` 为唯一 Period 数据源，不新增第二套 PBS Period 配置。

## 2. 目标

- 在同一条 `roster_period` 记录中配置 RP 范围、Bid 窗口和 Award 计划开放时间。
- Bid 与 Award 分别解析自己的目标 Period，不再共享一个含义模糊的 Current Period。
- Award 只有在“已到计划开放时间”且“Live 实际发布成功”时才允许展示。
- PBS 全部业务日期范围以 `rp_start / rp_end` 为准，不再从 `Period Code` 推算。
- 以 `schedule_publish_record` 保留实际发布批次和时间，便于问题追踪和历史回溯。

## 3. 非目标

- 本阶段不修改 PBS 优化算法。
- 本阶段不改变 Award 原因报告的生成和解析方式。
- 本阶段不新建独立 `pbs_period` 表。
- 本阶段不把多个航司的周期规则硬编码到 PBS Portal。
- 本阶段不自动补造历史 Award 数据；历史数据迁移仅处理能够可靠确认的状态。

## 4. 核心业务模型

### 4.1 单一配置记录

每个 PBS 周期对应 Live `roster_period` 中的一条记录。Period 管理页面展示并维护：

| 字段 | 含义 | 维护方式 |
|---|---|---|
| `pbs_period_code` | Portal 展示的周期编码，如 `Jun 2026` | 管理员配置 |
| `rp_start` | 实际排班周期开始日期 | 管理员配置；进入投标后锁定 |
| `rp_end` | 实际排班周期结束日期，包含结束日 | 管理员配置；进入投标后锁定 |
| `pbs_bid_open_at` | Bid 开放时间 | 管理员配置 |
| `pbs_bid_close_at` | Bid 截止时间 | 管理员配置 |
| `pbs_award_publish_at` | Award 计划允许查看的时间 | 管理员配置 |

`roster_period` 继续作为唯一数据源。不得根据 `pbs_period_code`、月份名称或自然月规则重新计算 `rp_start / rp_end`。

实际发布事实不重复存入 `roster_period`，统一来自 `schedule_publish_record`。该表中的成功发布记录同时提供发布范围、批次和实际发生时间。

### 4.2 时间语义

- Period 配置时间（`pbs_bid_open_at / pbs_bid_close_at / pbs_award_publish_at`）以带时区时间保存。
- 管理页面使用 Live 已配置的业务时区显示和编辑，API 传输 ISO 8601 时间。
- `rp_start / rp_end` 按业务日期解释，且 `rp_end` 为包含式结束日期。
- `schedule_publish_record` 在部分环境中仍是无时区 timestamp；实施前必须核对开发、SIT、UAT 的真实类型，并在查询中明确按 Live 业务时区解释，不能按数据库会话或浏览器时区猜测。
- Portal 不自行猜测时区或周期边界。

## 5. 生命周期

### 5.1 Bid 阶段

Bid 阶段由业务时间与 `pbs_bid_open_at / pbs_bid_close_at` 计算：

- 缺少必要配置：`INCOMPLETE`
- 当前时间早于开放时间：`NOT_OPEN`
- `pbs_bid_open_at <= businessNow < pbs_bid_close_at`：`OPEN`
- `businessNow >= pbs_bid_close_at`：`CLOSED`

该计算状态用于 Bid、Dashboard 和管理页面展示，不依赖 Award 是否发布。

Bid 窗口不允许重叠。即使历史脏数据出现重叠，resolver 也必须稳定排序：开放 Period 按 `pbs_bid_open_at DESC, id DESC`；未来 Period 按 `pbs_bid_open_at ASC, id ASC`；已关闭 Period 按 `pbs_bid_close_at DESC, id DESC`。

Bid 的 `NOT_OPEN / OPEN / CLOSED / INCOMPLETE` 始终根据时间实时计算，不依赖或写回 `pbs_status`，因此不需要定时同步任务。现有 `pbs_status` 不作为本设计的 Award 展示依据，避免与实际发布记录形成两份互相冲突的状态。

### 5.2 Award 发布状态

Award 可见必须同时满足：

```text
businessNow >= pbs_award_publish_at
AND EXISTS (符合当前 Period 与用户范围的 schedule_publish_record 成功记录)
```

一条成功发布记录必须满足：

```text
schedule_publish_record.roster_period_id = roster_period.id
AND schedule_publish_record.published = 1
AND schedule_publish_record.str_dt <= roster_period.rp_start
AND schedule_publish_record.end_dt >= roster_period.rp_end
AND division 与当前机组匹配
AND base 非空且与当前机组唯一有效 prime Base 精确匹配
AND crew_id 非空且与当前 crew_id 精确匹配
AND ac_type 非空且与当前机组在 Period 内有效机队集合完全相等
```

`file_path/file_size/checksum` 是历史兼容字段，不参与 Award 门禁。`publish_type=Normal/Emergency/Correction` 均可构成成功发布，前提是满足范围条件且 `published=1`。

实际首次发布时间取所有符合条件成功记录的 `min(created_at)`；最近发布批次取 `created_at DESC, id DESC` 的第一条。计划时间到达但没有成功记录时，Award 页面必须保持“等待发布”，不得因为 `roster_publish` 中存在部分数据就自动判断为已发布。

### 5.3 Live 发布动作

Live 的发布流程按以下顺序执行：

1. 根据选定 `roster_period.id` 和 `rp_start / rp_end` 生成发布数据。
2. 在同一数据库事务内完整写入 `roster_publish`、`roster_publish_adjust`。
3. 数据写入确认成功后，在同一事务写入 `schedule_publish_record`，包含准确的 `roster_period_id`、`str_dt/end_dt`、`division`、`base/crew_id/ac_type`、`batch_id` 和 `published=1`；不生成 `.schedule.gz`。
4. 任一步骤失败时，不得产生 `published=1` 的成功记录；可以保留 `published=0` 的失败/草稿记录供排查。

`published=1` 必须是发布链路的最终成功标记。通用 API 或管理员不得绕过真实发布流程直接创建成功记录。重复发布、紧急发布和更正发布各自新增记录，不覆盖历史批次。

## 6. Current Bid Period 与 Current Award Period

两者不是两套配置，而是对同一组 `roster_period` 记录的两种查询结果。

### 6.1 Current Bid Period

解析顺序：

1. 优先选择当前处于 `OPEN` 的 Period。
2. 没有开放 Period 时，选择最近即将开放的 Period。
3. 没有未来 Period 时，回退到最近关闭的 Period，用于只读查看。

该结果供 Bid、Dashboard、Pairing Search、Days Off、Reserve 和 Bid Calendar 使用。

### 6.2 Current Award Period

Award API 分为“可见 Period”和“候选 Period”，避免把发布状态和 Period 选择混为一谈：

1. `visiblePeriod`：仅考虑已满足 Award 可见条件的 Period，按 `pbs_award_publish_at DESC, id DESC` 选择最近一条；实际发布时间由匹配的 `schedule_publish_record.created_at` 聚合返回。
2. `candidatePeriod`：仅在没有 `visiblePeriod` 时返回，用于解释为什么尚不可见；优先选择计划时间已到但未发布的最近 Period，否则选择最近即将开放 Award 的 Period。
3. 不得用 Current Bid Period 代替 Award Period。
4. API 明确返回 `availability`：
   - `AVAILABLE`：存在 `visiblePeriod`，允许读取 Award 数据。
   - `PUBLISH_PENDING`：计划时间已到，但 Live 尚未成功发布。
   - `SCHEDULED`：已配置未来 Award 开放时间。
   - `UNCONFIGURED`：没有可用配置。
5. Portal 只在 `AVAILABLE` 时展示 Award 数据；其他状态显示对应说明，不混入旧数据。

### 6.3 示例

```text
Jun 2026
RP：2026-06-01 至 2026-06-30
Bid：2026-05-01 00:00 至 2026-05-08 23:59
Award 计划开放：2026-05-18 12:00

Jul 2026
RP：2026-07-01 至 2026-07-31
Bid：2026-06-05 00:00 至 2026-06-12 23:59
```

在 5 月 18 日 Jun Award 已发布、Jul Bid 尚未开放时：

- Current Bid Period 可以是即将开放的 `Jul 2026`。
- Current Award Period 必须是已发布的 `Jun 2026`。

## 7. 管理页面设计

现有 Period 新建/编辑弹窗扩展为：

- Period Code
- Roster Start
- Roster End
- Bid Open
- Bid Close
- Award Publish

实际发布信息只读展示：

- 是否已经存在成功发布记录
- First Published At
- Latest Publish Batch / Latest Published At

校验规则：

- `rp_start <= rp_end`
- `pbs_bid_open_at < pbs_bid_close_at`
- `pbs_bid_close_at <= pbs_award_publish_at`
- Period Code 唯一。
- RP 日期范围不得与其他有效 `roster_period` 重叠。
- Bid 窗口不得与其他有效 Period 的 Bid 窗口重叠。
- Period 已进入 Bid Open 或已有 Bid/Award/发布数据后，禁止直接修改 `rp_start / rp_end`；需要先走专门的数据修复流程。
- 字段错误显示在对应控件附近，不返回原始数据库或 Axios 错误。

年度批量生成必须只产生预览，管理员确认后保存。Flair 特殊 RP 边界由 Live 的 Period 规则生成；PBS Server 和 Portal只读取最终的 `rp_start / rp_end`。

## 8. API 与服务职责

### 8.1 Live Server

- Period Admin API 读写同一条 `roster_period`。
- 返回 RP 日期、Bid 窗口、Award 计划时间，以及从 `schedule_publish_record` 聚合的实际发布信息。
- 校验周期重叠、时间顺序和已使用 Period 的修改限制。
- Live 发布流程只有在完整成功后才写入 `schedule_publish_record.published=1`。
- 禁止通用创建接口绕过真实发布流程伪造成功记录；成功记录写入必须收口到发布服务。

### 8.2 PBS Server

- 提供独立的 Bid Period resolver 和 Award Period resolver。
- 所有查询范围使用 resolver 返回的 `rosterPeriodId / rpStart / rpEnd`。
- Award 只根据匹配的 `schedule_publish_record.published=1` 判断实际发布成功，不再通过“存在 `roster_publish` 行”或 `pbs_status` 推断。
- Award API 返回计划发布时间、实际发布时间和可见状态，Portal 只消费结果。

### 8.3 PBS Portal

- Bid 页面消费 Current Bid Period。
- Award 页面消费 Current Award Period。
- Portal 不根据月份、Period Code 或浏览器本地时间自行推算业务周期。
- 未满足发布门禁时显示稳定的未发布状态，不展示旧 Period 数据冒充当前结果。

## 9. 数据库与 migration

新增一条向前 migration：

- 确保 `roster_period.pbs_award_publish_at timestamptz` 存在。
- 为 `schedule_publish_record` 增加按 Period 和发布状态查询的索引，建议为 `(roster_period_id, published, created_at DESC)`。
- 更新 `pbs_award_publish_at`、`schedule_publish_record.roster_period_id` 和 `published` 的字段注释。
- 不修改已经存在的历史 migration。

仓库中 `2026-08-04-pbs-period-drop-unused-fields.sql` 曾将 `pbs_award_publish_at` 定义为未使用字段并计划删除。实施时应通过新的 migration 恢复正式字段，并核对开发、SIT、UAT 三个环境的实际 schema 状态后再执行，保证脚本在字段已存在或已删除两种情况下都幂等。

只读核查发现当前开发库 `schedule_publish_record` 尚无数据，而且其时间列、审计列为 `timestamp without time zone`，与仓库 schema 中的 `timestamptz` 定义存在漂移。实施前必须对开发、SIT、UAT 分别核对列类型、空值和真实发布样本；在未确认历史时间语义前不得直接批量转换列类型。

历史数据处理：

- 只有 `roster_period_id`、覆盖日期、范围和 `published=1` 均可靠的历史 `schedule_publish_record` 才可作为成功依据。
- 缺少 `roster_period_id` 的历史记录不得仅凭日期自动关联，除非受控脚本验证只有唯一匹配 Period。
- 仅存在零散 `roster_publish` 数据但没有成功发布记录时，不自动补造 `schedule_publish_record`。
- 无法可靠判断的历史记录保持不可见，交由管理员确认。
- 缺少 `pbs_award_publish_at` 的 Period 视为 `UNCONFIGURED`，禁止发布和展示，必须先由管理员确认计划时间。

部署顺序固定为：

1. 在目标环境执行 schema expand migration，并核对字段与空值分布。
2. 部署收口成功记录写入的 Live publisher 和兼容新旧空值的 Period Admin。
3. 管理员确认或受控回填历史计划时间，并核验已有成功发布记录；不得用人工状态替代或补造 `schedule_publish_record.published=1`。
4. 部署新的 PBS Server resolver 和 Portal。
5. 执行一次“配置 → 发布 → Award 查看”链路 smoke。

旧的 drop migration 若尚未执行，不再单独执行；若环境已经执行，则由新的幂等 migration 恢复字段。回滚应用版本时保留新增列，不执行破坏性 schema rollback，避免丢失发布时间。

## 10. 数据源迁移审计

### 10.1 旧来源与新来源

- 旧行为一：Bid/Award 共用 Current Period。
- 新行为：Bid resolver 与 Award resolver 分离。
- 旧行为二：从 `Period Code` 推算自然月。
- 新行为：`roster_period.rp_start / rp_end` 为唯一周期边界。
- 旧行为三：存在 roster 行或读取 `pbs_status` 即可推断 Award Published。
- 新行为：计划时间与 `schedule_publish_record` 成功记录双重门禁。

当旧推算结果与 `rp_start / rp_end` 冲突时，必须以 `rp_start / rp_end` 为准，并增加冲突回归测试。

### 10.2 必须审计的下游路径

- Live Period Admin 列表、新建、编辑、年度生成。
- Live 发布至 PBS 的成功/失败路径。
- `schedule_publish_record` 的全部写入入口、通用创建 API 和批次范围语义。
- PBS Dashboard、Bid、Pairing Search、Days Off、Reserve、Calendar。
- PBS Award summary、roster details、selected duty、reason report 入口。
- PBS Bid/Award API 合同、测试 fixture 和 QA 文档。
- 所有仍调用共享 `resolveCurrentPeriod` 或从 `Period Code` 推算月份的代码。

算法输入不依赖“用户如何搜索 Period”，本阶段不调整算法压缩包字段；如果审计发现导出范围仍由自然月推算，则只修正其 Period 范围来源，不新增算法字段。

## 11. 测试与验收

### 11.1 后端自动化测试

- Flair RP2：`rp_start=2026-01-31`、`rp_end=2026-03-01`，查询必须覆盖完整边界。
- Bid 关闭后存在未来 Period：Bid resolver 可指向未来 Period，Award resolver 仍返回最近已发布 Period。
- `businessNow == pbs_bid_close_at`：Bid 阶段为 `CLOSED`。
- 历史脏数据存在多个开放/未来/关闭 Period：resolver 按确定性排序返回固定结果。
- Award 计划时间已到但没有匹配的成功发布记录：不可见。
- 存在匹配的成功发布记录但计划时间未到：不可见。
- 计划时间已到且存在匹配的成功发布记录：可见。
- 没有可见 Award、计划时间已到但未发布：返回 `PUBLISH_PENDING`。
- 没有可见 Award、计划时间未到：返回 `SCHEDULED`。
- `roster_publish` 有数据但没有成功发布记录：不可见。
- `schedule_publish_record.published=0/null`：不可见。
- 成功记录的 `roster_period_id`、日期范围、division、base 或 crew 范围不匹配：不可见。
- Live 发布失败：不得写入 `published=1` 的记录。
- Live 发布成功：成功记录范围字段、批次和实际时间正确，文件兼容字段保持 null。
- 重复发布：保留所有批次，首次和最近发布时间均可正确聚合。
- 通用创建 API 不能直接伪造 `published=1` 的记录。
- 旧自然月推算值与 RP 边界冲突：断言 RP 边界胜出。

### 11.2 UI / Playwright

- 管理员可创建或编辑完整 Period 配置。
- 时间顺序或 RP 重叠时显示字段级错误。
- 已使用 Period 的 RP 边界不可直接修改。
- Bid 页面显示 Bid resolver 返回的 Period。
- Award 页面显示 Award resolver 返回的不同 Period。
- 未发布、等待开放和已发布三种 Award 状态显示正确。

### 11.3 数据库验证

- migration 在开发、SIT、UAT 分别执行并核对列、类型和空值分布。
- 对动态 SQL 执行远端 PostgreSQL `EXPLAIN` 或最小只读查询。
- 对特殊 Q1 RP 和普通自然月 RP 各进行一次查询验证。

## 12. 验收标准

- Period Admin 一处即可维护完整 PBS 周期配置。
- 系统中不存在第二套 Period 配置表或 Portal 端日期推算。
- Bid 与 Award 可同时指向不同 Period，且结果符合各自业务语义。
- Award 不会因为时间到达或存在部分 roster 数据而被误判为已发布。
- 所有 PBS 业务日期范围正确支持 Flair 非自然月 RP。
- 发布失败不会暴露不完整 Award；发布成功可通过 `schedule_publish_record` 追踪实际时间和批次。
- 相关后端测试、Playwright、模块构建及根目录 UI 检查全部通过。

## 13. 实施分期

### 第一阶段：Period 基础契约

- 数据库字段与 migration。
- Live Period Admin 配置和校验。
- Bid/Award resolver 分离。
- 全部周期范围改用 `rp_start / rp_end`。

### 第二阶段：发布闭环

- Live 发布成功后写入完整、可信的 `schedule_publish_record`。
- Award 双重门禁。
- 历史数据核对与受控回填。

第一阶段和第二阶段可以在同一次开发中连续完成，但上线时必须保证 migration、Live writer、PBS reader 的兼容顺序，避免读写版本错配。

## 14. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: Period resolver、API 合同、发布记录与 Award 查询紧密耦合，具有明确的顺序依赖。
- Suggested split: 主代理统一实施；独立评审代理只读检查 spec、测试覆盖和变更范围。
- Write boundaries: 实施期间由单一代理负责 `live-server`、`pbs-server`、`pbs-portal` 与 migration 的关联改动。
- Conflict risk: 多个代理同时修改共享 Period resolver、类型合同或 migration 时冲突风险高。
- Execution gate: 本 spec 经用户明确批准后，先输出实施计划，再开始代码修改。
