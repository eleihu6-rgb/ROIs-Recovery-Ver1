# Live 发布生成排班快照与成功记录设计

> 已废弃：物理快照与 `SCHEDULE_SNAPSHOT_DIR` 方案已由
> `2026-08-06-live-roster-publish-record-only-design.md` 替代。

## 1. 背景与目标

当前 Live 的 `Publish Roster` 只在一个串行化事务中更新 `roster_publish` 和
`roster_publish_adjust`，不会生成 `.schedule.gz`，也不会写入
`schedule_publish_record`。PBS Award 已明确只把一条完整、匹配且
`published = 1` 的 `schedule_publish_record` 视为真实发布事实，因此现有发布动作完成后
Award 仍会保持 `Awaiting publication`。

本次目标是：Live 发布成功时生成可信的只读排班快照，并自动写入对应的
`schedule_publish_record`；任一步骤失败时，不得留下可解锁 Award 的成功记录。

## 2. 范围

### 2.1 本次包含

- 扩展 Live `rosterPublishService.applyDiff` 的发布事务。
- 根据发布后的 `roster_publish` 生成版本化 `.schedule.gz` 快照。
- 写入带完整文件元数据和业务范围的 `schedule_publish_record`。
- 使用真实 `roster_period_id`、周期范围、发布批次和操作人。
- 同一 Crew 的发布必须原子完成，防止部分发布与历史成功记录组合后形成新旧混合 Award。
- 禁止通用 Schedule Publish Record API 绕过真实发布流程直接创建
  `published = 1` 记录。
- 增加 Live 后端回归测试，并更新 PBS 人工测试用例。

### 2.2 本次不包含

- 不修改 PBS Award 的读取规则。
- 不修改优化算法、Gantt/Portal 页面或发布页面交互。
- 不回填历史发布记录。
- 不新增数据库字段，也不需要数据库 migration。
- 不实现对象存储；第一阶段使用 Live Server 可持久化的本地/共享文件目录。

## 3. 方案比较与决策

### 方案 A：只插入数据库记录

实现最少，但 `file_path`、`file_size`、`checksum` 缺失时 Award 不认可；伪造这些字段又会破坏
发布事实的可信度。因此不可采用。

### 方案 B：数据库提交后异步生成快照

发布事务较短，但会出现 `roster_publish` 已更新、快照尚未生成的中间状态，还需要任务重试、
状态恢复和并发版本控制，超出本次最小范围。

### 方案 C：发布事务内生成快照并写成功记录（采用）

在现有串行化事务和 advisory lock 内完成发布数据变更、快照生成及成功记录写入。
文件先写临时文件，再原子重命名；只有文件完整后才插入 `published = 1`。该方案会略微延长
低频发布事务，但边界最清楚，且不会让不完整快照解锁 Award。

## 4. 发布数据流

1. 对用户选择的 keys 去重，开启串行化事务、取得 advisory lock 并加载 Roster Period。
2. 在事务内重新计算所选 diff；无 actionable diff 时按现有逻辑返回，不生成批次、快照或记录。
3. 从所选 actionable rows 取得候选 Crew，一次性查询这些 Crew 在该 Period 的全部 actionable
   keys，并在任何写操作前校验请求完整覆盖。只要一个 Crew 未选全，整个 Apply 回滚；错误提示
   要求用户刷新并选择该 Crew 的全部差异。
4. 完整性预检通过后，锁定必要的源数据和旧 `roster_publish` 行，生成 `batch_id`。
5. 写入 `roster_publish_adjust`，删除旧发布行并插入新发布行。
6. 从当前事务读取该 Roster Period 发布后的完整 `roster_publish` 数据，按稳定字段排序，生成
   版本化 JSON 快照并 gzip 压缩。
7. 快照先写入同一存储目录的临时文件；完成后计算 SHA-256 和字节数，再原子重命名为最终
   `.schedule.gz` 文件。
8. 根据本次完整发布的 Crew 生成 `schedule_publish_record`，共享同一个 `batch_id` 和
   快照文件元数据。
9. 插入全部成功记录后提交数据库事务，再按现有逻辑清除缓存。

