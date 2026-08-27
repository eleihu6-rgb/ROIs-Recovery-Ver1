# PBS Airport Preference：Jen 对齐重设计（草案）

## 1. 状态与决策

- 状态：待用户 review；**未授权实现**。
- 原型参考：`.superpowers/brainstorm/23895-1783755069/airport-preference-v1-jen-aligned.html`。
- 沿用 property：`propertyCode = 168`、`Airport Preference`，不新增第二个 Airport Preference 入口。
- 已确认：清除旧 `168` 的已保存数据、favorites 与草稿规则，不做 payload 兼容、自动转换或旧 UI 回退。
- 已确认：项目实现以已完成的 Prefer Off、Long Stretch Off / Compressed Flying、Pairing Preference 的弹窗、日期、Tier、数量输入行为为准；HTML 只作为业务原型，不直接搬入产品。

## 2. 背景与问题

Jen 在 `Bidding Options V1(2).xlsx` 中对 Airport Preference 的描述是：

- Crew 可 award 或 avoid 指定机场/城市的 landing、layover 或两者。
- 输入包括 airport/city、landing/layover/both、date、date range、minimum required、maximum required、layover duration。
- 仅选择 layover 时，才提供 layover duration。
- 目标是把 landing airport 与 layover airport 合成一个入口。

项目当前已有 `168`，但实现来自旧 spec `2026-07-08-pbs-airport-preference-design.md`：

- 只有 `Landing` / `Layover` 二选一；
- Date、Matching Count、Layover Duration 是折叠卡片；
- `matchingCount` 表达的是一条 pairing 内符合条件的 event/segment 数，不是要 award 的 pairing 数量；
- 当前 airport options 只返回三字机场码，未提供城市维度和名称；
- 这与现在已确认的用户语义和 UI 标准不一致。

因此本次是 **168 的完整替换与增强**，不是纯样式调整。

## 3. 方案比较

### A. 只重画旧控件

保留 `matchingCount`、旧 event 类型和折叠卡片，只换成新视觉。

- 优点：改动最小。
- 缺点：UI 中的 `Fulfilment` 会继续表达错误业务含义，无法支持 airport/city 和 `Landing or Layover`。

不采用。

### B. 新增第二个 Airport Preference property

保留旧 `168`，另加新 property / payload。

- 优点：旧数据完全不动。
- 缺点：两个入口会让用户无法判断该选哪一个，也违背 Jen 的合并目标。

不采用。

### 推荐：C. 原 property 168 完整替换

清除旧 `168` 数据，将 `168` 的 payload、前端 editor、校验、搜索 preview 和摘要一并切换到新语义。

- 优点：一个入口、一套语义，后续不会保留旧交互分叉。
- 代价：需要受控数据清理与前后端 contract 同步。

## 4. 用户界面与交互契约

### 4.1 弹窗外壳

- 使用 `PbsDialogFrame`，不修改其共享外壳、遮罩、关闭或滚动实现。
- 标题：`Configure Airport Preference`。
- 复用稳定 header / footer，body 可滚动；日期和机场选择下拉均以 portal/fixed 浮层打开，绝不作为 body 内联内容撑开、裁切或推移 footer。
- 复用已完成的 `TierToggleGroup`、`AwardAvoidSegmentedControl`、`PbsDatePicker`、`PbsInputNumber`；不创建原型中的独立副本。

### 4.2 字段顺序与默认状态

1. `TIERS`
   - 新建默认 T1；编辑时回显保存值。
   - 可取消最后一个 Tier；空选显示 `Required`，`SAVE FAVORITE` 和 `ADD BID` disabled，不自动回选、不显示 toast。

2. `PREFERENCE`
   - `Award` / `Avoid`，默认 Award。

3. `AIRPORT EVENT`
   - 初始不选，必须显式选择。
   - 三个互斥按钮：`Landing`、`Layover`、`Landing or Layover`。
   - 禁止使用 `Both`：它会被误读为“同一条 pairing 同时包含 landing 与 layover”。
   - `Landing or Layover` 的语义是两个 event 的并集（OR），不是 AND。

