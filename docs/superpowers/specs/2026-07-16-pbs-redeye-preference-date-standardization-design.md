# PBS Redeye Preference 日期统一与默认 Avoid 设计

> 状态：已通过独立审查，待用户最终复核
>
> 日期：2026-07-16
>
> 范围：PBS Portal Pairing 条件 `propertyCode=117`
>
> 取代文档：`docs/superpowers/specs/2026-07-13-pbs-redeye-preference-design.md`

## 1. 背景

当前 `Redeye Preference` 已经支持 `Award / Avoid` 和日期限制，但仍使用一套较早的日期交互：

- 新增条件默认选择 `Award`。
- 日期区域固定显示为 `DATE`。
- 日期模式为 `Any date / Specific date / Date range`。
- `Specific date` 只能选择一个日期。
- 运行时仍兼容旧 `{ type: "flag" }` bid。

此前已验收的 `Airport Preference`、`Pairing Check-In / Check-Out Time`、`Flight Legs per Duty`、`Pairing Length` 与 `Flight Number Preference` 已形成统一的可选日期限制模式：日期限制默认关闭；开启后选择 `Specific Dates` 多选或 `Date Range`。

用户确认 `Redeye Preference` 也采用该模式，并明确：

- 仍保留 `Award / Avoid` 两个选项；
- 仅新增条件的默认 action 改为 `Avoid`；
- 编辑已有条件时必须尊重已保存的 action；
- 项目尚未上线，本次不兼容旧 property `117` 数据。

## 2. 目标

- 将日期区域统一为可选的 `LIMIT TO FLIGHT DATE`。
- 日期限制开启后支持 `Specific Dates` 多选和 `Date Range`。
- 新增 Redeye Preference 时默认选中 `Avoid`，同时保留用户切换到 `Award` 的能力。
- 保留并只读展示公司的 Redeye 定义 `03:30-05:30 local time`。
- 统一 Portal、共享 contract、服务端校验、lineholder 序列化、Pairing Search 与算法评分的数据结构。
- 删除旧 `specific_date` 与 legacy `flag` 兼容路径。
- 通过新的幂等 migration 清理 property `117` 的旧 bid 与 favorite 数据。
- Pairing 页面与 Search Pairings 继续复用同一个 editor 和同一 payload。

## 3. 范围

### 3.1 范围内

- `packages/contracts` property `117` 的类型、默认 bid、默认 action、归一化及规则签名。
- `pbs-portal` editor、类型、默认草稿、完整性判断、摘要、clone、回显和测试。
- `pbs-server` route schema、业务校验、lineholder parse/serialize/clone/format。
- `pbs-server` Pairing Search 日期条件及算法评分导出。
- `live-server` 对应的 lineholder bid 读取、clone、serialize、format 与搜索条件链路。
- property catalog seed 和新的破坏性、幂等 migration。
- Portal Vitest、server focused tests、真实 UI Playwright 与 PBS 人工 QA 文档。

### 3.2 范围外

- 不允许用户在 bid 弹窗中修改 Redeye 时间窗口。
- 不新增 Redeye definition 管理页面或新数据库业务表。
- 不修改 `03:30-05:30 local time` 的业务定义。
- 不修改其他疲劳法规、Gantt Redeye 标签或 legality rule。
- 不新增 Any/Every、operator 或 matching-count 控件。
- 不借本任务重构所有 Pairing condition 的通用日期类型。

## 4. 已确认业务规则

| 项目 | 新规则 |
| --- | --- |
| 条件名称 | `Redeye Preference` |
| Property code | `117` |
| Tiers | 必填；新增时默认不选择任何 Tier |
| Preference options | 保留 `Award / Avoid` |
| 新增默认 Preference | `Avoid` |
| 编辑已有条件 | 使用已保存 action，不用默认值覆盖 |
| Redeye definition | 只读显示 `03:30-05:30 local time` |
| Date limit | 可选；新增时默认关闭 |
| Date label | `LIMIT TO FLIGHT DATE` |
| Specific Dates | 支持一个或多个当前 bid period 内日期 |
| Date Range | 闭区间，`from <= to`，两端位于当前 bid period |
| Flight Date | Redeye window 所属的出发机场本地日期 `redeye_windows.redeye_date` |
| Positive match | Pairing 至少有一个有效航段的 operating interval 与该本地日期的 Redeye window 重叠 |
| Search Award | 返回正向命中集合 |
| Search Avoid | 返回正向命中集合的补集 |
| Algorithm Award/Avoid | 两种 action 都查询正向命中集合，再写入相应 counter |
| 旧数据 | 清除 property `117` 旧 bid/favorite；不兼容、不转换 |

## 5. Portal UI 设计

