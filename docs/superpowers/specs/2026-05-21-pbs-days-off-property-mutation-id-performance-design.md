# PBS Days Off Property Mutation 稳定身份与性能优化设计

日期：2026-05-21  
状态：已确认实施  
范围：PBS Days Off `POST / PUT / DELETE /api/days-off-bids/current/properties` 链路、前端 Days Off service payload、后端 Days Off property mutation service、性能诊断与回归测试。

## 背景

用户在真实页面 Network 中观察到：

- `PUT /api/days-off-bids/current/properties/:propertyGroupKey` 偶发 4-5 秒。
- 同一轮操作里多个 `current` 请求也出现 2-4 秒。
- `PUT` payload 很小，只有约 `0.4 KB`，说明慢点不是请求体大小，而更可能在后端处理、数据库查询、锁等待、请求排队或重复刷新链路。

项目现有规范也明确要求：

- PBS 可持久化业务对象 CRUD 默认必须使用后端返回的稳定 `id` / `key` 作为主身份。
- 后端返回稳定 `id` / `key` 后，后续详情读取、修改、删除、绑定、解绑、保存、乐观更新和缓存同步必须继续使用该稳定身份。
- 不要用展示顺序、名称、日期文本、UI 文案、临时位置定位已有业务记录。
- 涉及当前草稿或批量保存的请求必须携带最新版本信息，遇到并发冲突要提示用户刷新或重新保存。

当前 Days Off property mutation 虽然 URL 使用了 `propertyGroupKey`，但前端轻量 payload 在部分路径中只带 `draftVersion`，没有稳定 `draftKey` / `bidId` / `periodCode`。这会让后端需要靠登录态和 current period 推导目标 draft，容易走较慢路径，也不完全符合“稳定身份优先”的接口约定。

## 目标

- 让 Days Off property 修改 / 删除稳定按唯一身份定位目标资源：
  - `propertyGroupKey` 定位 property。
  - `bidId` 或 `draftKey` 定位 current draft。
  - `draftVersion` 做乐观锁。
- 找出 `PUT /current/properties/:propertyGroupKey` 偶发 4-5 秒的真实瓶颈，不能继续只靠前端减少刷新掩盖问题。
- 优化 Days Off property mutation 后端快路径，正常本地开发环境稳定 `< 2s`，目标 `500ms-1s`。
- 保持现有 AA / 旧库业务语义：`Prefer Off` 重叠允许保存，不新增硬拦截。
- 不恢复旧 `/api/calendar-days-off/*`。
- 补充自动化测试和人工回归案例，证明接口契约、性能方向和功能语义没有被破坏。

## 非目标

- 不改数据库主表结构，不迁移 PBS bid 数据模型。
- 不改 Days Off UI 视觉布局。
- 不改变 `Prefer Off` 重叠允许保存语义。
- 不删除旧 `PATCH` 兼容路由，除非单独确认。
- 不为了性能跳过现有业务校验。
- 不把性能问题转移成“前端假快、后端仍慢”。

## 现状初步判断

`PUT /api/days-off-bids/current/properties/:propertyGroupKey` 当前后端链路大致包括：

1. 解析 current period / catalog。
2. 按 current draft reference 查找 bid。
3. 读取 existing Days Off draft properties 做整体验证。
4. 构造目标 property。
5. 写入 `pbs_bid_group`，按 tier 删除 / 插入 / upsert。
6. 更新 `pbs_bid.draft_version`。
7. 调用 `syncBidTiersByBidId` 重算 tier totals 和 bid total tiers。

慢点候选：

- 缺少稳定 `bidId/draftKey` 时，后端需要按 current period 和 crew 推导 draft。
- `loadDaysOffDraftProperties` 会读取当前 bid 下所有 Days Off group 做 validation。
- `writeDaysOffPropertyWithTierSync` 已经在主 SQL 里更新一部分 tier / bid 信息，随后又执行 `syncBidTiersByBidId`，可能存在重复同步。
- `syncBidTiersByBidId` 可能对全部 tiers 重算，而不是只同步受影响 tiers。
- 同一个 `pbs_bid` 上连续保存会通过 `draftVersion` 和 `for update` 串行化，可能出现锁等待。
- 如果真实数据库缺少或未命中 `(bid_id, bid_type, property_group_key)`、`(bid_id, tier)` 等索引，抖动会被放大。

