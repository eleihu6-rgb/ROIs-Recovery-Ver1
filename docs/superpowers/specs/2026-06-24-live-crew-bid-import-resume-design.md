# Live Crew Bid Import 补导与 Pairing Number 长列表修复设计

## 背景

当前 `Crew Bid Import` 已能完成整份 `CLASS-BidsReport_March2026.txt` 的正式导入，但最新 run 结果仍有部分 crew 写入失败：

- run `a642e202-2793-4e2f-8190-2368621948bd`
- `Selected Crew`: 659
- `Imported Crew`: 642
- `Failed Crew`: 17
- 失败原因：`bid_write_failed: value too long for type character varying(1000)`

代码和 schema 核查后，根因不是 report message，也不是 pairing 匹配失败，而是业务 bid 写入时字段长度不够：

- `pbs_bid_group.param_a varchar(1000)`
- `pbs_bid_condition.param_a varchar(1000)`

失败 crew 的源文件里存在大量类似条件：

```text
Avoid Pairings If Pairing Number T4501, T4502, T4503, ...
Award Pairings If Pairing Number T4525, T4529, T4551, ...
```

导入逻辑会先把 `Pairing Number` resolve 成目标月份实际 `pairing_id`。原始 `T4501` 很短，但 resolve 后每个 id 都可能是 UUID/长字符串。几十个 pairing id 用逗号拼接后写入 `param_a`，就会超过 `varchar(1000)`。

另外，正式 Import 现在是整份文件重新跑。用户在修复失败后再次上传同一文件时，已经成功导入的 642 个 crew 会被再次覆盖写入，或需要用户先手工 rollback/delete，操作成本高，也容易误操作。

## 目标

1. 修复 `Pairing Number` 长列表导致的 `param_a varchar(1000)` 写入失败。
2. 支持同文件同周期再次上传时自动补导未完成 crew：
   - 已成功导入的人不再重写。
   - 上一次失败、未导入、或没有成功 item 的人才重新导入。
3. Dry Run 也能预览补导效果，避免正式 Import 前看不出来。
4. UI 报告清楚显示本次是补导：
   - 选中了多少 crew。
   - 跳过了多少已成功导入 crew。
   - 本次实际新导入多少。
   - 仍失败多少，以及失败原因。
5. 保持 rollback 语义清晰：每个 import run 只 rollback 自己实际写入的 bid，不影响之前已经成功的 run。

## 非目标

- 不重写 import 性能模型。
- 不改变 pairing/airport 匹配规则。
- 不修改 `pbs-server`，只处理 `live-server` 和 Gantt Admin Tools。
- 不新增复杂导入向导。
- 不自动 rollback 旧 run。
- 不处理不同文件或不同 period 的跨文件补导。

## 方案比较

### 方案 A：只把 `param_a` 改成 `text`

优点：

- 可以解决当前 17 个 `varchar(1000)` 写入失败。
- 改动小。

缺点：

- 用户重新上传同一文件时仍会重写已经成功的 642 人。
- 失败后继续导入仍需要手动清理旧 run 或 rollback。
- 没解决用户当前最痛的重复操作问题。

### 方案 B：`param_a` 改成 `text` + 自动补导同文件同周期未完成 crew

优点：

- 解决字段长度问题。
- 再次上传同一文件时自动跳过已成功 crew，只补失败/未完成 crew。
- 不需要新增用户操作步骤。
- rollback 边界清楚：本次补导 run 只负责自己写的新 bid。

缺点：

- 需要在 live-server 中增加历史成功 item 查询和 skip 逻辑。
- Gantt Admin Tools 需要调整报告展示，避免把“已跳过的成功 crew”混到 Failures 里。

### 方案 C：新增显式 “Resume Previous Import” 按钮或开关

优点：

- 用户控制更明确。
- 可以保留“强制全量重导”的入口。

缺点：

- UI 和 API 合约改动更大。
- 用户每次仍需要知道该选哪个模式。
- 当前需求明确是“再次上传文件就补导”，自动模式更符合操作习惯。

## 推荐方案

采用方案 B。

默认规则：

> 同一 `Period Code` + 同一源文件内容 `source_sha256` 再次上传时，系统自动跳过之前已经成功导入且尚未 rollback 的 crew，只导入失败或未完成 crew。

