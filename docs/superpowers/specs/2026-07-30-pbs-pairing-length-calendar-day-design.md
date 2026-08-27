# PBS Pairing Length 日历日口径设计

## 1. 背景

客户已经明确 `Pairing Length < 2 days` 的业务含义：

- Pairing 从 Brief 到 Debrief 必须处于 Pairing Base 当地时区的同一个日历日，才属于 `< 2 days`。
- 例如 7 月 11 日 10:00 Brief、7 月 11 日 23:00 Debrief，计为 1 个日历日，应匹配 `< 2 days`。
- 例如 7 月 11 日 22:00 Brief、7 月 12 日 08:00 Debrief，即使实际时长只有 10 小时，也跨了 2 个日历日，不应匹配 `< 2 days`。

当前 PBS Pairing Length 查询和 `PAIRING_SCORE.csv` 生成均使用
`pairing.duration_days`。该字段由上游系统提供，必须保留原值用于追溯和其他既有业务，
不能改写为 PBS 客户口径。

## 2. 目标

- 保留上游 `pairing.duration_days` 的原始值和现有导出行为。
- 新增 PBS 专用字段 `pairing.pbs_calendar_days`。
- PBS Pairing Length 查询、规则预览、Tier 匹配和 `PAIRING_SCORE.csv` 使用新字段。
- 不修改 PBS 算法输入中的 `Pairing.durationDays` 契约。
- 缺少计算所需数据时，新字段保持 `NULL`，不使用 `duration_days` 兜底。

## 3. 非目标

- 不修改 `pbs-engine` 或其他算法代码。
- 不重新定义 Average Daily Credit 等仍使用原始 `duration_days` 的其他业务指标。
- 不修改 Pairing 日历展示、TAFB、Duty Count 或 Segment Count 的现有口径。
- 不把 PBS 口径反写到上游数据。

## 4. 方案比较

### 方案 A：查询时动态计算

PBS 查询和算法导出都在 SQL 中根据 Segment 时间现场计算。

- 优点：无需新增数据库字段，不存在字段过期。
- 缺点：两个服务需要维护重复 SQL；搜索热路径增加聚合和时区转换成本；不利于数据核查和回溯。

### 方案 B：覆盖 `duration_days`

导入时将 `duration_days` 改成 PBS 日历日口径。

- 优点：改动最少。
- 缺点：破坏上游原值和追溯能力；会影响算法输入及其他使用该字段的业务，不能采用。

### 方案 C：新增持久化字段 `pbs_calendar_days`（采用）

保留 `duration_days`，在 Pairing 及其 Segment 完成导入后计算 PBS 专用字段。

- 优点：原始数据可追溯；PBS 查询性能稳定；查询和算法导出使用同一数据源；业务含义清晰。
- 缺点：必须明确字段写入责任，并为历史数据执行回填。

## 5. 字段定义

在 Live `pairing` 表新增：

```sql
pbs_calendar_days smallint null
```

字段含义：

> 从该 Pairing 最早 Brief 到最晚 Debrief，在 Pairing Base 当地时区内覆盖的日历日数量，首尾日期均计入。

计算公式：

```text
brief_local_date   = min(pairing_segment.brief_start_utc) 转为 Pairing Base 时区后的日期
debrief_local_date = max(pairing_segment.debrief_end_utc) 转为 Pairing Base 时区后的日期

pbs_calendar_days = debrief_local_date - brief_local_date + 1
```

SQL 实现（`timestamp without time zone` 存 UTC 墙钟）必须先锚定 UTC，再转到 Base：

```sql
((brief_start_utc AT TIME ZONE 'UTC') AT TIME ZONE base_zone)::date
((debrief_end_utc AT TIME ZONE 'UTC') AT TIME ZONE base_zone)::date
```

禁止对 naive UTC 列直接写 `AT TIME ZONE base_zone`（PostgreSQL 会把数字当成已是 Base 当地时间，导致日历日数被抬高）。2026-08-04 纠正见 `sql/migration/2026-08-04-fix-pbs-calendar-days-utc-base.sql`。

数据要求：