## 推荐方案

采用“先测量，再修 contract，再优化 SQL 快路径”的方案。

### 阶段 1：服务端分段 timing

给 Days Off property mutation 增加开发可控的分段耗时日志或内部 timing helper：

- route 总耗时。
- normalize / schema parse。
- current period / catalog resolve。
- load existing draft properties。
- validation。
- property write SQL。
- tier sync。
- response build。

要求：

- 默认不污染生产日志，可通过已有日志级别或环境开关控制。
- 日志不输出敏感 crew 个人信息，只输出 endpoint、propertyGroupKey、bidId、draftVersion、耗时。
- 用真实点击复现 4-5 秒时，能看出慢在哪一段。

### 阶段 2：前端 payload 使用稳定 draft 身份

`pbs-portal/src/shared/services/days-off-service.ts` 的 mutation payload 应携带：

```json
{
  "draftKey": "2",
  "bidId": 2,
  "periodCode": "Apr 2026",
  "draftVersion": 1044,
  "bid": {
    "type": "tag-list",
    "values": ["2026-04-01"]
  },
  "tiers": ["T1"],
  "allOrNothing": false,
  "minimumN": null
}
```

说明：

- `propertyGroupKey` 仍在 URL 中，作为 property 稳定 key。
- `draftKey/bidId/periodCode` 来自后端返回的 `draftMeta`，不是 UI 推导。
- `draftVersion` 仍用于乐观锁。
- 不恢复 `name`、`suggestions`、整份 UI property 或整份 draft。
- Add / Put / Delete 三类 mutation 统一使用稳定 draft identity。

### 阶段 3：后端稳定 bidId 快路径

后端 `patchCurrentDraftProperty` 在 request 包含稳定 `bidId` / `draftKey` 时：

- 直接按 `bidId + crewId + bidContext + draftVersion` 定位目标 draft。
- 避免重复 current period 推导作为主路径。
- 如果 `bidId` 不存在或不属于当前用户，返回 404。
- 如果 `draftVersion` 不匹配，返回 409。
- 保留 period fallback 作为兼容路径。

### 阶段 4：写入与 tier sync 优化

根据 timing 结果做定向优化，优先级：

1. 如果慢在 `syncBidTiersByBidId`：
   - 将受影响 tier 的 `total_groups` 同步合并到主写入 SQL，或只同步受影响 tiers。
   - 避免每次 PUT 都重算全部 tiers。

2. 如果慢在 `loadDaysOffDraftProperties`：
   - 保留必要 AA 校验，但尽量读取 validation 必需字段。
   - 对 single-property PUT，考虑只读取目标 property + 会与它冲突的 property codes，而不是全量 Days Off property。

3. 如果慢在锁等待：
   - 前端继续保持 pending / disabled，避免同一 property 连续提交。
   - 后端日志记录 lock wait 时间，必要时调整事务范围。

4. 如果慢在缺索引：
   - 先用本地 DB explain / pg_indexes 确认。
   - 如缺少必要索引，新增 migration，例如：
     - `pbs_bid (id, crew_id, bid_context, draft_version)`
     - `pbs_bid_group (bid_id, bid_type, property_group_key)`
     - `pbs_bid_tier (bid_id, tier)`
   - 不修改已确认 schema 脚本，只新增 migration。

## API 契约

### 更新 property

`PUT /api/days-off-bids/current/properties/:propertyGroupKey`

请求体应使用稳定 draft identity：

