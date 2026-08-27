# PBS 算法导出 Pairing Score 设计

日期：2026-06-02  
状态：已确认  
范围：`/api/admin/algorithm-export` 导出包新增 Pairing Score 文件。本文件只定义设计，不包含代码实现。

## 背景

当前管理员算法导出接口：

```text
GET /api/admin/algorithm-export?periodCode=<periodCode>
```

已经按最终 `.tgz` 包形式实现，但包内目前只有 `DAYSOFF.csv`。后续需要对接 Pairing 相关数据。用户确认本次 Pairing 导出不是导出 pairing 基础资料，也不是只导出用户显式选择的 Pairing Number，而是：

```text
根据每个 crew 在 PBS Pairing 页面配置的 pairing 条件，搜索 live pairing 表中符合条件的 pairing，
再把每个 crew / pairing 在各 tier 中被 award / avoid 条件命中的次数导出给算法侧。
```

因此本次文件更准确命名为 `PAIRING_SCORE.csv`。

## 目标

1. 在现有算法导出 `.tgz` 包中新增必需文件 `PAIRING_SCORE.csv`。
2. 对每个 crew 的 Current Pairing bid 规则逐条执行 pairing 搜索。
3. 将搜索命中的 pairing 按 `Crew_ID + Pairing_ID` 聚合。
4. 对每个 tier 分别统计 award / avoid counter。
5. 输出当前 live `pairing.id`，同时输出 `pairing.interface_id` 用于关联旧系统 Pairing_ID。
6. 复用现有 Pairing Search 条件构造逻辑，避免导出侧另写一套筛选语义。

## 非目标

- 不导出完整 pairing 基础数据，例如 duty、segment、composition 明细。
- 不在本文件中定义 RO / PO 引擎的完整输入包格式。
- 不改变 Pairing 页面保存结构。
- 不改变 `/api/admin/algorithm-export` 的接口路径、HTTP 方法或认证方式。
- 不做旧错误 Pairing Number payload 兼容；Pairing Number 必须继续使用稳定 `pairingId`。
- 只输出命中的 pairing；不把未命中任何 Pairing rule 的 pairing 强行输出为 0 分行。

## 输出文件

文件名：

```text
PAIRING_SCORE.csv
```

建议表头固定为：