- 只读取 `pairing_segment.is_deleted = 0` 的 Segment。
- Base 时区来自 `pairing.base -> airport.airport -> airport.zone_id`。
- Pairing 级最早非空 Brief、最晚非空 Debrief、Base 或合法时区任一无法取得时，
  结果为 `NULL`。
- 多 Segment 中部分重复行的 Brief/Debrief 为 `NULL`，但仍能从其他有效行取得
  Pairing 级最早 Brief 和最晚 Debrief时，允许计算；不要求每个 Segment 重复保存完整
  Duty 节点时间。
- 结果小于 1 时视为异常数据，写入 `NULL`。
- 禁止使用 `duration_days`、计划起止时间或 UTC 日期作为兜底。

## 6. 数据写入与回填

### 6.1 新数据

实现一个 Live Server 内部共享刷新方法，按 `pairing_id` 读取 Pairing、Segment 和 Base
时区并更新 `pairing.pbs_calendar_days`。

当前已确认必须接入该方法的写入路径：

- `pairing-inbound-worker`：上游导入会更新 Pairing Base，并整体替换 Segment。
- `pairing-duty-node-service.updateDutyNodes`：人工修改 Brief / Debrief。
- `pairing-service` 中允许修改 Pairing Base 的路径。

每条路径都必须在修改依赖字段的同一数据库事务中刷新派生字段。实施前还要再次检索
`pairing.base`、`pairing_segment.brief_start_utc`、
`pairing_segment.debrief_end_utc` 和相关 `is_deleted` 写入点；发现其他 FLY Pairing
写入路径时，同样接入共享方法或在 spec 实施记录中明确说明其为何不进入 PBS 候选池。

这样新值与本次导入的 Segment 原子提交，不会出现 Pairing 已更新但派生字段仍是旧值的状态。

### 6.2 历史数据

新增幂等 migration：

1. 添加 nullable 字段。
2. 使用与 inbound worker 完全相同的 Brief、Debrief、Base 时区口径回填现有 FLY Pairing。
3. 无法计算的记录保留 `NULL`。
4. migration 输出可核查的成功数量和 `NULL` 数量，但不修改 `duration_days`。

### 6.3 其他写入路径

Live Server 共享刷新方法是该字段的唯一计算入口，F8 inbound、Duty Node 修改和 Base 修改
均通过它写入；调用方不得自行复制计算公式。
RES、地面任务以及 Scenario S3 自建 Pairing 不参与 PBS Pairing Length 搜索，不扩大本次范围。
若未来这些 Pairing 进入 PBS 候选池，必须先接入同一派生方法。

## 7. 消费方切换

以下 Pairing Length 业务改用 `p.pbs_calendar_days`：

- PBS Server 搜索结果、Current Rules 匹配数和 Tier pool。
- Property `112`：`Pairing Length`，包括新版 JSON bid 和兼容 stepper。
- Property `131`：`Prefer Pairing Length`。
- Property `132`：`Prefer Pairing Length on Date` 中的长度比较部分。
- Live Server 生成 `PAIRING_SCORE.csv` 时对上述 Property 的匹配。

`pbs_calendar_days IS NULL` 时：

- Award 和 Avoid 均不参与 Pairing Length 判断。
- 实现必须在 Award/Avoid 取反逻辑之外增加明确的非空保护，不能依赖 SQL `NULL`
  的三值逻辑，也不能让 `NOT (NULL)` 或 `NOT (field IS NOT NULL AND ...)`
  意外改变候选集合。

以下行为继续使用原始 `duration_days`：

- `engine-server/F8/ro_input_builder/sections/pairing.py` 输出的 `Pairing.durationDays`。
- Average Daily Credit 等现有非 Pairing Length 指标。
- 其他没有明确迁移到客户 Pairing Length 口径的页面或服务。

## 8. Source-of-Truth 冲突规则

- 旧来源：上游 `pairing.duration_days`。
- 新来源：本地派生 `pairing.pbs_calendar_days`。
- 当两者冲突时，PBS Pairing Length 搜索和 `PAIRING_SCORE.csv` 必须以
  `pbs_calendar_days` 为准。
- `duration_days` 继续保留、继续导出，但不得再参与 Pairing Length 的业务判断。

