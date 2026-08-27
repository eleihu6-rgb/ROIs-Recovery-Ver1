# Roster Publish Credit 差异检测与批量发布实施计划

日期：2026-07-29

对应 spec：
`docs/superpowers/specs/2026-07-29-roster-publish-credit-diff-batch-apply-design.md`

状态：用户已批准实施

## 1. 实施目标

在不修改 schema、PBS Award contract 和页面布局的前提下：

1. Flying、Ground 的 scheduled/actual Credit 变化能进入 Publish Roster `UPDATE`。
2. apply 使用固定有界数量的批量 SQL，保持原子事务和调整历史。
3. Jun 2026 大批量发布在 120 秒内完成。
4. crew `762` 的 ILL、VAC、CGS Credit 写入 `roster_publish`，Award 不再因此 Missing。

## 2. 预计修改文件

- `live-server/src/services/roster/roster-publish-service.ts`
- `live-server/src/__tests__/services/roster/roster-publish-service.test.ts`
- `e2e/tests/pbs-portal/...` 中最小相关 Award Playwright 用例
- `docs/test-cases/pbs/award/...` 中本轮 QA 回执或测试说明

不修改：

- `sql/schema`、`sql/migration`
- `pbs-engine`、`engine-server`
- PBS Award API contract 和 Portal 布局

## 3. 实施步骤

### Step 1：建立基线与影响范围

- 对 `diffSql`、`applyDiff`、调整历史 SQL 和批量 insert 目标符号执行 GitNexus
  upstream impact；若工具不可用，记录不可用并用调用点、route、tests 做人工影响核对。
- 运行现有 focused test：

```bash
cd live-server
npx vitest run src/__tests__/services/roster/roster-publish-service.test.ts
```

- 保存开发库 crew `762`、RP06/RP07 的只读基线。

### Step 2：实现 Credit-aware diff

- 在 `source_rows` 计算与正式发布一致的 Flying effective scheduled/actual Credit。
- 在 `publish_rows` 读取发布快照 Credit。
- Flying 按稳定 segment 顺序聚合两个 Credit signatures。
- Ground 先按业务 key 分组，聚合去重 ids、count 和 Credit signatures。
- 将 Credit 纳入 `UPDATE` 判断与 `changed_fields`。
- 保持现有 API DTO 不变。

验证：

- focused tests 覆盖 Flying/Ground、NULL 变化、fallback、相同值和 changed fields。
- 开发库只读 diff 证明 crew `762` 的目标活动变成 `UPDATE`。

### Step 3：实现事务内 selected diff 物化

- `BEGIN ISOLATION LEVEL SERIALIZABLE`。
- 获取事务级 publish advisory lock。
- 在事务内加载 roster period、生成 batch id。
- 使用 selected `text[]` 物化 fresh diff，包括：
  key、kind、status、去重 source/publish ids、source/publish count。
- 锁定物化结果引用的 Live 源行和发布快照行。
- stale keys 留在返回结果，不进入写入集合。

验证：

- stale、并发 serialization failure、锁与 rollback focused tests。

### Step 4：批量调整历史

- 用一次 set-based insert 写 `roster_publish_adjust`。
- ADD 保存 new-only；DELETE 保存 old-only。
- Flying UPDATE 按 `roster_flight_id` full join。
- Ground UPDATE 在 logical key 内按稳定 id 排序，以 `key + row_number` full join。
- 断言每个 old/new 物理行在 batch 内最多出现一次。

验证：

- 覆盖 ADD/DELETE/Flying UPDATE/Ground duplicate key/数量不等的审计测试。

### Step 5：批量 delete / insert / count 校验

- 一次批量删除所有 selected publish ids。
- 一次批量插入 Flying rows。
- 一次批量插入 Ground rows。
- 结果按 spec 矩阵校验：
  - ADD：0 delete、source_count insert。
  - UPDATE：publish_count delete、source_count insert。
  - DELETE：publish_count delete、0 insert。
- 任何 key 不一致则抛出受控错误并整批 rollback。
- 返回值保持：
  applied/updated/skipped 为 logical key；inserted/deleted 为 physical row。

验证：

- 计数矩阵、segment 数变化、缺失源行、rollback tests。

### Step 6：缓存与错误语义

- COMMIT 后 best-effort 失效 publish cache。
- cache invalidation 失败记录 sanitized server log，仍返回发布成功。
- serialization failure 映射为可重试产品错误，不暴露 SQL/异常细节。

验证：

- COMMIT 后缓存失败不返回发布失败。
- 事务内错误必有 ROLLBACK、无 COMMIT。

### Step 7：性能门槛

- 1 key 和 5,000 keys 的 mock apply 成功路径均不超过 15 次
  `client.query`。
- 禁止 actionable loop 内数据库 query。
- 对远端开发库执行 generated SQL 的只读 `EXPLAIN`/最小执行。
- 实际 RP06 发布 HTTP 总耗时必须不超过 120 秒。

### Step 8：自然月 target manifest 与正式发布

- 按 crew-base timezone 和现有本地午夜规则生成 Jun 2026 exact key manifest。
- RP06 仅含 Jun 1–29；RP07 仅含 Jun 30。
- manifest 存放在受控临时目录，不写入 Git；正式回执只保留脱敏计数、batch 和耗时。
- 通过正式 Roster Publish service 提交 exact keys，不直接写库。
- 核对 batch audit、计数、重复 Ground 和发布后 diff。

### Step 9：Award E2E 与 QA

- 真实 PBS Portal 打开 crew `762`、Jun 2026 Award。
- 验证 ILL、VAC、CGS Credit 来自发布快照且不再 Missing。
- 验证 Flying Credit、Fleet、Explanation 无回归。
- 运行相关 Playwright，并记录精确命令和 PASS/FAIL。
- 增补最小 QA 测试说明。

### Step 10：交付检查

- 运行 focused Vitest、必要 build、Playwright 和 `npm run check:ui`
  （仅在触及前端样式时需要）。
- 在提交前执行 GitNexus `detect_changes(compare main)`；若工具不可用，使用
  `git diff --check`、scoped diff 和测试回执替代并明确说明。
- 只提交本任务文件，保留工作区中已有 Standing Bid 等无关改动。

## 4. 失败与停止条件

- Credit diff 仍将 crew `762` 判定为 `NO_CHANGE`：停止发布，修正数据语义。
- Ground 分组出现无法解释的重复/笛卡尔：停止写入，输出只读样例。
- apply 超过 15 次数据库调用或 120 秒：视为未完成，不降级为人工逐 crew 发布。
- 任何远端写入前只读 manifest 与预期范围不一致：停止并重新核对。
- SIT/UAT/生产不在授权范围内，不执行。

## 5. Multi-Agent 执行决定

不启用多 agent 实施。diff、apply、审计和 focused tests 紧密耦合并集中在同一
service，单一实现者更安全。主 agent 负责实现、验证、发布和最终回执。
