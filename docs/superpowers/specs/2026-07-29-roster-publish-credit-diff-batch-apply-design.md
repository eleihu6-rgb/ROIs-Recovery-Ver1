# Roster Publish Credit 差异检测与批量发布设计

日期：2026-07-29

状态：设计已确认，待正式 spec 审查与用户批准实施

相关模块：`live-server`、`gantt`、`e2e`

## 1. 背景与问题

PBS Award 只读取 `roster_publish`。开发库中当前 Live roster 已有 ILL、VAC、CGS
等活动的 Credit，但旧的 `roster_publish` 快照仍为空。

2026-07-29 通过真实 Live `Publish Roster` 页面检查 crew `762`：

- Live 数据中的 ILL、VAC、CGS Credit 已存在。
- 对应发布快照的 `sch_credited_minutes`、`act_credited_minutes` 仍为空。
- 发布差异把 29 条相同业务记录判定为 `NO_CHANGE`，因此不能通过重新发布补齐 Credit。
- 全 Division 的 `2026RP06` 有 6,961 条可操作差异。当前 apply 实现逐条保存调整快照、
  删除和插入，运行约 25 分钟后返回 HTTP 500；事务已完整回滚。

根因有两个：

1. 发布 diff 没有读取、聚合或比较 Credit 字段。
2. 发布 apply 对每个 diff row 顺序执行多条 SQL，数据库往返次数随行数线性增长，
   不适合历史全量重新发布。

## 2. 目标

1. Flying 和 Ground 的 scheduled/actual Credit 任一发生变化时，发布 diff 标记为
   `UPDATE`。
2. 重新发布后，`roster_publish.sch_credited_minutes` 和
   `roster_publish.act_credited_minutes` 与发布时的有效源值一致。
3. 将 apply 改为有界数量的批量 SQL，不再逐条执行。
4. 保持一次 apply 一个事务、一个 `batch_id`；失败时整批回滚。
5. 保留现有发布调整历史、stale key 检查、选择范围和返回计数语义。
6. 完成开发环境 Jun 2026 对应 `2026RP06`、`2026RP07` 的重新发布，并验证 PBS
   Award 不再因这些活动显示 Credit Missing。

## 3. 非目标

- 不新增数据库字段，不创建 migration。
- 不改变 Credit 的业务算法或来源所有权。
- 不让 PBS Award 运行时 join Live 表。
- 不修改 pbs-engine、engine-server 或优化算法。
- 不直接用一次性 SQL 绕过正式发布和发布调整历史。
- 不修改 SIT、UAT 或生产数据。
- 不重构 Publish Roster 页面布局或选择交互。

## 4. Credit 数据语义

发布 diff 必须比较“本次正式发布将写入的有效值”，而不是只比较
`roster_flight` 的原始列。

### 4.1 Flying

```text
effective_sch_credit
= roster_flight.sch_credited_minutes
  ?? pairing_segment.duty_sch_credited_minutes
  ?? pairing_segment.duty_act_credited_minutes

effective_act_credit
= roster_flight.act_credited_minutes
  ?? pairing_segment.duty_act_credited_minutes
```

该优先级必须与现有 `applyInsertSql('FLYING')` 保持一致。

Flying diff 的粒度继续是 `crew_id + pairing_id`。Credit signature 按与现有
segment signature 相同的稳定顺序生成，避免数组顺序产生假差异。

### 4.2 Ground

```text
effective_sch_credit = roster_flight.sch_credited_minutes
effective_act_credit = roster_flight.act_credited_minutes
```

Ground 没有 `pairing_segment`，不得使用 Flying fallback。ILL、VAC、CGS 等活动的
Credit 已由 NOC/Live 导入链路写入 `roster_flight`。若 Live 源值本身为空，本轮不伪造。

### 4.3 比较规则

- 使用 PostgreSQL `IS DISTINCT FROM`，正确识别 `NULL ↔ 非 NULL`。
- numeric Credit 按数据库值精确比较，不做前端字符串或 HH:MM 比较。
- `sch_credited_minutes` 不同，`changed_fields` 包含
  `sch_credited_minutes`。