如果文件生成、重命名、成功记录插入或数据库提交失败：

- 回滚 `roster_publish`、`roster_publish_adjust` 和成功记录；
- 可以确认数据库未提交时，删除临时文件或已重命名的孤立文件；
- 向用户返回现有产品化发布失败提示，不暴露文件路径、SQL 或异常详情；
- 即使进程在文件完成后、数据库提交前崩溃，最多遗留无数据库引用的孤立文件，不会错误开放
  Award。

PostgreSQL `COMMIT` 可能实际成功但响应丢失。遇到这种“提交结果不确定”时，不得直接删除最终
文件；服务必须使用主库新连接核实本次完整提交指纹：
`batch_id + roster_period_id + 预期 crew_id 集合 + file_path + file_size + checksum + published=1`，
同时核对相同 batch 的 `roster_publish_adjust`。记录数量、Crew 集合和文件指纹必须精确一致：

- 完整指纹与 adjust 均精确匹配：保留文件，并把本次视为已提交成功；
- 明确不存在本批任何记录：删除文件并返回发布失败；
- 结果不完整、冲突或数据库暂时不可核实：保留文件，返回“发布结果待确认，请刷新”，禁止
  判成功、删除文件或自动重试写入；后续按
  batch 受控核对。无引用孤立文件不会开放 Award，而删除已提交文件会制造断链，因此优先保留。

## 5. 快照格式与存储

### 5.1 文件格式

`.schedule.gz` 解压后为 UTF-8 JSON，顶层结构固定为：

```json
{
  "formatVersion": 1,
  "rosterPeriodId": 6,
  "batchId": 1785998972065033,
  "rosterStart": "2026-06-01T00:00:00.000Z",
  "rosterEnd": "2026-06-30T23:59:59.000Z",
  "createdAt": "2026-08-06T00:00:00.000Z",
  "rows": []
}
```

`rows` 保存该 Period 发布后的完整 `roster_publish` 行。Period 范围必须复用现有 diff SQL 的
Base-local 日期相交 CTE，包括跨周期 duty、午夜结束减一秒和有效 Base 时区规则，不得另写一套
简化 UTC 日期判断。

快照使用显式的 version-1 字段 allowlist，字段名使用数据库 snake_case；不得使用 `select *`，
未来数据库新增列不得静默进入版本 1。实现计划必须从当前 `roster_publish` model 生成并固化该
allowlist，至少覆盖 PBS/Award 展示字段、业务标识、计划/实际时间、Credit、Pairing/Fleet、
任务与审计来源字段。序列化规则为：bigint 与 numeric 写十进制字符串，timestamptz 写 UTC ISO
字符串，SQL null 保留 JSON null。按真实字段
`crew_id, sch_str_dt_utc nulls last, pairing_id nulls last, duty_seq nulls last,
seg_seq nulls last, roster_flight_id nulls last, id` 稳定排序。

`formatVersion` 为将来兼容读取保留，本次只支持版本 1。字段 allowlist 及其类型映射需要快照
结构测试锁定。

### 5.2 存储目录

- 新增配置 `SCHEDULE_SNAPSHOT_DIR`，不得在业务代码中硬编码机器路径。
- 生产类环境必须配置为持久化目录；开发/测试环境可使用明确的开发默认目录或测试临时目录。
- 最终文件名包含 `roster_period_id` 和 `batch_id`，例如
  `rp-6/batch-1785998972065033.schedule.gz`。
- 数据库 `file_path` 只保存相对 `SCHEDULE_SNAPSHOT_DIR` 的规范化 key；解析后必须仍位于配置根目录，
  禁止绝对路径和 `..` 目录穿越。
- 临时文件与最终文件必须位于同一 filesystem；临时文件 exclusive create，最终目标若已存在则
  失败，绝不覆盖历史快照。rename 后校验为 regular file，并再次核对 size/checksum；应用层不再
  修改已发布文件，可在平台支持时设置只读权限。
- `file_size` 取最终文件字节数；`checksum`
  保存 SHA-256 十六进制值。

## 6. 发布范围与防止错误开放

