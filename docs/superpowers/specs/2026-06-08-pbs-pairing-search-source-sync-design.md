# PBS Pairing Search 来源同步设计

## 背景

`/fpqe/pbs/pairing/search` 当前仍带有早期“多条件搜索工作区”的痕迹，例如：

- `BID THESE PROPERTIES`
- `ADD MORE SEARCH CRITERIA`
- 在 Search 页里添加更多 criteria
- 将 Search 页里的 criteria 再添加回 bid

现在产品语义已经变化：用户从 Pairing 页面点击小眼睛进入 Search Pairings，是为了查看“这个条件能过滤出多少 pairing”，并允许在 Search 页临时调整这个条件。如果用户确认修改，修改应同步回来源对象，而不是在 Search 页里再生成新的 bid 条件。

## 核心产品原则

- Search Pairings 页面只编辑当前来源条件。
- 来源是 `EXISTING PAIRING PROPERTIES`，确认修改后同步回 existing property。
- 来源是收藏条件（`FAVORITED PROPERTIES` / favorite item），确认修改后同步回 favorite。
- 来源是普通 catalog property 且尚未保存为 favorite / existing 时，Search 页可用于预览和临时调整，但不能伪装成“已同步外部对象”。
- 多条件组合搜索、在 Search 页添加更多条件、从 Search 页批量添加到 bid，后续单独设计。

## 目标

- 移除或隐藏 Search 页的 `BID THESE PROPERTIES` 和 `ADD MORE SEARCH CRITERIA`。
- Search 页最多展示一个 editable criteria。
- Search 页编辑确认后，根据入口来源同步回对应对象：
  - `existing` 来源：PATCH existing property。
  - `favorite` 来源：PATCH favorite property。
  - `catalog` 来源：仅更新 Search 页当前 preview 条件，不持久化。
- 同步成功后，刷新或更新 Pairing 页面缓存，返回 Pairing 页面时能看到最新值。
- 同步失败时，Search 页保持当前原条件，提示用户失败，不静默覆盖。

## 非目标

- 不做多条件组合搜索。
- 不保留 Search 页里的 `Add More Criteria` picker。
- 不从 Search 页执行 `Bid These Properties`。
- 不改 Search Results 表格结构。
- 不改变 existing property 和 favorite 的删除逻辑。
- 不修改 Days Off / Line / Reserve 的 Search 语义。

## 当前实现理解

### 前端

- `PairingRightPanel` 有三类进入 Search 页的入口：
  - `handleExistingPreview(propertyId)`：从 `EXISTING PAIRING PROPERTIES` 的小眼睛进入。
  - `handleAvailableAction("preview", property)`：从 available / favorite property 的小眼睛进入。
  - `handleSearchCurrentRules()`：从当前所有 rules 进入 current-rules preview。
- `PairingSearchLocationState` 目前只携带 `previewProperty` / `previewMode` / `existingProperties` / `draftMeta`，没有明确来源类型和来源 stable key。
- `SearchPairingsPage` 目前已经接入 `PairingPropertyConfigDialog`，但确认后只更新 Search 页本地 `criteriaItems`。
- Search 页仍保留 `BID THESE PROPERTIES`、`ADD MORE SEARCH CRITERIA`、favorite toggle、remove 等旧工作区动作。

### 后端

- existing property 已有 PATCH：
  - `PATCH /api/pairing-bids/current/properties/by-key/:propertyGroupKey`
  - 前端封装：`pairingService.patchCurrentDraftProperty(...)`
- favorite 当前只有新增和删除：
  - `POST /api/pairing-bids/current/favorites`
  - `DELETE /api/pairing-bids/current/favorites/by-key/:favoriteKey`
- favorite 还没有 PATCH update 契约；如果要从 Search 页同步收藏，必须补 stable favorite update。

## 入口来源模型

给 `PairingSearchLocationState` 增加明确来源：

