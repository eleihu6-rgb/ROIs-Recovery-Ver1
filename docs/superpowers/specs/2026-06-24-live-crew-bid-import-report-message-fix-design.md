# Live Crew Bid Import 报告 message 超长失败修复设计

## 背景

`Crew Bid Import` 在 Gantt Admin Tools 中通过 `live-server` 的接口执行：

- `POST /api/admin/crew-bid-imports/dry-run`
- `POST /api/admin/crew-bid-imports`
- `GET /api/admin/crew-bid-imports`
- `GET /api/admin/crew-bid-imports/:runId`
- `DELETE /api/admin/crew-bid-imports/:runId`

本次用户导入 `CLASS-BidsReport_March2026.txt` 时，Dry Run 成功，但正式 Import 失败。数据库核查结果：

- 最新失败 run `e1437536-5cc2-4abd-9b90-48072f692833` 实际写入了 `642` 个 bid。
- run 最终状态为 `failed`，UI 显示 `Imported 0 / Failed 659`。
- 失败原因是 `value too long for type character varying(500)`。
- 失败发生在写入 import report 明细时，不是在解析、pairing/airport resolve 或 bid 写入阶段。
- 两次失败 run 已通过数据库 backup 回滚完成，导入 bid 残留为 `0`，旧 bid `84/84` 已恢复。

现有表结构中：

- `pbs_crew_bid_import_item.message varchar(500)`
- `pbs_crew_bid_import_problem.message varchar(500)`
- `pbs_crew_bid_import_problem.raw_text text`

`live-server/src/services/crew-bid-import/crew-bid-import-service.ts` 已有 `truncateMessage()`，但目前只用于整批失败的 `import_run_failed`。批量写入 `pbs_crew_bid_import_item.message` 和 `pbs_crew_bid_import_problem.message` 时仍直接写原始 message，因此某些机场缺失、pairing 缺失、unsupported 条件或系统写入错误文案过长时，会导致整批 import report 写入事务失败。

## 目标

1. 正式 Import 不再因为 report message 超过 `varchar(500)` 导致整批 run 标记失败。
2. 导入报告能保留完整或足够完整的失败原因，便于用户判断：
   - Missing Pairing
   - Missing Airport
   - Over T7
   - Unsupported
   - Crew / User
   - System / Write
   - Other
3. 修复范围只覆盖 `live-server`。`pbs-server` 后续会删除，本次不修改。
4. 不改变 Dry Run、正式导入、rollback 的业务语义。
5. 不自动重新导入用户文件；修复后由用户手动 Dry Run / Import 验证。

## 非目标

- 不优化 import/rollback 性能。
- 不重写 crew bid import 的事务模型。
- 不修改 `pbs-server` 的重复 import service。
- 不改变 failures 分类 UI。
- 不改变 pairing/airport 匹配规则。
- 不处理已回滚 run 的历史展示数据。

## 方案比较

### 方案 A：只在代码中截断 message

优点：

- 改动最小。
- 即使数据库仍是 `varchar(500)`，也能避免同类错误。

缺点：

- 失败原因会被截断，用户可能看不到完整机场列表、pairing 列表或 unsupported 条件。
- 与导入报告“需要解释为什么失败”的目标冲突。

### 方案 B：字段改为 `text`，并在代码写 report 时做安全归一化

优点：

- report 可以保存完整失败原因。
- 代码仍能防御异常 message，例如非字符串、空字符串、极端超长字符串。
- 与当前 `raw_text text` 的设计一致，报告类字段不应因长度限制破坏导入事务。

缺点：

- 需要新增 migration。
- 需要确认远程 `f8_pbs` schema 执行 migration 后再重新导入。

### 方案 C：只改字段为 `text`

优点：

- 能解决当前 `varchar(500)` 报错。
- 改动少。

缺点：

- 代码层没有统一 report message 入口，后续仍可能出现不规范值。
- 测试无法清楚表达“report 写入必须防御超长 message”的约束。

## 推荐方案

采用方案 B：字段改为 `text`，并在 `live-server` 写 report 明细时统一处理 message。

## 设计

### 1. 数据库 migration

新增 migration，例如：

`sql/migration/2026-06-24-live-crew-bid-import-report-message-text.sql`

内容：

```sql
alter table pbs_crew_bid_import_item
    alter column message type text;

alter table pbs_crew_bid_import_problem
    alter column message type text;
```

说明：

- migration 保持 schema-agnostic，依赖执行时的 `search_path` 指向 `f8_pbs`。
- 不修改历史建表脚本 `2026-06-16-pbs-crew-bid-import-run.sql`，避免重写已确认 migration。
- 如果后续需要初始化全新环境，可以另行决定是否同步更新 seed/schema baseline；本次只做增量修复。

### 2. live-server report message 写入防御

修改：

`live-server/src/services/crew-bid-import/crew-bid-import-service.ts`

新增或复用一个统一 helper：

