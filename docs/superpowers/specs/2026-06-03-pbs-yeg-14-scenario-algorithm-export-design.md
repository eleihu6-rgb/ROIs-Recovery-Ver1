# PBS YEG 14 人临时算法导出测试设计

日期：2026-06-03  
状态：待确认  
范围：开发测试临时接口、YEG 14 人 Current bid 测试数据准备、算法导出排序规则。本文件只定义设计，不包含代码实现或数据库写入。

## 背景

当前 `/api/admin/algorithm-export` 已经支持导出：

- `DAYSOFF.csv`
- `PAIRING_SCORE.csv`
- `RESERVE_SCORE.csv`
- `LINE_RULES.csv`
- `LINE_RULES_README.md`

用户需要一个仅供开发测试快速使用的临时接口。这个接口后续可以删除。用途是对 14 个典型 PBS 条件做范围测试，并且只导出这 14 个人的数据。

最初给出的 14 条场景里，前 13 条带有旧 crew 编号，第 14 条 `No reserve` 没有指定 crew。后续确认：原先那些人的 `base` 是之前随意补的，不适合本次测试。本次应从用户提供的算法输入包 `ro_input.gz` 主 `Crew(26)` 中随机抽取 14 个数据库可匹配的 YEG crew，并把同样的 14 条测试场景配置到这些 YEG crew 身上。

## 目标

1. 新增一个开发测试临时接口，只导出 YEG 14 人算法包。
2. 给这 14 个 YEG crew 准备与原 14 条测试场景等价的 Current bid 数据。
3. 导出包中的主要 CSV 文件只包含这 14 个 crew 的数据。
4. 四个算法数据文件按 live `crew.seniority_num` 从大到小排序。
5. 第 14 条 `No reserve` 必须体现在 `LINE_RULES.csv` 中。
6. 临时接口和测试数据准备方式要清楚标记为可删除、非正式生产功能。

## 非目标

- 不替换正式 `/api/admin/algorithm-export` 的默认行为。
- 不改变已有正式算法导出文件格式。
- 不把临时 YEG 白名单逻辑散落到正式导出路径中。
- 不修改 live crew 的 base 或 seniority 数据。
- 不永久保留该临时接口。
- 不在本设计阶段写代码或写数据库。

## YEG 14 人映射

只读解析确认，用户提供的 `114_20260603_163635_978/ro_input.gz` 中主人员段为 `Crew(26)`，不是 28 人；`Crew(225)(COF)` 属于 COF 扩展人员，不作为本次测试主 crew 来源。

本轮从 `Crew(26)` 固定随机抽取 14 人，随后按数据库 `f8.crew.seniority_num desc` 排序并依次分配 14 条场景：

| 序号 | Crew_ID | Seniority_Num | Base | Rank | Division | 测试场景 |
| --- | --- | ---: | --- | --- | --- | --- |
| 1 | `8888` | 28888.00 | YEG | FO | P | Commuter – all days worked in a row all days off in a row – pattern – 5 on 4 off / 4 on 4 off |
| 2 | `13697` | 13697.00 | YEG | FO | P | Minimum 7 days off in a row |
| 3 | `2697` | 2697.00 | YEG | FO | P | Most flying in the least amount of days |
| 4 | `2696` | 2696.00 | YEG | CA | P | Only AM reserve |
| 5 | `2440` | 204.00 | YEG | FO | P | Weekends off |
| 6 | `2377` | 193.00 | YEG | FO | P | 1/2 of the month AM reserve, 1/2 the month PM reserve |
| 7 | `2229` | 182.00 | YEG | FO | P | 1/2 the month AM reserve, 1/2 the month flying |
| 8 | `2227` | 180.00 | YEG | FO | P | Highest credit pairings first then lower ones |
| 9 | `2224` | 175.00 | YEG | FO | P | Weekend flying ONLY Fri, Sat, Sun, Mon |
| 10 | `996` | 53.00 | YEG | FO | P | No red eyes, no weekends |
| 11 | `572` | 27.00 | YEG | FO | P | Weekends off – some flying some reserve |
| 12 | `536` | 24.00 | YEG | FO | P | AM reserve with Tues/Wed off |
| 13 | `383` | 13.00 | YEG | FO | P | Only reserve with weekends off |
| 14 | `274` | 9.00 | YEG | FO | P | No reserve |

注意：

- 本次必须使用完整 `crew_id` 精确匹配，不能用尾号匹配。
- 只读排查发现用尾号匹配会误带出 `12998`、`2799` 这类非目标 crew。

