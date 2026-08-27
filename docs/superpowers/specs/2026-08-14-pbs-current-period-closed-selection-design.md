# PBS Current Period 关闭后不应提前跳未来期设计

日期：2026-08-14  
状态：已确认，已实施  
范围：`pbs-server` 当前申请周期解析、PBS Portal 当前 Bid/Calendar/保存门禁回归测试

## 1. 背景

当前 PBS Portal 在 `PBS Business Time` 设为 2026-05-09 后，左侧 Bidding Calendar 显示 `Jul 2026 · Bidding not open`。但用户正在处理的是 `Jun 2026` bid：`Jun 2026` 的 bid window 已关闭，`Jul 2026` 尚未开放。

这会造成严重业务问题：

- Crew 会以为当前已经进入 `Jul 2026`，而不是看到 `Jun 2026` 已关闭。
- 当前 Bid / Calendar / Existing Bid Properties 读取的是未来期，旧期数据看起来像“丢了”。
- 后续导入、反馈、回归测试可能在错误 period 上操作。

AA PBS Guide 的时间线明确区分 Bid Open/Close、Award Publish、Final、Mis-award 等后续阶段。Bid Close 后仍属于同一个 bid month 的后续生命周期，不应立即把当前申请页面跳到下一个未开放 bid month。

## 2. 当前行为

`pbs-server/src/services/lineholder/current-bid.ts` 的 current period SQL 逻辑大致是：

1. 当前业务时间落在 `bid_open_at <= businessNow < bid_close_at` 内，选 open period。
2. 如果没有 open period，优先选最近未来未开放 period。
3. 如果没有未来 period，再选最近关闭 period。

因此当：

- `Jun 2026` 已过 `Bid Close`；
- `Jul 2026` 还没到 `Bid Open`；

系统会选 `Jul 2026 · NOT_OPEN`，而不是 `Jun 2026 · CLOSED`。

## 3. 目标行为

Current Bid 页面、Bidding Calendar、Pairing / Days Off / Line / Reserve 当前申请入口统一使用以下 period 选择规则：

1. **Open 优先**：如果存在当前业务时间落在 bid window 内的 period，选择该 period，`computedStage = OPEN`，允许提交。
2. **刚关闭期优先于未来期**：如果没有 open period，但存在已经关闭的 period，选择最近关闭的一期，`computedStage = CLOSED`，页面只读。
3. **只有没有任何已关闭 period 时才选未来期**：如果业务时间早于所有已配置 bid window，选择最近即将开放的一期，`computedStage = NOT_OPEN`，页面只读。
4. **无有效窗口时才进入 incomplete/fallback**：缺少 base、timezone、bid open/close 或 period range 不合法时，保持现有 fail closed 行为。

典型时间线：

| 业务时间 | Period 配置 | 预期显示 |
| --- | --- | --- |
| Jun bid open <= now < Jun bid close | Jun open | `Bidding open for Jun 2026` |
| Jun bid close <= now < Jul bid open | Jun closed, Jul future | `Bidding closed for Jun 2026` |
| Jul bid open <= now < Jul bid close | Jul open | `Bidding open for Jul 2026` |
| now < 第一条配置 period 的 bid open | 只有未来期 | `Bidding not open for <nearest future period>` |

## 4. 非目标

- 不改变 `PBS Business Time` 的 Rolling 计算方式。
- 不恢复已删除的 `Portal Active Period` 手动指定功能。
- 不在本次把静态 `pbs_status/System Stage` 作为强制提交开关；当前保存门禁仍由动态 `computedStage/canEditBid` 决定。
- 不修改 Award 页面当前 Award 默认展示规则；Award 已经有独立 resolver。
- 不新增数据库 migration。

## 5. 设计方案

### 推荐方案：调整 central current period resolver 排序

只修改 `pbs-server/src/services/lineholder/current-bid.ts` 中 `buildCurrentPeriodCte` 的排序语义。

当前 SQL 已经把所有有 `pbs_period_code` 的 `roster_period` 纳入 `automatic_candidates`，并按 `sort_rank` 排序。应把排序改为：

```text
sort_rank = 0: open period
sort_rank = 1: closed period
sort_rank = 2: future not-open period
sort_rank = 3: incomplete / unavailable period
```

排序细节：

- `OPEN`：保留现有优先级，若异常存在多个 open，选择业务上最新/最确定的一条，并保持 deterministic。
- `CLOSED`：按 `bid_close_at desc, period_sort_id desc` 选择最近关闭的一期。
- `NOT_OPEN`：按 `bid_open_at asc, period_sort_id asc` 选择最近即将开放的一期。
- `INCOMPLETE`：放最后，继续 fail closed。

