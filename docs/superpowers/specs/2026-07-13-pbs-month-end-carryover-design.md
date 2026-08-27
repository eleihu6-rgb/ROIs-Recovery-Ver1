# PBS Month-End Carryover 设计确认

## 背景

Jen 在 `Bidding Options V1(2).xlsx` 中将旧的 `Carry Out Days` 收敛为新的 Pairing 条件：

- `Final Bid Option`: `Month-End Carryover`
- `Purpose`: Crew bids to avoid or allow pairings carrying into the next month.
- `Required Fields / Inputs`: Avoid/award, number of carry-out days
- `Rules / Defaults`: `Limit to 1-5 days only`（Jen 原文；员工端不显示这个范围文案，最终输入范围按本设计的正整数规则和后续管理端配置执行）。
- `Notes for Developers`: Rename from carry out days.

这里的 `Rename from carry out days` 表示：旧系统/旧实现里的 `Carry-Out Days` 是来源，员工端最终展示名称应为 `Month-End Carryover`。

当前系统已经存在 Pairing property `163 Carry-Out Days`：

- `propertyCode = 163`
- `name = "Carry-Out Days"`
- `defaultAction = "award"`
- `defaultBid = { type: "stepper", value: 0, min: 0, max: 14, operator: ">" }`
- 后端 Pairing Search 已能按 bid period 月末计算 carry-out days
- `Avoid Carry-Out Days > N` 的既有含义是：排除 carry-out days 大于 N 的 pairing

项目尚未上线，因此本次不做旧 saved bid / 旧 generic payload 兼容。旧 `Carry-Out Days` 只作为代码来源和 rename 来源；运行时以新的 `Month-End Carryover` contract 为准。

本次设计目标是复用 property `163` 和后端跨月天数计算逻辑，把员工端条件替换为 `Month-End Carryover`，并纳入统一的 Pairing preference 条件 UI 标准。

## 目标

1. 员工端展示名从 `Carry-Out Days` 改为 `Month-End Carryover`。
2. 复用现有 `propertyCode = 163`，不新增新的 bid property。
3. 复用现有后端 carry-out days 计算逻辑。
4. 新 UI 的数字输入使用正整数天数，不在 placeholder 或静态说明中显示 `1-5`，避免员工误以为只能填写固定范围；支持 `<` / `=` / `>` / `Between` 四种比较。
5. UI 使用统一 preference 条件骨架：`TIERS` -> `PREFERENCE` -> 条件字段 -> footer。
6. 数字比较控件采用统一的“符号下拉 + 数值输入”模式；`<` / `=` / `>` 通过 aria label 保留业务语义。
7. 明确 `Award` 的业务含义，避免 generic operator 语义泄露给用户。
8. 不做旧 saved bid / 旧 `stepper` payload 兼容；开发期旧数据可清理或由 migration 覆盖 property config。

## 非目标

- 不重新设计 bid period 月末计算逻辑。
- 不把跨月信息重新放回左侧 `BIDDING CALENDAR`。
- 不恢复 `C/O Off` 日历 placeholder。
- 不新增管理端配置页面。
- 不在员工端硬编码展示 `1-5` 范围；若后续需要公司级最大值，由管理端配置驱动，不写死在 editor 文案里。
- 不把 `Carry-In / Carry-Out` 旧 property `129` 重新引入本功能。
- 不保留旧 `Carry-Out Days` saved bid 的运行时兼容。

## Jen 语义解释

Jen 的核心表达是：

> Crew bids to avoid or allow pairings carrying into the next month.

因此本系统中定义为：

- `Avoid Month-End Carryover`: 员工希望避免匹配所选 carry-out days 条件的跨月 pairing。
- `Award Month-End Carryover`: 员工愿意/偏好匹配所选 carry-out days 条件的跨月 pairing。
- `number of carry-out days`: pairing 结束日期超过当前 bid month 最后一天的天数。
- 所有比较条件只匹配真正跨月的 pairing；`carry_out_days = 0` 不属于 Month-End Carryover。

示例：

