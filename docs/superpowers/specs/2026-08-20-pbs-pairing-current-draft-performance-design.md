# PBS Pairing Current Draft 性能优化设计

## 背景

本轮不是为了减少代码行数而重构，也不是为了把所有大文件拆小。当前明确的性能证据来自：

```bash
pnpm --dir pbs-server perf:pbs -- --samples=5
```

最近两次基线中，`GET /api/pairing-bids/current` 是唯一稳定超过 2000ms p99 预算的接口：

| 轮次 | Max / P99 | Avg | 结论 |
| --- | ---: | ---: | --- |
| 第一次 | 3788ms | 1238ms | 明确尾延迟 |
| 第二次 | 2874ms | 1069ms | 尾延迟复现 |

同一轮测试中，`days-off-bids/current`、`line-bids/current`、`reserve-bids/current` 均未稳定超过 2000ms。代码检查发现 Pairing current draft 的读取路径与其他 bid service 不一致：

- Days Off / Line / Reserve：先走 `getCurrentPeriod(actor)`，该路径已有 60s current period cache，再调用 `loadExistingBid(db, actor, period)`。
- Pairing：`getCurrentDraft()` 走 `loadCurrentPeriodAndExistingBid(db, actor, businessNow)`，绕开 Pairing service 内已有的 current period cache。

这意味着 Pairing GET 当前存在一个可疑的重复复杂 current-period 解析路径。优化应优先收敛这个路径，而不是大范围重构 pairing-search 或 Pairing UI。

## 用户底线

- 不因为优化改坏功能、UI 行为或业务语义。
- 不为了减少代码行数而拆合理的大文件。
- 不改变 bid 保存、编辑、删除、favorite、tier、period、read-only/open/closed 判断语义。
- 每次优化都必须有性能前后对比。
- 涉及页面路径时必须跑 Playwright 回归，证明用户行为没有被破坏。
- 数据库变更必须有 `EXPLAIN` 证据，不能凭感觉加索引。

## 目标

- 降低 `GET /api/pairing-bids/current` 的尾延迟。
- 让 Pairing current draft 的 current period 解析路径对齐 Days Off / Line / Reserve。
- 保持 `/api/pairing-bids/current` response contract 完全不变。
- 保持 Pairing Preference 页面、Bid 页面已有功能和 UI 行为不变。
- 用自动化测试和 Playwright 回归证明没有触碰业务底线。
- 明确保留 Business Time / bid window 的既有 Lineholder cache 语义；本轮不新增或改造写路径缓存。

## 非目标

- 不接入或改造 `/api/portal/bootstrap`。该接口真实前端是否使用，需要另开独立 spec。
- 不重构 `pairing-search-preview-query.ts`、`pairing-preference-filter-dialog.tsx` 或大型 Pairing UI 组件。
- 不改变 pairing search 筛选逻辑、分页逻辑或搜索结果。
- 不改变 `current period` 选择规则。
- 不改变 read-only / bidding closed / bidding open 的判断。
- 不修改 Pairing 保存、删除、favorite、patch、tier 写入函数；如果实现中发现必须触碰写路径，立即停止并扩展 spec。
- 默认不新增数据库 migration；只有 `EXPLAIN` 证明必要时再单独确认。

## 当前调用链

### Pairing current draft

入口：

- `pbs-server/src/routes/pairing-bids.ts`
- `pbs-server/src/services/pairing/pairing-bid-service.ts`

当前 `getCurrentDraft(actor)` 主要步骤：

1. 并发执行：
   - `loadCurrentPeriodAndExistingBid(db, actor, await businessClock.getBusinessNow())`
   - `getPropertyCatalog()`
2. 如果没有 existing bid，返回空 draft + property catalog。
3. 如果有 existing bid，并发加载：
   - draft properties
   - favorite properties

### 其他 Lineholder bid current draft

Days Off / Line / Reserve 的模式是：

1. 并发执行：
   - `getCurrentPeriod(actor)`
   - `getPropertyCatalog()`
2. 使用 `loadExistingBid(db, actor, period)` 读取 current bid。
3. 再读取具体 properties / favorites。

`getCurrentPeriod(actor)` 已有 Redis cache 或 in-memory fallback，cache key 包含 crew id，TTL 为 60s。

## Business Time 与缓存语义

这是本轮最重要的行为风险点。

Pairing GET 当前每次读取 `businessClock.getBusinessNow()` 并走 `loadCurrentPeriodAndExistingBid`；改用 `getCurrentPeriod(actor)` 后，会与 Days Off / Line / Reserve 一样使用 60s current period cache。该 cache 会影响 GET response 中的：

