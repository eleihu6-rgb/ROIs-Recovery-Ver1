# PBS Pairing ID 模糊搜索下拉设计

日期：2026-04-30
作者：Codex
状态：已确认，实施中

## 背景

当前 `pbs-portal` 的 Pairing 搜索页和 Pairing 右侧属性面板中，`Pairing ID` 对应 `propertyCode=128`，控件类型是通用 `tag-list`：用户手动输入 ID，按 Enter 写入 bid value。

这个实现能保存数据，但存在两个问题：

- 用户不知道当前 live pairing 表中有哪些真实存在的 Pairing ID。
- 输入不存在或跨月份的 Pairing ID 后，左侧 `BIDDING CALENDAR` 可能不会显示，容易误判为保存失败。

用户确认的新目标是：`Pairing ID` 输入框要改成可输入模糊搜索的下拉选择，数据范围为所有 live pairing 中存在的 ID，不限制当前 bid month，并且搜索必须做防抖/节流，注意性能。

## 目标

1. 只针对 `Pairing ID(propertyCode=128)` 提供 autocomplete 下拉。
2. 下拉数据来自 live pairing 真实数据，范围覆盖所有可读 pairing，不限制当前 bid period。
3. 用户可以输入关键字进行模糊搜索，匹配 `pairing_label` 和 `id::text`。
4. 前端输入搜索使用防抖，避免每次按键都请求接口。
5. 后端接口必须限制返回数量，保持轻量、可分页扩展。
6. 选中下拉项后，仍写入现有 `tag-list` bid values，保持现有保存契约不变。
7. 保留手动输入并按 Enter 添加的能力，避免数据延迟或特殊 ID 阻塞用户。
8. Pairing ID 写入后继续刷新左侧综合日历缓存。

## 不做范围

- 不把 `Pairing ID` 改成单选；仍支持多个 ID。
- 不限制只能选择当前 bid month 内的 pairing。
- 不改变 `pbs_bid_group` 持久化结构。
- 不改变现有 `PbsPairingBidValue` 的 `tag-list` 数据契约。
- 不影响其他 `tag-list` 属性，例如 layover city、landing city。
- 不新增第三方依赖。

## 推荐方案

采用新增轻量查询接口 + 前端专用 autocomplete 控件。

### API

新增 route：

```text
GET /api/pairing-search/pairing-ids?query=M49&limit=20
```

响应结构建议：

```ts
export type PbsPairingIdOption = {
  value: string;
  label: string;
  pairingId: string;
  startDate: string | null;
  endDate: string | null;
};

export type PbsPairingIdSearchResponse = {
  query: string;
  limit: number;
  options: PbsPairingIdOption[];
};
```

字段说明：

- `value`：写入 bid 的值，优先使用 `pairing_label`，无 label 时使用 `id::text`。
- `label`：下拉展示文案，例如 `M4959 · 2026-02-24 - 2026-03-02`。
- `pairingId`：live `pairing.id` 的字符串形式，便于后续调试。
- `startDate/endDate`：用于帮助用户理解为什么某个 ID 不显示在当前月份日历里。

### 后端实现

在现有 pairing search 边界内扩展：

- contract：`packages/contracts/pbs-search-pairings.js/.d.ts`
- route：`pbs-server/src/routes/pairing-search.ts`
- service：`pbs-server/src/services/pairing-search/pairing-search-service.ts`
- query helper：优先复用或靠近 `pairing-search-preview-query.ts` 的查询风格

SQL 规则：

- 从 `${liveSchema}.pairing` 读取 `is_deleted = 0` 的 pairing。
- 模糊匹配：
  - `upper(p.pairing_label) like upper($queryPattern)`
  - 或 `p.id::text like $queryPattern`
- 查询 start/end 日期时使用 `pairing_segment` 的 `brief_start_utc/sch_str_dt_utc` 与 `debrief_end_utc/sch_end_dt_utc` 聚合；缺 segment 时 fallback 到 pairing 自身日期字段。
- `limit` 默认 20，最大 50。
- `query` trim 后为空时不建议扫全表；第一阶段返回空数组。这样前端只在用户输入后查，性能更稳。