4. `AIRPORTS`
   - 未选择 event 前 disabled。
   - 允许多选 airport 或 city，显示 chip；下拉只展示当前 crew base 和 bid period 内真正可用的选项。
   - 下拉通过 portal/fixed 定位，点击外部关闭，滚动和视口变化时重新定位。
   - 切换 event 后只保留仍适用于新 event 的选择；其余选择从表单移除。提交仍需至少一个选项。

5. `LIMIT TO EVENT DATE`
   - switch 默认关闭；关闭时不显示日期，也不写入旧缓存日期。
   - 开启后只提供 Jen 所需的 `Specific Dates` 与 `Date Range`，不提供旧版 `Day`。
   - 日期选择复用 `PbsDatePicker`：multiple / range、完成 range 后关闭、未完成 range 保持中性并禁用提交；不提前显示红字或伪造匹配数。

6. `MINIMUM LAYOVER DURATION`
   - 仅在 `Layover` 或 `Landing or Layover` 时显示；默认关闭。
   - 开启后输入 `HH:MM` 的最小 duration；这是 duration，不使用浏览器 `type=time`，因此允许超过 23 小时。
   - `Landing or Layover` 下它只约束 layover 分支；landing 分支不受该字段影响。界面直接写明 `Applies to layovers only`，不靠小字猜测。

7. `FULFILMENT`
   - 机场选定后显示，沿用 Prefer Off 的两段模式，而不是默认露出空数字框：
     - `All matching pairings`（默认）：不显示数字输入；表示不限制本 condition 可 award/avoid 的 pairing 数量。
     - `Flexible quantity`：显示相邻的 `Minimum Required` / `Maximum Required`，使用 `PbsInputNumber`。
   - 切换至 Flexible 时默认 `1 / 1`，用户不会进入“空字段但按钮被禁用”的状态。
   - Flexible 中必须同时存在 min 和 max，且 `min <= max`；控件防止反向值和负数。
   - 此处数值计的是最终符合 airport condition 的 **pairing 条数**，不是一条 pairing 内命中的 landing / layover 次数。
   - 不展示“3 matching pairings”“available pool”等前端临时统计；用户填写机场时不触发全量 pairing 查询来制造无业务意义的数字。

### 4.3 示例语义

用户选择：T1、Award、`Landing or Layover`、YYZ 与 YTO、6 月 19 日 / 21 日、minimum layover duration 12:00、Flexible 1–4。

含义为：

> 在 T1，优先 award 1–4 条 pairing；这些 pairing 在 6 月 19 日或 21 日，于 YYZ 或 YTO 落地，或在这些地点 layover。若由 layover 满足条件，layover 至少 12 小时。

一个 airport/city chip 是 OR 集合：满足任一已选项即可；不是每条 pairing 必须包含全部 chip。

## 5. 新 payload 与服务端语义

新 `airport-preference` payload 替换旧的 `matchingCount`、operator 型 duration 和 `day` date mode：

```ts
type AirportPreferenceEvent = "landing" | "layover" | "landing_or_layover";

type AirportPreferenceLocation = {
  code: string;
  kind: "airport" | "city";
};

type AirportPreferenceBid = {
  type: "airport-preference";
  event: AirportPreferenceEvent;
  locations: AirportPreferenceLocation[];
  dateScope?:
    | { mode: "specific_dates"; dates: string[] }
    | { mode: "date_range"; from: string; to: string }
    | null;
  minimumLayoverDuration?: string | null; // HH:MM
  minimumRequired?: number | null;
  maximumRequired?: number | null;
};
```

规则：

