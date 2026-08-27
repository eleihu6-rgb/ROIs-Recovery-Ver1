# PBS 算法导出 Line Rules 设计

日期：2026-06-02  
状态：已确认，准备实现  
范围：`/api/admin/algorithm-export` 导出包新增 Line 条件规则文件与 Rule ID 映射说明。本文件只定义设计，不包含代码实现。

## 背景

当前算法导出接口已经输出：

```text
DAYSOFF.csv
PAIRING_SCORE.csv
```

下一步需要导出 Line 相关条件。用户确认本次不是导出 Reserve 独立文件；`Reserve / Flying Date Pattern`、`Only Reserve` 这类语义归入 Line 文件中表达。

Line 导出目标是把 PBS Line 页面保存的条件 code、参数、tier 权重和完整描述导给算法侧。它不是像 `PAIRING_SCORE.csv` 那样先搜索 live pairing 后按 pairing 展开，而是按用户保存的 Line rule 聚合输出。

## 目标

1. 在现有算法导出 `.tgz` 包中新增 Line 条件规则文件。
2. 输出每个 crew 在 Current Line bid 中配置的规则。
3. 使用当前 Line property code 作为 `Rule_ID`。
4. 输出算法可解析的 `Parameters_JSON`。
5. 按 `T1-T7` 输出 counter，同一 crew / rule / params 在同一 tier 多次出现时 counter 累加。
6. 输出完整自然语言 `Description`，便于算法侧调试和人工检查。
7. 给算法侧提供 Rule ID 对应说明文档，列出每个 code 的含义和参数结构。

## 非目标

- 不新增独立 Reserve 导出文件。
- 不导出 Pairing Score 已覆盖的 pairing 命中分数。
- 不导出完整 pairing 池、line 结果或 award 结果。
- 不改变 Line 页面保存结构。
- 不改变 `/api/admin/algorithm-export` 的接口路径、HTTP 方法或认证方式。
- 不输出 T8+；首期固定 `T1-T7`，与 Days Off / Pairing Score 保持一致。

## 输出文件

建议文件名：

```text
LINE_RULES.csv
```

表头：