一次 Apply 可以只选择部分 diff，而历史成功记录不会因 Live 又出现未发布修改而自动失效。
如果允许同一 Crew 只 Apply 一部分，旧成功记录仍会让 Award 读取已经部分更新的
`roster_publish`，形成新旧混合结果。因此发布原子边界必须是 Crew，而不是单条 key。

本期采用精确 Crew 范围：

- 候选 Crew 来自本次 actionable rows，包括 ADD、UPDATE 和 DELETE。
- 写操作前，在同一事务内一次性查询这些 Crew 在该 Period 的全部 actionable keys。
- 每个候选 Crew 的全部 actionable keys 必须包含在请求 keys 中；任一 Crew 未选全则整个 Apply
  失败，不写 `roster_publish`、快照或发布记录。
- 通过预检的每个 Crew 写一条记录；同批记录共享同一快照文件。
- `crew_id` 写该 Crew ID；`division`、`base`、`ac_type` 从数据库中的该 Crew 有效资料取得，不能
  信任前端过滤参数。
- `base` 必须使用 Roster Start 时点有效且唯一的 prime base；缺失或冲突时拒绝发布该批。
- `ac_type` 使用与 Period 重叠的有效 `crew_fleet`，按
  `coalesce(ac_type, fleet_specific)` 去重、排序后写逗号列表；缺失可靠 fleet 时拒绝发布，不能
  写 null，因为 Award 对 null 的语义是“不限制机队”。

这样即使存在历史宽范围成功记录，也不会产生部分更新后的混合 Award；同时不依赖 UI 是否
“全选”，不会因 division/base 的组合交叉而扩大发布范围。以后若确认需要按完整
Base/Division 聚合，可另行优化，不改变本期正确性。

## 7. `schedule_publish_record` 字段映射

| 字段 | 写入规则 |
|---|---|
| `created_by` / `updated_by` | 当前登录用户 |
| `str_dt` / `end_dt` | `roster_period.rp_start` / `rp_end` 原值 |
| `roster_period_id` | 当前 Apply 的 Period ID |
| `published` | 仅完整成功时写 `1` |
| `division` | Crew 有效 division |
| `base` | Roster Start 时点的有效 prime base |
| `ac_type` | Period 内有效机队范围的稳定逗号列表；缺失或冲突时拒绝发布 |
| `crew_id` | 本条记录对应的 Crew ID |
| `publish_type` | `Normal` |
| `batch_id` | 本次 `roster_publish_adjust` 批次 ID |
| `file_path` | 最终 `.schedule.gz` 路径 |
| `file_size` | 最终文件大小，必须大于 0 |
| `checksum` | 最终文件 SHA-256 |

同一 `batch_id + roster_period_id + crew_id` 只允许产生一条成功记录。现有串行化事务、事务级
advisory lock 和“无 actionable 则不生成批次”的逻辑已能防止正常重复提交；插入时仍使用
`NOT EXISTS` 防御同批重放，不新增唯一索引。

## 8. 通用创建入口约束

现有 `POST /api/scenario/schedule-publish` 不能继续接受调用方直接提交
`published = 1` 和任意文件元数据。实施时为该入口增加明确 Zod contract，只使用
`request.authUser`，任何 number/string 归一后代表成功态的 `published` 输入都返回 403；真实
`published = 1` 只能由 `Publish Roster` 服务内部、在完成文件校验后写入。

列表读取能力保留不变。

## 9. 测试与验收

### 9.1 自动化测试

- 成功 Apply：生成有效 gzip，JSON 可解压解析，文件大小和 SHA-256 与记录一致。
- 成功 Apply：在 commit 前写入正确的 Period、batch、Crew 范围和 `published = 1`。
- ADD、UPDATE、DELETE 都能正确识别候选 Crew。
- 某 Crew 仍有未选中的 actionable diff 时，不为该 Crew 写成功记录。
- 某 Crew 未选全 actionable diff 时，整个 Apply 在写操作前失败；已有历史成功记录时也不会
  产生新旧混合 `roster_publish`。
