# PBS Flight Number Preference 标准答案语义对齐设计

> 状态：已通过独立审查，待用户最终复核
>
> 日期：2026-07-16
>
> 范围：PBS Portal Pairing 条件 `propertyCode=116`
>
> 取代文档：`docs/superpowers/specs/2026-07-13-pbs-flight-number-preference-design.md`

## 1. 背景

当前 `Flight Number Preference` 已经使用专用 bid，但仍包含两组不符合最新目标的行为：

1. 弹窗显示 `MATCHING FLIGHTS`，要求填写 `Minimum / Maximum`。
2. `FLIGHT DATE` 使用 `Any date / Specific date / Date range`，其中单日模式只能选择一个日期。

标准答案项目 `/Users/lei/Codehub/Flair_PBS_Optimization_Report` 对该条件的定义更简单：用户只选择航班号；一个 Pairing 中只要存在一条实际飞行腿命中所选航班号及可选日期 scope，即视为匹配。标准答案不存在 matching-flight 数量条件，并且 Deadhead leg 不参与匹配。

用户已进一步确认，本项目的日期交互不直接复制标准答案的通用单日 scope，而是继续使用此前已验收的统一模式：可选的日期限制开关，开启后提供 `Specific Dates | Date Range`，其中 `Specific Dates` 支持多选。

项目尚未上线。用户明确要求清除 property `116` 旧数据，不保留旧 payload、旧 favorite 或旧数量语义的兼容逻辑。

## 2. 目标

本次改造需要同时实现以下目标：

- 从 UI、契约、校验、序列化、搜索和评分链路中完整删除 `MATCHING FLIGHTS`。
- 将日期区域改为可选的 `LIMIT TO FLIGHT DATE`。
- 日期限制开启后默认进入 `Specific Dates`，支持一个或多个日期，也支持 `Date Range`。
- 使用“存在任意一条匹配的实际飞行腿”作为唯一匹配语义。
- 排除 Deadhead legs。
- 清除所有 property `116` 旧 bid、favorite/template 数据；不做转换或兼容读取。
- Pairing 页面与 Search Pairings 继续复用同一个 editor、同一 payload 和同一搜索语义。

## 3. 范围

### 3.1 范围内

- `pbs-portal` Flight Number Preference editor、类型、默认值、摘要、clone、完整性判断与测试。
- `packages/contracts` property `116` 的共享 bid 类型和规则签名归一化。
- `pbs-server` 路由 schema、业务校验、lineholder JSON 序列化/反序列化/摘要/clone。
- `pbs-server` Pairing Search SQL 条件。
- `pbs-server` 当前 `pairing-score-export` 的 property `116` 正向命中集合与 Award/Avoid 评分输出。
- `live-server` 当前算法导出所需的 bid 解析、clone、序列化、摘要及 Pairing Search 条件。
- property catalog seed 与一个新的幂等 migration。
- Pairing、Search Pairings、favorite/edit rehydrate 的自动化回归。
- PBS 人工 QA 测试案例。

### 3.2 范围外

- 不新增第二个 Flight Number property；继续使用 `propertyCode=116`。
- 不修改航班号 autocomplete 接口或候选数据来源。
- 不修改其他 Pairing 条件的日期语义。
- 不为旧 `minimumRequired / maximumRequired` 数据提供转换器、fallback 或隐藏默认值。
- 不改变 tier counter、Award/Avoid 权重或 solver 的其他评分规则。
- 不把标准答案项目的 React 组件、CSS 或运行时依赖复制到本项目。

## 4. 已确认业务语义