- `locations` 至少一个，`code` 标准化为大写、去重；airport 与 city 类型不可混淆。
- `dateScope` 缺失 / null 表示整个 bid month；range 必须完整且 `from <= to`。
- `minimumLayoverDuration` 仅 event 为 `layover` 或 `landing_or_layover` 时可存在，格式必须合法。
- `All matching pairings` 序列化为 `minimumRequired = null`、`maximumRequired = null`。
- `Flexible quantity` 需要两个正整数且 `minimumRequired <= maximumRequired`。
- 对 `landing_or_layover`，matching predicate 为 landing predicate OR layover predicate；duration 只加入 layover predicate。
- Date scope 的事件日期使用**事件发生机场的本地日历日**：landing 取落地事件时间在落地机场 `airport.zone_id` 的 local date；layover 取 layover 开始（前一 duty end / layover event）在 layover 机场 `airport.zone_id` 的 local date。不得用 pairing origin date、actor base date 或裸 `UTC::date` 代替。实现时抽取 / 复用明确的 SQL helper，两个分支共用同一 timezone conversion 规则。
- 可执行 predicate 等价于：`EXISTS pairing WHERE (landingLocation AND landingEventDate in scope) OR (layoverLocation AND layoverEventDate in scope AND (minimumLayoverDuration is null OR layoverDuration >= minimumLayoverDuration))`。换言之，只有用户开启 duration switch 时才追加 duration 子句；默认关闭不能排除任何 layover。Fulfilment 只作用于最终去重后的 pairing 数量，绝不进入 event-row / segment 聚合。

### Airport / city 数据源

现有 `airport` 主数据已有 airport code、airport name、city code。新 airport options contract 应由当前 base + bid period 中真实出现的 event 反查可用 airport，再 join airport master：

```ts
type PbsAirportPreferenceOption = {
  code: string;
  kind: "airport" | "city";
  label: string;
  events: AirportPreferenceEvent[];
};
```

- Airport option 例如 `YYZ · <airport_name>`，名称只取 live `airport.airport_name`。
- City option 首版只展示权威的三字 city code，例如 `YTO`；当前 `airport` 主数据没有 city name，不得显示原型中的 `Toronto` 等硬编码或推测名称。未来接入权威城市字典后，才可在不改变 payload 的前提下丰富 label。
- 选择 city 后，后端用 `airport.city = cityCode` 展开机场集合；选择 airport 时用 `airport.airport = airportCode` 精确匹配。options query、保存校验与 search predicate 均按 actor base、bid period、event 可用性验证，不能只信任前端 chip。
- 不硬编码 YYZ / YTO / 城市名称；没有当前 pairing 支持的 airport/city 不应出现在列表里。
- 继续按 actor base、bid month、live schema 做服务端 scoped query 与缓存；不把完整 pairing pool 返回前端。

## 6. 数据清理与无兼容策略

用户已明确：旧数据清除，不做兼容。

实施 migration 必须在一个事务中，沿用 `2026-07-08-pbs-airport-preference-property.sql` 的受控清理模式：

1. 先以 `pbs_bid_property.property_code = 168` 对应的 stable `id` 识别目标 property；同时捕获历史 payload 中的 legacy `property_id = 168`。
2. 若该 property 是主 group，或位于任一 `pbs_bid_condition` 的 AND 链中，均以其 parent `property_group_key` 为删除单位：删除该 key 的所有 tier group rows 与所有关联 conditions，不能只删附加 condition 后扩大原规则语义。
3. 分别删除命中的 Pairing configured favorites 与 simple favorites；不删除 `pbs_bid_property` metadata 定义本身。
4. 仅删除因上述操作而不再包含任何 group / property 的 bid、draft 容器；不得影响同一 bid 中其他 property。
5. 更新 / upsert `pbs_bid_property` 的 `168` metadata，使其声明新 event、date scope、location 与 fulfilment 能力。
6. migration 前后输出各表删除数量、受影响 `property_group_key` 数量与受影响 bid 数量，作为部署回执。
7. 不保留 `matchingCount`、`day`、旧 event parser、旧 accordion editor 或旧 summary 的 runtime fallback。

该操作是有意破坏性变更；发布说明与 QA 用例必须明确“已有 Airport Preference 需要重新创建”。

## 7. 实现边界

### 前端

- 替换 `pairing-airport-preference-control.tsx` 的旧 accordion 实现为 feature-local `AirportPreferenceEditor`；不修改无关 Pairing property editor。
- `PairingPropertyConfigDialog` 对 `propertyCode=168` 走该 editor，并复用 Pairing Preference 的专用 dialog 分支，而非旧泛型 `PairingBidControl` 排版。
- 扩展现有 `AirportMultiSelect`，使其使用新 option model、city/airport chips 和 event 过滤；保留其已经正确的 portal、outside-click、重定位能力。
- 更新 catalog clone、draft mapper、existing summary、favorite restore、i18n / aria 文案和相关 test fixture。

