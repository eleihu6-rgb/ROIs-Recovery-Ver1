# PBS Period Migration 后回归修复设计

## 目标

修复 Period 生命周期字段上线后发现的两个真实问题，并补齐历史 Period 数据，使 Bid 与 Award 页面恢复可用。

## 范围

1. 修复 `GET /api/pairing-bids/current` 的 PostgreSQL `42883`：`f8_pbs.pbs_bid.roster_period_id` 为 `bigint`，Current Period CTE 暴露的是文本 ID。比较时将可信的 roster Period ID 显式转换为 `bigint`，保持数据库列一侧不做转换，避免破坏索引使用。
2. 对 DEV、SIT、UAT 中 `pbs_award_publish_at` 已配置、且任一新字段为空的 Period 执行逐字段幂等回填：
   - 仅当 `pbs_award_final_at is null` 时，写入 `pbs_award_publish_at + interval '2 days'`。
   - 仅当 `pbs_mis_award_deadline_at is null` 时，写入 `pbs_award_publish_at + interval '6 days'`。
   - 已有值保持不变；使用 `coalesce(已有值, 推导值)`，候选条件为 `pbs_award_publish_at is not null and (pbs_award_final_at is null or pbs_mis_award_deadline_at is null)`。
3. 修复 Award 待发布提示：只有响应当前展示的 Period 为 `AVAILABLE`，且 `upcomingPeriod` 是更新的 `UNCONFIGURED`、`SCHEDULED` 或 `PUBLISH_PENDING` Period 时，才显示 `Showing the latest published Award`。`AVAILABLE` 必须同时满足三个生命周期时间均已配置、已到 `Award Publish`，并存在与当前机组身份精确匹配的 `schedule_publish_record`。没有任何可读历史 Award 时，只显示当前 Period 未配置空态。
4. 增加能捕获 bigint/text 错误的真实 PostgreSQL SQL 验证，并更新 Award 页面回归断言。

## 不做

- 不修改 Current Bid Period 的选择规则。
- 不修改 Award 生命周期时间规则。
- 不改算法、PBS Engine 或发布流程。
- 不为错误类型增加兼容分支或静默降级。

## 数据安全

- schema 映射固定为 DEV=`f8`、SIT=`f8_sit_live`、UAT=`f8_uat_live`，数据库均为已核验的远端 `rois`。
- 更新前对每个 schema 只读预览候选 ID、Period Code、原值、推导值与总数；本轮预期每个 schema 24 条，总计 72 条。
- 每个 schema 使用独立事务和 `UPDATE ... RETURNING`。实际返回行数不是 24 时立即回滚并停止后续环境。
- 回填仅更新 `pbs_award_publish_at is not null` 且至少一个目标字段为空的记录，并通过 `coalesce` 保留已填写值。
- 提交前仅对“更新前为空、由本轮填充”的字段断言时间差：Final 相对 Award Publish 为 2 天、Deadline 相对 Award Publish 为 6 天；对更新前已有非空字段逐值断言 UPDATE 前后完全相等。
- 不覆盖管理员已填写的 Final 或 mis-award 时间。

## 验收标准

- 真实账号请求 `/api/pairing-bids/current` 返回 200，不再出现 PostgreSQL `42883`。
- DEV=`f8`、SIT=`f8_sit_live`、UAT=`f8_uat_live` 各 24 条、总计 72 条候选 Period 完成缺失字段回填；本轮原本为空的字段与 Award Publish 时间差分别为 2 天和 6 天。
- 没有可读历史 Award 时，不再出现“正在显示最近已发布 Award”的误导提示。
- 有历史已发布 Award、同时存在更新未发布 Period 时，继续展示历史 Award和正确提示。
- 真实 PostgreSQL 执行 `loadCurrentPeriodAndExistingBid` 所生成的查询成功，并验证返回的 `period_id`、`bid_roster_period_id` 可解析为整数；真实账号请求 `/api/pairing-bids/current` 返回 200。
- 执行并通过：PBS Current Bid 聚焦测试、Portal Award 页面测试、Award Playwright、Period Playwright、`npm run check:ui`，以及 `live-server`、`pbs-server`、`gantt`、`pbs-portal` 的 `npx tsc --noEmit` 与 `npm run build`。

## 测试夹具

- 无历史：所有 Period 均非 `AVAILABLE`，响应展示最新不可用 Period，但不携带用于“历史回退”提示的 `upcomingPeriod`。
- 有历史 + 更新待发布：一个旧 Period 满足 `AVAILABLE`，一个更新 Period 为 `UNCONFIGURED`/`SCHEDULED`/`PUBLISH_PENDING`；响应展示旧 Period，并携带更新 Period 作为 `upcomingPeriod`。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: SQL 类型修复、历史回填与 Award 状态展示共享 Period 语义，顺序验证更安全。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server` Current Bid SQL、`pbs-portal` Award 提示及测试、一次性数据库回填。
- Conflict risk: Low。
- Execution gate: 用户已批准本设计方向后实施。