| 项目 | 新规则 |
| --- | --- |
| 条件名称 | `Flight Number Preference` |
| Property code | `116` |
| Preference | `Award / Avoid`，默认 `Award` |
| Tiers | 必填，默认不选择任何 Tier |
| Flight numbers | 必须至少选择一个；trim、转大写、去重后保存 |
| Date limit | 可选，默认关闭 |
| Specific Dates | 支持一个或多个当前 bid period 内的日期 |
| Date Range | 闭区间，起止日期都必须位于当前 bid period，且 `from <= to` |
| Flight Date | `pairing_segment.flt_dt`，即匹配航段的运营日期 |
| Flight leg | 仅 `seg_assignment` 规范化后为 `FLT` 或 `FLY` 的有效航段 |
| Deadhead | `DHD` 不参与匹配 |
| Pairing match | 存在至少一个航班号及可选 Flight Date 同时命中的实际飞行腿 |
| Award / Avoid | 命中集合始终是满足正向 `exists` 的 Pairing；Search Pairings 的 Avoid 预览可展示补集，但算法评分只对正向命中集合写入 Avoid counter |
| Matching Flights | 完全删除，不保留 minimum/maximum |
| 旧数据 | 全量清除，不兼容、不转换 |

## 5. Portal UI 设计

### 5.1 字段顺序

配置弹窗继续遵循 `docs/modules/pbs/pairing-condition-ui-standard.md`，顺序为：

1. `TIERS`
2. `PREFERENCE`
3. `FLIGHT NUMBERS`
4. `LIMIT TO FLIGHT DATE`
5. Footer：`Cancel / Save Favorite / Add Bid / Update Bid`

原 `MATCHING FLIGHTS` section、Minimum 输入和 Maximum 输入全部删除。

### 5.2 Flight Numbers

- 继续复用现有 `TagListControl` 和 flight-number autocomplete。
- 至少选择一个号码后，条件本体才有效。
- 输出前 trim、转大写、去重；不保存空字符串。
- 不新增数量、Any/Every 或 operator 控件。

### 5.3 Limit to Flight Date

复用 `OptionalEventDateScopeEditor`，调用方传入：

- 可见 label：`LIMIT TO FLIGHT DATE`
- switch aria label：`LIMIT TO FLIGHT DATE`
- 日期 aria 基础文案：`flight date`

交互规则：

1. 初始关闭，payload 为 `dateScope: null`。
2. 开启后默认进入 `Specific Dates`，初始日期数组为空，因此保存按钮禁用。
3. `Specific Dates` 使用 `PbsDatePicker mode="multiple"`，允许选择一个或多个日期。
4. `Date Range` 使用 `PbsDatePicker mode="range"`，显示标准 `Start date · TO · End date`。
5. 从 Specific Dates 切换到 Date Range 时，输出空的 range，不保留日期数组。
6. 从 Date Range 切换到 Specific Dates 时，输出空数组，不保留 range。
7. 关闭 switch 时，清除所有日期 scope，输出 `null`。
8. 所有新选择日期由当前草稿的 `periodCode` 限制。

### 5.4 完整性与保存门槛

一条 Flight Number Preference 可保存，当且仅当：

- 至少选择一个 Tier；
- action 为允许的 `Award` 或 `Avoid`；
- 至少选择一个有效航班号；
- 日期限制关闭，或开启后日期 scope 完整有效。

不再要求任何数字输入。

## 6. 新数据契约

property `116` 唯一合法 bid 为：

```ts
type FlightNumberPreferenceBid = {
  type: "flight-number-preference";
  flightNumbers: string[];
  dateScope?:
    | { mode: "specific_dates"; dates: string[] }
    | { mode: "date_range"; from: string; to: string }
    | null;
};
```

合法示例：

```json
{
  "type": "flight-number-preference",
  "flightNumbers": ["0601", "0609"],
  "dateScope": {
    "mode": "specific_dates",
    "dates": ["2026-06-03", "2026-06-18"]
  }
}
```

以下字段和模式不再合法：

- `minimumRequired`
- `maximumRequired`
- `{ mode: "specific_date", date: "..." }`
- 旧 `tag-list`
- legacy quantifier / operator

### 6.1 归一化与规则身份

- `flightNumbers`：trim、转大写、去重，并使用稳定顺序生成规则签名。
- `specific_dates.dates`：trim、去重、按 ISO 日期升序排列。
- `date_range`：保留规范化后的 `from / to`。
- 相同航班号集合或日期集合因输入顺序不同，不得产生不同 favorite/signature 身份。
- 不允许归一化函数重新补入已删除的 matching-flight 字段。

### 6.2 Clone 与回显

