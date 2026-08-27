# PBS Award Credit 差异重发测试案例

## 前置条件

- Live Server 已部署 `6035a9d7` 或后续包含相同修复的版本。
- 开发库存在 Jun 2026 的 `roster_flight` 和旧 `roster_publish` 快照。
- 使用 crew `762` 登录 PBS Portal。
- 仅通过正式 Roster Publish service 发布，不直接更新 `roster_publish`。

## 主流程

1. 在 Publish Roster diff 中选择 Credit 发生变化的 Flying/Ground key。
2. 执行发布，记录 `batch_id`、logical key 数、插入/删除物理行数和耗时。
3. 再次读取相同 diff，确认已发布 key 不再因 Credit 显示 `UPDATE`。
4. 打开 PBS Portal `/award`，确认周期为 `Published · Jun 2026`。
5. 查看顶部 `Credit Hours`。
6. 在 Roster Details 中检查 ILL、VAC、CGS。

## 预期结果

- `sch_credited_minutes` 或 `act_credited_minutes` 任一变化均触发 `UPDATE`。
- apply 在一个 `SERIALIZABLE` 事务和同一个 `batch_id` 内完成。
- 1 个 key 与 5,000 个 keys 的数据库调用次数均不超过 15 次。
- crew `762` 的 ILL、VAC、CGS Credit 均显示 `4:00`，页面不显示 `Missing data`。
- 顶部 `Credit Hours` 显示 `89:04`。
- Flying Credit、Fleet、日历、Selected Duty 和 Reason Report 现有行为无回归。

## 异常与边界场景

1. apply 前 key 已变为 `NO_CHANGE`。
   - 预期：返回 stale key，不写发布快照和审计。
2. 事务中发生 serialization failure。
   - 预期：整批回滚，提示刷新 diff 后重试，不暴露数据库错误。
3. 插入/删除物理 id 与物化 diff 不一致。
   - 预期：整批回滚，不返回成功。
4. Ground 同一业务 key 存在多个物理行。
   - 预期：先聚合并去重，审计按稳定 `row_number` 配对，不产生笛卡尔重复。
5. COMMIT 后 Redis 失效失败。
   - 预期：发布仍返回成功，服务端记录脱敏 warning，由 TTL 兜底。
6. Live 源 Credit 本身为 `NULL`。
   - 预期：发布不伪造 Credit；该数据继续显示缺失并交由上游补源。
7. 同一 crew/flight 在 Live 中被重复分配到不同 pairing。
   - 预期：唯一约束阻止发布，整批回滚；先修复 Live 源冲突，再重新发布。

## 开发环境回执（2026-07-29）

- crew `762` 小批量：25 keys，4.14 秒，发布后 Credit diff 为 0。
- RP06 Ground：16,588 applied，9.87 秒。
- RP07 Ground：163 applied，3.61 秒。
- Award 页面：`Credit Hours = 89:04`；ILL、VAC、CGS 均为 `4:00`；无
  `Missing data`。
- Playwright：

```bash
cd e2e
npx playwright test --config=config/playwright.config.ts \
  --project=pbs-portal \
  tests/pbs-portal/award-published-data-completeness.spec.ts \
  --no-deps
```

结果：`1 passed`。

## 回归范围

- Live Server Publish Roster diff/apply、审计和缓存失效。
- PBS Server `/api/award/current`。
- PBS Portal Award Summary、Roster Details、Selected Duty。
- Flying、Ground、重复 Ground key、stale key 和大批量发布。