如果用户确实想对同一文件做全量重导，应先 rollback 对应历史 import run，再重新 Import。

## 设计

### 1. 数据库字段修复

新增 migration：

`sql/migration/2026-06-24-live-crew-bid-param-a-text.sql`

内容：

```sql
alter table pbs_bid_group
    alter column param_a type text;

alter table pbs_bid_condition
    alter column param_a type text;
```

说明：

- 只改 `param_a`，因为当前超长值来自多值列表，主要写在 `param_a`。
- `param_b` / `param_c` 保持原长度，避免无必要扩大 schema。
- migration 通过目标 schema 的 `search_path` 执行，例如 `f8_pbs`。
- 不修改旧建表脚本，保持增量 migration。

### 2. 历史成功 crew 判断

在 `live-server/src/services/crew-bid-import/crew-bid-import-service.ts` 增加历史成功查询。

匹配条件：

- `pbs_crew_bid_import_run.mode = 'import'`
- `period_code = 当前请求 periodCode`
- `source_sha256 = 当前上传文件 hash`
- `rolled_back_at is null`
- run status 不是 `rolled_back`
- 对应 `pbs_crew_bid_import_item.status = 'imported'`
- `imported_bid_id is not null`
- 对应 `pbs_bid.id = imported_bid_id` 仍存在
- crew 在本次 selected blocks 内

输出结构：

```ts
Map<crewId, {
  runKey: string;
  importedBidId: number;
  importedAt: string;
}>
```

如果同一个 crew 有多个历史成功记录，取最新成功记录即可。

### 3. 自动补导流程

当前流程：

1. parse source
2. select blocks
3. prepare items
4. resolve pairing/airport
5. write all ready items
6. write run detail

补导后流程：

1. parse source
2. select blocks
3. 查询历史已成功导入 crew
4. 对 selected blocks 分成两类：
   - `resumeSkippedBlocks`: 已成功导入，不再 prepare/write
   - `pendingBlocks`: 失败/未完成/从未导入，本次继续处理
5. 只对 `pendingBlocks` 执行 prepare/resolve/write
6. `resumeSkippedBlocks` 生成 item：
   - `status = 'skipped'`
   - `importedBidId = 历史 imported_bid_id`
   - `message = Already imported by previous run <runKey>; skipped for resume import.`
   - preference count 可保留解析数量，importedPreferenceCount 为 0
7. summary：
   - `selectedCrew` 仍等于本次选择总人数，例如 659
   - `skippedCrew` 等于历史成功跳过人数，例如 642
   - `importedCrew` 只统计本次新写成功人数，例如 17
   - `failedCrew` 只统计本次仍失败人数

### 4. Dry Run 预览

Dry Run 不写 run record，但应使用同样的历史成功查询。

Dry Run 结果：

- 已成功 crew 标记为 `skipped`
- 未完成 crew 标记为 `ready` / `failed`
- summary 显示 `skippedCrew`
- performance 中可增加或复用 detail，例如 `resumeSkippedCrew: 642`

这样用户在正式 Import 前能看到：这次不会重写已经成功的人。

### 5. 正式 Import 行为

正式 Import 创建新的 run record。

该 run 的 item 明细包括：

- 历史成功且跳过的 crew：`skipped`
- 本次新导入成功的 crew：`imported`
- 本次仍失败的 crew：`failed`

该 run 的 backup 只写本次新导入成功 crew。

rollback 当前补导 run 时：

- 只删除当前 run 写入的新 bid。
- 只恢复当前 run backup 里的 previous bid。
- 不影响之前已经成功并被本次 skipped 的 crew。

### 6. Gantt Admin Tools 展示

当前 UI 已有 `skippedCrew` 字段，但 summary 卡片没有明显展示 crew 级 skipped。

调整建议：

1. Summary 增加 `Skipped Crew` 或 `Already Imported` 卡片。
2. Failures 表不要把“resume skipped”当失败展示。
3. 如果需要展示，可增加轻量提示：
   - `642 crew already imported from previous run and skipped.`
4. Failures 分类继续聚焦真正失败项：
   - Missing Pairing
   - Missing Airport
   - Over T7
   - Unsupported
   - Crew / User
   - System / Write
   - Other

### 7. 错误和边界处理

#### 历史 run 已 rollback

不跳过，重新导入。