```ts
type PairingSearchPreviewSource =
  | {
      type: "existing";
      propertyGroupKey: string;
    }
  | {
      type: "favorite";
      favoriteKey: string;
    }
  | {
      type: "catalog";
    };
```

`previewProperty` 仍保存用于渲染和 preview 的完整条件快照。

### 来源赋值规则

- `EXISTING PAIRING PROPERTIES` 小眼睛：
  - `source.type = "existing"`
  - `propertyGroupKey = existingProperty.id`
- `FAVORITED PROPERTIES` 小眼睛：
  - `source.type = "favorite"`
  - 必须带 `favoriteKey`
- 普通 `ALL PROPERTIES` 中尚未收藏的 catalog property 小眼睛：
  - `source.type = "catalog"`

如果 favorite 入口缺少 `favoriteKey`：

- 前端不应静默当成 catalog。
- 应阻止持久化同步并显示错误，例如 `Unable to update favorite because its saved identity is missing.`
- 同时补数据映射和测试，确保后端返回的 favorite item 在前端始终带 `favoriteKey`。

## Search 页行为设计

### Header actions

在单条件 preview 模式下：

- 不显示 `BID THESE PROPERTIES`。
- 不显示 `ADD MORE SEARCH CRITERIA`。
- 不显示 criteria picker。
- 不显示 criteria row 的 remove 按钮。
- 不显示 criteria row 的 favorite/unfavorite 按钮。
- 保留 criteria row 的 edit 按钮。

`current-rules` preview 仍保持只读 rule preview，不显示这些 actions。

### 编辑弹窗

- 继续使用 `PairingPropertyConfigDialog`。
- 点击 criteria edit 打开弹窗。
- `Cancel` 不修改本页条件，也不调用后端。
- `UPDATE BID`：
  - 先构造 updated criteria。
  - 根据 `source.type` 决定同步方式。
  - 同步成功后更新本页 criteria、刷新 preview、更新 Query Cache。
  - 同步失败后保留旧 criteria，提示错误。

### 来源同步规则

#### existing 来源

- 使用 `pairingService.patchCurrentDraftProperty(propertyGroupKey, existingProperty, draftMeta)`。
- `existingProperty` 可复用 `buildPairingExistingPropertyFromSearchCriteria(...)` 构造，但必须保留原 `propertyGroupKey`。
- 成功后：
  - patch `pairingPageDataQueryKey` 中 `rightPanel.existingProperties` 对应项。
  - patch `draftMeta` 的最新 `draftVersion`。
  - invalidate pairing calendar queries。
  - Search 页本地 criteria 更新并刷新 preview。

#### favorite 来源

新增 favorite PATCH 契约：

- Route:
  - `PATCH /api/pairing-bids/current/favorites/by-key/:favoriteKey`
- Request:
  - 沿用 `PbsSavePairingFavoritePropertyRequest` 的 draft identity + property payload。
  - 路径参数提供 stable `favoriteKey`。
- Response:
  - 沿用 `PbsPairingFavoriteMutationResponse`，返回最新 favorite payload 和 draft identity。

后端行为：

- 校验 `favoriteKey` 是当前用户当前 bid 下的 configured favorite。
- 校验 property payload。
- 更新 `pbs_bid_pairing_configured_favorite` 对应行的：
  - `favorite_name`
  - `action`
  - `quantifier`
  - `bid_payload`
  - `tiers`
  - `updated_by`
  - `updated_at`
- 返回更新后的 favorite。
- 不创建新 favorite。
- 不删除旧 favorite 再新建，避免 stable identity 变化。

前端行为：

- 新增 `pairingService.patchFavoriteProperty(favoriteKey, property, draftMeta)`。
- 成功后：
  - 更新 `availableProperties` / query cache 中相同 `favoriteKey` 的 favorite item。
  - 保留 `favoriteKey`。
  - Search 页本地 criteria 更新并刷新 preview。

#### catalog 来源

- 不调用后端。
- 更新 Search 页本地 criteria 并刷新 preview。
- 不显示“同步成功”类提示，避免误导用户以为外部 catalog 被修改。