### 5.1 弹窗顺序

1. `TIERS`
2. `PREFERENCE`
3. `REDEYE`
4. `LIMIT TO FLIGHT DATE`
5. Footer：`Cancel / Save Favorite / Add Bid / Update Bid`

弹窗继续使用既有 `PbsDialogFrame`、`TierToggleGroup`、`PreferenceConditionSection`、`AwardAvoidSegmentedControl` 和 `PairingPropertyDialogFooter`。

### 5.2 Preference 默认值

- property catalog 为 `117` 明确声明 `defaultAction: "avoid"`。
- 打开“新增”弹窗时，如果草稿没有 action，则初始化为 `avoid`。
- `Award` 与 `Avoid` 仍使用同一个 segmented state 驱动选中样式、`aria-pressed` 和保存 payload。
- 打开已保存 bid、favorite 或 Search Pairings 条件时，优先使用已有 action；只有真正的新草稿才使用 `defaultAction`。
- 不在 editor 内使用 effect 强制覆盖 action，避免编辑时把已有 `Award` 改成 `Avoid`。

### 5.3 Redeye definition

- 继续显示 `03:30-05:30 local time`，保持只读。
- definition 继续从共享 property contract/config 获取，不在 editor 新增另一份业务常量。
- 不增加可编辑时间输入、解释段落或额外开关。

### 5.4 Limit to Flight Date

复用已验收的 `OptionalEventDateScopeEditor`：

- label：`LIMIT TO FLIGHT DATE`
- switch aria label：`LIMIT TO FLIGHT DATE`
- 日期 aria 基础文案：`flight date`
- `periodCode`：当前 bid period

交互规则：

1. 新增时开关关闭，`dateScope: null`。
2. 开启后默认进入 `Specific Dates`，日期数组初始为空，因此条件暂时无效。
3. `Specific Dates` 使用 `PbsDatePicker mode="multiple"`，允许选择一个或多个日期。
4. `Date Range` 使用 `PbsDatePicker mode="range"` 和一个标准范围入口。
5. Specific Dates 切换到 Date Range 时清除 dates，输出空 range。
6. Date Range 切换到 Specific Dates 时清除 from/to，输出空 dates。
7. 关闭开关后清除隐藏的日期值并输出 `dateScope: null`。
8. 已保存日期必须正确回显；新选择只能落在当前 bid period。

### 5.5 保存门槛

条件可保存，当且仅当：

- 至少选择一个 Tier；
- action 是 `award` 或 `avoid`；
- 日期限制关闭，或开启后日期 scope 完整有效。

Redeye definition 是固定条件，不要求额外输入。

## 6. 新数据契约

property `117` 唯一合法 bid：

```ts
type RedeyePreferenceBid = {
  type: "redeye-preference";
  dateScope?:
    | { mode: "specific_dates"; dates: string[] }
    | { mode: "date_range"; from: string; to: string }
    | null;
};
```

Specific Dates 示例：

```json
{
  "type": "redeye-preference",
  "dateScope": {
    "mode": "specific_dates",
    "dates": ["2026-06-03", "2026-06-18"]
  }
}
```

无日期限制示例：

```json
{
  "type": "redeye-preference",
  "dateScope": null
}
```

以下结构不再合法：

- `{ type: "flag" }`
- `{ mode: "specific_date", date: "..." }`
- quantifier 或 operator
- 未识别的额外字段

### 6.1 归一化、clone 与规则身份

- `specific_dates.dates`：trim、去重、按 ISO 日期升序排列。
- `date_range`：规范化 `from / to`，不进行隐式交换。
- clone 必须深复制 `specific_dates.dates`。
- 相同日期集合不能因用户选择顺序不同而产生不同 favorite/signature 身份。
- Pairing、Search Pairings、favorite、lineholder rehydrate 使用同一专用 bid。
- 运行时不得把旧 `specific_date` 自动升级为单元素数组；旧记录由 migration 清除。

## 7. 后端校验

route schema 与业务 validation 必须同时检查：

1. property `117` 的 bid type 必须为 `redeye-preference`。
2. bid 使用 strict object；拒绝未知字段。
3. `dateScope` 可以是 `null / undefined`。
4. `specific_dates.dates` 至少包含一个合法 ISO 日期，规范化后仍不能为空。
5. `date_range` 必须包含合法 ISO `from / to`，且 `from <= to`。
6. 有当前 `periodCode` 时，所有 dates 和 range 两端都必须位于当前 bid period。
7. action 只能是 catalog 支持的 `award / avoid`。
8. quantifier 必须为 `null`。
9. legacy `flag` 与 `specific_date` 必须直接校验失败。

错误信息应明确指向 `Redeye Preference Flight Date`，不再使用单数 `Specific date` 的旧合同文案。