#### 历史 item 是 imported，但 imported bid 已不存在

不跳过，重新导入。

#### 用户上传同一文件但换了 crewIds 范围

只对本次 selected blocks 生效：

- 本次选择内已历史成功的 crew 跳过。
- 本次选择内未完成的 crew 导入。
- 本次没有选择的人不处理。

#### 用户上传修改后的文件

`source_sha256` 不同，不触发自动补导，按新文件完整导入。

#### 用户想强制同文件全量重导

先 rollback 历史成功 run，再重新 Import。

本次不新增 `forceReimport` 选项，避免扩大接口和 UI。

## 测试

### live-server 单元测试

文件：

`live-server/src/services/crew-bid-import/__tests__/crew-bid-import-service.test.ts`

新增覆盖：

1. `param_a` 超过 1000 的 Pairing Number 长列表可以写入，不再触发 `varchar(1000)`。
2. 同源文件同 period 存在历史 imported item 时，Import 跳过该 crew，只写未完成 crew。
3. Dry Run 能预览 skipped crew。
4. rollback 当前补导 run 不影响历史成功 run 的 imported bid。
5. 历史 run 已 rolled_back 时，不触发 skip。
6. 历史 imported_bid_id 不存在时，不触发 skip。

### Gantt UI 测试

建议补 Playwright 用例：

1. 先导入一个小 fixture，让部分 crew 成功、部分 crew 模拟失败。
2. 修复失败条件后再次上传同一 fixture。
3. 断言：
   - Summary 显示 skipped/already imported crew。
   - Import 只写入未完成 crew。
   - Failures 表不显示大量 already-imported skipped crew。
   - Run status 正确显示 `completed` 或 `completed_with_warnings`。

## 手工验收

1. 执行 migration 到远程 `f8_pbs`。
2. 使用同一 `CLASS-BidsReport_March2026.txt`。
3. 再次 Dry Run。
4. 预期 Dry Run 显示：
   - selected 659
   - skipped/already imported 642
   - ready 或 pending 17
5. 点击 Import。
6. 预期：
   - 不再出现 `value too long for type character varying(1000)`。
   - 本次只写 17 个之前失败的人。
   - 如果 17 个都成功，当前补导 run 显示 imported 17、skipped 642、failed 0。
   - 之前成功的 642 个 bid 不被重写。

## 风险与缓解

### 风险 1：自动 skip 让用户无法全量重导

缓解：

- 保留 rollback 作为全量重导前置操作。
- 文案明确：同文件同周期默认是 resume import。

### 风险 2：历史 imported item 存在但 bid 被手工删除

缓解：

- skip 判断必须 join `pbs_bid` 确认 imported bid 仍存在。

### 风险 3：UI 把 skipped crew 当失败显示

缓解：

- 调整 Failures 表过滤逻辑，resume skipped 不进入失败分类。
- Summary 单独显示 skipped/already imported。

### 风险 4：字段改成 text 后页面展示超长

缓解：

- `param_a` 是业务条件存储，不直接在列表大段展示。
- UI bid 展示仍可使用已有 label / summary，不直接暴露完整 id list。

## 验收标准

1. `pbs_bid_group.param_a` 和 `pbs_bid_condition.param_a` 在目标 schema 中为 `text`。
2. 当前 17 个 `bid_write_failed varchar(1000)` 的 crew 可以重新导入。
3. 同文件同 period 再次上传时，历史成功 crew 不重写。
4. Dry Run 能预览补导 skip 数。
5. 当前补导 run 的 rollback 不影响历史成功 crew。
6. UI 能清楚区分：
   - 已成功跳过
   - 本次新导入成功
   - 本次仍失败
7. 相关 live-server 测试和 Gantt Playwright 测试通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动横跨同一条 import 业务链路、run summary 语义和 UI 展示，拆分会增加合约同步成本。
- Suggested split: 不拆分；由一个 agent 顺序修改 migration、live-server、测试、Gantt UI。
- Write boundaries: `live-server/src/services/crew-bid-import/*`、`sql/migration/*`、`gantt/src/components/pbs/*`、必要的 e2e 测试。
- Conflict risk: 中等；主要风险是 summary/status 语义和 UI 过滤逻辑不一致。
- Execution gate: 用户确认本 spec 后进入实现。