- 多 Crew 完成发布时，共享一个快照文件并分别生成精确范围记录。
- 无 actionable diff 时，不生成文件或记录。
- 文件写入失败、记录插入失败或序列化冲突时回滚发布数据，且不留下成功记录。
- 数据库实际提交但 COMMIT ACK 丢失时，新连接能确认成功并保留最终文件；无法确认时保留文件
  且不盲目重试。
- 重复 Apply 不产生重复文件或记录。
- 通用创建 API 拒绝直接创建 `published = 1`。
- 缺失/冲突 prime base、缺失 fleet 和空 `ac_type` 都不能降级成 wildcard 成功记录。
- 使用真实 PostgreSQL fixture 验证动态 SQL、Period 边界和文件元数据；不能只依赖 mock 查询顺序。
- 增加跨服务契约测试：由发布流程产出记录，再使用真实 Award resolver 判定该 Crew 可见；范围不匹配
  Crew 不可见。
- 增加真实 Gantt Playwright 回归：同一 Crew 有两个 diff 时只选择一个并 Apply，验证产品化错误
  提示、发布数据未变化、刷新后 diff 仍完整；随后选择该 Crew 的全部 diff，验证发布成功、记录
  生成且页面状态正确。
- 保持现有 5,000 keys 发布测试的数据库查询次数有界；快照数据只执行一次批量读取，禁止
  N+1 查询。

### 9.2 环境验证

- 在开发环境执行一次真实发布，校验文件存在、可解压、checksum 一致。
- 在 SIT 发布一个受控 Period，验证匹配 Crew 的 Award 从
  `Awaiting publication` 变为 `Published`。
- 验证未完成发布或范围不匹配的 Crew 仍保持等待状态。
- 先完整发布，再为同一 Crew 制造两个 diff 并只选一个发布；预期整个发布被拒绝，Award 不会读取
  新旧混合结果。
- UAT 只在部署配置了可持久化 `SCHEDULE_SNAPSHOT_DIR` 后执行发布验证。

### 9.3 验收标准

- Live 页面发布成功后，不需要人工补写 `schedule_publish_record`。
- 数据库不存在缺少文件元数据却标记 `published = 1` 的新记录。
- 发布失败不会留下可被 Award 识别的成功事实。
- 部分发布只开放真正完成发布的 Crew。
- 不改变现有发布页面交互和 PBS Award 读取契约。
- 同一 Crew 未选全时会明确拒绝整批 Apply；这是为保证发布原子性而新增的校验行为，必须通过
  Playwright 覆盖真实页面反馈。

## 10. 风险与部署要求

- 快照生成会延长发布事务，应通过批量查询、流式 gzip 或有界内存实现控制时长；禁止逐 Crew
  查询全部排班。
- `SCHEDULE_SNAPSHOT_DIR` 必须位于持久化且 Live Server 进程可写的存储卷。env schema、
  `.env.example`、SIT/UAT 部署环境与持久卷挂载均属于实施/部署范围；生产类环境缺配置应启动
  失败，目录不可写时应拒绝发布，不得降级为仅写数据库记录。若当前仓库不管理部署 manifest，
  持久卷和目录权限必须列为上线阻塞项。
- 孤立文件不影响 Award 正确性，但应记录不含敏感路径的受控日志，并可后续增加清理任务；本次
  不引入额外定时任务。
- 当前表注释与架构要求已支持该流程，因此不需要 migration；部署时只新增环境配置和目录权限。

## 11. Multi-Agent Parallelism Assessment

- **Recommendation:** No
- **Rationale:** 核心改动集中在同一个发布事务、快照写入和同一组回归测试，强顺序且契约紧密。
- **Suggested split:** 主实现者完成 Live Service、配置、测试和测试用例文档；仅可安排只读独立审查。
- **Write boundaries:** `live-server` 发布服务/配置/测试、Gantt Playwright 与
  `docs/test-cases/pbs`；不修改 Portal、算法或 PBS Award 消费逻辑。
- **Conflict risk:** 多人同时修改 `roster-publish-service.ts` 和其 mock 查询序列，冲突风险高。
- **Execution gate:** 用户审阅并明确批准本 spec 后，才能进入实施计划和代码修改。
