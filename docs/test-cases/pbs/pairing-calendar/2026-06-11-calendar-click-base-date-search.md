# PBS 左侧日历点击 Pairing 按登录人 Base 日期搜索 QA 用例

日期：2026-06-11  
范围：PBS Portal 左侧 `BIDDING CALENDAR` 点击日期添加 Pairing 的 occurrence 搜索

## 前置条件

- 使用有 Pairing Award 权限的 PBS 用户登录。
- 当前登录用户 `pbs_user.base` 有对应 live `airport.zone_id`，例如 `YYC -> America/Edmonton`。
- 测试数据中至少存在一个 pairing 的 `report/start UTC` 在 UTC 日期为次日、但换算到登录人 base 后仍属于前一日的记录，例如：
  - UTC：`12-28 05:05`
  - YYC：`12-27 22:05`
- 当前 bid period 与左侧 `BIDDING CALENDAR` 展示月份一致。

## 主流程

1. 登录 PBS Portal，进入包含左侧 `BIDDING CALENDAR` 的工作台页面。
2. 确认当前 bid period 已加载，且 Pairing Award bid 可用。
3. 在左侧日历点击登录人 base-local 日期为 `0627` 的日期格。
4. 查看弹出的 Pairing occurrence 搜索结果。

## 预期结果

- 后端搜索使用当前登录人的 base 时区解释点击日期。
- UTC 日期为 `0628`、但登录人 base-local start/report 日期为 `0627` 的 pairing 应出现在 `0627` 的搜索结果中。
- 同一 pairing 不应仅因为 UTC 日期是 `0628` 而只能在 `0628` 点击时出现。
- occurrence 的 `originDate/startDate/endDate` 与左侧日历口径一致，都是登录人 base-local 日期。
- 前端请求仍只包含 `originDate` 和 `periodCode`，不额外传 `base` 或 `zone`。

## 边界场景

- 登录用户 `pbs_user.base` 缺失、`airport.zone_id` 缺失或 `zone_id` 不是有效时区名时，接口 fallback 到 `UTC`，页面不应报错。
- 点击无匹配 pairing 的日期时，弹窗应正常显示空结果或对应空态。
- 选择 occurrence 加入 bid 后，左侧日历事件应按返回的 `originDate/startDate/endDate` 展示。
- 打开 pairing detail 时，详情卡片仍按 pairing `base` 展示 `REPORT / DATE / DEP / ARR` 和右侧 duty mini calendar。

## 回归范围

- `GET /api/pairing-search/pairing-occurrences/by-date`
- 左侧 `BIDDING CALENDAR` 点击日期添加 Pairing
- Pairing occurrence 选择弹窗
- Pairing bid 加入日历后的展示与详情弹窗