- `act_credited_minutes` 不同，`changed_fields` 包含
  `act_credited_minutes`。
- 其他现有 diff 字段和业务 identity 保持不变。

## 5. 发布 Diff 设计

修改 `live-server/src/services/roster/roster-publish-service.ts`：

1. `source_rows` 选择 Flying 的 effective scheduled/actual Credit。
2. `publish_rows` 选择 `roster_publish` 中对应 Credit。
3. `source_flying` / `publish_flying` 增加稳定排序的 scheduled/actual Credit
   signatures。
4. `flying_diff` 将两个 Credit signature 纳入 `UPDATE` 判断和
   `changed_fields`。
5. `source_ground` / `publish_ground` 选择 scheduled/actual Credit。
6. `ground_diff` 将两个 Credit 字段纳入 `UPDATE` 判断和
   `changed_fields`。

diff API 和前端类型不增加新字段。现有 `changedFields: string[]` 已能表达变化原因。

## 6. 批量 Apply 设计

### 6.1 总体事务

apply 继续执行以下顺序：

1. `BEGIN ISOLATION LEVEL SERIALIZABLE`。
2. 获取 roster publish 事务级 advisory lock，避免两个发布 apply 并行处理同一快照。
3. 在事务内获取 roster period 和新的 `batch_id`。
4. 在事务内重新执行并物化 selected diff，识别 actionable rows 和 stale keys。
5. 锁定物化结果引用的 `roster_flight` 源行和 `roster_publish` 快照行。
6. 批量写发布调整历史。
7. 批量删除需要替换或删除的旧 `roster_publish` 行。
8. 批量插入 Flying 和 Ground 的新发布快照。
9. 校验每个 actionable key 的实际结果。
10. `COMMIT`。
11. 提交后清理相关缓存。

事务内步骤失败均 `ROLLBACK`。serialization failure 不自动静默重试，返回可重试的产品化
错误，要求用户重新加载 diff 后再次发布。

缓存清理位于 `COMMIT` 之后，不属于可回滚事务：

- 缓存失效失败不得把已成功提交的发布报告为失败。
- 记录 sanitized server log，不记录 roster 内容或数据库异常细节。
- 依赖现有 cache-aside TTL 自动恢复，并尽可能执行 best-effort 失效。
- apply HTTP 仍返回发布成功；不得因为缓存失败诱导用户重复发布。

### 6.2 Selected rows 传递

- 复用 apply 请求中的 `keys: string[]`，不改变 HTTP contract。
- SQL 使用一个 `text[]` 参数或等价的单参数 recordset 传递 selected keys。
- 不为每个 key 动态增加 SQL 参数，避免 PostgreSQL 参数数量限制。
- selected key、status、kind、source/publish ids 必须来自 apply 时重新计算的 diff，
  不信任前端提交的状态或 id。
- selected diff 必须在 `SERIALIZABLE` 事务内物化一次；审计、删除、插入和结果校验
  全部只读取该物化结果，不得在不同语句中各自重新解释 key。
- 源行与快照行锁定后发生的并发 roster 修改必须等待、触发 serialization failure 或在
  下一次 diff 中体现，不能与本次发布混入两个不同的一致性视图。

### 6.3 调整历史

- 同一次 apply 的所有调整记录使用同一个 `batch_id`。
- `roster_publish_adjust` 仍按现有粒度保存被替换/删除的发布快照。
- 每条调整记录保留原有 `ADD` / `UPDATE` / `DELETE` 状态语义。
- 批量化只改变 SQL 执行方式，不减少审计信息。
- 本轮不新增 `roster_publish_adjust` 字段；审计继续保存该表当前已有的新旧侧列。

审计新旧侧规则：

| Status | old side | new side | 审计行数/配对 |
|---|---|---|---|
| `ADD` | 全部为 NULL | 每个 source 物理行一次 | `source_count` |
| `DELETE` | 每个旧 publish 物理行一次 | 全部为 NULL | `publish_count` |
| `UPDATE` Flying | 旧 publish rows | 新 source rows | 按 `roster_flight_id` full join；相同 id 配成一行，仅一侧存在的 id 保留 NULL 对侧 |
| `UPDATE` Ground | 旧 publish rows | 新 source rows | 在 logical key 内分别按物理 id 稳定排序生成 `row_number`，按 `key + row_number` full join |

