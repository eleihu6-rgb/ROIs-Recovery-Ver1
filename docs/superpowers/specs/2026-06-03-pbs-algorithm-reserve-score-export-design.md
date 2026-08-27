# PBS 算法导出 Reserve Score 设计

日期：2026-06-03  
状态：已确认并实施  
范围：`/api/admin/algorithm-export` 导出包新增 Reserve Score 文件。本文件只定义设计，不包含代码实现。

## 背景

当前管理员算法导出包已经包含：

- `DAYSOFF.csv`
- `PAIRING_SCORE.csv`
- `LINE_RULES.csv`
- `LINE_RULES_README.md`

现在需要继续对接 Reserve。用户确认 Reserve 在 live 数据中不是单独的航班表，而是 `pairing` 表里的特殊 pairing：

```text
pairing.assignment_group = 'SBY'
pairing.assignment = PRAM / PRPM / CRAM / CRPM / PRMM / RESA / RESB
```

本地排查远程 live `f8.pairing` 后确认，2026-06-03 下午新导入了 Reserve pairing：

```text
assignment_group = SBY, assignment = PRAM, 31 条，created_at = 2026-06-03 14:02:38
assignment_group = SBY, assignment = PRPM, 31 条，created_at = 2026-06-03 14:32:31
```

样例：

```text
id=61711, pairing_label=PRAM-1000-2200, interface_id=PRAM2026-06-01, assignment_group=SBY, assignment=PRAM
id=61742, pairing_label=PRPM-2000-0559, interface_id=PRPM2026-06-01, assignment_group=SBY, assignment=PRPM
```

其中 `PRAM` 有对应 `pairing_segment`，但当前 `PRPM` 没有 segment。因此 Reserve 导出必须以 `pairing` 头表为准，不能依赖 `pairing_segment` 才能命中。

## 目标

1. 在现有算法导出 `.tgz` 包中新增 `RESERVE_SCORE.csv`。
2. 读取 Current Reserve bid 条件，搜索 live `pairing.assignment_group = 'SBY'` 的 Reserve pairing。
3. 将命中的 Reserve pairing 按 `Crew_ID + Pairing_ID` 聚合。
4. 对每个 tier 分别统计 award / avoid counter。
5. 输出 `pairing.id` 作为 `Pairing_ID`，输出 `pairing.interface_id` 作为旧系统关联 ID。
6. Reserve 日期匹配必须把数据库 UTC 时间转换成 base 本地日期后再比较。
7. 不支持的 Reserve 条件跳过并记录日志，不阻断整个导出包。

## 非目标

- 不导出 Reserve coverage 需求表；`pbs_reserve_coverage` 是覆盖需求，不是本次算法 score 输入。
- 不导出完整 Reserve pairing 明细，例如 duty、segment、机场、时间段等。
- 不改变 Reserve 页面保存结构。
- 不改变 `/api/admin/algorithm-export` 的 HTTP 接口路径、方法或鉴权。
- 不把 Reserve 行混入 `PAIRING_SCORE.csv`；Reserve 独立输出 `RESERVE_SCORE.csv`。
- 不依赖 `pairing_segment` 搜索 Reserve；segment 缺失不能导致 Reserve pairing 被漏导。

## 输出文件

文件名：

```text
RESERVE_SCORE.csv
```

表头与 `PAIRING_SCORE.csv` 保持一致：