- clone 必须深复制 `flightNumbers` 和 `specific_dates.dates`。
- Pairing editor、Search Pairings editor、favorite 及已保存 bid 使用同一个专用结构回显。
- 由于旧数据会被 migration 清除，运行时不需要识别旧结构。

## 7. 后端校验

路由 schema 与业务 validation 都必须执行以下检查：

1. `type` 必须是 `flight-number-preference`。
2. `flightNumbers` 必须为非空字符串数组；规范化后至少保留一个值。
3. `quantifier` 必须为 `null`。
4. bid 必须是 strict object；提交 `minimumRequired`、`maximumRequired` 或其他未知字段时直接拒绝。
5. `dateScope` 可为 `null / undefined`。
6. `specific_dates` 必须至少包含一个合法 ISO 日期。
7. `date_range` 必须包含合法 ISO `from / to`，且 `from <= to`。
8. 提供当前 `periodCode` 时，所有 Specific Dates 和 range 两端必须位于当前 bid period。

错误信息需明确指向 Flight Number Preference 的号码或 Flight Date scope，不再出现 matching-flight count 文案。

## 8. Pairing Search 与算法匹配

### 8.1 正向 SQL 条件

正向条件使用一个 `exists`，语义等价于：

```sql
exists (
  select 1
  from <live_schema>.pairing_segment s
  where s.pairing_id = p.id
    and s.is_deleted = 0
    and upper(btrim(coalesce(s.seg_assignment, ''))) in ('FLT', 'FLY')
    and upper(btrim(s.flt_num)) = any($flight_numbers::text[])
    and <optional flight-date clause>
)
```

日期 clause：

- `specific_dates`：`s.flt_dt = any($dates::date[])`
- `date_range`：`s.flt_dt between $from::date and $to::date`
- `null`：不添加日期条件

不得继续构造 `count(*)`、minimum 或 maximum clause。

### 8.2 Search Pairings 预览与算法评分的 Action 边界

必须区分两个消费者：

1. **Search Pairings 预览/过滤**：沿用现有用户意图语义。Award 返回正向 `exists`；Avoid 可通过现有 intent wrapper 对完整正向条件取反，从而展示“不满足该偏好”的 Pairing 补集。
2. **算法评分导出**：无论 action 是 Award 还是 Avoid，查询的 Pairing 集合都必须是满足正向 `exists` 的命中集合。随后由 `action_id` 决定把这些命中 Pairing 写入 Award counter 还是 Avoid counter。

算法导出不得把 Avoid action 先变成 SQL 补集、再写入 Avoid counter，否则会产生双重反转：真正包含所选航班的 Pairing 未被 Avoid，反而把不包含该航班的 Pairing 标记为 Avoid。

实现应为 property `116` 建立可复用的正向 clause 边界，并让预览层决定是否包裹 intent。算法导出调用正向匹配路径或在进入共享 preview builder 前仅对 property `116` 使用正向 action；不得借本任务顺带改变其他 property 的既有 Award/Avoid 行为。

### 8.3 pbs-server 与 live-server 算法导出

`pbs-server/src/services/algorithm-export/pairing-score-export*` 与 `live-server/src/services/algorithm-export/pairing-score-export*` 都在本次范围内。两条路径必须：

- 理解同一专用 bid；
- 对 Award 和 Avoid 都查询正向 `exists` 命中集合；
- 根据保存的 action 分别写入 Award/Avoid counter；
- 生成与正向 Pairing Search 条件等价的航班号、`FLT / FLY` 与 Flight Date 过滤；
- 不依赖旧数量字段，不把 Deadhead 航段计入命中。

## 9. 摘要与可观察结果

摘要应展示用户真正保存的条件：

- 无日期限制：航班号集合。
- Specific Dates：航班号集合 + 所选日期。
- Date Range：航班号集合 + 日期范围。

摘要不得继续显示 `minimum`, `maximum`, `matching flights` 或隐含的默认数量 1。

## 10. Seed 与破坏性 Migration

### 10.1 Catalog seed

`sql/seed/10-pbs-bid-property.sql` 中 property `116` 更新为：

- `award_or_avoid = ["award", "avoid"]`
- `any_or_every = null`
- `operator_options = null`
- `validation_json` 只描述 flight-number multi-select 和 `specific_dates / date_range`
- tooltip 只说明按航班号及可选运营日期 Award/Avoid Pairing
- 不再出现 `matchingFlights`