必须增加冲突回归：

```text
duration_days = 1
Brief = 7 月 11 日 22:00（Base local）
Debrief = 7 月 12 日 08:00（Base local）
pbs_calendar_days = 2
```

断言：

- `< 2 days` 的 PBS 查询不返回该 Pairing。
- `PAIRING_SCORE.csv` 不给该 Pairing 写入对应 Award 命中。
- 算法输入中的 `Pairing.durationDays` 仍保持上游值 `1`。

## 9. 数据库与发布

- migration 需要在 DEV、SIT、UAT 的 Live schema 执行。
- migration 必须幂等，不包含密码或固定外部连接信息。
- 部署顺序：
  1. 先执行数据库 migration 和历史回填。
  2. 再部署写入新字段的 Live Server。
  3. 最后部署读取新字段的 PBS Server / Live Server 算法导出代码。
- 读取方上线前必须确认目标环境字段已存在，避免运行时 SQL 错误。

## 10. 验收标准

1. 同一 Base 当地日期内完成的 Pairing，`pbs_calendar_days = 1`。
2. Brief 与 Debrief 跨当地午夜的 Pairing，`pbs_calendar_days = 2`。
3. 跨时区或 UTC 日期与 Base 日期不同的样例，严格以 Pairing Base 时区计算。
4. 缺少 Brief、Debrief 或合法 Base 时区时，新字段为 `NULL`。
5. PBS `Pairing Length < 2 days` 只匹配 `pbs_calendar_days = 1`。
6. PBS 搜索结果、Current Rules 数量、Tier pool 和 `PAIRING_SCORE.csv` 结果一致。
7. `duration_days` 不被修改，算法输入 `Pairing.durationDays` 契约不变。
8. 冲突样例证明 Pairing Length 使用新字段，而算法原始 Pairing 输出仍使用旧字段。

## 11. 验证范围

- Live Server inbound worker 单元测试：
  - 同日、跨午夜、时区边界、缺字段四类计算。
  - 多 Segment 仅部分行保存 Brief/Debrief 时，仍使用 Pairing 级最早/最晚有效值。
  - 确认 Pairing 与 Segment 更新在同一事务内刷新派生字段。
- Live Server writer 回归：
  - Duty Node 修改后刷新新字段。
  - Pairing Base 修改后按新 Base 时区刷新新字段。
- PBS Server condition builder 单元测试：
  - Property 112、131、132 均生成 `p.pbs_calendar_days` 条件。
  - 不再为 Pairing Length 生成 `p.duration_days` 条件。
  - `pbs_calendar_days IS NULL` 在 Award 和 Avoid 两种规则下均不参与匹配。
- Live Server pairing condition builder / algorithm export 测试：
  - `PAIRING_SCORE.csv` 使用新字段。
  - 新旧字段冲突时新字段获胜。
- 远端 PostgreSQL：
  - migration 后执行只读统计。
  - 对动态 SQL 做 `EXPLAIN` 或最小只读执行。
- HTTP / 文件 smoke：
  - PBS Pairing Search 实际请求。
  - 实际生成一份 `PAIRING_SCORE.csv` 并检查目标 Pairing。

## 12. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 字段定义、migration、writer 和两个读取方存在严格的先后依赖，核心改动集中在同一份 Pairing Length condition builder 逻辑，任务规模不足以抵消并行协调成本。
- Suggested split: 主 Agent 按 schema → writer → consumers → tests 顺序完成。
- Write boundaries: 不拆分并行写入。
- Conflict risk: 若多人同时修改 Live/PBS 两份 condition builder 和相关测试，容易产生口径偏差。
- Execution gate: 用户批准本 spec 后才进入实施。

## 13. 风险与后续

- 历史 Pairing 若缺少 Brief/Debrief 或 Base 时区，会保持 `NULL` 并从长度匹配中排除；需要通过回填统计暴露数据质量问题。
- `duration_days` 仍可能与 `pbs_calendar_days` 不同，这是设计允许的，不应再以两者相等作为数据质量要求。
- 若未来算法明确要求消费 PBS 日历日口径，应新增独立算法字段，不能复用或覆盖现有 `Pairing.durationDays`。
