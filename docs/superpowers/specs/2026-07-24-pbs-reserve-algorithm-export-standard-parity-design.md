# PBS Reserve 算法导出与标准答案对齐设计

日期：2026-07-24
状态：用户已确认
范围：`live-server` 实际算法压缩包中的 Reserve 条件转换

## 背景

当前算法压缩包由 `live-server` 导出，包含：

- `DAYSOFF.csv`
- `PAIRING_SCORE.csv`
- `RESERVE_SCORE.csv`
- `LINE_RULES.csv`
- `LINE_RULES_README.md`

本次只处理 Reserve Preference（Property Code `301`）在
`RESERVE_SCORE.csv` 与 `LINE_RULES.csv` 之间的分类和转换。

标准答案项目为：

```text
/Users/lei/Codehub/Flair_PBS_Optimization_Report
```

契约依据包括：

- `src/frontend/src/unittest/scoreCsv.ts`
- `src/frontend/src/unittest/lineRulesCsv.ts`
- `unit_test/**/RESERVE_SCORE.csv`
- `unit_test/**/LINE_RULES.csv`
- `unit_test/Test_7/LINE_RULES.csv`

只读核查确认：

1. 当前 `RESERVE_SCORE.csv` 的 19 列表头和 Tier Award/Avoid Counter
   已与标准答案一致。
2. 当前 `whole_month` Reserve Preference 已按标准格式输出为
   `LINE_RULES.csv` 的 `Rule_ID=301`。
3. 标准答案 `Test_7` 把 `date_range` Reserve Short Call 输出到
   `LINE_RULES.csv`，日期字段为 `start` / `end`。
4. 当前实现只把 `whole_month` 放入 `LINE_RULES.csv`，其他日期范围放入
   `RESERVE_SCORE.csv`，因此与标准答案不完全一致。
5. 当前远端 live 数据中的 Reserve pairing 使用
   `assignment_group='RES'`，而导出器只查询 `assignment_group='SBY'`。

## 目标

1. 标准答案已有明确契约的 Reserve 条件，输出文件、字段和计数行为与标准答案一致。
2. 将当前页面额外提供的 `first_half`、`second_half` 转换成标准答案支持的
   `date_range`。
3. 保留 `specific_dates` 的精确日期语义，通过 `RESERVE_SCORE.csv`
   展开为具体 Reserve pairing。
4. 同一个 Reserve 条件只进入一个算法文件，避免重复计分。
5. 兼容 live 数据中的 `RES` 和历史数据中的 `SBY` Reserve pairing 标记。

## 对齐原则

- 标准答案有明确文件、源码或测试样例的行为，严格按标准答案实现。
- 标准答案未覆盖的当前 Portal 模式，不伪造“标准答案已有该行为”的结论；
  按现有业务语义无损转换。
- 因此，`whole_month`、`date_range` 严格对齐标准答案，
  `first_half`、`second_half` 转为标准 Date Range，
  `specific_dates` 保留为精确的 `RESERVE_SCORE.csv` pairing 展开。

## 非目标

- 不修改 Reserve Portal 页面、保存 payload 或数据库 schema。
- 不修改算法压缩包接口地址、鉴权或五个文件名。
- 不修改 Pairing、Days Off、Line 其他条件的导出行为。
- 不修改算法对 `LINE_RULES.csv` 的消费逻辑。
- 不处理当前 Credit Window `DELTA_HOURS` 配置缺失问题；该问题属于另一项
  Line 导出改动。
- 不切换实际导出所有权到 `pbs-server`；本次只修改实际提供压缩包的
  `live-server`。

## 方案比较

### 方案 A：标准格式优先，并转换现有额外日期模式（采用）

- `whole_month`、`date_range`、`first_half`、`second_half` 进入
  `LINE_RULES.csv`。
- `first_half`、`second_half` 先转换为标准 `date_range`。
- `specific_dates` 进入 `RESERVE_SCORE.csv`。

优点：

- 标准答案已有格式能够逐字段对齐。
- 不丢失当前页面的 Specific Dates 功能。
- 不让同一个条件同时进入两个文件。

缺点：

- `specific_dates` 是兼容扩展，不是标准答案现有 Line Rule 格式。

### 方案 B：所有有限日期条件均展开到 `RESERVE_SCORE.csv`

优点是日期匹配直接、精确；缺点是标准答案明确把 `date_range` 放在
`LINE_RULES.csv`，不满足本次“行为与标准答案一致”的目标。

### 方案 C：严格只支持标准答案两个模式

仅导出 `whole_month` 和 `date_range`，忽略其他模式。该方案会静默丢失当前用户
已能保存的 `first_half`、`second_half`、`specific_dates`，因此不采用。

## 分类与转换规则

### 1. Whole Month

输入：

```json
{
  "type": "reserve-call-type-date-scope",
  "callType": "PRAM",
  "dateScope": {
    "mode": "whole_month"
  }
}
```

输出：`LINE_RULES.csv`

```json
{
  "action": "award",
  "callType": "PRAM",
  "dateScope": {
    "mode": "whole_month"
  }
}
```

### 2. Date Range