### 合同与后端

- 更新 `packages/contracts/pbs-pairing-bids.*`、`packages/contracts/pbs-search-pairings.*` 和 Portal / Server 的同构 bid type。
- 更新 route schema、normalization、clone、serialize / deserialize、payload validation 与 existing summary formatter。
- 改造 `getAirportOptions`：返回带 name/city/event 可用性的受控 option model。
- 更新 pairing search preview：支持 landing、layover、landing-or-layover 和 city expansion；移除旧 `matchingCount` 的 segment 聚合语义。
- 不新增产品算法协议；新 JSON bid 仍通过既有 Pairing bid 的统一持久化 / export 通道传递。

### 不在范围内

- 不修改 `PbsDialogFrame`、`PbsDatePicker`、`PbsInputNumber` 的共享基础行为。
- 不新增第二个 Airport Preference property 或旧 payload fallback。
- 不为“可能匹配多少 pairing”新增前端统计 / polling。
- 不改变其他 Pairing property 的 event、date 或 quantity 语义。

## 8. 验收标准

1. Pairing property list 仍只有一个 `Airport Preference (168)` 入口。
2. 打开弹窗后，视觉、footer、日期浮层、Tier、Award/Avoid、数字框与已完成的三个 preference 条件一致；无 card 套 card、无 body 内联浮层。
3. 用户能选择 Landing、Layover 或 Landing or Layover；第三项明确为 OR。
4. 用户能选择当前 base / bid period 真实支持的 airport 或 city；切换 event 后不会保留无效地点。
5. Date switch 关闭不写日期；开启后 Specific Dates / Date Range 未完成时不提交且不显示虚假匹配数。
6. Layover duration 不会在 Landing 下出现；在 Landing or Layover 下明确只应用于 layover。
7. All matching 默认可提交，不显示空 min/max；Flexible 默认 1/1 并防止 min 超过 max。
8. 不展示 pool count、matching pairing count 或其他没有直接业务意义的数字。
9. 旧 `168` bid / favorite / group 被 migration 清除；新版本不解析旧 payload。
10. Existing row / favorite summary 能准确表达 event、locations、date scope、duration 和 fulfilment。

## 9. 测试与验证计划

- Portal RTL：初始防呆、Tier 清空、event 切换、airport/city multi-select portal、日期 toggle / incomplete range、duration gating、All/Flexible、min/max relationship、favorite restore 与 existing summary。
- Portal Playwright：真实 Pairing 页面新增 Airport Preference；选择项、浮层定位、关闭、提交与刷新后回显。
- Server unit / integration：payload schema、城市展开、Landing or Layover OR、duration 仅 layover、日期范围、quantity relation、airport options actor/base/period scoping、无旧 `matchingCount` predicate。
- Migration integration：只清除 `168` 及其关联空容器，不影响混合 bid 的其他 property。
- QA 文档：`docs/test-cases/pbs/condition-properties/` 新增 Airport Preference 手工用例，包含破坏性旧数据清理说明。
- 前端样式改动后：`npm run check:ui`；完整交付再执行对应 Portal / Server 测试、`npm run lint`、`npm run build` 与必要的 `npm run verify:pbs`。

## 10. Multi-Agent Parallelism Assessment

- Recommendation: No。
- Rationale: payload 语义、旧数据清理、Portal editor、server validation 与 search predicate 是一条强耦合链；并行写会显著增加 contract 不一致风险。
- Suggested split: 不拆分实现；先完成 contract / cleanup，再串行完成 frontend、backend 与测试。
- Write boundaries: `packages/contracts`、`pbs-portal/src/features/pairing`、`pbs-server/src/services/pairing*`、`pbs-server/src/services/pairing-search`、`sql/migration`、相关测试和 QA 文档。
- Conflict risk: High（同一 payload 会被多处 clone / serialize / validate / format）。
- Execution gate: 用户 review 本 spec 并明确批准后，才进入 implementation plan 与代码修改。
