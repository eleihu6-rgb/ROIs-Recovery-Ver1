# PBS Work Day Preference 标准语义重构设计

## 1. 背景

当前 PBS Portal 的 `Work Day Preference`（Pairing property `110`）使用以下模型：

- `Award / Avoid`
- `Any work day / Every work day`
- `Specific dates / weekdays / Date range`
- `date-or-dow-list` 或通用 `date-range` payload

与标准答案项目 `/Users/lei/Codehub/Flair_PBS_Optimization_Report` 对照后，以上模型并不符合目标业务语义。标准答案将该条件定义为：选择希望工作的星期，并可为每个星期配置独立的当地 Check-In 时间窗口；Pairing 中只要存在一个 Duty 命中，即视为匹配。

本次重构只参考标准答案的业务语义，不复制其 UI。Portal 继续使用本项目现有的弹窗骨架、Tier、weekday chip、日期选择器、颜色、间距与 footer 规范。

## 2. 目标

1. 将 `Work Day Preference` 固定为 Award-only，界面不展示 `Award / Avoid` 选择。
2. 删除 `Any / Every` 量词，统一为“至少一个 Duty 命中”。
3. 支持选择一个或多个星期，并为每个星期设置独立、可选的 Check-In 时间窗口。
4. 支持可选的 Event Date Scope；默认关闭表示任意日期。
5. Event Date、weekday 和 Check-In time 均取自同一个 Duty 的起飞机场当地 Check-In。
6. 新建独立、明确的 `work-day-preference` payload，不再复用通用日期类型。
7. 删除全部旧 property `110` bids、occurrences 和 favorites，不提供旧 payload 兼容。
8. Pairing 页面、Search Pairings、摘要、保存、导入/导出和算法评分使用同一语义。

## 3. 非目标

- 不照搬标准答案项目的页面布局、原生 select、七行固定表单或 CSS。
- 不采用标准答案的 Pairing-span date scope；用户已明确要求与本项目既有 `LIMIT TO EVENT DATE` 语义保持一致。
- 不修改其他使用 `date-or-dow-list` 的 property。
- 不保留旧 `Avoid`、`Any / Every`、具体日期列表或通用 date-range 的兼容转换。
- 不迁移或猜测旧规则意图。
- 不改变 Tier 评分权重、Tier counter 或其他 Pairing property 的业务语义。
- 不引入新的第三方依赖。

## 4. 已确认产品决策

### 4.1 Award 固定且隐藏

- property `110` 的 catalog 只支持 `award`。
- 配置弹窗不渲染 `PREFERENCE` 区域，也不显示不可点击的 Award 按钮。
- 新建、收藏复用、编辑和提交时均固定 `action: "award"`。
- 后端拒绝 property `110` 的 `avoid` 请求，不能只依赖前端隐藏。

### 4.2 不使用 Any / Every

- catalog 的 `supportedQuantifiers` 与 `defaultQuantifier` 均为空。
- 弹窗删除 `WORK-DAY MATCH` 区域。
- 保存时 `quantifier` 必须为 `null`。
- 匹配语义固定为：Pairing 中至少一个 Duty 的当地 Check-In 同时满足 Event Date、weekday 和该 weekday 的时间窗口。

### 4.3 保留本项目 UI

- 保留 `Configure Work Day Preference` 弹窗标题。
- `TIERS · REQUIRED` 继续使用本项目的 T1–T7 多选控件，新增时默认不选择 Tier。
- weekday 继续使用本项目的 Mon–Sun chip 视觉和键盘/无障碍选中态。
- 日期继续使用 `PbsDatePicker` 和 bid-period 日期边界。
- footer 继续使用 `CANCEL / SAVE FAVORITE / ADD BID` 或编辑场景的既有按钮。

## 5. UI 与交互设计

### 5.1 弹窗结构

从上到下为：

1. `TIERS · REQUIRED`
2. `WORK DAYS & CHECK-IN WINDOW · REQUIRED`
3. `LIMIT TO EVENT DATE`
4. 既有 footer

弹窗中不再出现：

- `PREFERENCE`
- `WORK-DAY MATCH`
- `WHEN SHOULD THE WORK DAY OCCUR?`
- `Specific dates / weekdays`

### 5.2 Work Days 与 Check-In Window