- 输入：`string | null | undefined`
- 输出：可写入 report 表的 `string | null`
- 处理：
  - `null/undefined` 保持为 `null`。
  - 其它值转成字符串。
  - 去掉 `\u0000` 这类 PostgreSQL text 不接受的空字符。
  - 设一个很高的保护上限，例如 `16_000` 字符，防止异常对象或重复拼接导致 report 爆炸。
  - 超出上限时尾部加 `... [truncated]`。

应用位置：

- `pbs_crew_bid_import_item.message`
- `pbs_crew_bid_import_problem.message`
- `import_run_failed` 的 message 可继续走同一 helper。

原则：

- 业务失败原因应保存为 report data，不应该让 report 持久化失败反过来把整次 import 标记为系统失败。
- `raw_text` 继续保存原始 preference 文本，不做业务截断。

### 3. 错误处理语义

修复后，如果某些 crew 因业务原因不可导入：

- run 不应因为 report message 超长变成系统级 `failed`。
- run status 应按 `determineStatus()` 的现有规则计算：
  - 全部 crew 失败：`failed`
  - 部分成功且有 warning/error：`completed_with_warnings`
  - 无问题：`completed`
- UI summary 应显示真实 imported / failed 数量。
- Failures 表应能展示具体失败项和原因。

如果 bid 写入阶段自身失败：

- 单个 crew 的 `preparedItem.item.status` 仍设为 `failed`。
- 写入 report 时保存 `bid_write_failed` problem。
- 不因 problem message 过长导致整批 report 写入失败。

### 4. 测试

新增或扩展 live-server 测试：

`live-server/src/services/crew-bid-import/__tests__/crew-bid-import-service.test.ts`

覆盖：

1. `insertRunItemsAndProblems` 写入超长 `preparedItem.item.message` 时，不抛出 `varchar(500)` 类错误，传给 DB 的 message 为归一化后的安全文本。
2. `insertRunItemsAndProblems` 写入超长 `problem.message` 时，不影响 run summary 更新。
3. `updateRunRecordFailed` 仍保存系统级失败 message，并使用同一个 helper。
4. helper 对 `null/undefined`、普通字符串、包含 `\u0000` 的字符串、超过保护上限的字符串行为稳定。

如果现有测试 mock DB 不容易直接调用私有函数，可通过 service import 流程构造一个会产生长 message 的 prepared item，或在测试 mock 中断言插入 `pbs_crew_bid_import_item/problem` 时收到的参数已被归一化。

### 5. 手工验证

修复并执行 migration 后：

1. 刷新 Admin Tools。
2. 对同一 `CLASS-BidsReport_March2026.txt` 先执行 Dry Run。
3. 确认 Dry Run 与之前一致，Unsupported / Missing Pairing / Missing Airport 分类能显示。
4. 执行 Import。
5. 预期：
   - 不再出现 `value too long for type character varying(500)`。
   - run status 不应因为 report 写入失败而变成系统级 failed。
   - summary 显示真实 imported / failed。
   - Failures 表显示具体 crew、line、seq、failed preference、code、reason。
6. 如需要重跑失败导入，先确认之前失败 run 已 rolled back，避免覆盖状态混乱。

## 风险与缓解

### 风险 1：migration 未在目标 schema 执行

表现：

- 代码改完后，如果目标库仍是 `varchar(500)`，超长 message 仍可能失败。

缓解：

- 实施时必须在远程 `f8_pbs` schema 执行 migration。
- 代码 helper 仍保留保护上限，但主要依赖字段改为 `text` 保存完整原因。

### 风险 2：report message 极端巨大

表现：

- 如果一个问题拼出几万字符，接口响应和页面渲染会变慢。

缓解：

- helper 使用高上限，例如 `16_000` 字符。
- 原始 preference 文本仍在 `raw_text`，无需把无限长内容塞进 message。

### 风险 3：只修 live-server，pbs-server 保持旧逻辑

说明：

- 用户已确认只修 `live-server`，`pbs-server` 后续会删除。
- 本次不触碰 `pbs-server`，避免扩大范围。

## 验收标准

1. `live-server` 中 Crew Bid Import 正式导入不会因为 report message 长度导致 `value too long for type character varying(500)`。
2. 对大文件导入，run detail 能持久化 items/problems。
3. UI 能看到真实成功/失败数量，而不是 report 写入失败造成的 `Imported 0 / Failed all`。
4. Failure reason 能显示具体业务原因。
5. 两个 message 字段在目标 schema 中为 `text`。
6. live-server 相关测试通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 `live-server` 一条导入链路和一个 migration，单 agent 更容易保持上下文一致。
- Suggested split: 不拆分。
- Write boundaries: `live-server/src/services/crew-bid-import/*`、`sql/migration/*`、必要的 live-server 测试文件。
- Conflict risk: 低。
- Execution gate: 用户确认本 spec 后进入实现。