- `Avoid · > 5 days`: 避免跨出 6 天及以上的 pairing。
- `Award · Between 2 and 3 days`: 偏好跨出 2-3 天的 pairing。
- `Avoid · < 3 days`: 避免跨出 1-2 天的 pairing。
- `Award · = 1 day`: 偏好刚好跨出 1 天的 pairing。

Jen 没有给具体例子，只给了 `number of carry-out days` 和 `Limit to 1-5 days only`。结合本轮产品确认，员工端不展示 `1-5` 作为 placeholder 或说明文案，避免造成“只能填写 1 到 5”的视觉暗示；输入按正整数天数处理，后续如需公司级最大值由管理端配置提供。`> 5` 可以表达 6 天及以上；`Between 2 and 3`、`< 3`、`= 6` 这类数字比较能力都保持清楚。数字比较属于员工明确选择的规则条件，UI 显示技术符号比长文案更紧凑；无障碍语义用 `Less than` / `Equal to` / `More than` 作为 aria label 保留。

## UI 设计

弹窗结构：

1. `Configure Month-End Carryover`
2. `TIERS`
   - 使用现有 `TierToggleGroup`
   - 默认不选，保存前必填
3. `PREFERENCE`
   - `Award`
   - `Avoid`
   - 默认 `Award`，与已统一的 Pairing preference 条件默认行为保持一致
4. `CARRY-OUT DAYS`
   - 左侧为统一比较下拉框：`<` / `=` / `>` / `Between`
   - 右侧为数字输入：placeholder 使用 `Enter` 或 `Enter days`，不显示 `1-5`
   - `Between` 时显示 `From` / `To` 两个数字输入
   - 不展示额外解释段落
5. Footer
   - `Cancel`
   - `Save Favorite`
   - `Add Bid` / `Update Bid`

字段交互：

- 默认比较条件为 `>`，数字为空。
- `Carry-out days` 必须输入正整数才可保存。
- `Between` 的 `from` / `to` 必须都是正整数，且 `from <= to`。
- `Award / Avoid` 切换不清空 operator 或 carry-out days。
- 切换 operator 时清理不适用字段；例如从 `Between` 切到 `>` 后不保留 `from/to`。
- 切换 action 后 summary 和 payload 语义同步更新。
- 保存按钮要求 `tiers.length > 0` 且 carry-out days 条件完整有效。

UI 文案建议：

- section title: `CARRY-OUT DAYS`
- control aria label: `Month-End Carryover carry-out days`
- summary:
  - `Avoid carryover > 5 days`
  - `Award carryover between 2 and 3 days`
  - `Avoid carryover < 3 days`

## Payload 设计

推荐新增专用 bid value，避免让 UI 继续依赖 generic operator：

```ts
type MonthEndCarryoverBid =
  | {
      type: "month-end-carryover";
      operator: "<" | "=" | ">";
      days: number | null;
    }
  | {
      type: "month-end-carryover";
      operator: "Between";
      from: number | null;
      to: number | null;
    };
```

规则：

- 新建/编辑时 canonical payload 使用 `month-end-carryover`。
- 非 `Between` operator 使用 `days`；`days = null` 表示用户尚未输入，前端不可保存。
- `Between` operator 使用 `from` / `to`；任一为空时前端不可保存。
- 可保存数字必须是正整数；员工端不硬编码最大值。
- `Between` 必须满足 `from <= to`。
- action 仍沿用 property 外层的 `award` / `avoid`。
- API、contracts、draft mapper、search builder 只接受 `month-end-carryover` 作为 property `163` 的有效 payload。
- 旧 `{ type: "stepper" }` / `{ type: "stepper-range" }` 不再作为 property `163` 的有效 payload。

## Search / 后端语义

继续使用现有 carry-out days 计算：

```sql
greatest(
  0,
  ((coalesce(p.sch_end_dt_utc, p.sch_str_dt_utc) at time zone 'UTC')::date - <period_end_date>::date)
)
```

其中 `<period_end_date>` 由请求上下文的 `periodCode` 解析得到。

搜索语义：

- 基础命中必须包含 `carry_out_days >= 1`，确保 0 天不算 Month-End Carryover。
- `< N`: `carry_out_days >= 1 and carry_out_days < N`
- `= N`: `carry_out_days = N`
- `> N`: `carry_out_days > N`
- `Between A and B`: `carry_out_days between A and B`
- `Award` 保留匹配条件的 pairing。
- `Avoid` 排除匹配条件的 pairing。