## 8. Pairing Search 与算法语义

### 8.1 Redeye 正向命中

以 `pbs-server` 现有 Redeye interval-overlap 语义作为统一标准：

- 从有效 `pairing_segment` 读取 scheduled UTC interval；
- 通过出发机场 timezone 转为本地日期；
- 为可能涉及的每个本地日期生成 `03:30-05:30` Redeye window；
- 航段 interval 与该 window 有重叠即命中；
- 日期限制匹配的是 window 对应的 `redeye_windows.redeye_date`。

`live-server` 当前仍使用 legacy `{ type: "flag" }`，并以“到达机场本地日期晚于出发机场本地日期”判断跨夜。本次必须删除该旧判断，改为与 `pbs-server` 完全相同的 `03:30-05:30` interval-overlap、专用 bid 和日期 scope；“保留现有语义”仅指保留 `pbs-server` 的现行标准，不得保留 live-server 的跨自然日语义。

日期 clause：

- `specific_dates`：`redeye_windows.redeye_date = any($dates::date[])`
- `date_range`：`redeye_windows.redeye_date between $from::date and $to::date`
- `null`：不添加日期条件

### 8.2 Search Pairings action

- Award：使用正向 `exists` 条件。
- Avoid：由现有 intent wrapper 对完整正向条件取反，显示不包含目标 Redeye 条件的 Pairing。
- Pairing 页面与 Search Pairings 必须共享相同的日期 payload 和正向 builder。

### 8.3 算法评分 action

算法评分导出必须避免双重取反：

- Award 与 Avoid 都查询满足 Redeye 正向条件的 Pairing 集合。
- 再依据保存的 action，把命中集合写入 Award counter 或 Avoid counter。
- property `117` 的新增默认 action 由 catalog 的 `defaultAction: "avoid"` 提供；显式保存的 action 始终优先。
- 不借本任务改变其他 property 的 action fallback。

`pbs-server` 和仍消费该 bid 的 `live-server` 路径必须保持一致。

## 9. 摘要与回显

摘要必须反映真实 scope：

- 无限制：`Redeye`
- Specific Dates：`Redeye · Jun 3, Jun 18`
- Date Range：`Redeye · Jun 3-Jun 18`

外层 bid/group 继续展示 Award 或 Avoid。编辑回显必须保持已保存 action、tiers 和日期，不得重新套用新增默认值。

## 10. Catalog、Seed 与 Migration

### 10.1 Contract/catalog

property `117`：

- `defaultAction: "avoid"`
- `defaultBid: { type: "redeye-preference", dateScope: null }`
- `supportedActions: ["award", "avoid"]`
- 不支持 quantifier/operator

### 10.2 SQL seed

`sql/seed/10-pbs-bid-property.sql` 更新 property `117`：

- `award_or_avoid = ["award", "avoid"]`
- validation 中日期模式改为 `specific_dates / date_range`
- 保留 Redeye definition `03:30-05:30 local time`
- tooltip 说明按可选 Flight Date Award/Avoid Redeye Pairings

数据库 property 表当前没有 `default_action` 字段；默认 Avoid 属于共享 contract 行为，不能伪造数据库列。若服务端 catalog API 暴露 `defaultAction`，应继续由共享 contract 合并提供。

### 10.3 新破坏性 migration

新增独立的 2026-07-16 migration，不修改历史 migration。按 FK 安全顺序幂等执行：

1. 更新 property `117` metadata、validation JSON 与 tooltip。
2. 删除三类 property `117` favorite/template 记录。
3. 找出包含 property `117` 的 bid group 和受影响 bid/tier。
4. 先删除关联 `pbs_bid_pairing_occurrence`。
5. 删除 property `117` condition 及其目标 group。
6. 重算受影响 tier 的 `total_groups`。
7. 删除无 group 且没有 day-off 引用的空 tier。
8. 重算受影响 bid 的 `total_tiers`。
9. 仅在无任何 tier/group/occurrence/day-off/favorite 引用时删除空 bid 容器。

迁移不尝试把旧单日期转成多日期，也不保留 legacy flag。

迁移验证必须在受控 PBS schema 完成：

- 连续执行 migration 两次，两次均成功；
- 第二次执行不产生额外删除或错误；
- 验证只清理 property `117`，其他 property 的 bid/favorite 数量不变；
- 核对 occurrence、condition、group、tier 与 bid 的剩余引用和汇总计数一致。

## 11. 测试与验证

### 11.1 Portal focused tests

