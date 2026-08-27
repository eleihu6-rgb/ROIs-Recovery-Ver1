# PBS Current Draft Period Mismatch 读取修复设计

## 背景

SIT 已部署到最新 `main` 后，PBS Portal 在 Business Time 切到 `2026-07-05` 时自动进入 `Aug 2026` bid window，但 `/pbs/api/pairing-bids/current` 仍返回：

```json
{
  "code": 409,
  "message": "The current draft is not linked to the active roster period. Please refresh and try again."
}
```

Business Time 是测试和业务模拟控制，用户可以切到任意日期。切换 Business Time 只能改变 active roster period，不能成为当前 bid 页面加载失败的理由。

## 问题判断

这是后端读取 current draft 的容错 bug。

当前 `loadCurrentPeriodAndExistingBid` 的 read-side SQL 会在找当前 draft 时使用：

- `pbs_bid.roster_period_id = current_period.period_id`
- 或 `pbs_bid.period_code = current_period.period_code`

第二个 `period_code` fallback 会把历史迁移、重复 period、或 roster period id 失配的旧 `Current` draft 捞出来。随后代码发现 `bid_roster_period_id !== active roster_period_id`，直接抛 409，导致 GET current draft 页面级失败。

## 目标

1. Business Time 任意切换后，Current bid 页面必须能加载。
2. GET `/api/*-bids/current` 只返回 active `roster_period_id` 对应的 current draft。
3. 如果当前 active period 没有 draft，返回 empty draft，不因为同 crew 的旧 draft 报错。
4. 写入、patch、delete 等 mutation 仍然严格校验 draft reference 和 active period，避免旧页面覆盖新 period。
5. `bid-feedback/current/conflicts` 通过各 bid service 读取时，不应因为旧 period draft mismatch 崩掉整个 feedback。

## 范围

### 修改

- `pbs-server/src/services/lineholder/current-bid.ts`
  - `loadCurrentPeriodAndExistingBid` 的 lateral join 只按 `roster_period_id = current_period.period_id::bigint` 查 current draft。
  - 保留读取后 period mismatch 的防御校验，但正常 SQL 不再主动捞出 mismatch row。

- `pbs-server/src/services/lineholder/current-period-bid.test.ts`
  - 新增回归：同 `periodCode` 但不同 `rosterPeriodId` 的旧 bid 不应阻塞读取，应表现为当前 period empty draft。
  - 更新 SQL 结构断言，确保 read-side 查询不再使用 `period_code = current_period.period_code` fallback。

### 不修改

- 不清理或迁移 SIT 历史 `pbs_bid` 数据。
- 不改变 Business Time 的 rolling 计算方式。
- 不放宽 mutation 的 draftKey / rosterPeriodId 校验。
- 不改变 current period selection 规则。

## 方案选择

推荐方案：读取 current draft 只按稳定 `roster_period_id`。

备选方案 A：继续按 `period_code` fallback，但 mismatch 时忽略。缺点是仍会多捞旧 row，且在多个旧 row 存在时依赖排序，语义不干净。

备选方案 B：自动修正旧 draft 的 `roster_period_id`。缺点是 GET 接口产生写入副作用，且无法证明旧 draft 一定属于当前 period，风险更高。

## 验收标准

1. 当 active period 为 Aug 2026，且同 crew 有一条 `period_code='Aug 2026'` 但 `roster_period_id` 指向旧 period 的 current draft 时，GET current draft 返回 empty draft，不返回 409。
2. 当前 period 下存在匹配 `roster_period_id` 的 draft 时，仍正常返回该 draft。
3. Mutation reference 指向非 active period 时仍返回 409。
4. Focused 后端测试通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 修复点集中在一个共享 resolver 和一个测试文件，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server/src/services/lineholder/current-bid.ts`、`pbs-server/src/services/lineholder/current-period-bid.test.ts`、本 spec。
- Conflict risk: 低，逻辑集中但影响四类 current bid 读取。
- Execution gate: 用户已明确要求修复并在修复后提交本地代码。
