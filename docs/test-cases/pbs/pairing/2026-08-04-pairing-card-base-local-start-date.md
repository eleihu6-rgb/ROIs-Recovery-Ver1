# Pairing 卡片 Base 本地开始日期测试

## 前置条件

- 测试用户能够进入 `Bid > Search Pairings`。
- 准备一个 Pairing：Base 本地开始日期为 `2026-06-04`，对应 UTC 日期为 `2026-06-05`。

## 主流程

1. Date Range 选择 `2026-06-01` 至 `2026-06-04`。
2. 找到该 Pairing 的结果卡片。
3. 核对卡片 `Start` 和右侧迷你日历。

预期：

- 该 Pairing 包含在结果中。
- 卡片显示 `Start Jun 4, 2026`，不显示 UTC 日期 `Jun 5, 2026`。
- 迷你日历的 `2026-06-04` 为激活状态。

## 详情入口

从 Pairing ID/详情入口打开同一 Pairing。

预期：`originDate`、`Start` 和日历起始日期均为 Base 本地日期 `2026-06-04`。

## 边界场景

- `active_start_date` 缺失但存在有效航段覆盖日期：使用第一天 Base 本地覆盖日期。
- 本地开始日期和航段覆盖日期均缺失：显示 `-`，不得回退显示 UTC 日期。

## 回归范围

- Pairing 搜索结果卡片。
- Pairing 详情入口。
- Date Range 筛选。
- 迷你日历激活日期。
