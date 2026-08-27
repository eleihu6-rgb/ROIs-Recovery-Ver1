# NPBS Default Bid 导入 Standing Bid 与绝对日期裁剪设计

## 1. 背景

`CLASS-BidsReport_July2026.txt` 同时包含 `Default Bid` 和 `Current Bid`。现有 NPBS
导入流程把两者当作候选来源：优先选择 Current，Current 不存在或没有可导入条件时才把
Default 写入 Current。这会丢失同一员工同时存在的长期偏好，也与当前已经独立开发完成的
Standing Bid 数据模型不一致。

本次确认的业务语义是：

- `Current Bid` 是当月申请，导入 `period_code=<目标月份>`、`bid_context=Current`。
- `Default Bid` 是长期复用申请，导入 `period_code=STANDING`。
- Default 中的 Days Off、Pairing、Line 条件进入 `StandingLineholder`。
- Default 中的 Reserve 条件进入 `StandingReserve`。
- 同一员工的 Default 和 Current 必须分别保留，不再互相覆盖或互相兜底。

July 文件核查结果：

- 663 名员工；
- 442 人同时存在 Default 和 Current；
- 25 人只有 Default；
- 196 人只有 Current；
- Default 中有大量可复用条件，同时也存在明确年月日、具体 Pairing 和复合条件，不能整块
  无条件写入 Standing。

## 2. 目标

1. 正式导入同时处理 Default 和 Current 两种源上下文。
2. Default 只写 Standing，不再作为 Current 的 fallback。
3. Default 中绝对日期只是附加范围时，删除日期范围并保留仍然完整的长期条件。
4. 条件完全依赖绝对日期时，跳过整条条件。
5. 每次日期裁剪和跳过都进入 dry-run/import 报告，不允许静默修改源语义。
6. Standing 条件是否允许导入只由目标上下文的数据库可见性和 Standing payload 规则决定，
   前后端不得增加 property code 可见性硬编码。
7. 保留正式导入已有的 dry-run、备份、逐员工隔离、run 明细和 rollback 能力。

## 3. 非目标

- 不把具体年月日写入 Standing。
- 不把具体 Pairing Number、具体 Pairing occurrence 或 `On Date` 条件写入 Standing。
- 不为了提高导入成功率而打开数据库中隐藏的 Standing 条件。
- 不修改 Current Bid 的日期语义。
- 不把 Default 复制到 Current，也不在员工缺少 Current 时自动生成 Current。
- 不使用 Playwright 承担正式全量数据写入。
- 不在本阶段实现 Standing 自动参与最终排班计算。

## 4. 核心规则

### 4.1 源上下文到目标上下文

| 源记录 | 条件类型 | 目标 period | 目标 context |
|---|---|---|---|
| Current | DaysOff / Pairing / Line / Reserve | 请求中的目标月份 | `Current` |
| Default | DaysOff / Pairing / Line | `STANDING` | `StandingLineholder` |
| Default | Reserve | `STANDING` | `StandingReserve` |

一个 Default 源记录可以拆成两个独立目标草稿。原始 T1-T7 位置必须保留；条件被跳过时不得
把后面的条件向前压缩。拆分到不同 Standing context 后也保留源 Tier，因此允许某个 context
中存在 Tier 间隔。

### 4.2 绝对日期定义

下列内容都属于 Standing 需要删除的绝对日期：

- 明确年月日，例如 `Jul 6, 2026`、`2026-07-06`；
- 明确日期列表；
- 明确日期范围；
- Pairing occurrence 的具体出发日、值勤日或 Check-In Date；
- payload 中的 `specific_dates`、`date_range` 或等价绝对日期字段。

下列内容不是绝对日期，应继续保留：

- Monday-Sunday；
- Weekends；
- 每日时间窗口；
- Whole Month / First Half / Second Half 等相对月份范围；
- Month-End Carryover 等不绑定具体年月日的长期语义。

### 4.3 日期裁剪判定

导入 Default 时按结构化条件判定，不允许对原始文本做一次全局正则替换后直接保存。

#### A. 日期是可选范围或附加子句

