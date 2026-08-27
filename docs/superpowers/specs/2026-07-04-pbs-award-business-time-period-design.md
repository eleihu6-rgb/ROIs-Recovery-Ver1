# PBS Award 页面当前 Period 使用 Business Time 设计

## 背景

PBS Portal 的正常 bid 页面会根据系统日（PBS Business Time）判断当前 bid period。当前系统日由 `f8_pbs.dictionary` 中的以下配置控制：

- `PBS_BUSINESS_TIME_MODE`
- `PBS_BUSINESS_TIME_ANCHOR`
- `PBS_BUSINESS_TIME_ANCHOR_REAL`

当前远端库配置为 `ROLLING` 模式：

- 业务时间锚点：`2026-05-01T06:16:00.000Z`
- 真实时间锚点：`2026-07-01T06:17:00.700Z`
- 当前计算出的业务时间约为：`2026-05-04 Asia/Shanghai`

按该业务时间，division `P` 的当前 period 应为 `Jun 2026`。但 Award 页面当前展示 `Aug 2026`，原因是 Award 后端服务使用服务器真实时间调用 `resolveCurrentPeriod(db, actor)`，没有像 Days Off / Pairing / Line / Reserve / Dashboard / Bidding Calendar 一样传入 `businessClock.getBusinessNow()`。

## 问题

`pbs-server/src/services/award/award-results-service.ts` 当前逻辑：

```ts
const period = await resolveCurrentPeriod(db, actor);
```

这会让 Award 接口按真实时间选 period。当前真实时间是 `2026-07-04`，因此命中 `Aug 2026`，但 `f8.roster_publish` 中没有 Aug 数据，页面显示空。

正确行为应与其他 PBS bid 页面一致：

```ts
const period = await resolveCurrentPeriod(db, actor, await businessClock.getBusinessNow());
```

## 目标

让 Award 页面 `/api/award/current` 的当前 period 判断遵循 PBS Business Time，而不是服务器真实时间。

## 范围

本次只修正 Award 后端取当前 period 的时间来源。

包含：

- 在 `createPbsAwardResultsService` 中创建并使用 `createPbsBusinessClock({ db })`。
- 调用 `resolveCurrentPeriod` 时传入 `await businessClock.getBusinessNow()`。
- 更新 Award service 单测，覆盖 Business Time 决定 period 的行为。
- 后端 runtime 变更需要按项目规则 bump `gantt/src/version.ts` 中的 `BACKEND_VERSION`。

不包含：

- 不修改 `roster_publish` 或 `roster_flight` 数据。
- 不同步或补造 Aug 2026 数据。
- 不改变 Award 页 UI 布局。
- 不新增 period selector。
- 不改变 `pbs_award_result / pbs_award_item` 的生成逻辑。
- 不把 `Jun 2026` 伪装成已发布 award result；如果 `pbs_award_result` 为空，reason report 仍应不可用。

## 数据现状

已核查远端库：

- `StanislavProfatilov` 账号映射正确：
  - `crew_id = 2071`
  - `division = P`
  - `base = YYC`
  - `rank = FO`
- 按真实时间 `2026-07-04`，当前 period 会命中 `Aug 2026`。
- 按 PBS Business Time `2026-05-04 Asia/Shanghai`，当前 period 应命中 `Jun 2026`。
- `f8.roster_publish`：
  - 全局只有 `Jun 2026` 数据。
  - `crew_id=2071` 有 `Jun 2026` 的 19 条数据。
  - 没有 `Aug 2026` 数据。
- `f8.roster_flight`：
  - `crew_id=2071` 也只有 `Jun 2026` 数据。
- `f8_pbs.pbs_award_result / pbs_award_item`：
  - 当前没有 `crew_id=2071` 的 award result。

## 预期行为

当 PBS Business Time 为 `2026-05-04 Asia/Shanghai` 时：

- `GET /api/award/current` 对 `StanislavProfatilov / crew_id=2071` 应返回 `periodCode = "Jun 2026"`。
- Award 页面标题状态应显示 `Jun 2026`，不应显示 `Aug 2026`。
- 页面可展示 `roster_publish` 中 Jun 2026 的活动数据。
- 因为 `pbs_award_result` 为空：
  - `summary.tier` 仍可为空。
  - reason report 仍应显示不可用状态。
  - 不应伪造 matched tier / reason report。

## 实现方案

推荐采用最小修正方案：

1. 在 `pbs-server/src/services/award/award-results-service.ts` 引入 `createPbsBusinessClock`。
2. 在 `createPbsAwardResultsService` 初始化阶段创建：

   ```ts
   const businessClock = createPbsBusinessClock({ db });
   ```

3. 在 `getCurrentAward` 中改为：

   ```ts
   const period = await resolveCurrentPeriod(db, actor, await businessClock.getBusinessNow());
   ```

该方案与现有 Days Off / Pairing / Line / Reserve / Dashboard / Bidding Calendar 的模式一致，影响面最小。

## 测试方案

自动化测试：

- 更新 `pbs-server/src/services/award/award-results-service.test.ts`。
- 模拟 `dictionary` 返回 PBS Business Time 配置。
- 模拟 current period 查询在传入 business now 时返回 `Jun 2026`。
- 断言 roster 查询时间范围为：
  - `2026-06-01`
  - `2026-07-01`
- 断言 Award result 查询使用 `Jun 2026`。

建议运行：

```bash
npm --prefix pbs-server test -- src/services/award/award-results-service.test.ts
npm --prefix pbs-server test -- src/routes/award-results.test.ts
npm --prefix pbs-server run build
```

如果本次修正会影响前端显示验证，再补充 Playwright 打开真实 `/pbs/award`：

- 确认页面 period 显示 `Jun 2026`。
- 确认不再显示 `No published award · Aug 2026`。

## 验收标准

- Award 当前 period 与正常 bid 页面完全一致，统一由 PBS Business Time 决定。
- Business Time 为 `2026-05-04 Asia/Shanghai` 时，Award 使用 `Jun 2026`。
- 不再因为服务器真实时间 `2026-07-04` 错误命中 `Aug 2026`。
- 不产生任何数据库写入。
- 不改变 `roster_publish` / `roster_flight` / `pbs_award_result` 数据。
- 单测覆盖该回归点。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 Award service 一个服务入口和对应测试，拆分会增加沟通成本。
- Suggested split: 不拆分。
- Write boundaries: 仅 `pbs-server/src/services/award/award-results-service.ts`、对应测试，以及版本号文件。
- Conflict risk: 低，但当前工作区已有 Award 页面 UI 未提交改动，实施时必须避免误提交或回滚这些改动。
- Execution gate: 用户确认 spec 后再改代码。
