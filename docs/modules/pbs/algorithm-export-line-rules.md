# PBS Algorithm Export：Line Rules 对接说明

日期：2026-06-02

## 文件

`/api/admin/algorithm-export` 导出包包含：

```text
LINE_RULES.csv
LINE_RULES_README.md
```

`LINE_RULES_README.md` 会随 `.tgz` 一起交给算法侧，内容是 Rule ID 对照说明。本文档是仓库内长期说明。

## LINE_RULES.csv 表头

```csv
Crew_ID,Rule_ID,Rule_Type,Parameters_JSON,T1_Counter,T2_Counter,T3_Counter,T4_Counter,T5_Counter,T6_Counter,T7_Counter,Description
```

## 聚合语义

- 行粒度：`Crew_ID + Rule_ID + Rule_Type + Parameters_JSON`。
- 同一 crew、rule、参数在同一 tier 多次出现时，`Tn_Counter` 累加。
- 只输出有 counter 的行，不输出全 0 规则。
- 首期只输出 `T1-T7`，`T8+` 忽略。
- `Description` 用于人工检查，算法解析应使用 `Rule_ID`、`Rule_Type`、`Parameters_JSON` 和 counters。

## Rule ID

| Rule_ID | Rule_Type | UI 名称 | 备注 |
| --- | --- | --- | --- |
| 401 | `MAX_CREDIT_WINDOW` | Max Credit Window | Legacy flag |
| 402 | `MIN_CREDIT_WINDOW` | Min Credit Window | Legacy flag |
| 403 | `CLEAR_SCHEDULE_AND_START_NEXT_BID_GROUP` | Clear Schedule and Start Next Bid Group | Legacy flag |
| 404 | `NO_SAME_DAY_PAIRINGS` | No Same Day Pairings | Legacy flag |
| 405 | `WAIVE_NO_SAME_DAY_DUTY_STARTS` | Waive No Same Day Duty Starts | Legacy flag |
| 406 | `FORGET_LINE` | Forget Line | stepper |
| 407 | `MIN_BASE_LAYOVER` | Min Base Layover | text duration |
| 408 | `COMMUTER_PATTERN` | Commuter Pattern | days on/off pattern |
| 409 | `MOST_FLYING_IN_LEAST_WORKING_DAYS_CONFIGURED` | Most Flying In Least Working Days (Configured) | hidden legacy credit density |
| 410 | `RESERVE_FLYING_DATE_PATTERN` | Reserve / Flying Date Pattern | Reserve 语义归入 Line |
| 411 | `TARGET_CREDIT_RANGE` | Target Credit Range | range |
| 412 | `MAXIMIZE_CREDIT` | Maximize Credit | flag |
| 413 | `MAXIMIZE_INTERNATIONAL_CREDIT` | Maximize International Credit | flag |
| 414 | `WORK_BLOCK_SIZE` | Work Block Size | range |
| 415 | `PREFER_CADENCE_ON_DAY_OF_WEEK` | Prefer Cadence on Day-of-Week | select |
| 416 | `COMMUTABLE_WORK_BLOCK` | Commutable Work Block | time range |
| 417 | `PAIRING_MIX_IN_WORK_BLOCK` | Pairing Mix in a Work Block | tag list |
| 418 | `ALLOW_DOUBLE_UP_ON_DATE` | Allow Double-Up on Date | date |
| 419 | `ALLOW_MULTIPLE_PAIRINGS` | Allow Multiple Pairings | flag |
| 420 | `ALLOW_MULTIPLE_PAIRINGS_ON_DATE` | Allow Multiple Pairings on Date | date |
| 421 | `ALLOW_CO_TERMINAL_MIX_IN_WORK_BLOCK` | Allow Co-Terminal Mix in Work Block | flag |
| 422 | `CLEAR_BIDS` | Clear Bids | flag |
| 423 | `WAIVE_24_HOURS_REST_IN_DOMICILE` | Waive 24 hrs Rest in Domicile | flag |
| 424 | `WAIVE_MINIMUM_DOMICILE_REST` | Waive Minimum Domicile Rest | flag |
| 425 | `WAIVE_30_HOURS_IN_7_DAYS` | Waive 30 hrs in 7 Days | flag |
| 426 | `WAIVE_CARRY_OVER_CREDIT` | Waive Carry-Over Credit | flag |
| 427 | `RESERVE` | Reserve | whole-month reserve award/avoid |
| 428 | `EFFICIENT_FLYING_FIRST` | Efficient Flying First | Award/Avoid average daily credit preference |

## Reserve

不新增独立 Reserve 导出文件。

`Reserve / Flying Date Pattern` 继续使用 `Rule_ID=410`，用于表达 reserve/flying 日期 pattern。

Line `Reserve` 使用 `Rule_ID=427` 表达 whole bid month 的 reserve-only / no-reserve 偏好。`Parameters_JSON` 必须写入显式 action：

```json
{
  "action": "award",
  "scope": "whole_bid_month"
}
```

```json
{
  "action": "avoid",
  "scope": "whole_bid_month"
}
```