- 显示 Mon–Sun 七个 weekday chips。
- 至少必须选择一个 weekday。
- 选择 weekday 后，在 chips 下方显示该 weekday 的 Check-In window 配置卡片。
- 多个已选 weekday 按 Mon–Sun 顺序排列，不能按用户点击顺序漂移。
- 每个卡片包含 weekday 标签、`From` 时间和 `To` 时间。
- 取消 weekday 时，立即删除该 weekday 的时间窗口草稿；再次选择时从空窗口开始，防止隐藏旧值被提交。

时间窗口语义：

| From | To | 含义 |
|---|---|---|
| 空 | 空 | 该 weekday 的任意 Check-In 时间 |
| 有值 | 空 | 从该时间开始及以后 |
| 空 | 有值 | 该时间及以前 |
| From < To | | 同日闭区间 |
| From > To | | 跨午夜窗口，例如 `22:00–05:00` |
| From = To | | 无效，不允许保存 |

边界时间包含在匹配范围内。

### 5.3 Limit to Event Date

- 使用本项目已验收的 optional date-scope 模式。
- toggle 默认关闭；关闭时 `dateScope: null`，表示 Any date，但实际数据仍受当前 bid period 限制。
- 打开后显示模式切换：
  - `Specific Dates`
  - `Date Range`
- 默认进入 `Specific Dates`，但日期列表为空，因此在选择至少一个有效日期前 footer 保持 disabled。
- `Specific Dates` 与既有 `LIMIT TO EVENT DATE` 组件一致，允许选择多个独立日期。
- `Date Range` 的起止日均为包含关系。
- 所有日期必须位于当前 bid period 内。
- 切换模式时清空另一模式的草稿；关闭 toggle 时清空全部 date scope，防止隐藏值继续参与匹配。
- Event Date 为 Duty 起飞机场当地 Check-In 日期。
- 日期、weekday 和 Check-In time 必须由同一个 Duty 同时满足；不能由不同 Duty 分别满足各条件后拼成命中。
- 本节有意偏离标准答案项目的 Pairing-span overlap，目的是与本项目其他条件的 `LIMIT TO EVENT DATE` 交互及用户理解保持一致。

## 6. 新数据契约

新增专用 payload：

```ts
type WorkDayPreferenceBid = {
  type: "work-day-preference";
  days: Array<{
    dayOfWeek: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
    checkInFrom: string | null; // HH:mm
    checkInTo: string | null;   // HH:mm
  }>;
  dateScope:
    | null
    | { mode: "specific_dates"; dates: string[] }
    | { mode: "date_range"; from: string; to: string };
};
```

示例：

```json
{
  "type": "work-day-preference",
  "days": [
    {
      "dayOfWeek": "MON",
      "checkInFrom": "06:00",
      "checkInTo": "09:00"
    },
    {
      "dayOfWeek": "WED",
      "checkInFrom": null,
      "checkInTo": null
    }
  ],
  "dateScope": {
    "mode": "date_range",
    "from": "2026-06-20",
    "to": "2026-06-23"
  }
}
```

property `110` catalog 更新为：

- `defaultBid`: 空 `work-day-preference`
- `supportedActions`: `["award"]`
- `supportedQuantifiers`: 空
- `defaultQuantifier`: 空
- `supportedOperators`: 空
- validation metadata 明确为 Work Day + per-day Check-In window + optional Event Date Scope

`days` 必须规范化为 Mon–Sun 顺序；同一个 weekday 不允许出现两次。

## 7. 后端校验

property `110` 必须满足：

1. `action === "award"`。
2. `quantifier === null`。
3. `operator === null`。
4. `bid.type === "work-day-preference"`。
5. `days` 至少包含一项，weekday 必须合法且唯一。
6. `checkInFrom / checkInTo` 只能是 `null` 或合法 `HH:mm`。
7. 同一窗口两端均存在时不能相等；允许 From 大于 To 表示跨午夜。
8. `dateScope` 为 `null`、完整 specific date 或完整 date range；该字段过滤 Duty 当地 Check-In Event Date。
9. date range 的 `from <= to`。
10. Event Date Scope 必须落在请求对应的当前 bid period 内。

旧 payload 明确拒绝：

- `date-or-dow-list`
- 通用 `date-range`
- 任何带 Any / Every 的 property `110`
- `avoid`

## 8. 匹配语义

### 8.1 Duty Check-In Event

每个有效 Duty 的唯一 Check-In event 算法如下：