- `currentPeriod.computedStage`
- `currentPeriod.canEditBid`
- `currentPeriod.readOnlyReason`
- bid open / closed banner 的数据来源

本轮接受的语义边界是：

- Pairing GET 与其他 Lineholder bid GET 保持一致的 60s current period cache 语义。
- 不缓存 existing bid、draftVersion、draft properties、favorite properties。
- 不新增或改造写路径缓存；save/delete/favorite/patch 仍保持当前写路径已有的 period/editability 校验方式。
- 不改变 `businessClock.getBusinessNow()` 本身。

实现前后必须重点回归：

- bidding open 的 period 下，Pairing 当前 bid 仍可正常打开和保存。
- bidding closed 的 period 下，Pairing 页面仍保持只读 / 禁止写入。
- 手动切换 PBS Business Time 后，如果 60s cache 内 UI 没立即变化，这必须与 Days Off / Line / Reserve 当前行为一致；如果 Pairing 出现独有不一致，视为失败。

如果用户要求写入前 period/editability 校验必须绕过 60s cache，或要求 Pairing 在 Business Time 切换后必须立即绕过 60s cache，则本轮推荐方案失效，需要另写 spec 统一所有 Lineholder bid 的 current period cache invalidation，而不是只给 Pairing 做特殊行为。

## 方案比较

### 方案 A：Pairing 对齐其他 bid 的读取路径

做法：

- `getCurrentDraft(actor)` 改为先调用 Pairing service 内已有的 `getCurrentPeriod(actor)`。
- 再调用共享的 `loadExistingBid(db, actor, period)`。
- 保留 property catalog、draft properties、favorite properties 的加载方式不变。

优点：

- 改动小，行为最容易证明不变。
- 复用已存在 current period cache。
- 与 Days Off / Line / Reserve 保持一致，降低后续维护成本。
- 不需要数据库变更。

缺点：

- 相比当前 combined SQL，多一次轻量 `pbs_bid` lookup；但 current period 解析可被缓存，整体尾延迟预期更稳。

结论：推荐。

### 方案 B：给 `loadCurrentPeriodAndExistingBid` 增加缓存

做法：

- 保留 Pairing 当前 combined SQL。
- 给 current period + existing bid 的组合结果加短 TTL cache。

优点：

- 不改变当前 SQL 形状。

缺点：

- existing bid 是用户草稿数据，保存/删除/favorite/tier 更新后失效边界更复杂。
- 容易缓存到旧 draftVersion 或旧 properties 状态。
- 为了一个 GET 尾延迟引入更高一致性风险。

结论：不推荐。

### 方案 C：重写 current period CTE 或直接加索引

做法：

- 重写 `resolveCurrentPeriod` / `loadCurrentPeriodAndExistingBid` 的 SQL。
- 或给相关表增加索引。

优点：

- 如果瓶颈确实在 SQL 计划，收益可能更大。

缺点：

- 当前没有 `EXPLAIN` 证明瓶颈一定来自缺索引或 CTE 写法。
- 容易影响所有 Lineholder bid 的 period 选择语义。
- 风险超过本轮目标。

结论：先不做；只作为 fallback。

## 推荐设计

采用方案 A。

### 后端读取路径调整

目标文件：

- `pbs-server/src/services/pairing/pairing-bid-service.ts`

调整前：

```ts
const [bidContext, catalogContext] = await Promise.all([
  getCurrentPeriodBidContext(actor),
  getPropertyCatalog(),
]);
const { period, existingBid } = bidContext;
```

调整后：

```ts
const [period, catalogContext] = await Promise.all([
  getCurrentPeriod(actor),
  getPropertyCatalog(),
]);
const existingBid = await loadExistingBid(db, actor, period);
```

保留不变：

- empty draft 返回结构。
- existing draft 返回结构。
- `buildDraftIdentity(period, existingBid)` 校验。
- `loadDraftProperties`。
- `loadFavoriteProperties`。
- property catalog 内容。
- favorite properties 内容。

### 索引验证

当前 schema 已有：

- `uq_pbs_bid on pbs_bid (crew_id, period_code, bid_context)`
- `idx_pbs_bid_crew on pbs_bid (crew_id)`
- `idx_pbs_bid_period on pbs_bid (period_code, bid_context)`

当前 `loadExistingBid` 的真实条件是：

- `crew_id`
- `roster_period_id`
- `bid_context`

