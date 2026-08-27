# Bidding Calendar Requested Days Off 使用 Roster Period ID 设计

## 背景

代码 simplify / 性能优化 Phase 0 审查发现，`pbs-server/src/services/calendar/bidding-calendar-service.ts` 的 requested days-off count 查询仍使用 `bid.period_code = $5::varchar` 过滤 `pbs_bid`。这与当前 PBS period identity 规则不一致：业务身份应以 `roster_period.id` / `rosterPeriodId` 为准，`periodCode` 只能作为展示文案或兼容字段。

这个问题会阻塞后续 calendar SQL 性能优化。因为如果继续基于 `period_code` 合并 SQL 或做 explain，优化的是旧查询语义。

## 目标

- 将 Bidding Calendar 的 requested days-off count 查询从 `period_code` 过滤切换为 `roster_period_id` 过滤。
- 不改变接口响应结构，不改变前端 contract。
- 不改变 days-off capacity 计算公式，只修正 period identity。
- 保留现有同一 crew 多 tier 同日申请只计一次的去重逻辑。

## 非目标

- 不合并两个 requested count SQL；SQL round trip 优化放到下一步。
- 不新增数据库索引。
- 不修改 `periodCode` 展示字段。
- 不修改 bid 保存逻辑。
- 不修改 dashboard / bid 页面 UI。

## 当前代码依据

- `LineholderPeriodContext` 已包含 `rosterPeriodId`。
- `getCurrentCalendar` 已先调用 `getCurrentPeriod(actor)`，因此调用 `loadSafeDayOffCapacityRows` 时可以直接传 `period.rosterPeriodId`。
- 当前 `loadRequestedDayOffCountsByDate` 内两段 SQL 都用：
  - `bid.period_code = $5::varchar`
- 当前测试也断言该旧条件：
  - `bidding-calendar-service.test.ts` 中匹配 `/bid\.period_code = \$5::varchar/i`

## 设计

### 参数调整

将以下函数参数从只传 `periodCode` 调整为传 `rosterPeriodId`：

- `loadRequestedDayOffCountsByDate`
- `loadDayOffCapacityRows`
- `loadSafeDayOffCapacityRows`

保留 `periodCode` 仅在确实还有展示或非查询身份用途时使用；如果函数内部不再需要 `periodCode`，则删除该参数。

### SQL 调整

两段 requested count SQL 均改为：

```sql
and bid.roster_period_id = $5::bigint
```

参数数组第 5 位改为 `period.rosterPeriodId`。

### 测试调整

更新 `bidding-calendar-service.test.ts`：

- 调用参数从 `periodCode: "Apr 2026"` 改为 `rosterPeriodId: 42` 或同类测试 id。
- 断言 query values 第 5 位是该 id。
- 断言 SQL 包含 `bid.roster_period_id = $5::bigint`。
- 断言不再包含 `bid.period_code = $5::varchar`。
- 保持 expected `requestedDayOffCount` 不变，证明统计语义只换 period identity。

## 验收标准

- `/api/bidding-calendar/current` 响应结构不变。
- `requestedDayOffCount` 结果在测试 fixture 下保持不变。
- SQL 不再用 `period_code` 作为 `pbs_bid` 业务过滤条件。
- 同一年不同月份和跨年同月份不会因 `periodCode` 字符串复用或脏数据串数据。
- 不需要数据库 migration。

## 验证命令

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/services/calendar/bidding-calendar-service.test.ts
pnpm exec tsc --noEmit
```

## 风险与控制

- 风险：调用链仍有某处只传 `periodCode`。
  - 控制：TypeScript 编译应暴露所有未更新调用点。
- 风险：测试只检查 SQL 文本，不覆盖真实 DB。
  - 控制：这是身份修复，不是性能 SQL rewrite；后续性能优化阶段仍需要远端 `EXPLAIN (ANALYZE, BUFFERS)`。
- 风险：老数据没有 `roster_period_id`。
  - 控制：当前项目已经把 current bid 读写切到 `rosterPeriodId`；如果 SIT 发现旧数据为空，应修数据，不在这里兼容脏数据。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动范围很小，集中在一个 service 和一个测试文件，多 agent 协调成本高于收益。
- Suggested split: 不拆分。
- Write boundaries: 仅 `pbs-server/src/services/calendar/bidding-calendar-service.ts` 和对应测试。
- Conflict risk: Low。
- Execution gate: 用户确认本 spec 后实施。
