# PBS Tier View Pairing Set QA 测试案例

> 更新：2026-07-20 起，`/tier` 不再从 `BID SUMMARY` / `TIER REVIEW` 管理 bid 或打开配置类 review 详情。Pairing Set Preview 保留在 `PAIRING POOLS`；当前 Tx 筛选、bid 管理和 `BID REVIEW` 以 `/bid` 为准。

## 目标

验证 `/tier` 页面能从 Pairing bid detail 打开只读 `Pairing Set Preview`，展示当前 Tx 保存的 Pairing 规则筛出的 pairings。该结果仅用于提交前规则预览，不等同于最终 Award。

## 前置条件

- PBS Portal 可进入 `/tier`。
- 当前 Lineholder Current draft 至少保存一条 `Pairing` bid，且该 bid 位于 `T1-T7`。
- Pairing search preview API 可返回结果或空结果。

## 场景 1：Pairing bid detail 显示 View Pairing Set

1. 打开 `/tier`。
2. 在 `BID SUMMARY` 点击一条 `Pairing` bid。

预期：

- 页面打开 `Tier Bid Detail`。
- Detail 内显示 `View Pairing Set` 按钮。
- Days Off / Line / Calendar detail 不显示该按钮。

## 场景 2：打开 Pairing Set Preview

1. 在 Pairing bid detail 中点击 `View Pairing Set`。

预期：

- 显示 `Pairing Set Preview`。
- 显示当前 Tx chip。
- 显示 `Preview only. Final award is produced by the optimization run.`。
- 显示 pairing numbers / total results summary。
- 结果卡片展示 pairing id、base、report、block、credit、legs 摘要和 active dates。

## 场景 3：空结果

1. 准备一条当前 Tx 下无匹配 pairings 的 Pairing 规则。
2. 在 `/tier` 打开该 bid detail。
3. 点击 `View Pairing Set`。

预期：

- 显示空状态：`No pairings match this saved rule set for the selected Tx.`。
- 不显示为 Award 失败。
- 原 detail 可通过 `Back` 返回。

## 场景 4：接口错误

1. 模拟 pairing preview API 返回 400 / 500 或网络错误。
2. 点击 `View Pairing Set`。

预期：

- 显示错误说明。
- 显示 `Retry`。
- 不关闭 `Tier Bid Detail`。
- 不修改任何用户 bid。

## 场景 5：分页

1. 准备 preview 结果超过一页。
2. 点击 `Next` / `Previous`。

预期：

- 只刷新 preview 列表。
- Dialog 不关闭。
- 当前 Tier detail 上下文保持不变。

## 回归检查

- `PAIRING POOLS` 仍在页面内稳定显示。
- `Pairing Set Preview` 的结果、分页和关闭行为正常。
- `/pairing` 当前搜索、保存、preview 链路不受影响。
- `/award` 仍不把 preview 当作最终结果。