这样能让所有复用 `resolveCurrentPeriod` / `loadCurrentPeriodAndExistingBid` 的模块自动对齐，包括：

- `/api/bidding-calendar/current`
- Pairing current draft
- Days Off current draft
- Line current draft
- Reserve current draft
- Bid Feedback 依赖的 current draft 输入
- 当前 bid 保存入口的 `assertCurrentPeriodCanEdit`

### 不采用方案 A：前端看到 Jul 后强行回退 Jun

缺点：

- 只能修显示，不能修保存门禁和后端读取 period。
- Pairing Search、Feedback、Calendar 等接口仍会用错误 period。
- 会造成前后端 period 不一致。

### 不采用方案 B：重新引入 Manual Active Period

缺点：

- 违背已确认的 Active Period 硬删除设计。
- 会重新制造 Business Time 与手动 period 双口径冲突。
- 不能解决自动选择规则本身错误。

## 6. 数据与时区口径

Period 配置字段是 Crew Base 当地墙上时间：

- `roster_period.pbs_bid_open_at`
- `roster_period.pbs_bid_close_at`
- `roster_period.pbs_award_publish_at`
- `roster_period.pbs_award_final_at`
- `roster_period.pbs_mis_award_deadline_at`

Current Bid resolver 继续用 crew effective prime base 找到 `airport.zone_id`，再把 wall time 转成可和 `businessNow` 比较的时间点。

示例：

- Business Time 页面输入使用 `Asia/Shanghai (UTC+8)`。
- Portal 状态显示使用 crew base，例如 `YYZ Local Time`。
- `2026-05-09 11:01 Asia/Shanghai` 对 YYZ 是 `2026-05-08 23:01`。
- 如果 `Jun 2026 Bid Close = 2026-05-08 22:59 YYZ`，此时应显示 `Jun 2026 · CLOSED`，不是 `Jul 2026 · NOT_OPEN`。

## 7. API 与 UI 影响

API contract 不变：

- `currentPeriod.periodCode`
- `currentPeriod.computedStage`
- `currentPeriod.canEditBid`
- `currentPeriod.readOnlyReason`
- `currentPeriod.bidOpenAt`
- `currentPeriod.bidCloseAt`

前端不需要新增字段。前端只消费后端返回的 corrected current period。

预期 UI 变化：

- Bidding Calendar 标题从错误的 `JUL 2026` 回到 `JUN 2026`。
- 状态块显示 `Bidding closed for Jun 2026`。
- Existing Bid Properties 读取 `Jun 2026` 的 current draft。
- 添加、修改、删除 bid 入口只读；后端写接口返回 423。

## 8. 测试策略

### 8.1 pbs-server 单元测试

更新 `pbs-server/src/services/lineholder/current-period-bid.test.ts`：

注意：现有 `createDb(rows)` mock 直接返回 `rows`，不会执行 SQL `ORDER BY`。因此多 rows 排序行为不能只靠这个 mock 证明。测试必须至少覆盖两层：

- 纯映射/门禁单测继续使用 mock，验证 `computedStage/readOnlyReason/canEditBid`。
- 排序语义必须通过真实 SQL 路径验证：优先使用 PostgreSQL fixture/只读最小执行；如果测试环境不允许真实 DB fixture，则必须捕获生成 SQL 并断言 `sort_rank` 与 `ORDER BY` 语义，同时用真实后端 API/E2E 覆盖最终行为。

1. `closed current period wins over future not-open period`
   - rows 同时包含：
     - `Jun 2026`：`bid_close_at <= businessNow`
     - `Jul 2026`：`bid_open_at > businessNow`
   - 必须通过真实 SQL 排序路径验证最终选中 `Jun 2026`，`computedStage = CLOSED`，`canEditBid = false`。

2. `future not-open period is selected only before any closed period exists`
   - rows 只包含未来 `Jun 2026`。
   - 期望选 `Jun 2026`，`computedStage = NOT_OPEN`。

3. `next period takes over once its bid window opens`
   - rows 同时包含 closed `Jun 2026` 和 open `Jul 2026`。
   - 期望选 `Jul 2026`，`computedStage = OPEN`。

4. `assertCurrentPeriodCanEdit rejects the selected closed period`
   - 使用 closed `Jun 2026` context。
   - 期望保存入口抛 423，不允许继续提交旧期或未来期。