因此：

- Flying UPDATE 审计行数等于新旧 `roster_flight_id` 的 union 数。
- Ground UPDATE 审计行数等于 `max(source_count, publish_count)`。
- 每个 old/new 物理行在同一 batch 内最多出现一次。
- Ground 重复 key 不做原始多对多 join，不产生笛卡尔审计。
- Credit-only UPDATE 仍生成 UPDATE 审计，但精确 Credit 值不在当前
  `roster_publish_adjust` schema 中；本轮不扩展审计表字段。

### 6.4 删除与插入

- 删除使用选中 diff 重新解析出的 `publish_ids` 批量完成。
- Flying 插入按选中的 `crew_id + pairing_id` 集合，从 Live 源一次性
  `INSERT ... SELECT`。
- Ground 插入按选中的 `roster_flight.id` 集合，从 Live 源一次性
  `INSERT ... SELECT`。
- 写入字段及 Credit fallback 必须复用当前 `applyInsertSql` 的语义；不得因批量化
  改变快照内容。
- `ADD`、`UPDATE`、`DELETE` 返回计数保持现有 API 含义。

返回计数的精确定义：

| 字段 | 单位 | 定义 |
|---|---|---|
| `applied` | logical key | 本次事务成功处理的 actionable key 数 |
| `updated` | logical key | status 为 `UPDATE` 的成功 key 数 |
| `inserted` | physical row | 实际插入 `roster_publish` 的物理行数 |
| `deleted` | physical row | 实际删除 `roster_publish` 的物理行数 |
| `skipped` | logical key | apply 时已 stale、未进入事务写入的 key 数 |

各 status 的预期校验：

| Status | 事务内源数据 | 旧快照 | 预期删除 | 预期插入 | 逻辑计数 |
|---|---|---|---|---|---|
| `ADD` | `source_count >= 1` | `publish_count = 0` | 0 | `source_count` | `applied +1` |
| `UPDATE` | `source_count >= 1` | `publish_count >= 1` | `publish_count` | `source_count` | `applied +1`, `updated +1` |
| `DELETE` | `source_count = 0` | `publish_count >= 1` | `publish_count` | 0 | `applied +1` |

Flying segment 数变化时，`UPDATE` 的 `publish_count` 与 `source_count` 可以不同；
不得错误要求 inserted 与 deleted 相等。校验只要求每个 key 的实际删除/插入数分别等于
物化 diff 中对应的 `publish_count` / `source_count`。

### 6.5 Ground key 分组

Ground 业务 identity 继续使用当前 key：

```text
crew_id + assignment_group + assignment +
sch_str_dt_utc + sch_end_dt_utc + dep_arp + arv_arp
```

但 diff CTE 必须显式按该 key 分组：

- `source_ground` 聚合成一个 logical key，生成稳定排序、去重的 `roster_ids`，
  `source_count` 和 scheduled/actual Credit signatures。
- `publish_ground` 聚合成一个 logical key，生成稳定排序、去重的 `publish_ids`，
  `publish_count` 和 scheduled/actual Credit signatures。
- diff 在两个已分组集合之间做一对一 full join，不允许原始多行直接 full join 导致
  笛卡尔扩增。
- apply 对 `roster_ids`、`publish_ids` 先去重，再分别插入/删除每个物理 id 一次。
- 调整历史严格使用第 6.3 节的新旧侧配对规则。
- Ground `segmentCount` 表示该 logical key 的 `source_count`；DELETE 时回退为
  `publish_count`。

### 6.6 stale 与异常结果

- apply 重新计算后已不再 actionable 的 key 返回到 `staleKeys`，不进入事务写入。
- actionable key 若应插入但没有找到 Live 源行，整批失败并回滚，不能静默报告成功。
- actionable key 的实际删除/插入结果与第 6.4 节矩阵不一致时，整批失败并回滚。
- 用户可见错误沿用项目统一通知入口，显示产品化结果和重试建议，不暴露 SQL、
  exception 或数据库内部信息。