```csv
Crew_ID,Pairing_ID,Interface_ID,T1_Award_Counter,T1_Avoid_Counter,T2_Award_Counter,T2_Avoid_Counter,T3_Award_Counter,T3_Avoid_Counter,T4_Award_Counter,T4_Avoid_Counter,T5_Award_Counter,T5_Avoid_Counter,T6_Award_Counter,T6_Avoid_Counter,T7_Award_Counter,T7_Avoid_Counter
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `Crew_ID` | PBS bid crew id，来自 `pbs_bid.crew_id`。 |
| `Pairing_ID` | live Reserve pairing 稳定 id，来自 `<live_schema>.pairing.id`。 |
| `Interface_ID` | 外部旧系统 Reserve/Pairing id，来自 `<live_schema>.pairing.interface_id`。为空时输出空字符串。 |
| `Tn_Award_Counter` | 该 crew 在 Tn 中有多少条 award Reserve 条件命中该 Reserve pairing。 |
| `Tn_Avoid_Counter` | 该 crew 在 Tn 中有多少条 avoid Reserve 条件命中该 Reserve pairing。 |

行粒度：

```text
Crew_ID + Pairing_ID
```

排序建议：

```text
Crew_ID asc, Pairing_ID numeric asc
```

示例：

```csv
Crew_ID,Pairing_ID,Interface_ID,T1_Award_Counter,T1_Avoid_Counter,T2_Award_Counter,T2_Avoid_Counter,T3_Award_Counter,T3_Avoid_Counter,T4_Award_Counter,T4_Avoid_Counter,T5_Award_Counter,T5_Avoid_Counter,T6_Award_Counter,T6_Avoid_Counter,T7_Award_Counter,T7_Avoid_Counter
F8030,61711,PRAM2026-06-01,1,0,0,0,0,0,0,0,0,0,0,0,0,0
F8030,61742,PRPM2026-06-01,0,1,0,0,0,0,0,0,0,0,0,0,0,0
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
pbs_bid_group.bid_type = 'Reserve'
```

live Reserve pairing 来源：

- `<live_schema>.pairing`
- `<live_schema>.airport`

Reserve pairing 基础条件：

```sql
p.is_deleted = 0
and p.assignment_group = 'SBY'
```

字段映射：

```text
Call Type    = p.assignment
Pairing_ID   = p.id
Interface_ID = p.interface_id
Base         = p.base
Start UTC    = p.sch_str_dt_utc
```

live schema 继续沿用现有 algorithm export service 的推导方式：

```text
env.PBS_SCHEMA.replace(/_pbs$/i, "")
```

## Reserve 条件映射

### 301 Short Call Type

用户配置：

```text
callType = PRAM / PRPM / CRAM / CRPM / PRMM / RESA / RESB
dateScope = whole_month / first_half / second_half / date_range / specific_dates
```

搜索语义：

```sql
p.assignment_group = 'SBY'
and p.assignment = <callType>
and base_local_date(p.sch_str_dt_utc, p.base) matches <dateScope>
```

action 语义：

- 如果 `pbs_bid_group.action_id` 明确为 Award，则写 Award counter。
- 如果 `pbs_bid_group.action_id` 明确为 Avoid，则写 Avoid counter。
- 如果没有显式 action，默认按 Award 处理。

### 302 Reserve Day On

用户配置：日期 tag-list。

搜索语义：

```sql
p.assignment_group = 'SBY'
and base_local_date(p.sch_str_dt_utc, p.base) in <selected dates>
```

action 语义：

- 固定写 Award counter。
- 空日期列表不报错，只是不产生命中。

### 311 Reserve Prefer Off

用户配置：日期 tag-list。

搜索语义：

```sql
p.assignment_group = 'SBY'
and base_local_date(p.sch_str_dt_utc, p.base) in <selected dates>
```

action 语义：

- 固定写 Avoid counter。
- 空日期列表不报错，只是不产生命中。

## Base 本地日期匹配

数据库时间字段保持 UTC 语义：

```text
pairing.sch_str_dt_utc
pairing.sch_end_dt_utc
```

导出匹配日期时不能直接比较 UTC date，必须转成 pairing base 对应的本地日期：

```text
base_zone = airport.zone_id where airport.airport = pairing.base
base_local_date = (pairing.sch_str_dt_utc AT TIME ZONE base_zone)::date
```

匹配使用 `base_local_date`：

- `whole_month`
- `first_half`
- `second_half`
- `date_range`
- `specific_dates`
- `Reserve Day On`
- `Reserve Prefer Off`

理由：

- 用户在 PBS 页面选择的是业务本地日期，不是 UTC 自然日。
- `PRPM-2000-0559` 这类 Reserve 跨本地午夜，如果直接用 UTC date，容易错一天。
- 现有 Days Off 导出设计已经使用 `airport.zone_id` 处理 base timezone，本功能应保持同一口径。

时区缺失处理：

- 优先 join `<live_schema>.airport` 读取 `zone_id`。
- 如果某个 Reserve pairing 的 `base` 找不到 `airport.zone_id`，该 pairing 对日期型 Reserve 条件不应被模糊命中。
- 缺失时区应记录 skip/log 事件，包含 `base`、`pairingId`、`interfaceId`、原因。
- 不建议硬编码航司默认时区；如后续需要 fallback，应使用 `dictionary` 的 `SYS_PARAM.DEFAULT_TIMEZONE` 或明确配置，并在日志中标记 fallback。

## Counter 语义

对同一个 crew、同一个 Reserve pairing、同一个 tier：

- 每一条 award Reserve property 命中时，对 `Tn_Award_Counter` 加 1。
- 每一条 avoid Reserve property 命中时，对 `Tn_Avoid_Counter` 加 1。
- 多条规则命中同一个 Reserve pairing 时累计，不去重。
- 同一条 property 如果配置到多个 tier，应分别计入对应 tier。
- 只输出 `T1-T7`，与当前 `DAYSOFF.csv`、`PAIRING_SCORE.csv` 保持一致。
- `T8+` 首期忽略。
- 只输出命中的 Reserve pairing；不输出全 0 行。

示例：

```text
Crew F8030:
- T1 Award Short Call Type PRAM whole month，命中 61711
- T1 Award Reserve Day On 2026-06-01，命中 61711
- T2 Avoid Reserve Prefer Off 2026-06-01，命中 61711
```

输出中 `F8030 + 61711` 应为：

```csv
F8030,61711,PRAM2026-06-01,2,0,0,1,0,0,0,0,0,0,0,0,0,0
```

## 打包集成

`/api/admin/algorithm-export` 生成 `.tgz` 时新增文件：

```text
RESERVE_SCORE.csv
```

建议包内容变为：

```text
DAYSOFF.csv
PAIRING_SCORE.csv
RESERVE_SCORE.csv
LINE_RULES.csv
LINE_RULES_README.md
```

`RESERVE_SCORE.csv` 为空数据时仍输出只有 header 的 CSV，保证算法侧包结构稳定。

## 实施范围

建议新增：

- `pbs-server/src/services/algorithm-export/reserve-score-export.ts`
- `pbs-server/src/services/algorithm-export/reserve-score-export.test.ts`

需要修改：

- `pbs-server/src/services/algorithm-export/algorithm-export-service.ts`
  - 调用 `loadReserveScoreCsv`
  - 将 `RESERVE_SCORE.csv` 加入 tgz
  - 增加 `onSkippedReserveScoreProperty` 或同等日志 hook
- `pbs-server/src/services/algorithm-export/types.ts`
  - 如服务类型需要暴露新增 skip callback，则同步调整
- `pbs-server/src/app.ts`
  - 创建 algorithm export service 时传入新增 skip logger

可复用/抽取：

- `PAIRING_SCORE.csv` 的表头、counter 聚合、CSV 序列化逻辑可以抽成共享 helper。
- 若为降低改动风险，首期也可以在 `reserve-score-export.ts` 内局部复用同样逻辑；后续再统一抽取。

## 测试范围

单元测试建议覆盖：

1. `301 Short Call Type` + `whole_month` 匹配 `SBY + PRAM`。
2. `301 Short Call Type` + `date_range` 只匹配 base local date 落在范围内的 Reserve pairing。
3. `301 Short Call Type` + `specific_dates` 使用 base local date，而不是 UTC date。
4. `302 Reserve Day On` 输出 Award counter。
5. `311 Reserve Prefer Off` 输出 Avoid counter。
6. 多个 Reserve 条件命中同一 `Crew_ID + Pairing_ID` 时 counter++。
7. `PRPM` 没有 `pairing_segment` 时仍能通过 `pairing` 头表命中。
8. unsupported Reserve property code 触发 skip log。
9. 缺失 `airport.zone_id` 时日期型条件不模糊命中，并记录日志。
10. `.tgz` 包包含 `RESERVE_SCORE.csv`。

验证命令：

```bash
pnpm --filter pbs-server exec tsc --noEmit
pnpm --filter pbs-server test
```

## 风险与注意事项

- 当前 live 数据中 `PRPM` 有 pairing 头表但无 segment；实现必须避免用 `pairing_segment` 作为 Reserve 命中前提。
- Date scope 必须按 base local date；直接使用 UTC date 会造成跨时区日期偏差。
- `duration_days` 当前 Reserve 样例显示为 `4`，不应在本导出中用于日期匹配。
- `interface_id` 可能为空；CSV 中输出空字符串即可。
- 如果未来 Reserve call type 扩展，优先从 `pbsReserveShortCallTypes` 或数据库 property 配置读取，不在导出代码中散落硬编码。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 `pbs-server` 的 algorithm export 服务，范围清晰，单人实现更快且冲突更少。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server/src/services/algorithm-export/*`、`pbs-server/src/app.ts`、相关测试。
- Conflict risk: 低；但当前工作树已有前序算法导出和文档改动，实施时应在现有改动上继续，不回滚用户或历史改动。
- Execution gate: 用户确认本 spec 后实施。