### 10.2 新 migration

新增 2026-07-16 的独立 migration，不修改已存在的 `2026-07-13-pbs-flight-number-preference.sql`。

新 migration 复用既有 property `116` 清理顺序并保持幂等：

1. 更新 `pbs_bid_property` 的 metadata、validation JSON 和 tooltip。
2. 删除 `pbs_bid_pairing_configured_favorite` 中 property `116` 记录。
3. 删除 `pbs_bid_pairing_favorite` 中 property `116` 记录。
4. 删除 `pbs_bid_property_favorite` 中 Pairing/property `116` 记录。
5. 找出包含 property `116` 的目标 bid/group，并先删除关联的 `pbs_bid_pairing_occurrence`。
6. 按 FK 顺序删除 `pbs_bid_condition` 和 `pbs_bid_group`。
7. 对受影响的 `pbs_bid_tier` 重算 `total_groups`。
8. 删除已经没有 group、且没有 day-off 引用的空 tier。
9. 对受影响的 `pbs_bid` 重算 `total_tiers`。
10. 只在 bid 已无 tier、day-off、group、occurrence 或任何 favorite 引用时删除空 `pbs_bid` 容器。
11. 输出 favorite、occurrence、condition、group、empty tier、empty bid 的删除数量 notice，便于受控执行后核验。

重复执行 migration 不得报错，也不得删除其他 property 的条件或 favorite。

## 11. 自动化测试

### 11.1 Contract / Portal Vitest

- 默认 bid 只有 `flightNumbers` 与 `dateScope`。
- UI 不存在 `MATCHING FLIGHTS`、Minimum 或 Maximum。
- 日期限制默认关闭。
- 开启后默认 Specific Dates，空数组时 invalid。
- 选择一个日期后 valid；选择多个日期后 payload 完整。
- Specific Dates 与 Date Range 相互切换时清除隐藏值。
- 关闭 switch 后 `dateScope: null`。
- rule signature 对航班号/日期集合顺序稳定。
- clone 深复制数组。
- summary 不出现 matching-flight 数量。

### 11.2 pbs-server

- 路由 schema 接受合法的新 payload。
- 拒绝空航班号、空 Specific Dates、倒置 range、越过 bid period 的日期。
- strict schema 拒绝 `minimumRequired / maximumRequired / specific_date`。
- JSON serialize / deserialize / clone / summary 保持新结构。
- Pairing Search 生成 `exists`，包含 `FLT / FLY`、航班号和正确日期 clause。
- SQL 不包含 `count(*)` 或数量比较。
- Search Pairings 的 Award/Avoid 预览方向正确。
- Deadhead 航段不命中。
- `pbs-server` pairing-score export 对 Award/Avoid 都只选择正向命中 Pairing，并分别写入 Award/Avoid counter。

### 11.3 live-server

- 新 payload 可被算法导出路径解析、clone、序列化和回显。
- 评分查询只选择至少一个实际飞行腿命中的 Pairing。
- Specific Dates 与 Date Range 均有覆盖。
- Deadhead-only 命中不产生评分记录。
- Award 与 Avoid 都使用相同正向命中集合，只改变输出 counter 方向。

### 11.4 Playwright

更新真实 PBS Portal 回归：

1. Pairing 页面打开 Flight Number Preference。
2. 断言不存在 `MATCHING FLIGHTS`、Minimum、Maximum。
3. 选择 Tier 和多个 Flight Numbers。
4. 开启 `LIMIT TO FLIGHT DATE`，选择两个 Specific Dates。
5. 切到 Date Range，验证隐藏值清理；再切回 Specific Dates 并重新选择。
6. 提交并断言请求 payload 不含数量字段。
7. Search Pairings 复用同一 editor，并正确回显新 payload。
8. favorite 保存与复用保持同一结构。

## 12. 人工 QA

更新或取代 `docs/test-cases/pbs/pairing/2026-07-13-flight-number-preference.md`，至少覆盖：