示例：

- bid period: `Apr 2026`
- pairing: `2026-04-30 -> 2026-05-03`
- carry-out days: `3`

| Bid | 是否命中 |
| --- | --- |
| `Avoid · > 1 day` | 命中排除，因为 3 > 1 |
| `Avoid · > 3 days` | 不排除，因为 3 不大于 3 |
| `Award · Between 2 and 3 days` | 命中，因为 3 在 2-3 内 |
| `Award · < 3 days` | 不命中，因为 3 不小于 3 |
| `Award · > 5 days` | 不命中；但 6+ carry-out days 会命中 |

## 数据库 / Catalog

复用并更新 `property_code = 163`：

- `property_name`: `Month-End Carryover`
- `award_or_avoid`: `["award","avoid"]`
- `defaultBid`: `{ "type": "month-end-carryover", "operator": ">", "days": null }`
- `operator_options`: `["<","=",">","Between"]`
- `validation_json`: 建议更新为专用配置

示例：

```json
{
  "validationType": "month_end_carryover",
  "label": "Month-End Carryover",
  "fieldLabel": "Carry-Out Days",
  "operators": ["<", "=", ">", "Between"],
  "min": 1
}
```

其中 `validationType` 是 `validation_json` 的配置 discriminator，不是 bid payload 的 `type`。bid payload 只接受 `type: "month-end-carryover"`。`label` 是 property display name，必须保持 `Month-End Carryover`；`fieldLabel` 仅用于条件内字段标题，不得覆盖 property 展示名或 summary 条件名。

`sql/seed/10-pbs-bid-property.sql` 和 migration 都需要同步。

## 前端实现影响

预计涉及：

- `packages/contracts/pbs-pairing-bids.js`
- `packages/contracts/pbs-pairing-bids.d.ts`
- `pbs-portal/src/features/pairing/types.ts`
- `pbs-portal/src/features/pairing/components/month-end-carryover-editor.tsx`
- `pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx`
- `pbs-portal/src/features/pairing/pairing-bid-summary.ts`
- `pbs-portal/src/features/pairing/pairing-draft-mappers.ts`
- `pbs-portal/src/features/pairing/pairing-property-catalog.ts`
- `pbs-portal/src/features/pairing/mock.ts`
- Search Pairings picker 相关测试

实现原则：

- 新 editor 使用统一 `PreferenceConditionSection` 和 `AwardAvoidSegmentedControl`。
- `CARRY-OUT DAYS` 使用统一数字比较 primitive，不写单独的 select / 输入框样式。
- 不复用 generic `PairingBidControl` 的 operator select。
- Pairing 页面和 Search Pairings 编辑入口共用同一个 editor。
- summary 可以沿用可读业务语义，也可以保留 operator 符号；但配置弹窗内的比较选择必须使用统一符号下拉。

## 后端实现影响

预计涉及：

- `pbs-server/src/routes/pairing-bid-route-schemas.ts`
- `pbs-server/src/services/pairing/pairing-property-validation.ts`
- `pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts`
- `pbs-server/src/services/lineholder/rule-bid-types.ts`
- `pbs-server/src/services/lineholder/rule-bid-value.ts`
- `pbs-server/src/services/lineholder/rule-bid-clone.ts`
- `pbs-server/src/services/lineholder/rule-bid-format.ts`
- `pbs-server/src/services/lineholder/rule-bid-serialize.ts`
- `pbs-server/src/services/lineholder/lineholder-summary-formatters.ts`

后端需要：

- 接受新 `month-end-carryover` payload。
- 对 property `163` 拒绝旧 `stepper` / `stepper-range` payload。
- 对新 payload 校验 operator 和数字范围；所有数字必须为正整数，`Between` 必须 `from <= to`。后续若管理端提供最大值，后端按配置追加 max 校验。
- Search builder 将新 payload 映射成上述 `Avoid` / `Award` 条件。
- 更新 lineholder summary 和 export 文案为 `Month-End Carryover`。