- 新增弹窗默认 action 为 Avoid，Award 仍可选择。
- 编辑已保存 Award 时保持 Award。
- 日期限制默认关闭。
- 开启后默认 Specific Dates，空数组时无效。
- multiple picker 选择、取消和多日期回显。
- Specific Dates / Date Range 切换清理隐藏字段。
- 关闭 switch 输出 `dateScope: null`。
- 摘要、clone、equality 与 favorite rehydrate。
- legacy `flag` / `specific_date` 不再被视为有效 Redeye bid。

### 11.2 Server focused tests

- route schema 与业务 validation 接受新 payload、拒绝旧 payload。
- parse/serialize/clone/format 覆盖多日期及深复制。
- Search SQL 覆盖 `= any(date[])`、range、无 scope、Award 与 Avoid。
- Specific Dates 任一日期越出 bid period 时拒绝；Date Range 任一端越出 bid period 时拒绝。
- 算法导出验证 Award/Avoid 都使用正向 Redeye 集合，再写入对应 counter。
- catalog 测试验证 `defaultAction === "avoid"`。

### 11.3 Playwright

真实 PBS Pairing UI 至少覆盖：

1. 新增 Redeye Preference，默认 Avoid。
2. 切换 Award 后保存并重新编辑，仍显示 Award。
3. `LIMIT TO FLIGHT DATE` 默认关闭。
4. 开启并选择两个 Specific Dates，保存后重新编辑正确回显。
5. 切换 Date Range 并验证单一范围 picker。
6. Search Pairings 打开同一 editor 并正确回显。

### 11.4 QA 文档

新增 `docs/test-cases/pbs/pairing/2026-07-16-redeye-preference-date-standardization.md`，覆盖默认值、日期多选、范围、编辑回显、Search Pairings、bid period 越界、旧 payload 拒绝和 migration 后无旧数据。

同时更新旧文档 `docs/test-cases/pbs/pairing/2026-07-13-redeye-preference.md`，在顶部明确标记其已被 2026-07-16 QA 文档取代；旧文档中 legacy `flag` 自动转换等与新合同冲突的步骤不得继续作为有效验收标准。

### 11.5 交付验证命令

实施后至少执行并报告：

- Portal focused Vitest
- pbs-server focused tests
- live-server touched-area focused tests
- 相关 Playwright
- 在受控 PBS schema 连续执行新 migration 两次并完成 property `117` 定向数据核查
- `cd pbs-portal && npm run lint -- --quiet`
- `cd pbs-portal && npm run build`
- `npm run check:ui`
- `git diff --check`
- `gitnexus detect_changes` 或当前环境可用的等价 GitNexus change detection

若共享 contract 或 lineholder 链路影响面扩大，再补跑 `cd pbs-portal && npm test`、pbs-server 全量测试或根目录 `npm run verify:pbs`。

## 12. 风险与控制

- **默认值覆盖风险**：默认 Avoid 只能用于新增草稿；测试必须覆盖编辑已有 Award。
- **日期语义风险**：Flight Date 明确定义为 Redeye window 的出发机场本地日期，不改为 UTC 日期或到达日期。
- **双重取反风险**：Search preview 与算法评分分别测试 action 语义。
- **隐藏字段风险**：switch 关闭和 mode 切换必须输出清理后的 payload。
- **旧数据风险**：项目未上线且用户要求不兼容；migration 必须清理而非静默转换。
- **工作区冲突风险**：当前存在 Dashboard Dialog 的其他未提交修改；实现和提交必须排除这些文件。

## 13. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: contract、editor、校验、搜索、lineholder 与 migration 围绕同一 property payload 紧密耦合，拆分实现容易出现短暂不一致和同文件冲突。
- Suggested split: 单 agent 顺序实现；独立 reviewer 只做 spec/代码审查，不写实现文件。
- Write boundaries: 仅 property `117` 相关 contract、Portal、server、live-server、SQL、测试与文档。
- Conflict risk: Medium；必须保留并排除工作区现有 Dashboard Dialog 改动。
- Execution gate: 本 spec 通过独立审查并经用户明确批准后才开始实现。

## 14. 验收标准

1. 新增 Redeye Preference 默认显示 Avoid，但仍可选择 Award。
2. 编辑已保存 Award/Avoid 时不被默认值覆盖。
3. 日期区域显示 `LIMIT TO FLIGHT DATE` 且默认关闭。
4. 开启后支持 Specific Dates 多选和 Date Range。
5. Portal、contract、server、live-server 只接受新专用 payload。
6. Pairing Search 和算法对 Redeye 正向集合及 Award/Avoid 的处理正确。
7. Redeye definition 继续显示 `03:30-05:30 local time`。
8. property `117` 旧 bid/favorite 经 migration 清理，不保留运行时兼容。
9. focused tests、相关 Playwright、Portal build、lint、UI gate 与 diff check 达到交付要求。
