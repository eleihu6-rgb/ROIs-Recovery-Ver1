# PBS Tier Detail Drilldown QA 测试案例

> 更新：2026-07-20 起，`/tier` 不再提供 `BID SUMMARY` / `TIER REVIEW` bid 管理和配置类 review 入口。Bid 配置类 review 与详情入口迁移到 `/bid` 的 `BID REVIEW` / `EXISTING BID PROPERTIES`；`/tier` 仅保留 `PAIRING POOLS` 和 `Pairing Set Preview`。

## 测试目标

历史目标：验证旧 `/tier` 页面支持从 `BID SUMMARY` 和 `TIER REVIEW` 打开只读详情 overlay。当前页面已迁移，该目标不再作为现行验收标准。

## 前置条件

- PBS Portal 可进入 `/tier`。
- 当前 Lineholder Current draft 或 mock 数据至少包含：
  - 一条带 conditions 的 Pairing bid。
  - 一条跨 `T1`、`T2` 的重复引用 diagnostic。
  - 一条空 Tier diagnostic，例如 `T3 has no saved bids`。
  - 可选：一条 legacy / unsupported bid。

## 场景 1：历史废弃：从 BID SUMMARY 打开 bid detail

1. 打开 `/tier`。
2. 在 `BID SUMMARY` 中点击一条 bid row。

预期结果：

- 页面显示 `Tier Bid Detail` overlay。
- overlay 显示 bid type、action、label、readable text 和 Tx chips。
- 如果该 bid 有 conditions，overlay 显示 condition chain。
- overlay 没有编辑、保存、删除入口。

## 场景 2：历史废弃：从 TIER REVIEW 打开相关 bid detail

1. 打开 `/tier`。
2. 在 `TIER REVIEW` 中点击一条带 `groupKey` 或 `itemIds` 的 diagnostic。

预期结果：

- 页面显示 `Tier Bid Detail` overlay。
- overlay 聚焦该 diagnostic 对应的 bid。
- `Review Reasons` 中显示点击的 diagnostic message。
- 相关 warnings 仍可显示，不影响只读状态。

## 场景 3：从 Tier-level diagnostic 打开 review detail

1. 打开 `/tier`。
2. 点击 `emptyTier`、`heavyTier` 或 `lightTier` 类 diagnostic。

预期结果：

- 页面显示 `Tier Review Detail` overlay。
- overlay 显示相关 Tx chips。
- overlay 显示该 diagnostic 原因。
- 如果没有直接关联 bid，页面显示 `No bid is directly attached to this review item.`。

## 场景 4：关闭 overlay

1. 打开任意 detail overlay。
2. 点击 `Close`。
3. 再次打开 overlay。
4. 按 `Escape`。

预期结果：

- 两种方式都能关闭 overlay。
- 当前行为：`/tier` 不再显示 `BID SUMMARY` / `TIER REVIEW`；关闭 Pairing Set Preview 后应回到 `PAIRING POOLS`。

## 场景 5：Legacy / unsupported bid 详情

1. 准备一条 legacy 或 unsupported bid。
2. 在 `/tier` 中点击该 bid 或对应 diagnostic。

预期结果：

- overlay 显示 `Review-only` 标记。
- `Review Reasons` 显示 legacy / unsupported warning 或 diagnostic。
- 页面不报错，也不提供编辑入口。

## 回归范围

- 当前行为以 `/bid` 的 `BID REVIEW` 和 `/tier` 的 `PAIRING POOLS` 为准。
- `/pairing`、`/days-off`、`/line` 编辑保存链路不受影响。