- 初始状态和 footer 禁用态。
- 航班号单选、多选、去重。
- 日期限制关闭、Specific Dates 多选、Date Range。
- 模式切换与 switch 关闭后的数据清理。
- Pairing 创建、编辑、favorite 复用。
- Search Pairings 创建和回显。
- Award / Avoid。
- Deadhead 不匹配。
- migration 后 property `116` 旧 bid/favorite 已清除，其他 property 不受影响。

## 13. 验证命令与完成标准

实施完成后至少运行：

- `pbs-portal` focused Vitest。
- `pbs-server` property `116` schema、validation、lineholder、search focused tests。
- `pbs-server` pairing-score algorithm-export focused tests。
- `live-server` lineholder、search、pairing-score algorithm-export focused tests。
- property `116` Playwright 主流程。
- `pbs-portal` TypeScript、lint、production build。
- `pbs-server` 与 `live-server` TypeScript。
- `npm run check:ui`，硬违规必须为 0。
- `git diff --check`。
- 受控 schema 或测试数据库上的 migration 验证；业务数据核查只能使用项目规定的远端权威 PostgreSQL。

完成标准：

- Portal 中完全不存在 Matching Flights UI。
- 新请求和持久化 payload 完全不存在 matching-flight 字段。
- Flight Date 与已验收条件一致，支持多日期和范围。
- Pairing Search 与算法评分均使用实际飞行腿 `exists` 语义。
- property `116` 旧数据已清除且无兼容分支。
- 自动化与人工 QA 文档同步更新。

## 14. 风险与控制

### 14.1 共享契约影响面

Flight Number Preference bid 被 Portal、pbs-server、live-server、favorite、Search Pairings 和算法导出共同消费。只改 UI 会留下隐藏数量语义，因此必须在同一实施中完成端到端收口。

控制措施：修改前对共享 clone、parser、serializer、formatter 和 search builder 执行 GitNexus impact；提交前执行 `detect_changes --scope staged`。

### 14.2 语义扩大

删除 minimum/maximum 后，任意一个匹配航段即可命中。若保留旧数据，会静默扩大旧规则影响范围。

控制措施：按用户确认执行破坏性清理，不转换旧 bid/favorite。

### 14.3 Deadhead 误计入

当前旧 Flight Number SQL 只按 `flt_num` 计数，没有限制 `seg_assignment`，可能把 DHD 航段计入。

控制措施：新 SQL 明确仅接受规范化后的 `FLT / FLY`，并增加 Deadhead 回归测试。

### 14.4 共享工作区冲突

相邻 Pairing 条件可能并行修改 catalog、contract、validation、search builder 和 E2E 文件。

控制措施：实施前重新检查 `git status`，逐 hunk 隔离本任务，禁止回退或提交其他任务改动。

### 14.5 Award/Avoid 双重反转

当前 pairing-score export 复用 action-aware preview condition，同时又根据 `action_id` 写入 Award/Avoid counter。若 property `116` 的 Avoid 直接使用预览补集，会把错误的 Pairing 集合写入 Avoid counter。

控制措施：正向命中 clause 与预览 intent wrapper 分层；pbs-server/live-server 的 property `116` 算法导出测试必须同时断言命中 Pairing 集合和 counter 方向。

## 15. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: Portal、共享 contract、server validation、SQL、migration 和测试围绕同一 property `116` 契约高度耦合；多个 agent 会频繁修改相同文件。
- Suggested split: 单一实现线顺序完成；独立 reviewer 只做 spec / code review，不写实现文件。
- Write boundaries: 实现只触达 Flight Number Preference 相关代码、property `116` seed/migration、自动化和 QA 文档。
- Conflict risk: 高；共享文件与相邻 Pairing 条件重叠。
- Execution gate: 本 spec 经独立审查并由用户明确批准实施后，才允许修改非 spec 文件。

## 16. 已确认决定

- 用户确认删除 `MATCHING FLIGHTS`。
- 用户确认日期改为 `LIMIT TO FLIGHT DATE`。
- 用户确认日期开启后使用 `Specific Dates | Date Range`，Specific Dates 支持多选。
- 用户确认项目未上线。
- 用户确认清除 property `116` 旧数据，不兼容旧 payload。
- 用户确认本轮先写 spec，尚未授权实施。
