# PBS Period 生命周期实施计划

> 发布事实采用 record-only 契约：Live 发布事务写 `schedule_publish_record.published=1`，不生成
> `.schedule.gz`，文件兼容字段保持 null。详见
> `docs/superpowers/specs/2026-08-06-live-roster-publish-record-only-design.md`。

## 实施目标

按已批准的设计完成以下闭环：

1. Live Period Admin 在同一条 `roster_period` 上维护真实 RP 范围、Bid 窗口和 Award 计划开放时间。
2. PBS Bid 保持独立的 Current Bid Period 解析，并修正截止时刻边界。
3. PBS Award 使用独立 Period 解析，实际发布事实只读取 `schedule_publish_record`。
4. Award 查询范围使用 `rp_start / rp_end`，不再从 `Period Code` 推算自然月。
5. Portal 明确展示 `AVAILABLE / PUBLISH_PENDING / SCHEDULED / UNCONFIGURED` 状态。

## 已确认边界

- `schedule_publish_record` 由现有发布流程生成，本次不修改优化算法。
- 本次不人工补造 `schedule_publish_record.published=1`。
- 当前开发库该表无数据；实施完成后用只读 SQL 验证查询计划，并用测试 fixture 覆盖发布状态。
- 不自动提交 Git。

## 任务 1：数据库与模型兼容

修改：

- `sql/schema/live/01-base.sql`
- `sql/schema/live/02-crew-roster.sql`
- 新增 `sql/migration/2026-08-06-pbs-period-award-publication-gate.sql`
- `pbs-server/src/models/live/roster-period.ts`

内容：

- 恢复/保留 `roster_period.pbs_award_publish_at timestamptz`。
- 为 `schedule_publish_record` 添加 `(roster_period_id, published, created_at desc)` 索引。
- 保持 migration 幂等，不修改历史 migration。
- 不转换现有 `schedule_publish_record` 时间列类型，查询侧显式处理业务日期。

验证：

- 在远端开发库执行 migration 前只读 schema 检查和 `EXPLAIN`。
- migration 由用户确认后再决定是否执行到开发/SIT/UAT；代码实现阶段不擅自改库。

## 任务 2：Live Period Admin 合同

修改：

- `live-server/src/routes/pbs/period-admin.ts`
- `live-server/src/__tests__/unit/pbs-period-admin-route.test.ts`
- `gantt/src/services/pbs-period-admin-api.ts`
- `gantt/src/components/pbs/pbs-period-view.tsx`
- 对应 Gantt Playwright 测试。

内容：

- API 返回 `rpStart / rpEnd / awardPublishAt`。
- 新建/编辑接受真实 RP 范围和 Award 计划时间。
- 校验 RP 顺序、Bid 顺序、Bid Close 不晚于 Award Publish。
- 不再在保存时仅凭 Period Code 静默重算用户提交的 RP 范围。
- 表格和弹窗展示 Roster Range 与 Award Publish。
- 年度生成继续给出 Flair Q1 特殊范围，并生成默认 Award Publish 候选值。

验证：

- Live route Vitest 覆盖合法、非法、特殊 Q1 和更新场景。
- Gantt Playwright 通过真实 UI 完成新建/编辑字段交互。

## 任务 3：Bid Period 边界

修改：

- `pbs-server/src/services/lineholder/current-bid.ts`
- `pbs-server/src/services/lineholder/current-period-bid.test.ts`

内容：

- 明确 `open <= now < close` 为 OPEN，`now >= close` 为 CLOSED。
- 保持 OPEN → nearest future → latest closed 的稳定排序。
- Current Bid Period 继续服务现有 Bid/Dashboard 页面，不与 Award resolver 共用。

验证：

- 增加 `now == bidCloseAt` 回归测试和确定性排序测试。

## 任务 4：Award 独立 resolver 与发布门禁

修改：

- 新增或扩展 `pbs-server/src/services/award/award-period-resolver.ts`
- `pbs-server/src/services/award/award-results-service.ts`
- `pbs-server/src/services/award/award-results-mapper.ts`
- `pbs-server/src/services/award/types.ts`
- 对应 Vitest。

内容：

- 从 `roster_period` 解析 Award 候选，不再调用 `resolveCurrentPeriod()`。
- 使用管理员 `pbs_award_publish_at` 与匹配的 `schedule_publish_record.published=1` 双重门禁。
- 发布记录按 `roster_period_id`、完整 RP 日期覆盖、division/base/crew 范围匹配。
- `visiblePeriod` 与 `candidatePeriod` 分离，返回明确 availability。
- Roster 查询直接使用 resolver 的 `rpStart / rpEnd`；删除 Award 的自然月推算。
- Mapper 的 `published` 只消费 resolver 结果，不再根据 roster 行或 `pbs_award_result.status` 推断。

验证：

- 覆盖四种 availability、范围不匹配、计划时间边界、特殊 Q1 RP、仅有 roster 行、仅有 award_result 状态等冲突 fixture。
- 对生成 SQL 做远端 PostgreSQL `EXPLAIN`。

## 任务 5：共享合同与 Portal 状态

修改：

- `packages/contracts/pbs-award-results.js`
- `packages/contracts/pbs-award-results.d.ts`
- `packages/contracts/pbs-award-results.test.mjs`
- `pbs-portal/src/features/award/types.ts`
- `pbs-portal/src/features/award/award-mappers.ts`
- `pbs-portal/src/features/award/components/award-right-panel.tsx`
- `pbs-portal/src/features/award/pages/award-page.test.tsx`
- Award Playwright 测试。

内容：

- API 增加 `availability`、`awardPublishAt`、`firstPublishedAt/latestPublishedAt`。
- AVAILABLE 才展示 Award roster。
- PUBLISH_PENDING、SCHEDULED、UNCONFIGURED 使用稳定、可访问的页面状态文案。
- 不展示旧 Period 数据冒充当前结果。

验证：

- Portal Vitest 覆盖四种状态。
- Playwright 验证未发布与已发布主流程。

## 任务 6：QA 文档与全量验证

新增：

- `docs/test-cases/pbs/period/2026-08-06-period-award-publication-lifecycle.md`

验证顺序：

1. Focused Live Vitest。
2. Focused PBS Server Vitest。
3. Contracts tests。
4. Focused Portal/Gantt tests。
5. Playwright 主流程。
6. `live-server`、`pbs-server`、`gantt`、`pbs-portal` build/lint。
7. 根目录 `npm run check:ui`。
8. 根目录 `npm run verify:pbs`（若环境依赖可用）。
9. GitNexus `detect_changes --compare main`。

## 风险控制

- 如果 SIT/UAT 的 `schedule_publish_record` 样本显示范围字段语义与设计不同，停止实现消费者门禁并先更新 spec。
- 如果成功记录没有完整快照字段，不在 reader 中静默放宽；先确认发布流程的真实成功标记。
- 不把 `pbs_status`、`roster_publish` 行数或 `pbs_award_result.status` 作为兼容 fallback，避免继续保留多份事实来源。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: Live contract、Award resolver、共享合同和 UI 状态存在严格顺序依赖。
- Suggested split: 单一代理实现，独立评审仅做只读检查。
- Write boundaries: 所有实现由主代理统一修改和集成。
- Conflict risk: 并行修改 Period/Award 合同会造成 fixture 和 API 版本冲突。
- Execution gate: spec 已获批准；按本计划顺序执行。