## 上线前数据处理

项目未上线，不做旧 saved bid runtime 兼容。

处理策略：

1. migration / seed 直接更新 property `163` 的名称、actions、default bid 和 validation config。
2. 开发库或测试库中旧 `Carry-Out Days` saved bid 可以清理，不作为产品兼容目标。
3. 后端 validation 对 property `163` 只接受 `month-end-carryover`。
4. 如果后续发现必须保留某批测试数据，应写一次性数据修正脚本，不在运行时代码中加兼容分支。

## 测试要求

Vitest：

- catalog 将 `163` 展示为 `Month-End Carryover`。
- editor 初始态：默认 `Award`、`>`、days 为空、无 tier、Add Bid disabled。
- 选择 tier + operator + 有效 days 后可保存。
- `> 5` 表达 6 天及以上。
- `Between 2 and 3` 表达 2-3 天。
- `< 3` 表达 1-2 天。
- validation 接受新 payload，拒绝空值、`0`、`6`、小数、字符串，以及 `Between from > to`。
- validation / mapper / search builder 拒绝旧 stepper / stepper-range 作为 property `163` payload。
- editor 使用统一符号 operator select。
- search builder 覆盖 `<`、`=`、`>`、`Between`，以及 Award / Avoid intent。
- Search Pairings picker 能找到 `Month-End Carryover`。

Playwright：

- Pairing 页面打开 `Month-End Carryover`。
- 默认无 tier，`Award` selected，`>` selected，days 为空，Add Bid disabled。
- 弹窗顺序为 `TIERS` -> `PREFERENCE` -> `CARRY-OUT DAYS` -> footer。
- 弹窗内 comparison 使用符号下拉，不使用 `Less than` / `Exactly` / `More than` 的长文案按钮。
- 选择 T1 + `> 5 days` 后保存。
- 切换到 `Between` 后显示 From / To 两个输入。
- `Between 2 and 3 days` 可保存。
- payload 中 propertyCode 仍为 `163`。
- 切到 `Award` 后保存，payload 和 summary 使用 Award 语义。
- Search Pairings 中同一 editor 可打开和回显。

回归：

- 左侧 `BIDDING CALENDAR` 不出现 `C/O Off`。
- 已有 `Carry-Out Days` 搜索/过滤测试按 `Month-End Carryover` 新 contract 更新。
- property `163` 不再以 `Carry-Out Days` 名称出现在员工端。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 该改动虽然跨 contracts、portal、server、SQL 和 E2E，但核心是同一个 property `163` 的命名、payload 和语义收敛；并行编辑容易造成 contract/schema 不一致。
- Suggested split: 不建议并行实现。建议顺序为 spec -> 原型 -> contract/catalog -> portal editor -> server validation/search -> tests。
- Write boundaries: 单 agent 顺序处理，避免与正在进行的 Flight Number 或后续 Pairing 条件改动互相覆盖。
- Conflict risk: Medium。`163` 已存在开发期实现，需要整体替换旧 generic stepper 语义，同时保持 property code 不变。
- Execution gate: 用户确认 spec 和原型后再进入项目实现；实现前先重新检查工作区状态，避免覆盖无关 dirty changes。

## 验收标准

1. 员工端看到的条件名是 `Month-End Carryover`。
2. 条件复用 `propertyCode=163`。
3. UI 显示 `Award / Avoid`、符号下拉和中性的数字输入 placeholder，不显示 `1-5`。
4. `> 5` 可以表达 6 天及以上。
5. `Between 2 and 3` 可以表达 2-3 天。
6. 新建/编辑的数字输入接受正整数，不在员工端硬编码 `1-5`。
7. 旧 `stepper` / `stepper-range` payload 不再是 property `163` 的有效输入。
8. Pairing 页面和 Search Pairings 使用同一 editor 和同一 payload 语义。
9. focused Vitest、相关 Playwright、`cd pbs-portal && npm run lint -- --quiet`、`cd pbs-portal && npm run build`、`npm run check:ui`、`git diff --check` 通过。若实现影响共享 editor 或回显路径，还需要按触达面运行 `cd pbs-portal && npm test` 或说明未运行原因。
