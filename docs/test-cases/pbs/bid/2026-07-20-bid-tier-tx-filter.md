# PBS Bid Tx 筛选与 Tier 页收口 QA 测试案例

## 测试目标

验证左侧 `BIDDING CALENDAR` 的 Tx 选择可以驱动 `/bid` 页面 `EXISTING BID PROPERTIES` 与 `BID REVIEW` 筛选，并确认 `/tier` 页面不再显示重复的 bid review / summary 管理区。

## 前置条件

- PBS Portal 与 PBS Server 正常启动。
- 使用 Lineholder crew 登录。
- 当前 Current draft 至少包含：
  - 一条只属于 `T1` 的 bid。
  - 一条只属于 `T2` 的 bid。
  - 可选：一条同时属于 `T1`、`T2` 的 bid。
- 当前 draft 至少包含一条 Pairing bid，用于验证 Tier 页 `PAIRING POOLS` 仍可预览。

## 场景 1：Bid 页默认显示 T1

1. 不选择左侧 calendar 的任何 Tx。
2. 打开 `/bid`。
3. 查看 `EXISTING BID PROPERTIES`。

预期：

- 左侧 `T1` 为默认 active 状态。
- `EXISTING BID PROPERTIES` 显示 `T1 only`。
- `BID REVIEW` 显示 `T1`。
- 列表只展示 tiers 包含 `T1` 的 Days Off / Pairing / Line bid。
- `ADD BID PROPERTIES` 的分类 Tab、搜索、收藏和新增能力保持可用。

## 场景 2：点击 Tx 后只显示该 Tx 的 Existing bids

1. 在左侧 `BIDDING CALENDAR` 点击 `T2`。
2. 保持在 `/bid` 或切换回 `/bid`。
3. 查看 `EXISTING BID PROPERTIES`。

预期：

- 左侧 `T2` 为 active 状态。
- `EXISTING BID PROPERTIES` 显示 `T2 only`。
- `BID REVIEW` 显示 `T2`，并只展示 T2 / global / legacy-only 规则允许显示的 review item。
- 列表只显示 tiers 包含 `T2` 的 bid。
- 同时属于 `T1`、`T2` 的 bid 在 `T2 only` 下仍显示。
- 只属于 `T1` 的 bid 不显示。

## 场景 3：再次点击同一个 Tx 回到默认 T1

1. 在 `T2 only` 状态下再次点击左侧 `T2`。
2. 查看 `/bid`。

预期：

- 左侧 `T2` 取消 active 状态。
- 左侧 `T1` 回到默认 active 状态。
- `EXISTING BID PROPERTIES` 回到 `T1 only`。
- 列表只显示 tiers 包含 `T1` 的 bid，不显示 T2-only bid。

## 场景 4：选中 Tx 但没有 bid

1. 点击一个当前没有任何 bid 的 Tx，例如 `T6`。
2. 查看 `/bid` 的 `EXISTING BID PROPERTIES`。

预期：

- 显示 `T6 only`。
- 列表显示空状态 `No bid properties are attached to T6.`。
- 仍可在下方 `ADD BID PROPERTIES` 添加新 bid。

## 场景 5：Tier 页移除底部 BID SUMMARY

1. 打开 `/tier`。
2. 滚动或检查页面底部。

预期：

- 页面不显示 `BID SUMMARY` 管理区。
- 页面不显示 `TIER REVIEW`。
- `PAIRING POOLS` 和 pool review messages 保持可见。
- Pairing pool 行仍可点击 `View Set` 打开 `Pairing Set Preview`。

## 回归范围

- `/bid` Existing 行编辑、删除、Pairing Preview。
- `/bid` 下方 Days Off / Pairing / Line 新增条件。
- 左侧 `BIDDING CALENDAR` 日期事件展示和 Tx toggle。
- `/tier` Pairing Pools 统计、空 pool diagnostic、Pairing Set Preview。
- Help Center 的 Tier 文案应引导用户去 `/bid` 管理 bid。
