# PBS Search Results 刷新范围收敛设计

日期：2026-04-28
作者：Codex
状态：待实现

## 背景

当前 `/pairing/search` 在添加更多 search criteria 时，页面会出现整块刷新或重新 loading 的体验。用户期望添加条件、减少条件、修改条件时，`SEARCH CRITERIA` 区域保持稳定，只刷新 `SEARCH RESULTS` 下方内容。

只读排查发现：

- `SearchPairingsPage` 已有 `lastPreviewResponse`，编辑 criteria 时通常可以保留上一份 page data，因此不会整页 loading。
- 但添加 criteria、删除 criteria 时会调用 `setLastPreviewResponse(null)`。
- 当新的 `previewCriteria` 还没返回且 `pageData` 为 `null` 时，页面进入 `Loading pairing search preview...` 的整页 loading 分支。
- 这会让 `SEARCH CRITERIA`、按钮、picker 和结果区一起被替换，用户感知为整个页面刷新。

## 目标

- 添加 search criteria 时，criteria 列表立即更新，页面不整块刷新。
- 删除 search criteria 时，criteria 列表立即更新，页面不整块刷新。
- 修改 search criteria 的 bid / action / quantifier / layer 时，页面不整块刷新。
- 新搜索请求进行中时，只让 `SEARCH RESULTS` 区域进入刷新态。
- 用户确认的刷新态策略为：清空旧结果列表，只在 `SEARCH RESULTS` 区域显示局部 loading。
- 新结果返回后，更新结果摘要、结果列表和分页。
- 搜索失败时，保留当前 criteria，错误只显示在 `SEARCH RESULTS` 区域。

## 非目标

- 不改变 pairing search 后端 API。
- 不改变 search criteria 的业务校验规则。
- 不改变 `BID THESE PROPERTIES` 写入 draft 的流程。
- 不重新设计 criteria picker 的布局。
- 不实现 Day Off / Planned Absence conflict。

## 交互设计

### 首次加载

如果从 `/pairing` 进入 `/pairing/search`，且页面还没有任何可展示数据：

- 可以继续显示当前页面级首次 loading。
- 如果首次 preview 失败，可以继续显示首次错误页。

原因：首次进入时尚无 criteria/result 页面结构可稳定展示，页面级 loading 可接受。

### Criteria 变化后的刷新

当页面已经建立 search builder 结构后，以下操作都不能触发整页 loading：

- `ADD MORE SEARCH CRITERIA` 添加一条 criteria。
- 删除已有 criteria。
- 编辑 bid 值。
- 修改 action。
- 修改 quantifier。
- 切换 criteria layer。
- 翻页。

刷新期间表现：

- `SEARCH CRITERIA` 区域立即展示最新 criteria。
- `SEARCH CRITERIA` 标题区按钮保持可用状态规则不变。
- criteria picker / 编辑面板不因为搜索请求重挂而消失。
- `SEARCH RESULTS` 的旧结果列表清空。
- `SEARCH RESULTS` 区域显示局部 `Refreshing results...`。
- footer 的总数和分页不展示旧结果对应的可操作分页，避免用户误以为旧分页仍属于当前条件。

### 空 Criteria

当 criteria 被删除到 0 条：

- 不触发 `previewCriteria`。
- `SEARCH CRITERIA` 显示空状态。
- `SEARCH RESULTS` 显示 `0 pairing IDs, 0 total results`。
- 结果列表为空。
- `BID THESE PROPERTIES` 禁用。

### 刷新失败

如果 criteria 变化后的 preview 请求失败：

- 不整页替换成错误页。
- criteria 区保留当前用户输入。
- `SEARCH RESULTS` 区域显示错误提示。
- 结果列表保持为空，避免把旧结果误认为当前条件的结果。

## 推荐方案

采用“页面结构稳定 + results 局部空态刷新”的方案。

实现要点：

