# PBS Pairing Length 人工测试用例

## 前置条件

- 登录 PBS Portal，当前 bid period 为可用月份。
- Pairing 页面可见 `Pairing Length` 条件。

## 主流程

1. 进入 Pairing 页面，打开 `Pairing Length` 配置弹窗。
2. 不选 Tier、不填天数，确认 `ADD BID` 和 `SAVE FAVORITE` 为禁用。
3. 选择一个 Tier，保持天数为空，确认 footer 仍禁用。
4. 输入 `Min days = 1`、`Max days = 3`，保持 `LIMIT TO PAIRING START DATE` 关闭。
5. 确认可保存，保存后列表摘要显示 `1-3 days`。

## 日期范围流程

1. 再次打开 `Pairing Length`。
2. 输入 `Min days = 1`、`Max days = 3`。
3. 打开 `LIMIT TO PAIRING START DATE`。
4. 选择 From Date 和 To Date，例如 `2026-06-03` 到 `2026-06-18`。
5. 保存后确认 payload 表示 `pairing-length-preference`，并包含 `dateScope.mode = date_range`。
6. Search Pairings 预览应按 pairing start date 落在该范围内过滤。

## 边界场景

- `Min days > Max days` 时不能保存。
- 只填 `Min days` 表示至少 N 天；只填 `Max days` 表示最多 N 天。
- 开启日期限制但未选完整范围时不能保存。
- 编辑历史 `stepper` / `stepper-range` 的 Pairing Length bid 时，应回显为 min/max 天数，不显示技术 operator。

## 回归范围

- `Prefer Pairing Length` / `Prefer Pairing Length on Date` 作为隐藏 AA property 不应新增到 Portal 可见入口。
- Pairing Preference、Airport Preference、Pairing Check-In / Check-Out Time、Flight Legs per Duty、Work Day Preference 弹窗布局和保存行为不应回归。