因此理论上可能存在更贴合的索引：

```sql
create index if not exists idx_pbs_bid_crew_roster_context
  on pbs_bid (crew_id, roster_period_id, bid_context);
```

但本轮默认不直接加 migration。`EXPLAIN` 不是无数据库代码收敛的前置门槛；它是提出索引或 migration 之前的硬门槛。

只有当改完读取路径后性能没有改善，或准备提出索引方案时，才对 `loadExistingBid` 当前 SQL 在远端权威 PostgreSQL 跑 `EXPLAIN (ANALYZE, BUFFERS)`：

- 如果当前计划已经走唯一索引或返回极快，则不加索引。
- 如果计划显示 rows/buffers 明显偏大，且组合索引能降低成本，再单独向用户确认数据库 migration。
- 远端连接使用 `pbs-server/.env` 当前配置指向的 `DATABASE_URL` 和 PBS schema/search_path；不得在文档或日志里输出数据库密码。
- 目标环境 schema 必须按实际环境确认：
  - dev：`f8_dev_pbs`
  - SIT：`f8_sit_pbs`
  - UAT：`f8_uat_pbs`

## 数据库变更门槛

默认没有数据库 migration。

只有同时满足以下条件，才允许进入数据库变更：

- 远端 `EXPLAIN (ANALYZE, BUFFERS)` 证明 `pbs_bid` current draft lookup 慢在索引不匹配。
- 新索引字段和现有业务 identity 一致，即 `crew_id + roster_period_id + bid_context`。
- migration 使用幂等写法。
- 同步 canonical schema。
- 明确 dev / SIT / UAT 执行顺序和回滚说明。

如果没有这些证据，本轮只做代码路径收敛，不做 DB。

## 测试策略

### 后端测试

至少更新或新增 Pairing current draft service 测试，覆盖：

- `getCurrentDraft()` 使用 `getCurrentPeriod` 路径，返回 empty draft 不变。
- 有 existing bid 时返回 draft identity、periodCode、draftVersion、properties 不变。
- `buildDraftIdentity` 对 rosterPeriodId 不匹配仍然抛出原有 409。
- property catalog 和 favorite properties 仍然返回。

如果现有测试已经覆盖这些返回语义，可以只补 regression case，避免重复测试。

明确测试命令：

```bash
# 在 pbs-server 目录执行 targeted tests
DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test \
  src/services/pairing/pairing-bid-service.test.ts \
  src/services/lineholder/current-period-bid.test.ts \
  src/routes/pairing-bids.test.ts

# 模块完整后端回归
pnpm --dir pbs-server test
pnpm --dir pbs-server build
```

route/API 层还要保留或补充断言：

- `GET /api/pairing-bids/current` 仍返回 `{ code, data, message }`。
- `data.currentPeriod` 字段结构不变。
- `data.draft.draftVersion`、`data.draft.periodCode`、`data.draft.properties` 结构不变。
- 401/403/409/423 等错误语义不因本轮 GET 路径调整而改变。

### 性能验证

必须执行改动前后同一命令：

```bash
pnpm --dir pbs-server perf:pbs -- --samples=5
```

为避免冷缓存 / 热缓存误判，执行方式固定为：

1. 同一台机器、同一分支基线、同一个 `pbs-server/.env`、同一个远端数据库环境。
2. 不修改 PBS Business Time、不切换 period、不导入数据、不发布 award。
3. 每个版本先跑 1 次 warm-up，不计入结论。
4. warm-up 后连续跑 2 次 measured run，记录两轮完整结果。
5. perf 脚本会选择一个 active portal user；记录用户 crew id 即可，不输出 token。
6. 如果本地 Redis / server 重启导致缓存状态不一致，需要对 before/after 使用同样流程重启和 warm-up。

验收口径：

- `GET /api/pairing-bids/current` p99 / max 不应超过 2000ms。
- 至少相比当前基线 `2874ms - 3788ms` 的尾延迟有明确下降。
- 其他 PBS perf endpoints 不应出现新的稳定超 2000ms。

如果本地环境偶发波动，需要重复至少 2 轮，并报告每轮结果，不得只挑最好的一次。

### Playwright 回归

必须使用真实 UI 覆盖以下路径：