```json
{
  "draftKey": "2",
  "bidId": 2,
  "periodCode": "Apr 2026",
  "draftVersion": 1044,
  "bid": {
    "type": "tag-list",
    "values": ["2026-04-01", "2026-04-04"]
  },
  "tiers": ["T1", "T2"],
  "allOrNothing": false,
  "minimumN": null
}
```

### 删除 property

`DELETE /api/days-off-bids/current/properties/:propertyGroupKey`

Query 应包含：

```text
draftKey=2&bidId=2&periodCode=Apr%202026&draftVersion=1044
```

如果 query 过长或后续需要更标准化，可单独设计 `DELETE` body 或 `POST action`，本次先不扩展。

### 新增 property

`POST /api/days-off-bids/current/properties`

请求体包含 `draftKey/bidId/periodCode/draftVersion/propertyCode/bid/tiers/allOrNothing/minimumN`。

## 测试计划

### 后端

- Route schema 接受带 `draftKey/bidId/periodCode` 的 `PUT` payload。
- `patchCurrentDraftProperty` 带 `bidId` 时走稳定 bid id 路径。
- `draftVersion` 不匹配返回 409。
- `bidId` 不属于当前 crew 返回 404。
- `propertyGroupKey` 不存在返回 404。
- `Prefer Off` 重叠仍允许保存。
- 如果优化 `syncBidTiersByBidId`，补 service 测试确认：
  - 删除 T7 后 `pbs_bid_group` 中该 property 不再包含 T7。
  - `pbs_bid_tier.total_groups` 和 `pbs_bid.total_tiers` 正确。

### 前端

- `daysOffService.patchCurrentDraftProperty` payload 包含 `draftKey/bidId/periodCode/draftVersion`，不包含 `name/suggestions`。
- `daysOffService.removeCurrentDraftProperty` delete params 包含稳定 draft identity。
- Days Off 页面右侧 Existing property 编辑后，左侧日历使用新 draftVersion 的 page data，不残留旧 overlay。
- 左侧小日历 mutation 继续 patch cache，不重复 refetch Days Off page data。

### 性能与回归

- 用 Network 面板连续 5 次保存同一类 PUT：
  - 正常本地环境每次 `< 2s`。
  - 记录 min / max / avg。
- 记录后端分段 timing，确认最长段已被处理。
- 运行：
  - `pnpm --dir pbs-server test`
  - `pnpm --dir pbs-server build`
  - `pnpm --dir pbs-portal exec vitest run`
  - `pnpm --dir pbs-portal lint`
  - `pnpm --dir pbs-portal build`
  - `git diff --check`

## 验收标准

- `PUT /api/days-off-bids/current/properties/:propertyGroupKey` 不再偶发 4-5 秒，正常本地连续操作稳定 `< 2s`。
- `POST / PUT / DELETE` 都使用后端稳定 `draftKey/bidId/propertyGroupKey + draftVersion`。
- mutation payload 仍保持轻量，不传 UI-only 字段。
- 右侧取消 T7 后，左侧日历 T7 同步消失。
- `Prefer Off` 重叠允许保存。
- 错误仍通过统一 message，不出现重复 panel alert。
- 自动化测试、lint、build 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这次问题集中在同一条 Days Off property mutation 链路，前端 payload、后端 route schema、service 快路径、SQL/tier sync 和测试需要保持一致。并行写容易造成契约不一致。
- Suggested split: 不建议并行实现。主 agent 先加 timing 和契约修复，再按 timing 结果优化 SQL。
- Write boundaries: `packages/contracts/pbs-days-off-bids.*`、`pbs-portal/src/shared/services/days-off-service.ts`、`pbs-server/src/routes/days-off-bids.ts`、`pbs-server/src/services/days-off/*`、必要 migration 和测试文档。
- Conflict risk: Medium。当前工作树已有 Days Off 前端重构改动，继续修改需要避免覆盖已修复的左侧日历缓存逻辑。
- Execution gate: 用户确认本 spec 后开始实现。

Above is my understanding of the requirement/spec. Please confirm, and I will implement after your approval.
