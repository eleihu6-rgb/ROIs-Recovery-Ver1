# PBS Live Dictionary 环境隔离修复设计

## 背景

PBS Portal 的 `Minimum Base Layover` 与 `Time Between Flights` 配置从当前环境的 Live `dictionary` 表读取：

- DEV：`f8.dictionary`
- SIT：`f8_sit_live.dictionary`
- UAT：`f8_uat_live.dictionary`

历史 migration 将这两个参数硬编码写入 `f8.dictionary`，导致 DEV 正常，而 SIT、UAT 缺少配置：

- `SYS_PARAM / PBS_LINE_MINIMUM_BASE_LAYOVER = 013:00`
- `SYS_PARAM / PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES = 45`

远端只读核查确认，其他当前使用的 PBS Definition 参数在 SIT、UAT 均存在；各环境的 Business Time Anchor 值不同属于独立测试时钟的正常差异。

## 目标

1. 补齐 DEV、SIT、UAT 各自 Live schema 中的两个配置。
2. 修复 migration 的环境隔离方式，避免后续环境继续只写入 DEV。
3. 不重新执行包含清理历史 Bid/Favorite 逻辑的旧 migration。

## 方案

新增一个独立、幂等的 corrective migration：

- 由执行端通过 `psql -v live_schema=<schema>` 显式传入 `live_schema`。
- `live_schema` 必须严格属于 `f8`、`f8_sit_live`、`f8_uat_live` 白名单；使用 PostgreSQL `format('%I', ...)` 或 psql 标识符变量安全引用，禁止直接拼接未经校验的输入。
- 校验目标 schema、`dictionary` 表以及字典业务唯一约束存在。
- 字典逻辑键为 `(coalesce(parent_code, '___NULL___'), code)`；写入前检查目标键是否重复，重复时直接报错并回滚，不静默合并或删除。
- 使用与现有 `2026-08-03-pbs-bid-definitions.sql` 一致的冲突目标，确保并发和重复执行安全。
- 已有合法非空值时保持现有业务配置；缺失或空值时分别写入精确默认值 `013:00` 与 `45`；已有非空但非法值时拒绝执行并要求人工确认，不擅自覆盖。
- 每个 schema 的两个参数在一个独立事务内完成；提交前断言两个逻辑键各恰好一条、值合法，任一断言失败则整体回滚。
- migration 不读取或修改 PBS Bid、Favorite、Period、Award、Roster 等业务数据。

旧的 `2026-07-14` migration 保留为历史记录，不修改、不重跑。

## 执行范围

同一 corrective migration 分别执行：

1. `live_schema=f8`
2. `live_schema=f8_sit_live`
3. `live_schema=f8_uat_live`

项目当前没有跨三个 schema 共用的 migration tracking runner。本修复通过三次显式 `psql` 调用执行同一幂等脚本，每次调用独立提交或回滚，并保留命令、目标 schema、执行结果与执行后查询作为凭证；不会因为 DEV 已执行而跳过 SIT/UAT。

## 验收标准

- 三个 Live schema 中两个逻辑键各有且仅有一条记录。
- 原先缺失或空值的参数分别为精确默认值 `013:00` 与 `45`；原先已有的合法非空值保持不变。
- 参数值有效：Minimum Base Layover 为 `HHH:MM` 格式，Time Between Flights 为正整数分钟。
- SIT、UAT 的 PBS Definition 页面不再显示这两个配置为 `Unavailable`。
- Portal 的 Minimum Base Layover 配置接口返回 `available: true`。
- Portal 的 Time Between Flights bounds 接口返回成功，不再出现 500。
- 不改变其他 PBS Definition 参数及 Business Time 配置。

## 验证

- migration 静态检查，并在事务提交前执行目标键行数和值断言。
- 执行前记录三个 schema 的目标行快照；执行后查询三套 Live schema 的行数和值，并确认已有合法值未改变。
- 对 SIT、UAT 执行对应接口 smoke test，并在页面确认两个配置可用。若认证或部署状态阻塞，只能报告“数据库修复完成、应用验收受阻”，不能宣告整体完成；最终完成需要接口与页面验证凭证，或由用户明确接受残余风险。

## 风险与回滚

- 风险低：SQL 的写入条件仅允许两个确定的字典逻辑键。
- migration 幂等，可重复执行。
- 执行前保存每个 schema 的目标行快照与执行时间。回滚时按快照处理：原先不存在的行删除，原先存在的行恢复原值。
- 回滚前必须确认目标行在本次执行后没有被管理员再次修改；若 `updated_at`/`updated_by` 已变化，则停止自动回滚并人工处理，避免覆盖后续业务变更。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: SQL 编写、三环境执行与验证存在严格顺序，工作量小，拆分会增加协调风险。
- Suggested split: 不拆分。
- Write boundaries: 仅新增 corrective migration；不修改当前 Bid Feedback 工作区文件。
- Conflict risk: 低，但必须保持现有未提交改动不受影响。
- Execution gate: 本 spec 经用户确认后实施。