- 登录 PBS Portal。
- 打开 Bid 页面。
- Pairing tab / Pairing Preference 页面能正常加载 existing bid。
- 打开 `Configure Pairing Preference`。
- 搜索框、Filters 按钮、pairing 列表仍可见。
- 选择一个 pairing 或打开已有 pairing property，不出现空白、卡死或报错。
- 已有 Pairing bid summary 中的 property 名称、tier badge、selected pairing 数量仍正确。
- draftVersion 或保存按钮状态没有异常跳变。
- favorite / saved favorite 入口仍能展示，不因 GET response 调整而消失。
- closed period 页面仍保持 read-only，不允许从 Pairing dialog 保存。
- 不验证视觉重设计，因为本轮不改 UI；但要确认没有 layout 破坏、弹窗不能关闭、loading 卡住等回归。

明确 Playwright 命令：

```bash
pnpm --dir e2e exec playwright test \
  --config=config/playwright.config.ts \
  --project=pbs-portal \
  e2e/tests/pbs-portal/pairing-preference.spec.ts \
  e2e/tests/pbs-portal/pairing-closed-period-readonly.spec.ts \
  e2e/tests/pbs-portal/pairing-search.spec.ts
```

如果现有 Playwright case 无法断言 existing bid property / tier / favorite，则新增最小 regression case，不能只跑 mock route UI 测试。

### QA 人工测试案例

本轮属于 PBS 可验证业务行为路径的性能优化，需要新增或更新一份人工回归说明：

- 路径：`docs/test-cases/pbs/pairing/2026-08-20-pairing-current-draft-performance-regression.md`
- 内容必须覆盖：
  - 打开 Bid 页面查看 Pairing existing bid。
  - 打开 Configure Pairing Preference。
  - open period 可保存，closed period 不可保存。
  - 搜索、Filters、favorite 入口仍正常。
  - 记录前后 perf command 和结果。

如果实现后发现没有任何用户可见行为路径受影响，仍需要在最终说明中解释为什么该 QA 文档未新增；默认应新增。

## 风险与防护

| 风险 | 防护 |
| --- | --- |
| current period 选择结果变化 | 不改 `resolveCurrentPeriod`，只复用既有 `getCurrentPeriod` 包装 |
| existing bid 查询结果变化 | 使用共享 `loadExistingBid`，与 Days Off / Line / Reserve 保持一致 |
| draftVersion / rosterPeriodId 校验弱化 | 保留 `buildDraftIdentity` |
| 缓存导致草稿状态变旧 | 不缓存 existing bid，不缓存 draft properties |
| Business Time 切换后 60s 内状态显示边界 | 对齐既有 Lineholder GET cache；如需即时失效，停止并另写统一 cache invalidation spec |
| 写入路径被误改 | 本轮禁止修改 save/delete/favorite/patch/tier 写入函数，不新增或改造写路径缓存；必须触碰时停止扩展 spec |
| UI 行为被间接影响 | Playwright 真实页面回归 |
| 性能收益不明显 | 用 perf baseline 对比；如果无收益，停止扩大改动，回到 SQL explain |

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本轮改动范围应非常小，主要集中在 Pairing current draft 读取路径和测试。多 agent 并行会增加协调成本，反而提高冲突风险。
- Suggested split: 不建议拆分。
- Write boundaries: 单 agent 只触碰 `pbs-server` Pairing current draft 读取代码和测试；Playwright 测试按需触碰 `e2e`；QA 文档按需触碰 `docs/test-cases/pbs`。禁止修改 Pairing 写入函数。
- Conflict risk: 低；但如果同时做 bootstrap 前端接入，风险会升高，所以本轮明确排除。
- Execution gate: 用户确认本 spec 后，才能进入实现。

## 验收标准

- `/api/pairing-bids/current` response schema 和用户可见数据不变。
- Bid 页面 Pairing 相关 UI 行为不变。
- Pairing current draft 不再绕开已有 current period cache。
- 后端 touched-area 测试通过。
- Playwright 回归通过。
- QA 人工测试案例已新增/更新，或最终说明给出明确豁免理由。
- `pnpm --dir pbs-server perf:pbs -- --samples=5` 显示 Pairing current draft 尾延迟下降，且没有把其他接口拖慢。
- 无数据库 migration，除非用户在看到 `EXPLAIN` 证据后单独批准。

## 下一步

用户确认后进入实现。实现顺序：

1. 先跑一次实现前 perf baseline，保存结果。
2. 修改 Pairing current draft 读取路径。
3. 补/调后端 regression test。
4. 跑后端测试。
5. 跑 Playwright 回归。
6. 新增/更新 QA 人工测试案例。
7. 跑实现后 perf baseline，两轮对比。
8. 如果性能未改善，不扩大改动，先回到 `EXPLAIN`；需要索引时单独向用户确认。