- segment 过滤 `is_deleted = 0`。
- 按 `duty_seq` 分组。
- 仅考虑 `brief_start_utc is not null` 的 segment，不回退到 `duty_sch_str_dt_utc` 或 `sch_str_dt_utc`。
- 每个 Duty 按 `brief_start_utc asc, seg_seq asc, id asc` 稳定排序，取第一条；相同时间时由 `seg_seq`、再由稳定 segment `id` 决定。
- event timestamp 为所选 segment 的 `brief_start_utc`。
- event airport 为所选 segment 的 `dep_arp`。
- 通过 airport 数据取得 IANA timezone，并以 `pg_timezone_names` 验证；timezone 缺失或无效时明确使用 `UTC`。
- 将 UTC timestamp 转为该 timezone 的当地日期、ISO weekday 和 wall-clock time；不得依赖 PostgreSQL session timezone。
- Duty 没有任何非空 `brief_start_utc` 时没有 Check-In event，因此不能命中 Work Day Preference。
- Search Pairings、`pbs-server` PAIRING_SCORE 和 `live-server` PAIRING_SCORE 必须复用同一 SQL helper；如果模块边界无法直接复用，则必须使用相同 fixture 做逐项等价测试。

规范性伪 SQL：

```sql
select distinct on (s.pairing_id, s.duty_seq)
  s.pairing_id,
  s.duty_seq,
  s.brief_start_utc,
  s.dep_arp,
  coalesce(valid_timezone.name, 'UTC') as event_timezone
from pairing_segment s
left join airport a on a.arp_cd = s.dep_arp
left join pg_timezone_names valid_timezone on valid_timezone.name = a.timezone
where s.is_deleted = 0
  and s.brief_start_utc is not null
order by s.pairing_id, s.duty_seq, s.brief_start_utc, s.seg_seq, s.id;
```

实际 airport 表名/字段沿用仓库权威模型；上述伪 SQL 规定的是选择与 fallback 语义，不授权新建重复数据结构。

### 8.2 Duty Event Date Scope

`dateScope` 直接过滤 §8.1 选出的同一个 Duty Check-In event：

- `null`：不额外限制 Duty 日期，表示 Any date。
- `specific_dates`：Duty 当地 Check-In 日期必须属于所选日期列表。
- `date_range`：Duty 当地 Check-In 日期必须落在包含起止边界的连续范围内。
- Event Date、weekday 和 Check-In time 必须全部由同一个 Duty Check-In event 计算。
- 不使用 Pairing start/end span overlap，也不使用 crew Base 日期或 UTC 日历日期。
- Search 与两个 PAIRING_SCORE 路径必须使用同一 Duty Event Date 定义。

### 8.3 Duty 是否命中

一个 Duty 只有同时满足以下条件才命中：

1. `dateScope === null`，或 Duty 当地 Check-In Event Date 命中 specific date/date range。
2. Duty 当地 weekday 存在于 `days`。
3. Duty 当地 Check-In time 命中该 weekday 独立的时间窗口。

### 8.4 Pairing 是否命中

- Pairing 中存在至少一个同时满足 Event Date、weekday 和时间窗口的 Duty，即为正向匹配。
- 不再提供 Every Duty 语义。
- Award 评分只对正向匹配的 Pairing 增加对应 Tier counter。
- Search Pairings 与最终 `PAIRING_SCORE` 生成必须使用一致判断。

## 9. 摘要与展示

摘要应可让用户看出 weekday、时间和 Event Date Scope，不再显示 Any/Every 或 Avoid。例如：

```text
Award · Mon 06:00–09:00, Wed any time · 2026-06-20–2026-06-23 · T1
```

开放窗口示例：

- `Mon from 17:00`
- `Tue until 07:00`
- `Wed any time`
- `Thu 22:00–05:00`

Pairing 主页面、Search Pairings criteria、favorite 列表、Calendar/既有 bid 摘要和算法导出说明必须使用同一 formatter 或同一明确语义，避免再次产生文案分叉。

## 10. 旧数据删除 migration

用户已明确要求删除旧 property `110` 数据，不做兼容。

migration 必须在单一事务内执行，并同时通过稳定 identity 与 legacy code 识别 property `110`：

- 主 property：`pbs_bid_group.property_definition_id = target.id` 或 `property_id = 110`。
- AND condition：`pbs_bid_condition.property_definition_id = target.id` 或 `property_id = 110`。
- favorites：稳定 `property_id = target.id` 或 legacy `property_code = 110`。

如果 property `110` 出现在任意 AND condition 中，必须删除该 condition 所属 `property_group_key` 在所有 Tier 中的完整 group，而不是只删除 condition。否则会把原来的 AND 规则静默改成另一条规则。

具体步骤：