性能约束：

- 不做全量列表下载。
- 后端永远带 `limit`。
- 前端防抖后才发请求。
- 查询只返回下拉需要的轻量字段，不返回 legs/segments 明细。
- 如果未来 pairing 表数据量很大，再补数据库索引或改成 prefix 优先排序；本次不改 schema，避免不必要 migration。

### 前端实现

新增或扩展现有控件时遵循当前代码风格：

- 保留 `PairingBidControl` 的通用性。
- 不把 `Pairing ID` 逻辑硬塞进所有 `tag-list`。
- 推荐给 `PairingBidControl` 增加可选 `tagListAutocomplete` 配置，只有 `propertyCode=128` 的调用方传入。
- 或新增一个小组件 `PairingIdTagListControl`，由 Pairing 属性行在 propertyCode=128 时选择使用。

交互规则：

- 输入框仍显示已有 token。
- 用户输入 1 个或更多字符后，等待约 300ms 发起查询。
- 查询中显示轻量 loading 状态。
- 下拉展示最多 20 条结果。
- 点击选项后把 `value` 加入 `bid.values`，去重并大写规范化。
- 按 Enter 仍按当前输入手动添加。
- 失败时下拉区域显示简短失败状态，不阻断手动输入。

缓存与数据流：

- 新增 `pairingService.searchPairingIds(query, limit)`。
- Search Pairings 页面和 Pairing 右侧面板共用同一服务方法。
- 使用 TanStack Query 管理 autocomplete 请求，query key 包含 `query` 和 `limit`。
- 不把服务端搜索结果放入 Zustand。
- Pairing ID 保存成功后沿用已补齐的 `biddingCalendarQueryKey` + `tierPageDataQueryKey` invalidate。

### UI 文案

不新增解释型大段文案，只在控件内使用短文案：

- 输入 placeholder：`Search Pairing ID`
- 空结果：`No matching Pairing ID`
- 失败：`Unable to load Pairing IDs`

## 备选方案

### 方案 A：前端首次加载全部 Pairing ID

优点：实现简单，输入体验最快。

缺点：live pairing 数据量不可控，会拖慢首屏、增加内存和网络负担。

结论：不采用。

### 方案 B：复用现有 preview 接口

优点：少加后端 route。

缺点：preview 返回结果卡片、分页和 legs 明细，响应过重；语义也不是 autocomplete。

结论：不采用。

## 验收标准

1. 在 Search Pairings 添加 `Pairing ID` search criterion 后，输入框可模糊搜索真实 live Pairing ID。
2. 下拉选项可点击添加到 token list。
3. 用户仍可手动输入 ID 并按 Enter 添加。
4. 搜索请求有 300ms 左右防抖，不会每次按键立即请求。
5. 后端每次最多返回有限数量，默认 20，最大 50。
6. 选项展示包含 Pairing ID 和日期范围。
7. 保存 Pairing ID 后，左侧综合日历缓存会刷新。
8. 其他 tag-list 属性不受影响。
9. `npm run verify:pbs` 通过。

## 测试计划

后端：

- route test：`GET /api/pairing-search/pairing-ids` 返回统一响应格式。
- service/query test：query trim、limit clamp、空 query、模糊匹配字段、日期 fallback。
- contract type 更新。

前端：

- `PairingBidControl` 或新 autocomplete 控件测试：
  - 防抖后调用 service。
  - 点击 option 添加 token。
  - Enter 手动添加仍可用。
  - 已存在 token 去重。
  - 搜索失败不阻断手动输入。
- Search Pairings 页面回归：
  - `Pairing ID` criterion 使用 autocomplete。
  - 其他 tag-list 属性仍维持原行为。
- Pairing 页面回归：
  - 右侧属性面板中的 `Pairing ID` 也使用同一能力。