Portal 当前保存字段为 `from` / `to`。算法文件转换为标准答案字段
`start` / `end`。

输入：

```json
{
  "mode": "date_range",
  "from": "2026-06-07",
  "to": "2026-06-13"
}
```

输出：`LINE_RULES.csv`

```json
{
  "action": "award",
  "callType": "PRAM",
  "dateScope": {
    "mode": "date_range",
    "start": "2026-06-07",
    "end": "2026-06-13"
  }
}
```

### 3. First Half

转换为当月 1 日至 15 日：

```json
{
  "mode": "date_range",
  "start": "2026-06-01",
  "end": "2026-06-15"
}
```

输出：`LINE_RULES.csv`

### 4. Second Half

转换为当月 16 日至月末：

```json
{
  "mode": "date_range",
  "start": "2026-06-16",
  "end": "2026-06-30"
}
```

输出：`LINE_RULES.csv`

月末必须根据 `periodCode` 计算，正确处理 28、29、30、31 天月份。

### 5. Specific Dates

标准答案没有能够无损表达多个离散日期的 Reserve Line Rule。因此保留当前精确
展开方式：

1. 按选定日期查询对应的 Reserve pairing。
2. 按 `Crew_ID + Pairing_ID` 聚合。
3. 写入 `RESERVE_SCORE.csv` 对应 Tier 的 Award/Avoid Counter。

输出不得同时再生成 `LINE_RULES.csv` 的 Rule 301。

## LINE_RULES.csv 契约

表头保持：

```csv
Crew_ID,Code_ID,Rule_ID,Rule_Type,Parameters_JSON,T1_Counter,T2_Counter,T3_Counter,T4_Counter,T5_Counter,T6_Counter,T7_Counter,Description
```

Reserve Preference 行固定：

- `Code_ID=301`
- `Rule_ID=301`
- `Rule_Type=RESERVE_SHORT_CALL_TYPE`
- `Parameters_JSON.action=award|avoid`
- `Parameters_JSON.callType=<当前保存的 Call Type>`
- `Parameters_JSON.dateScope` 使用本设计规定的标准结构
- `T1_Counter` 至 `T7_Counter` 按同 Crew、相同参数聚合

Description 与标准答案保持：

- `whole_month`：
  `Award|Avoid Reserve Short Call Type <CallType> for whole month.`
- 标准化后的 `date_range`：
  `Award|Avoid Reserve Short Call <CallType> for <start>..<end>.`

JSON key 顺序不作为算法语义；为便于与标准答案 Golden 逐字节对比，Rule 301
仍按标准顺序输出 `action`、`callType`、`dateScope`，Date Range 内按 `mode`、
`start`、`end` 输出。

## RESERVE_SCORE.csv 契约

表头与标准答案保持完全一致：

```csv
Crew_ID,Pairing_ID,Interface_ID,Award_Higher_Credit_Tiers,Avoid_Higher_Credit_Tiers,T1_Award_Counter,T1_Avoid_Counter,T2_Award_Counter,T2_Avoid_Counter,T3_Award_Counter,T3_Avoid_Counter,T4_Award_Counter,T4_Avoid_Counter,T5_Award_Counter,T5_Avoid_Counter,T6_Award_Counter,T6_Avoid_Counter,T7_Award_Counter,T7_Avoid_Counter
```

只输出 `specific_dates` 命中的具体 Reserve pairing。空结果仍输出表头。

## Reserve Pairing 识别

当前实现只查询：

```sql
p.assignment_group = 'SBY'
```

远端当前数据实际使用 `RES`。查询修改为同时兼容：

```sql
upper(p.assignment_group) in ('SBY', 'RES')
```

并继续要求：

- `p.is_deleted = 0`
- `p.assignment = <callType>`
- 日期按 pairing base 的本地日期匹配

标准答案算法输入中的 Reserve pairing 可使用 `SBY`，当前 live 数据使用 `RES`；
导出 CSV 不包含 `assignment_group` 字段，因此输入侧兼容两者不会改变输出契约。

## 日期和时区

- `periodCode` 用于计算当月起止日期。
- `specific_dates` 使用：

```sql
(p.sch_str_dt_utc at time zone airport.zone_id)::date
```

- 不直接使用 UTC 自然日比较。
- 找不到有效机场时区的 Reserve pairing 不应被模糊匹配。
- 不硬编码默认时区。

## Action 和 Tier

- `action_id=1` → `award`
- `action_id=2` → `avoid`
- Reserve Preference 没有显式 action 时，保持当前兼容规则，默认 `award`
- Tier 只接受 `1..7`
- 相同 Crew、相同标准化参数、相同 Tier 的重复条件累加 Counter
- 不同 Call Type 或不同日期范围不得错误聚合

## 数据流

```text
Current Reserve Bid
        |
        v
解析 Property 301 + Date Scope
        |
        +-- whole_month ------------------------> LINE_RULES 301
        |
        +-- date_range -------------------------> 转 start/end -> LINE_RULES 301
        |
        +-- first_half / second_half -----------> 转 date_range -> LINE_RULES 301
        |
        +-- specific_dates ---------------------> 匹配 RES/SBY pairing
                                                   -> RESERVE_SCORE
```