1. 先锁定 `bid_type = 'Pairing' and property_code = 110` 的稳定 property definition id。
2. 建立待删除 group 集合：property `110` 为主 property 的 groups，加上 property `110` 作为 AND condition 时对应 `property_group_key` 在该 bid 下的全部 Tier groups。
3. 删除 property `110` 的 configured favorites。
4. 删除 property `110` 的 simple pairing favorites 与可能存在的 generic favorites。
5. 先按待删除 `group_id/property_group_key` 删除 `pbs_bid_pairing_occurrence`。
6. 删除待删除 groups 的全部 child conditions，而不是只删除 property `110` condition。
7. 删除待删除 groups。
8. 对仍保留的 Tier 重算 `total_groups`，不能留下派生计数漂移。
9. 删除不再拥有任何 group、day-off 或其他业务子对象的空 Tier；不能因为 property `110` group 被删就假设 Tier 为空。
10. 对仍保留的 bid 重算 `total_tiers`。
11. 仅删除不再拥有任何 Tier、day-off、group、favorite/configured favorite 或其他业务子对象的空 bid；如果仍有其他 property/业务数据，必须保留。
12. 更新 `pbs_bid_property` 的 actions、quantifiers、operators、validation metadata 和 tooltip。
13. migration 可重复执行；重复执行不能误删其他 property 数据。
14. migration 输出或验证查询应能确认 property `110` 旧记录已清零，同时其他 property 记录仍存在且派生计数正确。

不删除 `pbs_bid_property` 定义本身，因为 property code `110` 继续承载新语义。

## 11. 导入、收藏与算法导出

- NPBS/旧库导入若映射到 property `110`，必须生成新 payload；无法提供 per-day windows 的旧输入可映射为选中 weekday + 空时间窗口，但不得生成旧 payload。
- 如果旧输入只包含具体日期、Every 或 Avoid 且无法忠实表达，应拒绝该条映射并产生明确诊断，不静默改意图。
- 新 configured favorite 保存完整新 payload；由于 migration 已清除旧 favorite，不需要旧 favorite rehydrate。
- rule bid clone、format、serialize、summary 和算法导出支持 `work-day-preference`。
- API/Portal 层的 property `operator` 保持 `null`；数据库序列化层使用现有 JSON 通道：
  - `pbs_bid_group.operator = 'Json'`
  - `param_a = JSON.stringify(完整 work-day-preference payload)`
  - `param_b = null`
  - `param_c = null`
  - `preference_json = null`，避免同一业务 payload 存两份权威副本
- 数据库回读只有在 `operator = 'Json'` 且 `param_a` 能严格解析为合法 `work-day-preference` 时成功；禁止回退解析旧 `In/Between/date-or-dow-list/date-range` 参数。
- configured favorite、clone、Search criteria、summary 和算法导出全部经过同一 serializer/parser 或等价 fixture 验证。
- `PAIRING_SCORE` 必须对命中 Pairing 写入对应 Award Tier counter，不得写 Avoid counter。
- `pbs-server/src/services/algorithm-export/pairing-score-export.ts` 与 `live-server/src/services/algorithm-export/pairing-score-export.ts` 都是现存输出路径，本次必须同步支持；两条路径对相同 fixture 的匹配 Pairing 集合和 Award counters 必须一致。

## 12. 受影响范围

预计涉及：

- `packages/contracts`
- `pbs-portal/src/features/pairing`
- `pbs-server/src/routes`
- `pbs-server/src/services/pairing`
- `pbs-server/src/services/pairing-search`
- `pbs-server/src/services/lineholder`
- `pbs-server/src/services/crew-bid-import`
- `live-server/src/services/crew-bid-import`
- `pbs-server/src/services/algorithm-export/pairing-score-export.ts`
- `live-server/src/services/algorithm-export/pairing-score-export.ts`
- property seed 与新 migration
- Portal Vitest、Server Vitest、Playwright 和 QA 文档

实施前必须对实际修改的每个函数/方法执行 GitNexus upstream impact，并在 commit 前执行 `detect_changes()`。若发现 HIGH/CRITICAL blast radius，必须先向用户说明再修改。

## 13. 测试与验收

### 13.1 Portal 自动化

- 新建时无 Award/Avoid、无 Any/Every，Tier 和 weekday 均为空，footer disabled。
- 选择 Tier 和 weekday 后可保存，时间窗口可全部为空。
- 每个 weekday 保留自己的时间窗口。
- 取消 weekday 会清除其窗口。
- normal、open-ended、overnight 和 zero-width 窗口行为正确。
- `LIMIT TO EVENT DATE` toggle 默认关闭；specific date/date range 切换和隐藏值清理正确。
- 保存、编辑、favorite 和 Search Pairings 回显新 payload。
- 摘要不出现 Any/Every/Avoid。