删除绝对日期后，如果剩余内容仍能形成一个完整、可验证、目标 Standing context 可见的
条件，则导入剩余条件。

示例：

- `Award Pairings On Jul 6 If Landing In YVR`
  → `Award pairings landing in YVR`
- `Long Stretch Off 10 days from Jul 1 to Jul 15`
  → `Award at least 10 consecutive days off`
- 带绝对 `dateScope` 的 Airport / Check-In / Pairing Length 等条件
  → 清空 `dateScope`，保留机场、时间或长度条件。

这种转换会扩大适用范围，属于用户已经明确接受的业务行为。

#### B. 日期是条件主体

删除日期后没有独立业务含义或无法通过 Standing 校验时，跳过整条条件。

示例：

- `Prefer Off Jul 6, 2026`
- `Prefer Off Jul 6-10, 2026`
- 只有 `Any Duty On Jul 6, 2026`

#### C. 删除日期后仍包含 Standing 禁止内容

整条跳过，不继续降级：

- 具体 Pairing Number / Pairing occurrence；
- 只针对具体日期的 On Date 条件；
- 删除日期后字段不完整；
- 删除日期后 property 在目标 Standing context 不可见；
- 删除日期后 payload 仍不符合 Standing 专用校验。

#### D. 复合条件

复合条件先拆成结构化子句，再删除绝对日期子句：

- 剩余一个或多个可独立表达的长期子句时，按当前 mapper 已确认的拆分语义导入；
- 同一源 preference 拆出的多个条件保持同一个源 Tier；
- 无法忠实拆分的次级子句继续记录 blocker，不得猜测或编造；
- 不允许仅靠字符串截断产生残缺的 Award/Avoid 条件。

## 5. 数据流与实现边界

### 5.1 解析与选择

正式导入权威仍为 `live-server/src/services/crew-bid-import/`。

现有“每名员工只选择一个 block”的逻辑改为：

1. 按员工收集全部 Default / Current block；
2. Current block 独立准备为 Current 导入项；
3. Default block 独立准备，并按 mapped `bidType` 拆成
   `StandingLineholder` / `StandingReserve` 导入项；
4. 缺少任一源 block 时只是不生成对应目标项，不做 fallback。

`pbs-server` 中保留的旧导入实现不是正式管理入口。本次采用唯一策略：保留旧 HTTP 路径但
停止执行导入，统一返回 `410 Gone` 和固定产品文案，引导调用方使用 live-server 管理端
入口。删除其 service 注册和写入能力，并更新 route 测试，避免另一入口继续执行
“Current 覆盖 Default”的旧规则。

### 5.2 Standing 规范化与校验

Default mapper 的输出必须经过 Standing 专用规范化步骤：

1. 解析出 property、action、Tier、结构化子句和日期范围；
2. 删除绝对日期；
3. 判断剩余条件是否完整；
4. 从 `pbs_bid_property_context` 读取目标 context 可见性；
5. 使用与 `pbs-server` Standing 保存接口一致的序列化和 payload 校验；
6. 生成 canonical Standing payload 后才能进入写入阶段。

不得在 importer 中复制一份独立的 Standing property 白名单。数据库 context visibility 是
可见性的唯一来源；共享的纯规范化/校验逻辑应被 Standing API 与 importer 共同复用，防止
两套规则再次漂移。

### 5.3 写入身份

Standing 写入使用现有正式身份：

- `period_code=STANDING`
- `roster_period_id=null`
- `bid_context=StandingLineholder | StandingReserve`
- 唯一键继续使用 `(crew_id, period_code, bid_context)`

Current 写入保持：

- `period_code=<目标月份>`
- `bid_context=Current`

Current、StandingLineholder、StandingReserve 是三个独立覆盖目标。导入某一目标时不得删除
同一员工另外两个目标的数据。

### 5.4 导入 run 明细与数据库迁移

现有 import item 只有源 `bid_context` 和单个 `imported_bid_id`，无法清晰表示一个 Default
block 拆成两个 Standing 草稿。增加目标上下文审计字段：

- 保留 `bid_context` 表示源上下文 `Default | Current`；
- 增加 `target_bid_context varchar(24)` 表示
  `Current | StandingLineholder | StandingReserve`；