## 14 条场景配置建议

以下配置目标是“开发范围测试”，优先保证每类导出链路都有代表性数据，而不是设计真实生产 bid 策略。

### 1. Commuter Pattern

Crew：`8888`

建议配置：

```text
bid_type = Line
property = Commuter Pattern
tier = T1
operator = Between
param_a = 4
param_b = 4
param_c = 4
```

沿用当前旧样例 `886` 的配置语义。

### 2. Minimum 7 Days Off In A Row

Crew：`13697`

建议配置：

```text
bid_type = DaysOff
property = Min Consecutive Days Off
tier = T1
operator = =
param_a = 7
```

沿用当前旧样例 `479` 的配置语义。

导出说明：

- 页面和数据库仍保留在 `DaysOff`。
- 因为该条件表达的是规则型约束，不是具体日期休息请求，导出时额外归集到 `LINE_RULES.csv`。同类归集范围包括 `202 Max Consecutive Days On`、`203 Min Consecutive Days Off`、`204 Min Consecutive Days Off In Window`、`205 Days Off / Days On Pattern`、`206 Shared Days Off With Employee`。
- 期望输出 Rule_ID `203`，Rule_Type `MIN_CONSECUTIVE_DAYS_OFF`，Parameters_JSON `{"minimumDaysOff":7}`。

### 3. Most Flying In Least Days

Crew：`2697`

建议配置：

```text
bid_type = Line
property = Most Flying In Least Days
tier = T1
param_a = 75:00
param_b = 8
param_c = strong
```

沿用当前旧样例 `533` 的配置语义。

### 4. Only AM Reserve

Crew：`2696`

建议配置：

```text
bid_type = Reserve
property = Short Call Type
tier = T1
callType = PRAM
dateScope = whole_month
```

导出期望：

- `RESERVE_SCORE.csv` 命中 `assignment_group = SBY` 且 `assignment = PRAM` 的 Reserve pairing。

### 5. Weekends Off

Crew：`2440`

建议配置：

```text
bid_type = DaysOff
property = Prefer Off
tier = T1
values = Weekends
```

沿用当前旧样例 `1020` 的配置语义。

### 6. Half Month AM Reserve / Half Month PM Reserve

Crew：`2377`

建议配置：

```text
T1 Reserve Short Call Type PRAM dateScope = first_half
T1 Reserve Short Call Type PRPM dateScope = second_half
```

导出期望：

- `RESERVE_SCORE.csv` 中同一 crew 会分别命中上半月 PRAM 和下半月 PRPM。

### 7. Half Month AM Reserve / Half Month Flying

Crew：`2229`

建议配置：

```text
T1 Reserve Short Call Type PRAM dateScope = first_half
T1 Pairing Departing On date_range = 2026-06-16..2026-06-30
```

沿用当前旧样例 `499` 的配置语义。

### 8. Highest Credit Pairings First Then Lower Ones

Crew：`2227`

用户已确认旧样例当前配置可接受，不调整“明显可能不对”的判断。

建议配置：

```text
T1 Pairing Total Credit > 20:00
T2 Pairing Total Credit > 25:00
```

### 9. Weekend Flying Only Fri/Sat/Sun/Mon

Crew：`2224`

建议配置：

```text
T1 Award Pairing Departing On daysOfWeek = MON, FRI, SAT, SUN
T1 Avoid Pairing Any Duty On Date / Day daysOfWeek = TUE, WED, THU
```

沿用当前旧样例 `998` 的配置语义。

### 10. No Red Eyes, No Weekends

Crew：`996`

建议配置：

```text
T1 DaysOff Prefer Off = Saturday, Sunday
T1 Avoid Pairing Any Leg Is Redeye
```

沿用当前旧样例 `383` 的配置语义。

### 11. Weekends Off – Some Flying Some Reserve

Crew：`572`

用户已确认旧样例当前配置可接受。

建议配置：

```text
T1 DaysOff Prefer Off = Saturday, Sunday
```

如需更强覆盖，也可补充一条 Pairing 或 Reserve 条件，但本轮按用户确认保持旧样例语义。

### 12. AM Reserve With Tues/Wed Off

Crew：`536`

建议配置：

```text
T1 DaysOff Prefer Off = Tuesday, Wednesday
T1 Reserve Short Call Type PRAM dateScope = whole_month
```

沿用当前旧样例 `595` 的配置语义。

### 13. Only Reserve With Weekends Off