```csv
Crew_ID,Rule_ID,Rule_Type,Parameters_JSON,T1_Counter,T2_Counter,T3_Counter,T4_Counter,T5_Counter,T6_Counter,T7_Counter,Description
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `Crew_ID` | PBS bid crew id，来自 `pbs_bid.crew_id`。 |
| `Rule_ID` | Line property code，例如 `401`、`410`、`417`。 |
| `Rule_Type` | 算法侧规则分类，首期由 property code 映射生成。 |
| `Parameters_JSON` | 结构化参数 JSON。flag 类规则输出 `{}`。 |
| `Tn_Counter` | 该 crew 在 Tn 中配置该 rule + params 的次数。 |
| `Description` | 完整一句话描述该规则和参数。 |

行粒度：

```text
Crew_ID + Rule_ID + Rule_Type + Parameters_JSON
```

排序建议：

```text
Crew_ID asc, Rule_ID numeric asc, Parameters_JSON asc
```

## Counter 语义

- 每一条 Line property group 命中一个 tier 时，对对应 `Tn_Counter` 加 1。
- 同一个 crew、同一个 `Rule_ID`、同一个 `Parameters_JSON` 在同一 tier 多次出现时，counter 累加。
- 同一条 property 配置多个 tier 时，分别计入对应 tier。
- 只输出有 counter 的行；不输出全量 0 counter rule。
- T8+ 首期忽略。

示例：

```text
Crew F8030:
- T1 配置 Target Credit Range 75-85
- T3 配置 Target Credit Range 75-85
- T3 又配置一次同参数 Target Credit Range 75-85
```

输出：

```csv
F8030,411,TARGET_CREDIT_RANGE,"{""from"":75,""to"":85}",1,0,2,0,0,0,0,"Target credit range between 75 and 85 credits."
```

## 数据来源

PBS bid 来源：

- `pbs_bid`
- `pbs_bid_tier`
- `pbs_bid_group`
- `pbs_bid_property`

筛选范围：

```text
pbs_bid.period_code = periodCode
pbs_bid.bid_context = 'Current'
pbs_bid_group.bid_type = 'Line'
```

当前 Line property code 范围来自 `packages/contracts/pbs-line-bids.*`：

- Legacy Line property：`401-410`
- AA Line property：`411-426`

## Rule ID 与 Rule Type 映射

首期建议使用稳定、全大写、下划线分隔的 `Rule_Type`。`Rule_ID` 仍保留数字 code，作为项目内稳定规则身份。

| Rule_ID | Rule_Type | 名称 |
| --- | --- | --- |
| 401 | `MAX_CREDIT_WINDOW` | Max Credit Window |
| 402 | `MIN_CREDIT_WINDOW` | Min Credit Window |
| 403 | `CLEAR_SCHEDULE_AND_START_NEXT_BID_GROUP` | Clear Schedule and Start Next Bid Group |
| 404 | `NO_SAME_DAY_PAIRINGS` | No Same Day Pairings |
| 405 | `WAIVE_NO_SAME_DAY_DUTY_STARTS` | Waive No Same Day Duty Starts |
| 406 | `FORGET_LINE` | Forget Line |
| 407 | `MIN_BASE_LAYOVER` | Min Base Layover |
| 408 | `COMMUTER_PATTERN` | Commuter Pattern |
| 409 | `MOST_FLYING_IN_LEAST_DAYS` | Most Flying In Least Days |
| 410 | `RESERVE_FLYING_DATE_PATTERN` | Reserve / Flying Date Pattern |
| 411 | `TARGET_CREDIT_RANGE` | Target Credit Range |
| 412 | `MAXIMIZE_CREDIT` | Maximize Credit |
| 413 | `MAXIMIZE_INTERNATIONAL_CREDIT` | Maximize International Credit |
| 414 | `WORK_BLOCK_SIZE` | Work Block Size |
| 415 | `PREFER_CADENCE_ON_DAY_OF_WEEK` | Prefer Cadence on Day-of-Week |
| 416 | `COMMUTABLE_WORK_BLOCK` | Commutable Work Block |
| 417 | `PAIRING_MIX_IN_WORK_BLOCK` | Pairing Mix in a Work Block |
| 418 | `ALLOW_DOUBLE_UP_ON_DATE` | Allow Double-Up on Date |
| 419 | `ALLOW_MULTIPLE_PAIRINGS` | Allow Multiple Pairings |
| 420 | `ALLOW_MULTIPLE_PAIRINGS_ON_DATE` | Allow Multiple Pairings on Date |
| 421 | `ALLOW_CO_TERMINAL_MIX_IN_WORK_BLOCK` | Allow Co-Terminal Mix in Work Block |
| 422 | `CLEAR_BIDS` | Clear Bids |
| 423 | `WAIVE_24_HOURS_REST_IN_DOMICILE` | Waive 24 hrs Rest in Domicile |
| 424 | `WAIVE_MINIMUM_DOMICILE_REST` | Waive Minimum Domicile Rest |
| 425 | `WAIVE_30_HOURS_IN_7_DAYS` | Waive 30 hrs in 7 Days |
| 426 | `WAIVE_CARRY_OVER_CREDIT` | Waive Carry-Over Credit |

## Parameters_JSON 设计

`Parameters_JSON` 必须是稳定 JSON 字符串。推荐使用按 key 排序的 JSON，保证相同参数能聚合到同一行。

### 通用 bid 类型映射

| Bid 类型 | Parameters_JSON |
| --- | --- |
| `flag` | `{}` |
| `stepper` | `{"operator":"=","value":1}`；如果有 `<` / `>` 则使用对应 operator。 |
| `stepper-range` | `{"from":75,"to":85}` |
| `date` | `{"operator":"=","date":"2026-06-01"}` |
| `time-range` | `{"from":"18:00","to":"10:00"}` |
| `text` | `{"value":"013:00"}` |
| `tag-list` | `{"values":["3,1","2,2"]}` |
| `days-off-on-pattern` | `{"minDaysOff":4,"minDaysOn":4,"maxDaysOn":5}` |
| `credit-density-preference` | `{"minimumTotalCredit":"75:00","maximumWorkingDays":15,"strength":"strong"}` |
| `reserve-flying-date-pattern` | `{"segments":[...],"strength":"strong"}` |

### Reserve / Flying Date Pattern

`Rule_ID=410` 仍输出在 `LINE_RULES.csv` 中，不单独拆 Reserve 文件。

参数示例：

```json
{
  "segments": [
    {
      "workType": "reserve",
      "callType": "PRAM",
      "dateScope": { "mode": "first_half" }
    },
    {
      "workType": "flying",
      "dateScope": { "mode": "second_half" }
    }
  ],
  "strength": "strong"
}
```

后续更新：2026-06-03 已确认新增 Line `Reserve` (`propertyCode=427`) 作为 `Only Reserve` / `No Reserve` 的首选表达。以下 410 整月 reserve segment 方案保留为历史讨论，不再作为首选导出表达。

历史讨论中的备选建模如下：

```json
{
  "segments": [
    {
      "workType": "reserve",
      "callType": "PRAM",
      "dateScope": { "mode": "whole_month" }
    }
  ],
  "strength": "strong"
}
```

算法侧可通过 `segments` 判断整月 reserve-only。

## Description 生成规则

`Description` 应是一句完整英文描述，首期可以复用 `formatRuleBid()` 的参数摘要，再拼接 property name。

推荐模板：

```text
<Property Name>: <formatted bid value>.
```

示例：

| Rule_ID | Parameters_JSON | Description |
| --- | --- | --- |
| 406 | `{"operator":"=","value":12}` | `Forget Line: 12.` |
| 408 | `{"minDaysOff":4,"minDaysOn":4,"maxDaysOn":5}` | `Commuter Pattern: work 4-5 days, then at least 4 days off.` |
| 409 | `{"minimumTotalCredit":"75:00","maximumWorkingDays":15,"strength":"strong"}` | `Most Flying In Least Days: minimum credit 75:00, maximum 15 working days, strong preference.` |
| 410 | `{"segments":[...],"strength":"strong"}` | `Reserve / Flying Date Pattern: reserve PRAM in first half, flying in second half, strong preference.` |
| 411 | `{"from":75,"to":85}` | `Target Credit Range: between 75 and 85 credits.` |

说明：

- `Description` 用于人工检查，不作为算法解析字段。
- 算法解析必须以 `Rule_ID`、`Rule_Type`、`Parameters_JSON`、tier counters 为准。
- 若某个 bid 类型暂时没有专用描述模板，可以退回到 `Property Name: <formatRuleBid(bid)>`。

## Rule ID 说明文档

除了 CSV，建议同步维护说明文档：

```text
docs/modules/pbs/algorithm-export-line-rules.md
```

内容包括：

- `Rule_ID`
- `Rule_Type`
- UI / property name
- `Parameters_JSON` schema
- `Description` 示例
- 备注：是否来自 Legacy / AA，是否与 Reserve 语义相关

该文档面向算法侧对接人员，不包含数据库密码、Token 或运行时敏感信息。

## 包结构

新增后：

```text
DAYSOFF.csv
PAIRING_SCORE.csv
LINE_RULES.csv
```

后续如果需要规则说明随包一起交付，可另行确认是否加入：

```text
LINE_RULES_README.md
```

用户已确认 Rule ID 说明文档也随包输出，因此首期 `.tgz` 包包含：

```text
DAYSOFF.csv
PAIRING_SCORE.csv
LINE_RULES.csv
LINE_RULES_README.md
```

## 错误与跳过策略

- 没有 Line bid 数据时，仍输出只有表头的 `LINE_RULES.csv`。
- 不支持的 Line property code 跳过并记录 server log，不让整体导出失败。
- 无法反序列化的 bid 参数跳过并记录 server log。
- `Parameters_JSON` 序列化失败属于实现错误，应让导出失败并记录 server log。
- `Description` 生成失败时，可以退回到 `<Property Name>: <Rule_ID>.`，不影响算法解析。

## 推荐实现方案

### 方案 A：新增 Line Rules exporter，复用 Line contract 与 rule-bid-value

做法：

- 新增 `pbs-server/src/services/algorithm-export/line-rules-export.ts`。
- 查询 `pbs_bid_group bid_type='Line'`。
- 用 `pbsSupportedLinePropertyCatalog` 识别 property code。
- 用 `deserializeRuleBid()` 还原 bid。
- 用新 helper 输出稳定 `Parameters_JSON`。
- 用 `formatRuleBid()` 或 Line 专用描述 helper 生成 `Description`。
- 聚合 counter 后写入 `LINE_RULES.csv`。

优点：

- 与现有 Line 保存结构一致。
- 实现边界清晰，不影响 Line 页面。
- 便于单元测试参数 JSON 和 counter 聚合。

缺点：

- 需要新增一套 Line 参数 JSON 规范 helper。

推荐采用本方案。

### 方案 B：直接导出 pbs_bid_group param_a/b/c

做法：

- 将 `operator/param_a/param_b/param_c` 原样塞进 JSON。

优点：

- 改动最少。

缺点：

- 算法侧需要理解数据库内部序列化格式。
- 字段语义不稳定，不适合作为长期对接 contract。

不推荐。

## 测试设计

后端自动化测试：

- `buildLineRulesCsvFromRows` 聚合：
  - 相同 crew / rule / params 多 tier counter 正确。
  - 同 tier 重复出现 counter 累加。
  - T8+ 忽略。
  - 空数据只有表头。
- 参数 JSON：
  - `flag`
  - `stepper`
  - `stepper-range`
  - `days-off-on-pattern`
  - `credit-density-preference`
  - `reserve-flying-date-pattern`
  - `tag-list`
- package：
  - `/api/admin/algorithm-export` 的 tgz 包包含 `LINE_RULES.csv`。
  - 既有 `DAYSOFF.csv`、`PAIRING_SCORE.csv` 仍存在。

QA 人工测试案例：

- 新增 `docs/test-cases/pbs/algorithm-export/<YYYY-MM-DD>-line-rules-export.md`。
- 覆盖管理员导出、Line flag rule、Reserve / Flying Date Pattern、重复 tier counter、空数据。

## 验收标准

1. 导出包包含 `LINE_RULES.csv`。
2. `LINE_RULES.csv` 表头符合约定。
3. `Rule_ID` 使用 Line property code。
4. `Rule_Type` 与 Rule ID 映射稳定。
5. `Parameters_JSON` 是算法可解析的稳定 JSON。
6. `T1-T7` counter 正确聚合，重复命中递增。
7. `Description` 是完整一句话。
8. Reserve 相关 Line 条件包含在 `LINE_RULES.csv`，不新增独立 Reserve 文件。
9. `DAYSOFF.csv` 和 `PAIRING_SCORE.csv` 现有行为不变。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次实现集中在 algorithm export service 与 Line bid 序列化语义，拆分会增加 Rule_ID / Parameters_JSON 口径不一致风险。
- Suggested split: 不拆分。实现完成后可单独做 review。
- Write boundaries: `pbs-server/src/services/algorithm-export/*`、`docs/modules/pbs/*`、`docs/test-cases/pbs/algorithm-export/*`、相关后端测试。
- Conflict risk: Low-Medium。当前 algorithm export 已新增 Pairing Score，需要在同一 service 中继续扩展包结构。
- Execution gate: 用户 review 并确认本 spec 后，才能进入代码实现。

## 待确认点

1. 文件名是否确认使用 `LINE_RULES.csv`。
2. `Rule_Type` 是否接受本 spec 的全大写下划线命名。
3. Rule ID 说明文档是否只放 repo docs，还是也要打进 tgz 包。
4. 已由 2026-06-03 方案更新：`Only Reserve` / `No Reserve` 使用 `Rule_ID=427 RESERVE`，不再以 `Rule_ID=410 RESERVE_FLYING_DATE_PATTERN` 作为首选表达。