## 7. 性能要求

- apply 内数据库往返次数必须为固定有界数量，不随 selected key 数量逐条增长。
- 不允许保留 `for (const row of actionable)` 内逐条数据库 query 的实现。
- 正常成功路径的整个 apply 数据库阶段最多 15 次 PostgreSQL `client.query` 调用，
  从第一条 `BEGIN` 开始，到最后一条 `COMMIT` 结束。预算明确包含事务控制、
  advisory lock、period/batch 读取、selected diff 物化、行锁、stale/预期计数读取、
  审计 insert、publish delete、Flying insert、Ground insert 和结果校验。
- 预算不包含 `pgPool.connect` 与提交后的 Redis cache invalidation。
- 失败路径最多 16 次：成功路径预算内的已执行调用，加最后一次 `ROLLBACK`；
  失败路径不得有 `COMMIT`。
- focused test 必须用 1 个 key 与至少 5,000 个 keys 运行相同 apply mock，断言
  成功路径从 `BEGIN` 到 `COMMIT` 的 `client.query` 总次数都不超过 15。
- 开发环境 `2026RP06` 约 6,961 条 actionable rows 的验收，从 HTTP request 发出到
  成功 response 返回必须不超过 120 秒。
- 120 秒是硬性 PASS/FAIL 边界；超过即视为未完成，不使用“环境波动”豁免，也不得以
  逐条或人工按 crew 分批发布代替。

## 8. 影响范围

预计修改：

- `live-server/src/services/roster/roster-publish-service.ts`
- `live-server/src/__tests__/services/roster/roster-publish-service.test.ts`
- 必要的 Live Publish / PBS Award Playwright 用例
- 必要的 PBS QA 测试说明

预计不修改：

- 数据库 schema / migration
- PBS Award API contract
- PBS Portal 页面布局
- engine 项目

## 9. 验证与验收

### 9.1 后端自动化测试

新增或更新 focused Vitest，覆盖：

1. Flying scheduled Credit 不同 → `UPDATE`。
2. Flying actual Credit 不同 → `UPDATE`。
3. Flying Credit fallback 与正式 insert 规则一致。
4. Ground `NULL → 240` → `UPDATE`。
5. Ground actual/scheduled 任一不同 → `UPDATE`。
6. Credit 相同 → `NO_CHANGE`。
7. `changed_fields` 返回正确 Credit 字段。
8. 大量 selected keys 仍使用有界数量 SQL。
9. 调整历史、删除、Flying 插入、Ground 插入使用同一事务和 batch。
10. stale key 不写入。
11. 逐类验证第 6.4 节 ADD/UPDATE/DELETE 矩阵。
12. Flying segment 数变化时允许 inserted 与 deleted 不同。
13. Ground 重复业务 key 不产生笛卡尔扩增、重复插入或重复审计。
14. 插入/删除计数与物化 diff 预期不一致时回滚。
15. 并发变化触发 serialization failure 时整批回滚并返回可重试错误。
16. `COMMIT` 后缓存失效失败仍返回发布成功，避免用户重复发布。
17. 1 key 与 5,000 keys 的成功路径均不超过 15 次数据库 query。
18. ADD/DELETE 审计分别完整保存 new-only/old-only 侧。
19. Flying UPDATE 按 `roster_flight_id` 配对；Ground UPDATE 按 key 内稳定
    `row_number` 配对，审计行数符合第 6.3 节。

### 9.2 远端只读验证

在修改远端数据前：

- 对开发库执行最小只读 diff / `EXPLAIN`。
- crew `762` 的 ILL、VAC、CGS 从 `NO_CHANGE` 变为 `UPDATE`。
- 核对 changed fields 包含 Credit。
- 核对 Flying 与 Ground 都能识别 Credit 差异。
- 核对 Ground key 分组前后的 source/publish 物理行数，证明不会发生笛卡尔扩增。

### 9.3 开发环境正式发布

代码验证通过后，通过正式 Roster Publish apply service 发布自然月
`2026-06-01` 至 `2026-06-30` 的目标 keys，不得直接修改数据库。

