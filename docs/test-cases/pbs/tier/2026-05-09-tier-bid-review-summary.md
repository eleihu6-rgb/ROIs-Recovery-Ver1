# PBS Tier Bid Review / Summary QA 测试案例

> 历史口径：2026-07-20 起，`/tier` 页面底部 `BID SUMMARY` 已移除，bid 管理统一收口到 `/bid` 的 `EXISTING BID PROPERTIES`。当前验收以 `docs/test-cases/pbs/bid/2026-07-20-bid-tier-tx-filter.md` 为准；本文仅保留早期 Tier summary 设计背景。

## 目标

验证 `/tier` 首期基础功能：按 AA Layer Tab 方向展示当前 Lineholder Current draft 的只读 Bid Review / Summary，并能兼容旧数据形态的提示。

## 前置条件

- PBS Portal 与 PBS Server 已启动。
- 测试账号可登录 PBS Portal。
- 当前 bid period 存在。
- 测试账号至少准备以下数据之一：
  - Pairing bid。
  - Days Off property 或 calendar day off。
  - Line property。
- 如需验证 legacy warning，可准备或 mock 一条超出 `T7` 的 summary item，例如 `T12`。

## 测试场景 1：空 bid 状态

### 操作步骤

1. 使用没有 Current draft bid 的测试账号登录。
2. 进入 `/tier`。

### 预期结果

- 页面显示 `PAIRING POOLS`。
- 页面显示 `BID SUMMARY`。
- `T1-T7` pairing pool 行显示无 Pairing rules 或 0 新增 pairing。
- Summary 区显示没有已保存 bid 的空状态提示。
- 页面不出现 `PAIRING SUMMARY`、`PAIRING PROPERTIES`。
- 页面不出现可编辑下拉、删除按钮或可点击保存类操作。

## 测试场景 2：混合 bid 汇总

### 操作步骤

1. 在 Pairing 页面添加一个 `T1` Pairing bid。
2. 在 Days Off 或日历上添加一个 `T1` day off / days off bid。
3. 在 Line 页面添加一个 `T1` Line property。
4. 进入 `/tier`。

### 预期结果

- `PAIRING POOLS` 显示 `T1` 的 `Total Pairings` 与 `Pairings by Tx`。
- Days Off / Line / Calendar 不被计入 pairing pool filter。
- Summary 中能看到对应 `Pairing`、`Days Off`、`Line` 或 `Calendar` 类型标签。
- Line property 不被误显示成 Pairing。
- 每条 bid 展示业务可读文本，而不是只显示原始 `param_a / param_b / param_c`。

## 测试场景 3：同一 bid 跨多个 Tier

### 操作步骤

1. 添加一条同时适用于 `T1`、`T2` 的 bid。
2. 进入 `/tier`。

### 预期结果

- `T1` 和 `T2` 都能看到该 bid。
- 该 bid 的 Tier chip 显示 `T1`、`T2`。
- `PAIRING POOLS` 按 Pairing rules 计算 `T1`、`T2` 的累计和新增 pairing；非 Pairing bid 不改变 pairing pool。
- 页面仍为只读，不允许在 Tier 页面直接修改该 bid 的 Tier。

## 测试场景 4：多条件 bid group 展示

### 操作步骤

1. 准备一条带附加条件的 Pairing bid，例如：
   - 主条件：`Award Any Landing In Airport: YVR`
   - 附加条件：`AND Pairing Check-In Time < 12:00`
2. 进入 `/tier`。

### 预期结果

- 主 bid 显示在同一 summary row 中。
- `AND` 条件作为该 bid 的附加说明显示，不拆成另一条独立 bid。
- 条件顺序与后端返回顺序一致。

## 测试场景 5：空 Tier 提示

### 操作步骤

1. 准备只包含 `T1` 的 Current draft。
2. 进入 `/tier`。

### 预期结果

- `T1` 显示已保存 bid。
- `T2-T7` 显示 `No bids in this tier.`。
- 空 Tier 不被显示为错误。

## 测试场景 6：Legacy Tier warning

### 操作步骤

1. 准备或 mock 一条 summary item，tiers 包含 `T8-T24` 中任意值，例如 `T12`。
2. 进入 `/tier`。

### 预期结果

- `T1-T7` 主 Summary 不混入 `T12` 数据。
- 页面显示 `TIER WARNINGS`。
- Warning 明确说明存在超出当前 `T1-T7` review 范围的 legacy bid data。
- Legacy item 以只读方式展示。
- 页面不允许编辑 legacy item。

## 测试场景 7：错误状态

### 操作步骤

1. 让 `GET /lineholder-bids/current/summary` 返回错误。
2. 进入 `/tier`。

### 预期结果

- 页面显示 `Unable to load the current bid summary.`。
- 不显示 mock 数据。
- 不出现布局大面积空白或闪烁的错误内容。

## 回归范围

- Pairing 页面新增、删除和保存后，`/tier` 能刷新看到变化。
- Days Off 页面和左侧 Bidding Calendar 保存后，`/tier` 能看到对应变化。
- Line 页面保存后，`/tier` 能看到 Line summary。
- Dashboard / Pairing / Days Off / Line / Tier 切换时，左侧 Bidding Calendar 状态不应被 Tier 页面重置。
