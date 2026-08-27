# PBS All Pairings 每页数量选择设计

> 日期：2026-07-30
> 状态：已确认并实施
> 范围：All Pairings 搜索结果分页

## 1. 问题

All Pairings 页面底部的 `30/Page` 当前只有按钮外观，没有点击行为或选项，属于未完成
的分页控件。

## 2. 已确认行为

1. 提供 `30 / 50 / 100` 三个每页数量选项，默认值保持 30。
2. 切换每页数量后回到第 1 页。
3. 使用新的 `pageSize` 重新请求后端，不在前端一次加载全部结果。
4. 总页数、页码、左右翻页和 Go to 使用新的 `pageSize` 重新计算。
5. 选择结果后控件显示对应的 `30/Page`、`50/Page` 或 `100/Page`。
6. 可编辑选择器只在 All Pairings 模式启用；其他复用
   `PairingSearchPanel` 的预览模式保持现有分页行为，并使用非交互文本显示固定每页数量，
   不继续渲染无行为的假按钮。

## 3. 实现边界

- `pageSize` 状态归 `SearchPairingsPage` 所有，初始值为 30；All Pairings preview
  请求全部读取该状态。
- `pageSize` 必须进入 TanStack Query `queryKey`，与 `page`、period、filters 等条件共同
  标识缓存，避免不同分页数量缓存碰撞并确保切换后重查。
- 使用可访问的原生 `<select>`，名称为 `Pairings per page`，支持键盘操作并表达当前选项；
  不新增依赖或自定义弹层。
- 切换时立即更新选择值并回到第 1 页；复用 TanStack Query 对不同 key 的请求隔离，
  快速连续切换时旧响应不得覆盖最新选择。
- 请求失败时保留当前选择值和最后一次成功结果，复用页面现有持久错误状态与恢复路径，
  不显示原始异常。
- 仅修改 Pairing Search 页面、分页组件及对应测试。
- 不修改数据库、API Contract 或后端查询逻辑。

## 4. 验收标准

1. 默认显示 `30/Page`，初次请求 `pageSize=30`。
2. 选择 50 后显示 `50/Page`、回到第 1 页，并请求 `page=1&pageSize=50`。
3. 选择 100 后显示 `100/Page`、回到第 1 页，并请求 `page=1&pageSize=100`。
4. 切回 30 后恢复 `pageSize=30`。
5. 新 `pageSize` 下总页数、页码、左右翻页和 Go to 边界正确。
6. 非 All Pairings 模式不出现可编辑选择器，也不显示无行为的假按钮。
7. 请求失败时显示既有持久错误状态并保留最后成功结果；快速切换以最后选择为准。
8. 补充或更新 PBS QA 人工测试案例。
9. 单元测试、Portal build、lint、UI 标准检查和 Playwright 通过。

## 5. Multi-Agent Parallelism Assessment

- Recommendation：No
- Rationale：分页状态、组件和测试高度耦合，拆分会增加冲突。
- Suggested split：不拆分。
- Write boundaries：Pairing Search 页面、分页组件、聚焦测试。
- Conflict risk：Low。
- Execution gate：本 Spec 经用户确认并审查通过后实施。