## 错误与跳过策略

- 无法解析 `periodCode`：导出失败，返回明确错误；不能猜测月份。
- `date_range` 缺少起止日期：记录 unsupported/invalid skip，不生成错误范围。
- `first_half`、`second_half`：只要 period 合法就必须成功转换。
- `specific_dates` 为空：不报错，只不生成数据行。
- `whole_month`、`date_range`、`first_half`、`second_half` 直接生成
  `LINE_RULES.csv`，不查询、也不依赖 live 中是否存在对应 Call Type pairing。
- 只有 `specific_dates` 会查询具体 Reserve pairing；对应 Call Type 在 live 数据中
  不存在时输出零命中，不伪造 pairing。
- 不支持的 Reserve Property：继续记录 skip event，不阻断其他文件。
- 同一条件不得同时进入两个文件。

## 标准答案行为风险说明

标准答案源码注释表明，当前算法可能不会完整消费
`RESERVE_SHORT_CALL_TYPE.dateScope` 的日期细节。本任务按用户要求对齐标准答案的
文件和分类行为，不在本次修改 solver。

因此完成本任务后可以保证：

- 导出文件结构与标准答案一致；
- 标准答案已有样例的 Rule 301 参数一致；

但不能仅凭 CSV 一致声称 solver 已严格执行日期范围。若需要证明算法结果也按
日期范围生效，应另立 solver 行为验证任务。

## 测试设计

### 单元测试

1. `whole_month` 只进入 `LINE_RULES.csv`。
2. `date_range` 只进入 `LINE_RULES.csv`，并把 `from/to` 转为 `start/end`。
3. `first_half` 转为当月 1 日至 15 日。
4. `second_half` 正确处理 28、29、30、31 天月末。
5. `specific_dates` 只进入 `RESERVE_SCORE.csv`。
6. `specific_dates` 同时识别 live `RES` 与历史 `SBY` pairing。
7. 同一条件不在两个文件重复输出。
8. Award/Avoid 和 T1-T7 Counter 聚合正确。
9. `specific_dates` 不存在对应 Call Type 时只有表头或零匹配，不伪造数据；
   其他四种模式仍必须生成 Line Rule。
10. 非 Crew、无效 Tier、unsupported property 保持现有安全处理。

### Golden 对比

以标准答案 `unit_test/Test_7/LINE_RULES.csv` 的 Rule 301 为 Golden：

- 表头和列顺序完全一致；
- `Code_ID`、`Rule_ID`、`Rule_Type` 完全一致；
- `Parameters_JSON` 解析后的结构一致；
- Date Range 使用 `start/end`；
- Tier Counter 完全一致。
- Description 按 Whole Month 与 Date Range 的标准格式一致。

`RESERVE_SCORE.csv` 表头与标准答案真实文件逐列比较。

### 远端只读 Smoke

1. 对当前有效 bid period 生成实际压缩包。
2. 确认五个文件都存在。
3. 检查 Reserve Rule 301 的源条件数、成功输出数和允许零命中数。
4. 检查 `RESERVE_SCORE.csv` 不存在非 Crew 行或全零数据行。
5. 检查没有同一 Reserve 条件同时进入两个文件。

若完整压缩包仍被 Credit Window `DELTA_HOURS` 配置阻塞，应单独报告，不在本任务
中顺带修改其他 Line 逻辑。

## 预计实施范围

主要修改：

- `live-server/src/services/algorithm-export/reserve-score-export.ts`
- `live-server/src/services/algorithm-export/line-rules-entry.ts`
- `live-server/src/services/algorithm-export/line-rules-metadata.ts`
- 对应 `live-server` 单元测试与压缩包测试

可能增加一个 feature-local 日期范围标准化 helper；只有在两个导出器确实需要共享
相同分类结果时才抽取，避免重复分类逻辑。

不修改：

- `pbs-portal`
- 数据库 schema / seed / migration
- `pbs-server` 的 deprecated 导出入口
- 其他算法文件生成器

## 验收标准

1. `whole_month`、`date_range` 与标准答案 Rule 301 格式一致。
2. `first_half`、`second_half` 正确转换为标准 Date Range。
3. `specific_dates` 保持精确 pairing score 行为。
4. `RES` 与 `SBY` Reserve pairing 均可被识别。
5. 同一条件不重复进入两个文件。
6. 所有相关 Vitest、Golden 对比、远端只读 Smoke 通过。
7. 不修改 Portal、数据库或其他未授权业务逻辑。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: Reserve 分类结果同时决定两个 CSV，必须由同一实现统一裁决；并行编辑容易造成重复输出或边界不一致。
- Suggested split: 不拆分；可独立派 reviewer 做只读 Spec/代码审查。
- Write boundaries: `live-server/src/services/algorithm-export/**` 中 Reserve 相关文件、对应测试和 QA 文档。
- Conflict risk: 中等；当前工作区存在其他 Line 导出改动，实施时必须按文件和代码区域隔离。
- Execution gate: 本 Spec 经独立审查和用户批准后再编写实施计划并修改代码。