- 每个实际目标草稿生成一条 import item，因此每条 item 仍只对应一个 `imported_bid_id`；
- item 唯一定位和内存 key 必须包含 crew、category、源 context、目标 context；
- problem 同步记录目标 context，便于区分 Lineholder 和 Reserve；
- contract、管理端明细和测试同步展示源/目标 context。

现有 backup 唯一键 `(run_id, crew_id)` 无法保存同一员工的三个目标快照。migration 同时：

- 为 `pbs_crew_bid_import_backup` 增加 `target_bid_context varchar(24)`；
- 历史 backup 行回填 `Current`；
- 删除旧唯一索引 `uq_pbs_crew_bid_import_backup_run_crew`；
- 新唯一键使用 `(run_id, crew_id, period_code, target_bid_context)`；
- backup 写入、查询、恢复和测试都必须带目标 context，禁止只按 crew 取第一条。

数据库变更使用新的幂等 migration，并同步开发、SIT、UAT。不得修改已经执行过的历史
migration。

## 6. 报告与错误语义

新增稳定 problem code：

- `STANDING_ABSOLUTE_DATE_REMOVED`
  - warning；
  - 记录原始条件、删除的日期/日期范围和最终导入摘要。
- `STANDING_DATE_ONLY_SKIPPED`
  - warning；
  - 条件完全依赖绝对日期，整条跳过。
- `STANDING_FORBIDDEN_REMAINDER_SKIPPED`
  - warning；
  - 删除日期后仍剩具体 Pairing、On Date 或其他 Standing 禁止内容。
- `STANDING_PROPERTY_NOT_VISIBLE`
  - warning；
  - 数据库目标 context 标记不可见。
- `STANDING_PAYLOAD_INVALID`
  - error；
  - 删除日期后产生的 payload 未通过 Standing 校验。

problem 的阻断范围固定为：

- `ABSOLUTE_DATE_REMOVED`：条件继续导入；
- `DATE_ONLY_SKIPPED`、`FORBIDDEN_REMAINDER_SKIPPED`、`PROPERTY_NOT_VISIBLE`：只跳过当前条件，
  同一目标中的其他合法条件仍可导入；
- 上述 warning 导致某个目标没有任何合法条件时，该目标记录为 skipped，且不得用空草稿
  覆盖已有 Standing；
- `PAYLOAD_INVALID`：阻断该员工本次全部目标（Current、StandingLineholder、
  StandingReserve），不允许部分写入；
- 数据库写入、快照或恢复错误同样阻断并回滚该员工的全部目标。

用户界面和导入报告必须使用产品语言说明结果，不展示内部异常或 SQL。重复问题按现有 run
明细聚合，不产生无限 toast。

## 7. 覆盖、备份与回滚

1. dry-run 同时展示 Current 与 Standing 的准备结果，但不写数据库。
2. 正式导入前，分别快照将被覆盖的 Current、StandingLineholder、StandingReserve。
3. 只覆盖本次存在且通过准备阶段的目标：
   - 没有 Default 时，不清空已有 Standing；
   - Default 全部条件被跳过时，不用空草稿覆盖已有 Standing；
   - 没有 Current 时，不清空已有 Current。
4. 同一员工任一目标写入失败时，使用员工级 savepoint 回滚该员工本次涉及的全部目标，
   避免 Current 成功但 Standing 失败形成半导入。
5. rollback 必须删除本次创建的所有目标 bid，并按各自 context 恢复导入前快照。

## 8. 接口与管理端

现有含义模糊的：

- `useCurrentBidWhenAvailable`
- `fallbackToDefaultBid`

不再参与 Default/Current 二选一。接口改成明确的独立开关：

- `importCurrentBid`，默认 `true`；
- `importDefaultAsStanding`，默认 `true`；
- `overwriteCurrentBid` 保留；
- 增加 `overwriteStandingBid`，正式导入必须明确为 `true`。

兼容规则固定如下：

