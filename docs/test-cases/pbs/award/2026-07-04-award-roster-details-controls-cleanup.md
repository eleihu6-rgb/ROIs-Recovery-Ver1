# PBS Award Roster Details 控件清理 QA 用例

## 目标

验证 Award 页面右侧 `ROSTER DETAILS` 只展示真实可用的 roster 明细能力：

- 不再显示无真实功能的 `Sort by Start Time`。
- 不再显示无真实功能的 `Show: All`。
- 不再显示 `View all duties`。
- duties 数量较多时，通过明细区内部滚动查看全部记录。
- `Reason Report Preview` 继续保留，不伪造 reason 数据。

## 前置条件

- 用户已登录 PBS Portal。
- 当前账号存在已发布的 Award roster 数据。
- 至少准备一个 period / 账号组合，其 roster duties 数量超过右侧明细区首屏可见行数。

## 操作步骤

1. 打开 PBS Portal。
2. 进入 `Award` 页面。
3. 确认页面显示 `Published · <period>`。
4. 查看右侧 `ROSTER DETAILS` 区域标题行。
5. 查看 `ROSTER DETAILS` 表格内容。
6. 在 `ROSTER DETAILS` 表格区域内上下滚动。
7. 查看右侧下方 `Reason Report Preview` 区域。

## 预期结果

- `ROSTER DETAILS` 标题行显示 duties 数量，例如 `18 duties`。
- 页面不显示 `Sort by Start Time`。
- 页面不显示 `Show: All`。
- 页面不显示 `View all duties`。
- 表格不截断为固定 14 条；用户可以通过内部滚动查看全部 duties。
- `Reason Report Preview` 仍然显示。
- 如果没有真实 reason report 数据，`Reason Report Preview` 显示不可用提示。
- 顶部 `View Reason Report` 在无真实 reason report 数据时保持 disabled。

## 异常 / 边界场景

- 无 published roster 时，`ROSTER DETAILS` 显示空态：`No published award roster is available for this period.`
- 只有 1 条 duty 时，标题计数应显示 `1 duty`。
- 多条 day off / activity / pairing 混合时，表格仍能滚动并保持列头可读。

## 回归范围

- Award 页面顶部 summary 不应被影响。
- 左侧 Award Calendar 不应被影响。
- Reason Report 生成逻辑不应被影响。
- Pairing / Tier / Dashboard 页面不应被影响。