1. `SearchPairingsPage` 区分首次加载和 criteria 变化后的刷新。
2. 当用户修改 criteria 后，不再因为缺少最新 preview response 而让整个页面进入 `return loading`。
3. 为当前 criteria 构造临时 `PairingSearchPageData`：
   - criteriaItems 使用最新本地状态。
   - resultSummaryText 使用刷新态文案或 `0 pairing IDs, 0 total results`。
   - results 使用空数组。
   - pagination 使用安全空分页。
4. `PairingSearchPanel` 继续只负责展示：
   - `isResultsRefreshing=true` 时在 results viewport 内显示局部 loading。
   - results 数组为空时不渲染旧 result card。
5. preview 成功后用新 response 替换 summary/results/pagination。
6. preview 失败后保持 criteria page data，并在 results 区域显示错误。

## 备选方案

### 方案 A：保留旧结果并显示局部刷新

优点：

- 下半区视觉最稳定。
- 慢请求期间信息密度高。

缺点：

- 用户已明确选择不保留旧结果。
- 旧 pairing 可能被误认为当前 criteria 的结果。

### 方案 B：清空结果区并局部 loading（本轮采用）

优点：

- 语义明确，当前条件未完成搜索时不展示旧结果。
- 只影响 `SEARCH RESULTS`，不会打断 criteria 编辑。
- 改动可以集中在 `SearchPairingsPage` 的 pageData 构造和少量测试。

代价：

- 搜索慢时结果区会短暂空白。

### 方案 C：拆分独立 SearchResults 状态机

优点：

- 长期边界更清晰，结果摘要、列表、分页可以完全独立。

代价：

- 本轮改动面偏大，会重构 `PairingSearchPanel` props 和测试。
- 当前问题不需要引入额外结构。

## 数据与状态设计

新增或调整的状态语义：

- `hasSearchPreview`：是否处于 current rules preview 或 search builder preview 模式。
- `hasEverRenderedSearchShell` 或等价判断：是否已经可以稳定展示 search page shell。
- `isResultsRefreshing`：当前 preview 请求正在进行，且页面 shell 已存在。
- `resultsRefreshError`：preview 失败时只传入 results 区域展示。

`pageData` 构造规则：

| 场景 | pageData | results | loading 展示 |
| --- | --- | --- | --- |
| 无 criteria | empty page data | 空 | 无 |
| 首次 preview 加载中且无 shell | `null` | 无 | 页面级 loading |
| criteria 变化刷新中 | latest criteria page data | 空 | results 局部 loading |
| preview 成功 | response page data | 新结果 | 无 |
| preview 失败且已有 shell | latest criteria page data | 空 | results 局部 error |

## 测试计划

更新 `pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx`：

- 添加 criteria 时：
  - `SEARCH CRITERIA` 仍可见。
  - 新 criteria 立即显示。
  - 不出现页面级 `Loading pairing search preview...`。
  - `SEARCH RESULTS` 出现 `Refreshing pairing search results`。
  - 旧 result card 不显示。
- 删除 criteria 时：
  - criteria 区立即移除对应条件。
  - results 区局部刷新，不整页 loading。
- 编辑 criteria 时：
  - 编辑面板保持可见。
  - results 区清空旧结果并局部刷新。
- preview 失败时：
  - criteria 区保持当前条件。
  - results 区显示错误提示。
  - 不显示整页错误态。

## 验收标准

1. `/pairing/search` 添加 more search criteria 时，页面 shell 不刷新、不消失。
2. 添加、删除、修改 criteria 后，只有 `SEARCH RESULTS` 下方进入局部 loading。
3. 局部 loading 期间旧 result card 不显示。
4. 新 preview 成功后展示新摘要、新结果和新分页。
5. preview 失败时只在 results 区域显示错误，criteria 区不丢失。
6. 空 criteria 时回到空结果状态，不触发不必要 search 请求。
7. 既有 current-rules-preview、`BID THESE PROPERTIES`、criteria picker 行为不回退。