- 新旧字段都不存在：`importCurrentBid=true`、`importDefaultAsStanding=true`；
- 只有旧字段时：
  - `useCurrentBidWhenAvailable` 映射为 `importCurrentBid`；
  - `fallbackToDefaultBid` 映射为 `importDefaultAsStanding`；
- 新旧字段同时出现时，新字段优先；
- `fallbackToDefaultBid=true` 只表示导入 Default→Standing，永远不能恢复 Default→Current；
- 使用旧字段的请求在 run problems 中记录一次 `DEPRECATED_IMPORT_OPTION` warning；
- `overwriteStandingBid` 不从任何旧字段推断：dry-run 可以省略，正式导入 Default 时必须
  显式为 `true`，否则返回字段级 400；
- Gantt 管理端本次同步改用新字段，并显示两个独立导入范围和源→目标说明。

## 9. 测试与验收

### 9.1 Parser / mapper 单元测试

- 同一员工同时有 Default 和 Current，两个 block 都保留；
- 只有 Default 时只生成 Standing，不生成 Current；
- 只有 Current 时只生成 Current；
- 日期附加范围被删除，剩余条件成功导入；
- date-only Prefer Off 被跳过；
- 日期 + 具体 Pairing 被跳过；
- weekday/weekend/time window 不被当作绝对日期删除；
- 复合条件拆分后保持源 Tier，不压缩后续 Tier；
- 数据库 target context 不可见时跳过；
- canonical payload 与 Standing API 的 serializer/validator 一致。

### 9.2 Service / 数据库集成测试

- 同一员工一次写入 Current、StandingLineholder、StandingReserve；
- 三个目标使用正确 period/context，互不删除；
- Default 全被跳过时保留已有 Standing；
- 员工级任一目标失败时三个目标全部回滚；
- import item/problem 正确记录 source/target context；
- rollback 恢复三个 context 的旧快照；
- 动态 SQL 通过 fixture 结构检查、远端 PostgreSQL `EXPLAIN` 或最小只读执行。

### 9.3 Playwright

- Gantt 管理端上传 July 文件并执行 dry-run；
- run 详情同时显示 `Default → Standing` 与 `Current → Current`；
- 抽查至少一条“删除日期后导入”的 Default；
- 抽查至少一条 date-only skipped；
- 登录 PBS Portal，确认 Current 只在 Bid 页面，Default 转换结果只在 Standing Bid；
- Standing 页面编辑、删除和 Tier 展示正常。

### 9.4 July 文件验收

正式导入前必须先执行 dry-run，并输出：

- Current / StandingLineholder / StandingReserve 目标项数量；
- 删除绝对日期的条件数量；
- date-only 跳过数量；
- 具体 Pairing / On Date 跳过数量；
- 不可见 property 和 invalid payload 数量；
- 将被覆盖的三个 context 草稿数量。

人工审核 blocker 后才允许 confirm import。

## 10. 验收标准

- 442 名同时拥有 Default 和 Current 的员工，其 Default 和 Current 都被独立解析并进入
  可审计报告；只有至少一个合法长期条件时才生成对应 Standing 草稿。
- Default 永远不会写入 Current。
- Current 永远不会写入 Standing。
- Standing 数据中不存在明确年月日、具体 Pairing 或 On Date payload。
- 日期裁剪后保存的条件能够通过 Standing API 回读、编辑和再次保存。
- property 显示/隐藏完全由数据库目标 context 控制。
- dry-run、正式导入、run 明细和 rollback 对三个目标 context 都可审计。
- Current Bid、Standing Bid 和已有导入回滚行为无回归。

## 11. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: parser、mapper、Standing validator、写入身份、备份和 rollback 是同一条紧密事务链，
  拆分实现容易造成源/目标 context 或 payload 语义不一致。
- Suggested split: 不拆分写入；可以在实现完成后安排独立只读审查。
- Write boundaries: `live-server` 正式导入链路、共享 contracts、必要的 `pbs-server` Standing
  纯校验复用、Gantt 管理界面、migration、自动化与 QA 测试。
- Conflict risk: 多人并行修改 import contract 和 mapper 时风险高。
- Execution gate: 本 spec 审查并由用户明确批准后，才进入实施计划和代码修改。
