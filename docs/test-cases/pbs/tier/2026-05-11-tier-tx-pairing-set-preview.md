# PBS Tier Tx Pairing Set Preview QA 测试案例

> 更新：2026-07-20 起，`/tier` 不再显示底部 `BID SUMMARY` 分组。Tx 级 `View Set` 入口保留在 `PAIRING POOLS` 行内；当前验收以 Pairing Pools 预览为准。

## 目标

验证 `/tier` 页面可以从 `BID SUMMARY` 的某个 `T1-T7` 分组直接打开该 Tx 的只读 `Pairing Set Preview`。该结果只表示当前 Tx 已保存 Pairing rules 筛出的 pairing set，不是最终 Award。

## 前置条件

- PBS Portal 可进入 `/tier`。
- 当前 Lineholder Current draft 至少有一个 Tx 保存了 Pairing bid。
- Pairing search preview API 可返回成功、空结果或错误。

## 场景 1：有 Pairing bid 的 Tx 显示入口

1. 打开 `/tier`。
2. 查看 `BID SUMMARY`。
3. 找到包含 Pairing bid 的 Tx 分组，例如 `T1`。

预期：

- `T1` 分组 header 显示 `View Pairing Set`。
- 没有 Pairing bid 的 Tx 不显示该入口。

## 场景 2：从 Tx 分组直接打开 preview

1. 点击 `T1` 分组 header 的 `View Pairing Set`。

预期：

- 页面打开 `Pairing Set Preview` overlay。
- Header 显示当前 Tx，例如 `T1`。
- Header 右上角显示 `X` 关闭按钮。
- 标题中的 Tx 使用紫色 Tx chip 样式，右上角不重复显示 Tx chip。
- 显示 `Preview only. Final award is produced by the optimization run.`。
- 成功返回时显示 pairing number 数量、total results 和 pairing 明细。
- 不需要先打开 `Tier Bid Detail`。

## 场景 3：空结果

1. 准备一个 Pairing rules 很窄或 preview API 返回空结果的 Tx。
2. 点击该 Tx 的 `View Pairing Set`。

预期：

- 显示空态：`No pairings match this saved rule set for the selected Tx.`
- 不显示为 Award 失败。

## 场景 4：错误和重试

1. 模拟 pairing preview API 返回 400 / 500 或网络错误。
2. 点击 Tx 分组的 `View Pairing Set`。

预期：

- Overlay 显示错误说明。
- 显示 `Retry`。
- 点击 `Retry` 后重新请求当前 Tx preview。
- 不影响 `BID SUMMARY` 原页面。

## 场景 5：回退与分页

1. 打开 Tx 级 `Pairing Set Preview`。
2. 如果结果超过一页，点击 `Next / Previous`。
3. 点击右上角 `X`。

预期：

- 切页只刷新 preview 列表。
- `Page x of y`、`Previous`、`Next` 显示在底部左侧。
- 不显示旧的 `Back` 按钮。
- 点击右上角 `X` 后回到 `/tier` Summary 页面。
- `BID SUMMARY` 局部滚动体验不回退。

## 回归

- 从单条 Pairing bid detail 内打开 `View Pairing Set` 仍正常。
- Days Off / Line / Calendar bid detail 不显示 `View Pairing Set`。
- `/pairing` 当前规则 preview、搜索、保存链路不受影响。
- `/award` 不把 preview 当作最终结果。