5. `incomplete candidates do not outrank valid closed/future/open periods`
   - rows 混合包含 valid closed/future/open 与缺 timezone/open/close 的 incomplete candidate。
   - 期望 incomplete 排在最后；只有没有任何 valid open/closed/future candidate 时，才返回 incomplete/fail closed。

### 8.2 API / route 回归

若现有 route 测试能方便 mock current period rows，则补一条：

- `GET /api/bidding-calendar/current` 在 Jun closed + Jul future 时返回 `periodCode = Jun 2026`，状态为 `CLOSED`。

如果 route 层 mock 成本过高，不能只用不会执行 SQL 排序的 service mock 替代；必须保留至少一个真实后端路径验证，包括真实 DB fixture、真实只读远端 SQL 验证，或不 mock `GET /api/bidding-calendar/current` 的 Playwright/API smoke。

### 8.3 Playwright

新增或更新 PBS Portal current period lifecycle E2E：

1. 管理员设置 Business Time 到 `Jun Bid Close` 之后、`Jul Bid Open` 之前。
2. 打开 PBS Portal Bid/Dashboard。
3. 测试不得 mock `/api/bidding-calendar/current`，否则不能防止后端 resolver 回归。
4. 等待真实响应：
   - `GET /api/bidding-calendar/current`
   - 断言响应 `currentPeriod.periodCode = "Jun 2026"`。
   - 断言响应 `currentPeriod.computedStage = "CLOSED"`。
5. 断言 UI：
   - 左侧 Calendar 标题是 `JUN 2026`。
   - 状态块是 `Bidding closed for Jun 2026`。
   - 不显示 `JUL 2026` 作为当前 bid workspace。
   - `ADD BID` / 保存入口不可用，或提交后后端返回 423。

### 8.4 必跑验证

实施后至少运行：

```bash
npm --prefix pbs-server test -- src/services/lineholder/current-period-bid.test.ts
npm --prefix pbs-server test -- src/routes/bidding-calendar.test.ts
npm --prefix pbs-portal test -- src/features/dashboard/pages/dashboard-page.test.tsx
npx playwright test --config=e2e/config/playwright.config.ts --project=pbs-portal --no-deps <target spec>
npm run check:ui
git diff --check
```

实际命令以模块 `package.json` 和现有 E2E 文件名为准。若某条因环境依赖无法执行，最终交付必须说明原因和剩余风险。

## 9. 风险与控制

| 风险 | 控制 |
| --- | --- |
| 改排序影响所有 current bid 页面 | 只改 central resolver，并用 service tests 覆盖 open/closed/future 三种组合 |
| 历史 closed period 抢占正常 open period | `OPEN` 仍为最高优先级 |
| 业务时间早于第一期时无 closed 可选 | future not-open 仍保留作为 fallback |
| 前端缓存导致短时间仍显示旧 period | PBS current period / business clock 有短 TTL；测试时刷新或重启 pbs-server |
| Award 页面逻辑被误改 | 本次不碰 Award resolver，只在 spec 中声明边界 |

## 10. 验收标准

1. 在 `Jun 2026` 已关闭、`Jul 2026` 未开放时，PBS Portal 显示 `Jun 2026`。
2. 同一状态显示为 `Bidding closed for Jun 2026`，不可提交。
3. 到达 `Jul 2026` Bid Open 后，Portal 自动切到 `Jul 2026` 并按 open window 允许提交。
4. 业务时间早于所有已配置 period 时，Portal 仍显示最近未来期为 `Bidding not open`。
5. Existing Bid Properties、Bidding Calendar、Pairing/Days Off/Line/Reserve 当前 bid 入口使用同一个 corrected current period。
6. 后端写接口在 closed period 返回禁止写入，不能因为前端缓存或直接 API 调用绕过。
7. 相关单测和 E2E 通过。

## 11. Multi-Agent Parallelism Assessment

- Recommendation：No。
- Rationale：这是一个中心 resolver 的小范围高风险行为修正，主要写点集中在 `pbs-server/src/services/lineholder/current-bid.ts` 和对应测试。拆分并行会增加排序口径不一致风险。
- Suggested split：不拆分。单 agent 完成 resolver、service tests、必要 route/E2E 回归。
- Write boundaries：`pbs-server` current period resolver/test；必要时只补 `e2e/tests/pbs-portal/` 下当前 period 生命周期测试。
- Conflict risk：中等。`current-bid.ts` 是多个业务入口共享核心，必须保持最小改动。
- Execution gate：用户确认本 spec 后再实施。