## 用户提示

建议新增或复用提示：

- existing 更新成功：`Pairing property updated.`
- existing 更新失败：`Unable to update pairing property.`
- favorite 更新成功：`Favorite updated.`
- favorite 更新失败：`Unable to update favorite.`
- favorite identity 缺失：`Unable to update favorite because its saved identity is missing.`

## 测试计划

### 前端单元 / 组件测试

更新 `SearchPairingsPage` 相关测试：

- 单条件 preview 不显示：
  - `BID THESE PROPERTIES`
  - `ADD MORE SEARCH CRITERIA`
  - remove criteria
  - favorite/unfavorite criteria
- existing 来源：
  - 点击编辑打开弹窗。
  - `Cancel` 不调用 PATCH。
  - `UPDATE BID` 调用 `pairingService.patchCurrentDraftProperty`。
  - 成功后 criteria row 更新并 preview refresh。
  - 失败后 row 保持原值并显示错误。
- favorite 来源：
  - `UPDATE BID` 调用新的 `pairingService.patchFavoriteProperty`。
  - success 后保留 favoriteKey，并更新 query cache。
  - favoriteKey 缺失时不调用 API，显示错误。
- catalog 来源：
  - `UPDATE BID` 不调用 existing PATCH / favorite PATCH。
  - 只更新 Search 页本地 preview。

更新 Pairing 页面测试：

- existing 小眼睛进入 Search 时携带 `source.type = "existing"` 和 property key。
- favorite 小眼睛进入 Search 时携带 `source.type = "favorite"` 和 favorite key。
- catalog 小眼睛进入 Search 时携带 `source.type = "catalog"`。

### 后端测试

新增 / 更新：

- Contract route 常量包含 favorite PATCH route。
- `pairingService.patchFavoriteProperty` 前端 service 测试。
- `PATCH /api/pairing-bids/current/favorites/by-key/:favoriteKey` route test：
  - 成功更新 favorite。
  - invalid favorite key 返回 400。
  - favorite 不存在或不属于当前 bid 返回合理错误。
  - invalid property payload 返回 400。
- Pairing bid service test：
  - update configured favorite 不改变 favoriteKey。
  - 更新后的 favorite 返回新 bid/action/quantifier/tiers。

### QA 人工测试

新增或更新 `docs/test-cases/pbs/pairing/`：

- existing 来源修改同步。
- favorite 来源修改同步。
- catalog 来源只做临时 preview。
- header actions 不再出现。
- current-rules preview 不受影响。

## 验收标准

- Search 页单条件 preview 不再出现 `BID THESE PROPERTIES` 和 `ADD MORE SEARCH CRITERIA`。
- 从 `EXISTING PAIRING PROPERTIES` 小眼睛进入后，编辑确认会同步修改原 existing property。
- 从收藏小眼睛进入后，编辑确认会同步修改原 favorite，且 favorite stable key 不变。
- favorite 缺少 stable key 时，不允许假同步，必须提示错误。
- 从普通 catalog property 小眼睛进入后，编辑只影响当前 preview，不持久化。
- current-rules preview 保持可用。
- 自动化测试、类型检查、lint/build 回归通过；若 lint 存在历史 warning，需说明不是本任务引入。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 该任务跨前端 Search 页、Pairing 入口、前端 service、后端 route/service/contract/test，但核心契约紧密耦合，拆分后需要频繁协调同一类型和接口。
- Suggested split: 不建议并行拆分。若后续任务扩大，可按 backend favorite PATCH 与 frontend source sync 拆，但必须先固定 contract。
- Write boundaries: 当前 agent 统一修改 `packages/contracts`、`pbs-server/src/routes`、`pbs-server/src/services/pairing`、`pbs-portal/src/features/pairing`、`pbs-portal/src/shared/services` 和测试文档。
- Conflict risk: 中高；多个 agent 容易同时改 Pairing contract / service / page tests。
- Execution gate: 用户确认本 spec 后再进入实现。

