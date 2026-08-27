# PBS Long Stretch Off / Commuter Pattern 现有条件增强设计

日期：2026-07-11
状态：已确认，进入实现

来源：
- Jen 主 Excel：`/Users/lei/Codehub/rois-ai/init-docs/Bidding Options V1(2).xlsx`
- Jen 汇总 Excel：`/Users/lei/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_ncb53uy7i8si22_687c/temp/drag/pbs_bid_type_decision_summary_en.xlsx`
- Prefer Off 已实施设计：`docs/superpowers/specs/2026-07-08-pbs-days-off-prefer-off-entry-simplification-design.md`
- Commuter Pattern 既有设计：`docs/superpowers/specs/2026-05-28-pbs-line-commuter-pattern-design.md`
- 已确认 HTML 原型：`.superpowers/brainstorm/23895-1783755069/long-stretch-commuter-dual-entry-v7-jen-aligned.html`

## 背景

Jen 的 Days Off 第二入口是 `Long Stretch Off / Compressed Flying`：

- Purpose：Crew wants a long block of days off and is willing to compress flying elsewhere.
- Required Fields：Minimum consecutive days off, optional date window, award/avoid.
- Rule：Must respect max consecutive workday rules.
- Developer Note：如果 commuter pattern 可以处理 “10 days off anywhere in the month”，可以合并；否则保留。

Jen 的 Line 入口 `Commuter Pattern` 是另一个用户意图：

- Purpose：Crew bids for compressed work blocks and protected days off.
- Required Fields：Work block pattern, days off pattern, date range if applicable.
- Rule：Must reject impossible patterns based on workday limits and required days off.

产品结论：两个入口都保留。`Long Stretch Off / Compressed Flying` 表达“至少出现一段连续 N 天休息”；`Commuter Pattern` 表达“工作块 / 休息块节奏”。同 Tier、同月份下可能有覆盖关系，但不能跨 Tier 合并，否则会丢失优先级。

## 现有条件选择

### Days Off 204 作为 Long Stretch 基础

`204 Min Consecutive Days Off In Window` 当前类型是 `stepper-date-range`：

- `value`：连续休息天数
- `from`：窗口开始日期
- `to`：窗口结束日期

这与 Jen 的 `Minimum consecutive days off, optional date window, award/avoid` 最接近。本次不新增 property code，直接把 204 增强并显示为：

```text
Long Stretch Off / Compressed Flying
```

`203 Min Consecutive Days Off` 不作为本次入口基础，因为它在算法导出里已被映射成宽松的 `COMMUTER_PATTERN`，继续增强会混淆 203、204、408 的边界。

### Line 408 作为 Commuter Pattern 基础

`408 Commuter Pattern` 当前类型是 `days-off-on-pattern`：

- `minDaysOn`
- `maxDaysOn`
- `minDaysOff`

当前合同没有 `maxDaysOff`。本次 UI 继续保持休息块为单一数值：

```text
Work 4 to 5 days
Then 4 days off
```

不新增 `maxDaysOff`。用户提到的 “4-5 days off” 需要等业务确认到底是“最多 5 天”还是“至少 4 天”后再扩展。

## 目标

1. Days Off 页面展示 `Long Stretch Off / Compressed Flying`，对应 `propertyCode=204`。
2. Long Stretch UI 严格跟随 V7 原型：标题、TIERS、PREFERENCE、MINIMUM CONSECUTIVE DAYS OFF、LIMIT TO A DATE RANGE。
3. Long Stretch 支持 `Award / Avoid`，默认 `Award`，保存到 Days Off bid / favorite。
4. Long Stretch 的日期范围开关默认关闭；关闭时 UI 不显示日期字段，提交时使用当前 bid month 整月范围。
5. Line 页面继续使用 `propertyCode=408 Commuter Pattern`。
6. Commuter UI 严格跟随 V7 原型：标题、TIERS、WORK BLOCK、OFF BLOCK、LIMIT TO A DATE RANGE。
7. Commuter 支持可选 date range，保存到 bid JSON；历史 3 参数数据仍可读取。
8. Tier 行为与 Prefer Off 一致：默认 T1，允许取消最后一个 Tier，空选显示 `Required` 并禁用 `Save Favorite` / `Add Bid`。
9. 数字输入框使用类似 Ant Design `InputNumber` 的右侧上下按钮。
10. 日期范围使用真实可打开、可选择的日期控件。

## 非目标

- 不新增 bid property code。
- 不把 203 改名为 Long Stretch。
- 不给 Commuter Pattern 增加 `maxDaysOff`。
- 不做 UI 层的 204 / 408 覆盖去重提示。
- 不跨 Tier 合并条件。
- 不撤销或修改 commit `2fd893ee feat: 接入统一 Prefer Off 条件`。
- 未经用户明确授权，不执行 `git add`、`git commit`、`git push`。

## 前端设计

### Long Stretch Off / Compressed Flying

弹窗结构：