### 13.2 Server 自动化

- 接受合法新 payload。
- 拒绝 avoid、quantifier、operator、旧 payload、重复 weekday、非法时间、相同起止时间和非法日期范围。
- 日期超出 bid period 时拒绝。
- Pairing Search 覆盖：
  - 当地日期与 UTC 日期不同。
  - weekday 独立时间窗口。
  - 空窗口、单边窗口、同日窗口、跨午夜窗口。
  - optional Event Date Scope。
  - Event Date、weekday 和 time 分别由不同 Duty 命中时，Pairing 不匹配。
  - 多日 Pairing 与日期范围有重叠，但没有同一 Duty 同时满足 Event Date/weekday/time 时不匹配。
  - 多 Duty 中一个命中即匹配。
  - 无 Duty 命中时不匹配。
- 当地时间边界覆盖 timezone 缺失/无效回退 UTC、DST 切换、当地午夜、同一 Duty 多 segment 的稳定选择以及无有效 `brief_start_utc`。
- `pbs-server` 与 `live-server` 两条 `PAIRING_SCORE` 对同一 fixture 产生完全相同的匹配集合，并且只产生 Award counter。
- import、clone、serialize、format 和 summary 覆盖新类型。

### 13.3 Migration 验证

- property `110` 旧 groups、conditions、occurrences、favorites 全部删除。
- property `110` 作为 AND condition 时，其跨 Tier 完整 property group 被删除。
- 同一 bid 中其他 property 不被删除。
- 同一 Tier 有其他 group、Tier 有 day-off、Bid 有其他业务子对象时均不误删。
- 仅空 tier/bid 被清理，保留记录的 `total_groups/total_tiers` 重算正确。
- property `110` catalog 更新为 Award-only、无 quantifier/operator。
- migration 重复执行安全。

### 13.4 Playwright

通过真实 Pairing 页面完成：

1. 打开 `Work Day Preference`。
2. 验证固定 Award 且无对应按钮。
3. 选择 Tier。
4. 选择至少两个 weekday，配置不同时间窗口。
5. 打开 `LIMIT TO EVENT DATE`，设置范围。
6. 保存并验证提交 payload。
7. 重新编辑并验证完整回显。
8. 在 Search Pairings 中使用同一条件并验证实际结果。

不得直接调用保存 API 代替 UI 操作。

### 13.5 交付命令

按最小范围到完整范围执行并报告：

- Portal/Server 相关 Vitest
- `npm run check:ui`
- `pbs-portal npm run build`
- `pbs-server npm run build`
- property `110` Playwright
- 变更跨模块时运行根目录 `npm run verify:pbs`

另需更新 `docs/test-cases/pbs/...` 下对应中文人工 QA 用例。

## 14. 验收标准

1. 用户配置 Work Day Preference 时看不到 Award/Avoid 和 Any/Every。
2. 保存结果始终为 Award，且后端无法写入 Avoid。
3. 至少选择一个 weekday；每个 weekday 拥有独立可选 Check-In window。
4. 默认表示 Any date；`LIMIT TO EVENT DATE` 可限制到一个日期或一个连续范围。
5. Pairing 中任一 Duty 的当地 Check-In 同时命中 Event Date、星期和该星期时间窗口即可匹配。
6. 所有旧 property `110` bids、occurrences 和 favorites 被安全删除，不保留兼容。
7. Pairing、Search Pairings、摘要、收藏、导入/导出和算法评分语义一致。
8. 自动化测试、Playwright、build、UI standard gate 与 QA 文档全部完成并报告结果。

## 15. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 当前工作树已有多项未提交修改，且本任务会触及共享 contract、Pairing dialog、Search Pairings、import/export 和集中测试文件；并行写入冲突风险高于收益。
- Suggested split: 由单一实现者按 contract → backend validation/serialization → search/scoring → frontend → migration → tests/QA 顺序推进。
- Write boundaries: 只修改 property `110` 新语义所必需文件，不处理其他 Pairing property 或现有脏工作树内容。
- Conflict risk: High，尤其是共享 contracts、Pairing dialog、summary、import mapper 和 E2E 文件。
- Execution gate: 用户审阅并明确批准本 spec 后才进入 implementation plan；实施前逐文件确认已有修改，禁止覆盖、回滚或提交用户的其他工作。