Crew：`383`

用户已确认旧样例当前配置可接受。

建议配置：

```text
T1 DaysOff Prefer Off = Weekends
T1 Line Reserve Award = Only Reserve
```

说明：

- `Only Reserve` 应进入 `LINE_RULES.csv`。
- 如实现时需要兼容旧样例 `446` 当前的额外 Pairing Number / Clear Schedule 数据，应优先清理成更稳定、可解释的开发测试数据。

### 14. No Reserve

Crew：`274`

建议配置：

```text
T1 Line Reserve Avoid = No Reserve
```

导出期望：

- `LINE_RULES.csv` 输出 Rule_ID `427`，action = `avoid`。
- `Description` 应直接表达 “No Reserve for the whole bid month.”

## 临时接口设计

建议新增开发测试接口：

```text
GET /api/admin/algorithm-export/yeg-test-package?periodCode=Jun%202026
```

行为：

1. 复用现有管理员鉴权。
2. 复用现有算法导出 service 和 tgz 打包逻辑。
3. 增加临时 crew 白名单：

```text
8888, 13702, 13697, 13030, 2903, 2697, 2696, 2786, 2770, 2528, 2766, 2736, 2753, 2737
```

4. 导出包内文件与正式包一致：

```text
DAYSOFF.csv
PAIRING_SCORE.csv
RESERVE_SCORE.csv
LINE_RULES.csv
LINE_RULES_README.md
```

5. 文件名建议：

```text
pbs-algorithm-export-yeg-14-Jun-2026.tgz
```

6. 该接口仅用于开发测试，后续可删除。

## 导出过滤与排序

过滤：

```text
只导出白名单 14 个 Crew_ID。
```

排序：

```text
按 live f8.crew.seniority_num desc 排序。
```

需要影响的文件：

- `DAYSOFF.csv`
- `PAIRING_SCORE.csv`
- `RESERVE_SCORE.csv`
- `LINE_RULES.csv`

排序细节：

```text
primary: seniority_num desc
secondary: Crew_ID asc
tertiary: 文件原有排序字段
```

原因：

- `pbs_user` 没有 `seniority_num` 字段。
- `seniority_num` 在 live `f8.crew` 表。
- 排序需要通过 `pbs_user.crew_id = f8.crew.crew_id` 或直接用 `Crew_ID` join live crew。

## 数据准备策略

本任务需要修改远程 PBS Current bid 数据，建议实现为明确、可重复的开发测试 seed/script，而不是手工散 SQL。

建议新增临时脚本，例如：

```text
pbs-server/src/scripts/seed-yeg-14-algorithm-export-bids.ts
```

脚本行为：

1. 校验 14 个 crew 都存在于 `pbs_user`，且 `base = YEG`。
2. 校验 14 个 crew 都能在 live `crew` 找到 `seniority_num`。
3. 对 `periodCode = Jun 2026`、`bid_context = Current` 的目标 crew：
   - 创建或复用 `pbs_bid`。
   - 清理这些 crew 当前已有 `pbs_bid_group` / tier 相关测试配置。
   - 按本 spec 重建 14 条场景配置。
4. 只影响这 14 个 crew，不影响其他用户。
5. 输出变更摘要，方便人工复核。

风险控制：

- 脚本默认 dry-run，传 `--write` 才真正写库。
- 写入前打印将删除/新增的 bid group 数量。
- 所有写入在事务中完成。

## 测试与验收

接口验收：

1. 调用临时接口返回 `.tgz`。
2. `.tgz` 包含 5 个预期文件。
3. 每个 CSV 只包含白名单 14 人的数据。
4. 4 个算法 CSV 按 `seniority_num desc` 输出 crew。
5. `RESERVE_SCORE.csv` 有 PRAM / PRPM 命中。
6. `LINE_RULES.csv` 有：
   - `Only Reserve`
   - `No Reserve`
7. `LINE_RULES_README.md` 仍在包内。

建议测试命令：

```bash
pnpm --filter pbs-server exec tsc --noEmit
pnpm --filter pbs-server test
```

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 该任务涉及同一批 bid 数据、同一临时接口和同一导出排序逻辑，拆分会增加数据写入冲突风险。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server` 临时接口、algorithm export 过滤/排序参数、临时 seed/script、相关测试。
- Conflict risk: 中等；主要风险是远程 Current bid 数据被覆盖。必须限定 14 个 crew 并使用事务。
- Execution gate: 用户确认本 spec 后再实施。