发布前必须先生成并保存只读 target manifest，内容至少包含：

- `roster_period_id`
- exact diff `key`
- `kind`
- `status`
- `crew_id`
- `business_start_date`
- `source_count`
- `publish_count`

manifest 范围规则复用 diff 中现有 crew-base timezone 和本地午夜规则：

- `2026RP06`：只包含 `business_start_date` 位于
  `2026-06-01..2026-06-29` 的 actionable keys，排除 May 31。
- `2026RP07`：只包含 `business_start_date = 2026-06-30` 的 actionable keys，
  不发布 Jul 1 及之后开始的 keys。
- Ground 结束时间恰为 base-local `00:00` 时，沿用现有规则归属前一业务日。
- Flying key 以该 pairing diff row 的最早 scheduled start 在 crew base timezone
  下的日期作为 `business_start_date`；选中一个 Flying key 时仍发布该 key 的完整
  pairing rows，不拆 segment。

manifest 在写入前必须输出 RP06/RP07 各自 exact key 数、ADD/UPDATE/DELETE 数和物理
source/publish 行数，作为操作回执。apply 请求只能提交 manifest 中的 exact keys。

优先通过真实 Live `Publish Roster` 页面完成可精确选择的 keys；若页面现有筛选无法表达
自然月边界，则使用同一认证下的正式 `/api/roster/publish/apply` 端点提交 manifest keys。
这仍走同一个 service、事务和审计链路，不得改用直接 SQL。

发布后核对：

- actionable 差异归零或只剩与本任务无关的已知差异。
- `roster_publish` 中 ILL、VAC、CGS Credit 与 Live 源一致。
- 同一业务 ground task 不产生重复发布记录。
- 发布调整历史包含本次 batch。
- 保存 HTTP 总耗时、PostgreSQL query 次数、actionable/inserted/deleted/updated
  返回计数及 batch 审计核对回执。
- `2026RP06` 约 6,961 条 actionable rows 的 HTTP 总耗时不超过 120 秒。
- 发布后按 manifest 逐 key 核对；RP07 不得出现 manifest 之外 Jul 1 及以后
  `business_start_date` 的新发布 batch 记录。

### 9.4 PBS Award Playwright

使用真实开发页面验证 crew `762`、Jun 2026：

- 月度 Credit 不再因活动 Credit 为空显示 `Missing data`。
- ILL、VAC、CGS 使用发布快照中的真实 Credit。
- Flying Credit、Fleet、已有 Award Explanation 行为不回归。
- Award API 仍只读取发布快照，不在运行时 join Live 表。

## 10. 回滚

- apply 本身保持原子事务，运行失败自动回滚。
- 实施代码可通过常规 Git revert 回退。
- 已成功发布的数据不使用直接 SQL 删除；如需业务回退，使用现有
  `roster_publish_adjust` batch 审计信息制定单独恢复操作。

## 11. Multi-Agent Parallelism Assessment

- Recommendation：No
- Rationale：核心 diff、apply 和测试集中在同一个 service 及同一组 SQL contract，
  并行编辑冲突风险高，协调成本大于收益。
- Suggested split：主 agent 顺序完成 service、focused tests、远端验证和 UI 验收。
- Write boundaries：单一实现者负责 `roster-publish-service` 及其测试。
- Conflict risk：多人同时修改同一 SQL CTE 和 apply 事务会产生高冲突。
- Execution gate：正式 spec 经用户批准并完成 implementation plan 后才开始改代码。

## 12. 验收标准

本任务完成必须同时满足：

1. Credit-only 变化能被 diff 标记为 `UPDATE`。
2. Flying 和 Ground 均覆盖 scheduled/actual Credit。
3. 全量 apply 不再逐条执行 SQL。
4. 大批量发布成功，失败仍整批回滚。
5. crew `762` 的目标活动 Credit 写入发布快照。
6. Jun 2026 Award 页面不再出现由这些 Credit 引起的 Missing。
7. 所有 focused tests、真实发布验证和 Award Playwright 均有明确 PASS 回执。