```csv
Crew_ID,Pairing_ID,Interface_ID,T1_Award_Counter,T1_Avoid_Counter,T2_Award_Counter,T2_Avoid_Counter,T3_Award_Counter,T3_Avoid_Counter,T4_Award_Counter,T4_Avoid_Counter,T5_Award_Counter,T5_Avoid_Counter,T6_Award_Counter,T6_Avoid_Counter,T7_Award_Counter,T7_Avoid_Counter
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `Crew_ID` | PBS bid crew id，来自 `pbs_bid.crew_id`。 |
| `Pairing_ID` | 当前 live pairing 稳定 id，来自 `<live_schema>.pairing.id`。 |
| `Interface_ID` | 外部旧系统 pairing id，来自 `<live_schema>.pairing.interface_id`。为空时输出空字符串。 |
| `Tn_Award_Counter` | 该 crew 在 Tn 中有多少条 award Pairing 条件命中该 pairing。 |
| `Tn_Avoid_Counter` | 该 crew 在 Tn 中有多少条 avoid Pairing 条件命中该 pairing。 |

行粒度：

```text
Crew_ID + Pairing_ID
```

排序建议：

```text
Crew_ID asc, Pairing_ID numeric asc
```

## Counter 语义

对同一个 crew、同一个 pairing、同一个 tier：

- 每一条 `award` Pairing property 命中时，对 `Tn_Award_Counter` 加 1。
- 每一条 `avoid` Pairing property 命中时，对 `Tn_Avoid_Counter` 加 1。
- 多条规则命中同一个 pairing 时累计，不去重；每次命中都使对应 counter 加 1。
- 同一条 property 如果配置到多个 tier，应分别计入对应 tier。
- 只输出 `T1-T7`，与当前 Days Off 导出保持一致；`T8+` 首期忽略。

示例：

```text
Crew F8030:
- T1 Award Pairing Number = 496001
- T1 Award Any Flight Number = F8123，且 496001 命中
- T3 Avoid Redeye，且 496001 命中
```

输出中 `F8030 + 496001` 应为：

```csv
F8030,496001,<interface_id>,2,0,0,0,0,1,0,0,0,0,0,0,0,0
```

## 数据来源

PBS bid 来源：

- `pbs_bid`
- `pbs_bid_tier`
- `pbs_bid_group`
- `pbs_bid_property`
- 必要时读取 `pbs_bid_pairing_occurrence`

筛选范围：

```text
pbs_bid.period_code = periodCode
pbs_bid.bid_context = 'Current'
pbs_bid_group.bid_type = 'Pairing'
```

live pairing 来源：

- `<live_schema>.pairing`
- `<live_schema>.pairing_segment`
- 需要返回 `pairing.id` 和 `pairing.interface_id`

live schema 继续沿用现有 algorithm export service 的推导方式：

```text
env.PBS_SCHEMA.replace(/_pbs$/i, "")
```

## Pairing 条件搜索

导出侧不应重新发明 Pairing 条件 SQL。推荐复用或抽取现有 Pairing Search 的条件构造能力：

- 当前页面 preview / search 已经能把 `PbsPairingDraftProperty` 转换为 live pairing 查询条件。
- Pairing Score 导出应构造同样的单条 property 查询条件，并执行批量查询。
- 如果现有 search service 只面向分页预览，应抽出更底层的 helper，例如：

```ts
buildPairingPropertyCondition(property)
loadMatchingPairingIds(condition, periodCode)
```

导出逻辑只负责：

1. 读取 Current Pairing bid property rows。
2. 反序列化为 `PbsPairingDraftProperty` 语义。
3. 对每条 property 查询 matching pairings。
4. 将结果聚合为 `PAIRING_SCORE.csv`。

## Pairing Number 处理

Pairing Number 是最简单、也最需要保持稳定身份的一类。

### Entire Month

保存结构应为：

```ts
{
  type: "pairing-id-list",
  pairingIds: ["496001", "414601"],
  pairingLabels: ["M4959", "V4146"]
}
```

导出时：

- 业务查询只使用 `pairingIds`。
- `pairingLabels` 仅展示，不参与匹配。
- 不接受 `M4959` 等 label 作为 `Pairing_ID`。

### Specific Date

保存结构应为：

```ts
{
  type: "pairing-occurrence-list",
  occurrences: [
    {
      pairingId: "496001",
      originDate: "2026-06-11",
      occurrenceId: "496001:2026-06-11"
    }
  ]
}
```

导出时建议首期口径：

- 以 occurrence 明细中的 `pairingId` 作为命中 pairing。
- `originDate` 用于确保只命中特定日期 occurrence。
- 如果同一个 property 中同一个 pairing 多个 occurrence 命中，每次 occurrence 命中都使对应 counter 加 1。

## 通用 Pairing Property 处理

对于非 Pairing Number 的条件，例如：

- Check-in / check-out time
- Total credit / block time
- Average daily credit / block time
- Duty duration
- Layover duration
- Flight number
- Crew employee number
- Redeye
- Deadhead legs
- Departing / layover on date or day

导出侧应复用 Search Pairings 的 SQL 条件，查出所有符合条件的 live pairing。

award / avoid 不影响搜索条件本身，只影响 counter 写入哪一列。

any / every quantifier、date scope、time condition list 等语义必须与 Search Pairings 页面保持一致。若发现现有 Search Pairings 未覆盖某个 property 的查询语义，首期应明确跳过并记录测试/日志，不能在导出侧做含糊实现。

## 空数据与异常处理

- 没有 Pairing bid 数据时，仍输出只有表头的 `PAIRING_SCORE.csv`。
- 某条 property 无法反序列化或不支持搜索时，首期跳过该 property，并在 server log 记录 crew、period、property code、property group key。
- live pairing 缺少 `interface_id` 时，该字段输出空字符串。
- 整体导出仍应尽量成功，除非发生数据库连接、SQL 语法、schema 非法等系统级错误。

## 包结构

当前：

```text
DAYSOFF.csv
```

新增后：

```text
DAYSOFF.csv
PAIRING_SCORE.csv
```

后续如算法侧需要完整 pairing 池，可另行新增：

```text
PAIRINGS.csv
PAIRING_DUTIES.csv
PAIRING_COMPOSITIONS.csv
```

不要把完整 pairing 池与 `PAIRING_SCORE.csv` 混在一个文件里。

## 推荐实现方案

### 方案 A：复用 Search Pairings 条件构造，新增导出专用查询

做法：

- 从 pairing search 模块抽出可复用 condition builder。
- algorithm export 新增 `pairing-score-export.ts`。
- 每条 property 构造 condition 后查询 `pairing.id/interface_id`。
- 在导出 service 中加入 `PAIRING_SCORE.csv`。

优点：

- 与前端 Search Pairings 预览语义一致。
- 对现有 route 改动小。
- 便于单元测试每类 property 的命中行为。

缺点：

- 需要整理当前 search 模块的内部 helper 边界。
- 批量导出时如果逐条规则查询，后续可能需要优化并发和缓存。

推荐采用本方案。

### 方案 B：直接复用 previewPairings service

做法：

- algorithm export 伪造 preview request，调用现有 `previewPairings`。

优点：

- 初期改动少。

缺点：

- preview 是分页和页面展示服务，不适合全量导出。
- 容易受到 pageSize、metadata、actor 语义影响。
- 性能和边界不清晰。

不推荐。

### 方案 C：导出侧重写所有 Pairing SQL

做法：

- 在 algorithm export 中独立实现各 property 的 SQL。

优点：

- 短期对 pairing search 模块无侵入。

缺点：

- 极易与 Search Pairings 页面语义分叉。
- 后续 property 修复需要维护两套逻辑。

不推荐。

## 性能考虑

潜在风险：

- crew 数量 × property 数量逐条查询，可能带来 N+1 查询。
- 通用 property 搜索条件可能 join `pairing_segment`，数据量较大。

首期建议：

1. 先按 property 逐条查询实现正确性。
2. 查询结果按 condition signature 缓存：相同 period、propertyCode、operator、params 的条件可复用 matching pairing set。
3. Pairing Number 的 `pairing-id-list` 不走复杂 search，直接读取 ids 并批量回查 `interface_id`。
4. 控制并发，避免管理员导出时压垮数据库。
5. 后续如数据规模上升，再按 property 类型做批量 SQL 优化。

## 测试设计

后端自动化测试：

- `buildPairingScoreCsvFromRows` 聚合：
  - award counter 累加。
  - avoid counter 累加。
  - 同一 property 多 tier 分别计数。
  - T8+ 不输出。
  - `interface_id` 为空时输出空字段。
- Pairing Number：
  - `pairing-id-list` 按 `pairingIds` 命中。
  - label 不作为 Pairing_ID。
  - `pairing-occurrence-list` 按 occurrence 明细命中。
- 通用 property：
  - 选 2-3 个已有 search 条件做集成测试，例如 Flight Number、Redeye、Total Credit。
- route / package：
  - 管理员下载 tgz 中同时包含 `DAYSOFF.csv` 和 `PAIRING_SCORE.csv`。
  - 无 Pairing 数据时 `PAIRING_SCORE.csv` 只有表头。

QA 人工测试案例：

- 新增 `docs/test-cases/pbs/algorithm-export/<YYYY-MM-DD>-pairing-score-export.md`。
- 覆盖管理员导出、Pairing Number、通用 property、award/avoid counter、空数据。

## 验收标准

1. `/api/admin/algorithm-export?periodCode=Jun%202026` 返回的 tgz 包包含 `PAIRING_SCORE.csv`。
2. `PAIRING_SCORE.csv` 表头包含 `Crew_ID`、`Pairing_ID`、`Interface_ID` 和 `T1-T7` 的 award / avoid counter。
3. Pairing Number 条件输出 live `pairing.id`，并能带出 `pairing.interface_id`。
4. 非 Pairing Number 条件通过 Search Pairings 同源逻辑搜索 matching pairings。
5. 同一 crew / pairing / tier 的多个命中条件会累加 counter。
6. 没有命中的 pairing 不输出 0 分行。
7. `DAYSOFF.csv` 现有行为不变。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次实现会触及 Pairing Search 条件构造和 Algorithm Export 聚合，两者语义强耦合；拆分多 agent 容易造成查询口径不一致。
- Suggested split: 不拆分。可在单 agent 实现后另派 review agent 做代码审查。
- Write boundaries: `pbs-server/src/services/algorithm-export/*`、`pbs-server/src/services/pairing-search/*`、`pbs-server/src/routes/algorithm-export.test.ts`、相关测试文档。
- Conflict risk: Medium。当前工作树已有 pairing search/detail 未提交改动，后续实现前必须先确认这些改动是否与 Pairing Score 依赖的 search helper 冲突。
- Execution gate: 用户 review 并确认本 spec 后，才能进入实现计划和代码修改。

## 待确认点

1. 文件名确认使用 `PAIRING_SCORE.csv`。
2. `pairing-occurrence-list` 中同一 property 命中同一 pairing 的多个 occurrence 时，每次命中都使 counter 加 1。
3. 不支持搜索的 Pairing property 首期跳过并记录 server log，不让整体导出失败。
4. 只输出命中行，不输出全量 pairing 的 0 counter 行。
