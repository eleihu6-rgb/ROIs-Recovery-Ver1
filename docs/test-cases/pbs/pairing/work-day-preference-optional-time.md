# Work Day Preference 可选时间窗口人工回归

日期：2026-08-12
范围：PBS Portal Current Pairing Bid、Standing Lineholder Bid、Search Pairings、摘要展示

## 目标

确认 `Work Day Preference` 只选择 weekday、不填写具体 check-in time 时可以保存，并且保存后的筛选和摘要语义与参考项目一致。

## 前置条件

- 使用一个可编辑的 Current Bid period。
- 使用一个可编辑的 Standing Bid。
- Pairing 属性目录中存在 `Work Day Preference`。

## Current Pairing Bid

1. 打开 PBS Portal 的 Pairing Bid 页面。
2. 添加 `Work Day Preference`。
3. 选择一个 tier。
4. 只选择 `Thu`，不要填写 `check-in from` / `check-in to`。
5. 确认 `ADD BID` 可点击。
6. 保存后重新打开该 bid，确认 `Thu` 被选中，两个时间输入为空。
7. 摘要应显示为类似 `Award pairings checking in on Thursday`，不能显示 `needs review` 或 `Incomplete check-in window`。

## Open-Ended Window

1. 添加或编辑 `Work Day Preference`。
2. 配置 `Wed` 只填写 `check-in from = 06:00`。
3. 配置 `Fri` 只填写 `check-in to = 10:00`。
4. 保存后确认摘要表达为 `Wednesday at or after 06:00`、`Friday at or before 10:00` 或同等含义。
5. 两边都填写为同一时间，例如 `06:00` / `06:00`，确认保存按钮不可用或后端拒绝保存。

## Standing Lineholder Bid

1. 打开 Standing Bid 页面。
2. 添加 `Work Day Preference`。
3. 确认 Standing dialog 不显示 event date scope。
4. 选择一个 tier。
5. 只选择 `Wed` 和 `Fri`，不要填写具体时间。
6. 确认 `ADD BID` 可点击并能保存。
7. 保存后摘要不能显示 `needs review` 或 `Incomplete check-in window`。

## Search Pairings

1. 在 Pairing Search 中配置 `Work Day Preference`。
2. 使用 weekday-only、start-only、end-only 三类配置分别搜索。
3. 确认结果按 duty 的本地 check-in weekday 匹配。
4. start-only 只匹配该 weekday 且 check-in time 大于等于开始时间的 pairing。
5. end-only 只匹配该 weekday 且 check-in time 小于等于结束时间的 pairing。

## 数据库说明

本需求不需要执行 migration。现有 bid JSON 已经使用 `checkInFrom: string | null` 和 `checkInTo: string | null` 表达可选时间窗口。