```text
Configure Long Stretch Off / Compressed Flying

TIERS
T1 T2 T3 T4 T5 T6 T7

PREFERENCE
Award | Avoid

MINIMUM CONSECUTIVE DAYS OFF
[10 ▲▼]

LIMIT TO A DATE RANGE       [toggle]
[from] - [to]               仅 toggle on 显示
```

关键交互：

- 新增默认 T1。
- `PREFERENCE` 默认 `Award`，允许选择 `Avoid`。
- `Minimum Consecutive Days Off` 默认 10。
- `Limit to a Date Range` 默认关闭。
- 关闭 date range 时：
  - UI 上不显示旧日期。
  - 内部提交使用当前 bid month 起止日期。
  - 避免“看着没限制，实际提交旧缓存窗口”的问题。
- 打开 date range 时：
  - 日期字段清空，要求用户选择完整 start/end。
  - 日期窗口必须在当前 bid period 内。
  - 日期窗口长度必须大于等于连续休息天数。

### Commuter Pattern

弹窗结构：

```text
Configure Commuter Pattern

TIERS
T1 T2 T3 T4 T5 T6 T7

WORK BLOCK
Work [4 ▲▼] to [5 ▲▼] days

OFF BLOCK
Then [4 ▲▼] days off
Work 4-5 days, then 4 days off

LIMIT TO A DATE RANGE       [toggle]
[from] - [to]               仅 toggle on 显示
```

关键交互：

- 新增默认 T1。
- `minDaysOn <= maxDaysOn`。
- `minDaysOff` 是固定休息块天数。
- 不显示 `Days Off Max`。
- date range 关闭时不向 bid JSON 写 `dateRange`。
- date range 打开时写入 `{ from, to }`，并要求日期合法且在当前 bid period 内。

## Contract / 数据设计

### 204 Days Off

204 继续使用 `stepper-date-range`：

```json
{
  "type": "stepper-date-range",
  "value": 10,
  "from": "2026-06-01",
  "to": "2026-06-30",
  "min": 1,
  "max": 14
}
```

新增 / 保留字段：

```json
{
  "action": "award"
}
```

Days Off stable bid 使用既有 `pbs_bid_group.action_id`：

- `1` = Award
- `2` = Avoid

Days Off configured favorite 增加 `pbs_bid_days_off_favorite.action varchar(20)`，用于保存 Award/Avoid。

### 408 Line

408 继续使用 `days-off-on-pattern`，并允许可选 `dateRange`：

```json
{
  "type": "days-off-on-pattern",
  "minDaysOn": 4,
  "maxDaysOn": 5,
  "minDaysOff": 4,
  "dateRange": {
    "from": "2026-06-02",
    "to": "2026-06-18"
  },
  "min": 1,
  "max": 14
}
```

兼容策略：

- 没有 `dateRange` 时仍按历史 3 参数格式保存 / 读取。
- 有 `dateRange` 时以 JSON 结构保存，避免把 date range 塞进旧 `paramA/B/C`。
- 反序列化必须同时支持历史 `Between` 3 参数和新 JSON。

## 数据库迁移

新增 migration：

- `sql/migration/2026-07-11-pbs-long-stretch-off-commuter-pattern-visible.sql`
- `sql/migration/2026-07-11-pbs-days-off-long-stretch-action.sql`

效果：

- 204 显示为 `Long Stretch Off / Compressed Flying`。
- 204 在 Portal 中可见。
- 203、205 不作为 Days Off 新增入口显示，避免与 204 / 408 混淆。
- 204 默认值更新为 10。
- `pbs_bid_days_off_favorite.action` 存储 Long Stretch Favorite 的 Award/Avoid。

## 后端校验

204 校验：

- bid type 必须是 `stepper-date-range`。
- `value` 必须是合法整数。
- `from/to` 必须是合法 ISO 日期。
- `from <= to`。
- 日期窗口长度必须大于等于 `value`。
- `action` 必须是 `award` 或 `avoid`。

408 校验：

- bid type 必须是 `days-off-on-pattern`。
- `minDaysOn <= maxDaysOn`。
- `minDaysOff`、`minDaysOn`、`maxDaysOn` 必须在合法范围内。
- 如存在 `dateRange`：
  - `from/to` 必须是合法 ISO 日期。
  - `from <= to`。
  - 日期范围必须在当前 bid period 内。

## 算法导出

204 继续导出为：

```text
Rule_ID = 204
Rule_Type = MIN_CONSECUTIVE_DAYS_OFF_IN_WINDOW
```

参数保留 action：

```json
{
  "minimumDaysOff": 10,
  "from": "2026-06-01",
  "to": "2026-06-30",
  "action": "award"
}
```

408 继续导出为：

```text
Rule_Type = COMMUTER_PATTERN
```

参数保留 dateRange：

```json
{
  "minDaysOn": 4,
  "maxDaysOn": 5,
  "minDaysOff": 4,
  "maxDaysOff": 4,
  "dateRange": {
    "from": "2026-06-02",
    "to": "2026-06-18"
  }
}
```

当前算法侧可后续调整具体解释，但 Portal / Server 必须先完整保留客户确认的字段，不能在导出阶段静默丢失。

## 验收标准

