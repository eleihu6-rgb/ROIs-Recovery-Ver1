# PBS Search Results 局部 Loading 设计

日期：2026-04-24
作者：Codex
状态：已实现

## 背景

当前 `/pairing/search` 从 `SEARCH CRITERIA` 编辑条件后，会重新调用 pairing search preview。由于页面在 `previewQuery.isLoading` 时直接返回整页 loading，右侧整个 `Search Pairings` 面板都会被替换，导致用户正在编辑的条件、标题和上下文一起消失，体验很差。

用户期望：修改 criteria 重新搜索时，只刷新 `SEARCH RESULTS` 下方结果区域。

## 目标

- 首次从 `/pairing` preview 进入 `/pairing/search` 时，可以继续显示当前整页 loading。
- 当页面已经有一次搜索结果后，再编辑 criteria / 翻页触发新 preview 时，不替换整个右侧页面。
- `SEARCH CRITERIA` 区域保持稳定可见，用户能看到刚刚修改的条件。
- 只在 `SEARCH RESULTS` 下方展示 loading / refreshing 状态。
- 新结果返回后替换结果统计、列表和 pagination。

## 推荐方案

采用“保留上一份结果 + results 区域局部刷新”的方案。

实现思路：

1. `SearchPairingsPage` 不再在所有 `previewQuery.isLoading` 情况下整页 return loading。
2. 只有 `hasPreview && !pageData && previewQuery.isLoading` 时显示首次进入的整页 loading。
3. 如果已有 `pageData`，后续请求中的 `isFetching` 作为 `PairingSearchPanel` 的 `isResultsRefreshing` prop 传入。
4. `PairingSearchPanel` 在 `SEARCH RESULTS` 内容区显示局部 loading：
   - 可以在 results header/action row 附近显示 `Refreshing results...`
   - 或在结果列表上方/列表内部显示轻量 overlay
5. 请求失败时同理避免整页替换：
   - 首次进入失败仍显示当前错误页
   - 已有结果后的刷新失败，保留旧结果并在 results 区域显示错误提示

## 备选方案

### 方案 A：保留旧结果并局部刷新（推荐）

优点：

- 用户上下文稳定，不会看到整页闪烁。
- criteria 编辑面板不会被关闭。
- 即使请求慢，也还能看到上一轮结果。

代价：

- 需要 `SearchPairingsPage` 保存或复用上一份可展示的 page data。

### 方案 B：results 区域清空后局部 loading

优点：

- 语义最直接：新搜索中，旧结果不再显示。

代价：

- 页面下半部分会大面积空白或闪烁。
- 搜索慢时信息密度下降，体验不如保留旧结果。

### 方案 C：使用 React Query placeholderData

优点：

- 更贴近 React Query 模式，可以直接保留上一份 query data。

代价：

- 当前 pageData 还叠加了 criteria 本地状态和 mock fallback，直接使用 placeholderData 可能让状态关系更绕。

## 验收标准

- 从 `/pairing` 点击 eye 首次进入 `/pairing/search`，没有已缓存结果时仍显示 loading。
- 页面已有结果后，编辑 `SEARCH CRITERIA` 的 bid / mode / quantifier 不再让整个右侧 panel 消失。
- 刷新期间 `SEARCH CRITERIA` 仍保持可见，编辑区不被强制关闭。
- 刷新期间只有 `SEARCH RESULTS` 区域出现 loading / refreshing 提示。
- 新结果返回后更新统计、结果列表和分页。
- 刷新失败时保留上一轮结果，并在 results 区域提示错误。
- `SearchPairingsPage` 相关测试覆盖“编辑 criteria 时 panel 保留、results 显示 refreshing”。
