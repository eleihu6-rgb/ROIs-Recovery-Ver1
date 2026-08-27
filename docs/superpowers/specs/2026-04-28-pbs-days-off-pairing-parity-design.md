# PBS Days Off 向 Pairing 架构与交互对齐设计

日期：2026-04-28
作者：Codex
状态：已确认并实现

## 背景

`/days-off` 第二步已经补了 AA Days Off 的一部分深层语义：`Waive Minimum Days Off` 提示、`Minimum Days Off Between Work Blocks` 跨 layer restrictive 校验，以及 `all_or_nothing / minimum_n` 读写。

但实际页面体验暴露出新的问题：

- `/api/days-off-bids/current` 请求不应频繁出现；如果是 `GET` 频繁，属于 remount/refetch 问题；如果是 `PUT` 频繁，属于当前整份 draft autosave 设计过重。
- Days Off 后端仍缺少 Pairing 已有的 period/catalog cache、细粒度 add/delete/favorite 接口和稳定 property group key。
- Days Off 右侧面板仍是通用 RuleBid 面板，缺少 Pairing 页成熟的 pending 禁用、toast、收藏颜色、收藏失败回滚、底部区域和卡片高度体验。
- `MODIFIERS` 常驻成一整列不理想，语义上更像 bid 的附加设置，应放进可展开的 bid 设置区域。

本轮目标不是新增 AA 规则，而是把 Days Off 的数据写入方式、请求频率和用户体验向 Pairing 页面靠近。

## 目标

1. 降低 `/days-off` 页面进入和编辑时的请求频率。
2. 避免简单添加、删除、收藏、取消收藏都触发整份 draft 重写。
3. 让 Days Off property 使用稳定 `propertyGroupKey`，删除不再依赖临时 row/code id。
4. 让 Days Off 收藏与 Pairing 一样持久化，使用稳定 `favoriteKey/propertyId`。
5. 将 modifier UI 从常驻列改为“设置/编辑展开区域”，视觉和操作接近 Pairing。
6. 统一右侧卡片高度、底部按钮/分页/状态、按钮禁用、toast 和收藏按钮样式。

## 不做范围

- 不做 `Clear Bids`。
- 不做 `Layer` 页面展示。
- 不做 PBS award/engine 计算。
- 不改 Reserve Days Off 或 Standing Bid Days Off。
- 不重新设计左侧月历 popover。

## 方案

采用“Pairing parity”方案：在 Days Off 上补 Pairing 已验证过的稳定身份、细粒度 mutation、收藏持久化和交互状态，而不是继续扩大通用 RuleBid 面板的 autosave 行为。

### 1. 后端接口

扩展 `packages/contracts/pbs-days-off-bids.*`：

- `GET /days-off-bids/current`
- `PUT /days-off-bids/current`：保留整份保存，作为兜底。
- `POST /days-off-bids/current/properties`：添加一个 Days Off property。
- `DELETE /days-off-bids/current/properties/:propertyGroupKey`：删除一个 property group。
- `PUT /days-off-bids/current/favorites/:propertyCode`：收藏 property。
- `DELETE /days-off-bids/current/favorites/by-key/:favoriteKey`：按稳定 favorite id 取消收藏。

返回结构向 Pairing 靠齐：

- `draft.properties[].propertyGroupKey`
- `favoriteProperties`
- `favoritePropertyCodes`
- mutation response 返回 `draftKey / bidId / periodId / periodCode / draftVersion`
- add property response 返回 `propertyGroupKey / rowSeq`

### 2. 后端服务

在 `days-off-bid-service` 中补：

- period/catalog TTL cache，避免每次请求重复查稳定属性定义。
- `loadDraftProperties` 读取 `pbs_bid_group.property_group_key`，按 group key 合并多 layer。
- add property 使用 `randomUUID()` 生成稳定 `propertyGroupKey`。
- delete property 按 `propertyGroupKey` 删除，删除后顺序前移，并同步 `pbs_bid_layer.total_groups`。
- favorites 复用现有 `pbs_bid_pairing_favorite` 还是新增通用 favorite 表需要实现时确认数据库模型；推荐短期复用现有表结构模式，但新建/扩展为 Days Off 可用的 favorite 存储，避免表名语义误导。

### 3. 前端数据模型

扩展 RuleBid 类型：

