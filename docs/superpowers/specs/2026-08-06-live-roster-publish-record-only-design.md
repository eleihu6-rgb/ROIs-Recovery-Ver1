# Live 发布写入 PBS 发布记录（无快照文件）设计

## 决策

本设计替代
`docs/superpowers/specs/2026-08-06-live-roster-publish-snapshot-record-design.md`
中的物理快照方案。

Live `Publish Roster` 以 `roster_publish` 为唯一业务数据源。发布成功时，在同一数据库事务中为已完整
发布的 Crew 写入 `schedule_publish_record.published = 1`，但不生成 `.schedule.gz` 文件，也不新增
文件目录环境变量。

## 数据流

1. Scenario Publish 继续只把优化结果导回 `live.roster_flight`。
2. Live Publish Roster 校验同一 Crew 的全部 actionable diff 已被选择。
3. 同一事务内更新 `live.roster_publish`、写 `roster_publish_adjust`，并为完成发布的 Crew 写
   `schedule_publish_record`。
4. `schedule_publish_record` 写入 Period、batch、Crew、division、base、fleet 范围和
   `published=1`；`file_path/file_size/checksum` 保持 null。
5. PBS Award 仅接受以下全部条件匹配的成功记录：`roster_period_id` 相同、日期完整覆盖 Period、
   `published=1`、division/base/crew_id/ac_type 均非空。crew/division/base 直接规范化相等；`ac_type`
   将记录逗号集合与 Crew 在 Period 内的有效 `coalesce(ac_type, fleet_specific)` 去重排序集合做完全
   相等比较，不采用“任意一个 fleet 命中”语义。历史 null 通配记录不再解锁 Award；具体排班仍只
   读取 `roster_publish`。

## 保留的正确性门禁

- 完全未选择的 Crew 不参与本次发布；任何已选择至少一条 diff 的 Crew，都必须选齐该 Crew 的全部
  actionable diff，否则整个 Apply 在写操作前失败。完整性查询不受 UI filter、分页或状态筛选影响，
  并覆盖 ADD/UPDATE/DELETE、Flying/Ground。
- Crew 必须具有唯一有效 prime base、division 和有效 fleet，不能用 null 退化成通配范围。
- `roster_publish_adjust`、`roster_publish` 删除/插入和成功记录必须使用同一个 `PoolClient`；只有源行锁、
  DML row count、Crew 完整性和范围都确认后才插入成功记录，任一步失败时三张表共同回滚。
- `batch_id` 使用现有微秒批次 ID，但不假设数据库层全局唯一。插入继续使用 `NOT EXISTS` 防重，
  insert-return Crew 集合必须与预期完全一致；任何 batch 冲突、缺失或额外 Crew 都立即回滚。
- COMMIT ACK 丢失时，用主库新连接核对 Period、batch、精确 Crew 集合、每 Crew 恰好一条成功记录和
  adjust 精确数量，区分 `COMMITTED / NOT_COMMITTED / UNCERTAIN`。已确认提交仍做缓存失效；不确定时
  禁止自动重试并返回稳定产品错误。
- 通用 `POST /api/scenario/schedule-publish` 使用严格 allowlist；通用 service 强制写非成功态，
  `published=1` 只能由发布事务内部 helper 写入。

## 成功记录字段

- `str_dt/end_dt = roster_period.rp_start/rp_end`。
- `roster_period_id` 为当前 Period，`batch_id` 等于本次 adjust batch。
- `crew_id` 为本次完整发布的 Crew，`publish_type='Normal'`。
- `division` 使用 Crew 有效 division。
- `base` 使用与 PBS Award resolver 完全相同的 Roster Start 有效 prime-base 边界；缺失或冲突拒绝。
- `ac_type` 使用 Period 内有效 `coalesce(ac_type, fleet_specific)` 去重排序集合；缺失拒绝。
- `file_path/file_size/checksum` 为 null，仅保留数据库兼容性。

## 删除范围

- 删除 `SCHEDULE_SNAPSHOT_DIR` 及其开发/SIT 配置示例和配置门禁。
- 删除快照 writer、游标 SQL及其测试。
- 删除发布事务中的文件生成、checksum、文件清理逻辑。
- 删除 PBS Award resolver 对 `file_path/file_size/checksum` 的强制条件。
- 同步标记旧快照 spec、旧实施计划和 QA 快照用例已被本设计替代；数据库中的 nullable 文件字段保留，
  不做 schema migration。
- 同步修订 `2026-08-05-pbs-period-lifecycle-design.md`、对应实施计划、
  `pbs-period-award-publication-gate.md`，以及 `sql/schema/live/02-crew-roster.sql` 中
  `schedule_publish_record` 的历史文件索引注释，使 canonical 文档统一为 record-only 契约；仅更新
  注释，不执行结构 migration。

## 测试

- 后端：完整 Crew A、完全忽略 Crew B 时只发布 A；触及 Crew 但未选齐时整批拒绝；无 actionable 不写
  batch/record；ADD/UPDATE/DELETE 和 Flying/Ground 均覆盖；缺失/冲突范围或记录插入失败时三张表回滚。
- COMMIT ACK 覆盖三态；Crew 集合、记录数或 adjust 数量不精确时不得判成功。
- 通用接口覆盖 number/string/boolean `published=1`、夹带 batch/file 元数据和零写入断言。
- PBS：正确记录且 file 字段为 null 时 Award 可用；错误 Period、日期、Crew、division、base、ac_type、
  `published!=1` 均拒绝；无匹配记录时等待发布。
- 增加真实 PostgreSQL 跨服务契约验证：Live 产出记录可被 PBS resolver 消费；Award roster 仍只读取
  `roster_publish`；Scenario Publish 不写成功记录。
- Playwright：少选时报错并保留 diff，全选后发布成功。
- 除 UI mock 用例外，增加连接真实 Live backend 的隔离 fixture Playwright：不拦截 Apply API，验证
  真实事务结果；自动验证未配置 `SCHEDULE_SNAPSHOT_DIR` 仍可启动，发布后不产生快照文件。
- 不需要数据库 migration。

## 验收标准

- 不配置任何新增 env 即可启动和发布。
- 发布流程不生成排班快照文件。
- Live 发布成功后无需人工补写 `schedule_publish_record`。
- PBS Award 只以成功记录作为发布门禁，并继续只从 `roster_publish` 读取排班。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 删除文件链路并同步调整 Award 条件，改动范围小且契约紧密，串行修改更安全。
- Suggested split: 不拆分。
- Write boundaries: Live 发布服务、PBS Award resolver、对应测试和文档。
- Conflict risk: 多 agent 同时改发布契约容易产生短暂不一致。
- Execution gate: 用户确认本设计后实施。