### Days Off Long Stretch

- Days Off Add Properties 显示 `Long Stretch Off / Compressed Flying`。
- 203 / 205 不作为 Days Off 新增入口显示。
- 弹窗标题只有 `Configure Long Stretch Off / Compressed Flying`，没有重复副标题。
- 弹窗没有 `BID` 组标题。
- 默认 T1 active。
- 可以取消最后一个 Tier；空选显示 `Required`，保存按钮禁用。
- 显示 `PREFERENCE`，默认 `Award`，可选择 `Avoid`。
- 显示 `MINIMUM CONSECUTIVE DAYS OFF`，默认 10。
- 数字输入框有右侧上下按钮。
- date range 关闭时不显示旧日期，提交整月范围。
- date range 打开时使用真实日期控件，日期不完整 / 反向 / 窗口过短时禁用保存。
- 保存后后端仍存为 `propertyCode=204`。

### Line Commuter Pattern

- Line Add Properties 显示 `Commuter Pattern`。
- 弹窗标题只有 `Configure Commuter Pattern`，没有重复副标题。
- 弹窗没有 `BID` 组标题。
- 默认 T1 active。
- 可以取消最后一个 Tier；空选显示 `Required`，保存按钮禁用。
- 显示 `WORK BLOCK`：`Work [min] to [max] days`。
- 显示 `OFF BLOCK`：`Then [days] days off`。
- 显示 summary：`Work 4-5 days, then 4 days off`。
- 不显示 `Days Off Max`。
- date range 开关关闭时不写 `dateRange`。
- date range 打开时保存 `{ from, to }`。
- 保存后后端仍存为 `propertyCode=408`。

## 测试计划

### pbs-portal

- Days Off 页面新增 Long Stretch：
  - 默认 T1。
  - 可取消最后 Tier。
  - Award/Avoid 可切换并保存。
  - date range off 时保存整月范围。
  - date range on 且窗口过短时禁用保存。
- Line 页面新增 Commuter Pattern：
  - 默认 T1。
  - Work Block / Off Block UI 文案正确。
  - date range 可打开并保存。
  - 空 Tier 禁用保存。
- 共享 bid number input：
  - 右侧上下按钮可增减。
  - min/max clamp 生效。

需要运行：

```bash
npx tsc -b --pretty false
npx vitest run src/features/days-off/pages/days-off-page.test.tsx src/features/line/pages/line-page.test.tsx src/shared/services/days-off-service.test.ts
npm run check:ui
```

### pbs-server

- 204 validation 覆盖合法 / 非法 action、日期窗口、窗口长度。
- 204 persistence 覆盖 `action_id`。
- 204 favorite 覆盖 `action`。
- 408 validation 覆盖 dateRange。
- 408 serialize / deserialize 同时兼容旧 3 参数和新 JSON。
- line-rules export 保留 204 action 和 408 dateRange。

需要运行：

```bash
npx tsc --noEmit --pretty false
DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/services/lineholder/rule-bid-value.test.ts src/services/lineholder/lineholder-summary-formatters.test.ts src/services/days-off/days-off-validation.test.ts src/services/days-off/days-off-persistence-mappers.test.ts src/services/line/line-validation.test.ts src/services/algorithm-export/line-rules-export.test.ts
```

### Playwright / Manual QA

- 使用真实 PBS Portal UI 验证 Long Stretch 新增、Preference、date range 开关、短窗口防呆。
- 使用真实 PBS Portal UI 验证 Commuter Pattern 新增、Work/Off Block、date range 开关。
- QA 用例见 `docs/test-cases/pbs/days-off/2026-07-11-long-stretch-off-commuter-pattern.md`。

## 风险与取舍

- 204 的 `Avoid` 已保存在 Portal / Server / export 参数中，但算法侧最终如何解释 `Avoid long stretch off` 还需要与算法实现同步。
- 408 当前不支持 `maxDaysOff`，这是根据现有合同和历史设计保持的约束。
- 408 新增 dateRange 使用 JSON 保存，避免破坏历史 `Between` 3 参数行。
- 204 与 408 同 Tier、同月份下可能语义覆盖，本次只保留字段，不做合并；后续应在算法 normalization 阶段设计，且不得跨 Tier 合并。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 该任务是同一条 bid contract 从 UI、contract、server persistence、serialization 到 export 的串联改动，拆分后接口误差风险高。
- Suggested split: 不拆分；如后续扩展算法语义，可拆成 Portal / Server / Engine 三个阶段。
- Write boundaries: `packages/contracts/**`、`pbs-portal/src/features/days-off/**`、`pbs-portal/src/features/line/**`、`pbs-server/src/services/days-off/**`、`pbs-server/src/services/line/**`、`pbs-server/src/services/lineholder/**`、`pbs-server/src/services/algorithm-export/**`、`sql/**`、相关 tests / docs。
- Conflict risk: Medium；主要风险是 shared bid controls 和历史 bid serialization。
- Execution gate: 用户已确认“按照确定好的样子给客户看，字段 / 数据库该增加就增加”，允许进入实现。