- existing property 增加 `propertyGroupKey` 或直接让 `id` 使用后端稳定 key。
- available property 增加 `favoriteKey`、`propertyId`。
- mapper 从后端 favoriteProperties 建立收藏状态，不再用默认前三个假收藏。
- Days Off add/delete/favorite 调用细粒度 service。

### 4. 前端交互

Days Off 右侧体验向 Pairing 靠齐：

- 默认进入添加区时选中 `ALL PROPERTIES`，与 Pairing 页保持一致。
- add/delete/favorite/unfavorite/save 成功同步 cache 后，不重置当前 tab、搜索词、展开编辑状态和分页，避免用户操作后跳回 `FAVORITED`。
- 添加 property：立即调用 add property 接口，成功后本地 row 使用返回的 `propertyGroupKey`。
- 删除 property：调用 delete by propertyGroupKey，pending 时禁用删除/添加按钮。
- 收藏/取消收藏：
  - optimistic 更新。
  - pending 时禁用收藏按钮。
  - 收藏态使用红色实心心形，未收藏用 outline。
  - 成功/失败显示与 Pairing 一致风格 toast。
  - 失败回滚。
- 属性编辑：
  - existing 区域默认只显示 bid 摘要和 layer。
  - available 区域默认只显示 bid 摘要。
  - 点击编辑/设置图标后展开配置区域。
  - `allOrNothing / minimumN` 放入展开区域，作为 bid modifier。
- 页面容器：
  - 右侧卡片采用 Pairing 的 `flex min-h-full flex-col ... pb-5 pt-5`。
  - 添加区使用 `min-h`、`flex-1` 和 `mt-auto` footer，底部按钮/分页区域靠近 Pairing 的信息密度和样式。
  - available property 列表分页默认 `10/Page`，列表超过可用高度时在 footer 上方滚动或截断，不撑高整页。

### 5. 请求频率与性能

验收目标：

- 首次进入 `/days-off` 正常只应触发一次 `GET /api/days-off-bids/current`。
- 编辑 property 的 debounce 保存不应导致额外 GET。
- add/delete/favorite 使用细粒度接口，不整份重写。
- 后端 `GET /days-off-bids/current` 与 Pairing 一样使用 catalog/period cache。
- 若仍有频繁 GET，需用测试或浏览器 trace 定位 remount/refetch 根因。

### 6. 文档完成度

上一份 AA 对齐文档目前状态：

- 第一步已完成。
- 第二步在“不做 Clear Bids、不做 Layer 展示”的临时范围内已完成。
- 按原始文档完整验收，还差 `Clear Bids` 和 `Layer 页面展示`。
- 本轮新增的 parity 工作属于质量/架构补强，不替代 Clear Bids。

## 测试计划

后端：

- `GET /days-off-bids/current` 返回 stable `propertyGroupKey` 和 favorites。
- `POST /days-off-bids/current/properties` 添加 AA Days Off property。
- `DELETE /days-off-bids/current/properties/:propertyGroupKey` 删除并前移 rowSeq。
- favorite save/delete 按稳定 id 工作。
- restrictive / mutex / date / flag 校验仍然生效。

前端：

- 首次加载只调用一次 Days Off page data。
- add/delete/favorite 调用细粒度 service。
- favorite pending 禁用、成功 toast、失败回滚。
- modifier 在展开设置区内修改并保存。
- 右侧容器和 footer 样式与 Pairing 接近。
- 没有因为 draftMeta cache 更新导致面板反复 hydrate 或重复请求。
- 默认 `ALL PROPERTIES`，并且 add/delete/favorite/unfavorite 后仍停留在当前 tab 和搜索状态。
- available property 多于 10 条时展示 Pairing 风格分页，footer 固定在面板底部。

## 验收标准

1. Network 中 `/api/days-off-bids/current` 不再在页面空闲时频繁请求。
2. 常见 add/delete/favorite 不触发整份 draft 重写。
3. Days Off 收藏行为、按钮颜色、禁用态和提示文本接近 Pairing。
4. Modifiers 不再常驻一列，而是在 bid 设置展开区中配置。
5. Days Off 默认 tab 是 `ALL PROPERTIES`，操作后不跳回 `FAVORITED`。
6. 底部按钮与分页固定在右侧卡片底部，available 列表内容多时不会撑高页面。
7. `npm run verify:pbs` 通过。
