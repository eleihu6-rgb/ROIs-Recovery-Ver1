# PBS Days Off / Days On Pattern 字段语义修复设计

日期：2026-05-20  
状态：已确认并实施  
范围：只修复 `Days Off / Days On Pattern` (`propertyCode=205`) 的字段结构、UI 表述、保存映射与校验；不调整其他 Days Off 条件。

## 背景

用户在检查 `Days Off / Days On Pattern` 时发现当前条件表述不够清楚。只读核对 AA / 旧库资料后确认，这不是单纯文案问题，当前实现也缺少字段。

旧库资料中 `205 Days Off / Days On Pattern` 的结构是：

```text
Set Condition Pattern Between A and B Days On, with C Days Off
```

旧库字段含义：

```text
param_a = min days off
param_b = min days on
param_c = max days on
operator = Between
```

旧库示例：

```text
Set Condition Pattern Between 4 and 5 Days On, with 5 Days Off (Minimum)
Set Condition Pattern Between 3 and 4 Days On, with 3 Days Off (Minimum)
Set Condition Pattern Between 2 and 3 Days On, with 3 Days Off (Minimum)
```

当前代码中 `205` 默认 bid 是：

```ts
{ type: "stepper-range", from: 3, to: 5, min: 1, max: 14 }
```

这只能表达 `min days on` 与 `max days on`，缺少 `min days off`，因此无法完整表达旧库语义。

## 目标

1. `Days Off / Days On Pattern` 能完整填写三个字段：
   - 最少连续休息天数
   - 连续上班最少天数
   - 连续上班最多天数
2. UI 文案让用户能直接理解条件含义，不再只显示泛泛的 `Between N - N`。
3. 保存时保持旧库语义：
   - `param_a = minDaysOff`
   - `param_b = minDaysOn`
   - `param_c = maxDaysOn`
   - `operator = Between`
4. 回显旧数据时能恢复三个字段。
5. 不影响 `Prefer Off`、`Min Consecutive Days Off In Window`、`Shared Days Off With Employee` 等其他 Days Off 条件。

## 推荐方案

新增一个专用 bid value 类型表达 205：

```ts
{
  type: "days-off-on-pattern";
  minDaysOff: number;
  minDaysOn: number;
  maxDaysOn: number;
  min?: number;
  max?: number;
}
```

推荐原因：

- 205 是固定三字段结构，不是普通 `stepper-range`。
- 专用类型可以让保存映射、回显、校验和 UI 摘要都更清楚。
- 避免把 `minDaysOff` 硬塞到不匹配的通用 range 类型里。

## 备选方案

### 方案 A：只改文案，继续使用 `stepper-range`

不推荐。原因是仍然只能保存两个数字，缺少 `min days off`，不符合旧库真实结构。

### 方案 B：在 `stepper-range` 上额外增加 `minDaysOff`

不推荐。原因是 `stepper-range` 在 Pairing / Line / Days Off 中是通用结构，新增业务字段会污染通用类型，也容易影响其他条件。

## UI 设计

打开 `Configure Days Off Bid` 并选择 `Days Off / Days On Pattern` 时，表单应显示清楚的字段组合：

```text
Days on pattern
Min days on [ 3 ]  -  Max days on [ 5 ]

Days off minimum
Minimum days off [ 3 ]
```

推荐默认值：

```ts
{
  type: "days-off-on-pattern",
  minDaysOn: 3,
  maxDaysOn: 5,
  minDaysOff: 3,
  min: 1,
  max: 14
}
```

摘要 / 右侧详情建议显示：

```text
Work 3-5 days, then at least 3 days off
```

如果 `minDaysOn` 等于 `maxDaysOn`，摘要可显示：

```text
Work 4 days, then at least 3 days off
```

## 数据流

### 默认 property

`205 Days Off / Days On Pattern` 默认 bid 从：

```ts
{ type: "stepper-range", from: 3, to: 5, min: 1, max: 14 }
```

改为：

```ts
{ type: "days-off-on-pattern", minDaysOn: 3, maxDaysOn: 5, minDaysOff: 3, min: 1, max: 14 }
```

### 保存映射

`serializeRuleBid` 对 `days-off-on-pattern` 映射为：

```ts
{
  operator: "Between",
  paramA: String(minDaysOff),
  paramB: String(minDaysOn),
  paramC: String(maxDaysOn)
}
```

### 回显映射

`deserializeRuleBid` 对 `days-off-on-pattern` 从已保存数据恢复：

```ts
{
  minDaysOff: parsed(paramA) ?? fallback.minDaysOff,
  minDaysOn: parsed(paramB) ?? fallback.minDaysOn,
  maxDaysOn: parsed(paramC) ?? fallback.maxDaysOn
}
```

## 后端校验

只针对 `propertyCode=205` 增加校验：

- bid 类型必须是 `days-off-on-pattern`
- `minDaysOff` 必须是 safe integer，且 `>= 1`
- `minDaysOn` 必须是 safe integer，且 `>= 1`
- `maxDaysOn` 必须是 safe integer，且 `>= 1`
- `minDaysOn <= maxDaysOn`
- 如果使用 `max`，三个数字不能超过 `max`

本轮不新增“最大可配置值从数据库读取”的逻辑，沿用当前前端默认 `max=14` 的范围。

## 测试设计

### 单元测试

需要补充或更新以下单元测试：

1. `pbs-server/src/services/lineholder/rule-bid-value.test.ts`
   - 验证 `days-off-on-pattern` 序列化为 `operator=Between`、`paramA=minDaysOff`、`paramB=minDaysOn`、`paramC=maxDaysOn`。
   - 验证已保存的 `paramA` / `paramB` / `paramC` 能反序列化回三个字段。
   - 验证摘要格式为 `Work 3-5 days, then at least 3 days off`。

2. `pbs-server/src/services/days-off/days-off-validation.test.ts`
   - 验证 `205` 接受合法三字段结构。
   - 验证缺字段或错误 bid 类型时返回校验错误。
   - 验证任一字段小于 1 时返回校验错误。
   - 验证 `minDaysOn > maxDaysOn` 时返回校验错误。

3. `pbs-portal/src/features/pairing/components/pairing-bid-control.test.tsx`
   - 验证 `days-off-on-pattern` 渲染 `Min days on`、`Max days on`、`Minimum days off`。
   - 验证修改三个字段分别触发正确的 `onChange`。

4. `pbs-portal/src/features/days-off/pages/days-off-page.test.tsx`
   - 验证打开 `Days Off / Days On Pattern` 弹窗时显示三个字段。
   - 验证 `minDaysOn > maxDaysOn` 时不能提交并显示错误。
   - 验证填写合法值后提交 payload 包含新结构。

### 回归测试

需要覆盖以下已有功能不被破坏：

1. `Prefer Off`
   - 仍显示 `MODIFIERS`。
   - 日期 / 星期选择、time window、`All or Nothing`、`Minimum required` 保存语义不变。

2. `Min Consecutive Days Off In Window`
   - 仍显示连续天数 N 和日期窗口。
   - 日期窗口顺序校验仍生效。

3. `Shared Days Off With Employee`
   - 仍显示员工号和最少共享天数。
   - 员工号必填校验仍生效。

4. 通用 bid 控件
   - 现有 `stepper-range`、`stepper-date-range`、`crew-days-off-share`、`tag-list` 测试继续通过。

### 人工测试案例

人工测试用例需同步写入：

```text
docs/test-cases/pbs-portal/days-off-pattern-fields.md
```

测试用例至少包含：

1. 打开 Days Off 页面，搜索并选择 `Days Off / Days On Pattern`。
2. 打开配置弹窗，确认显示 `Min days on`、`Max days on`、`Minimum days off`。
3. 设置 `Min days on = 5`、`Max days on = 3`，确认不能提交并显示错误。
4. 设置 `Min days on = 4`、`Max days on = 5`、`Minimum days off = 5`，保存成功。
5. 重新打开或查看右侧详情，确认摘要表达 `Work 4-5 days, then at least 5 days off`。
6. 回归检查 `Prefer Off`、`Min Consecutive Days Off In Window`、`Shared Days Off With Employee`。

## 不做范围

- 不修改数据库 schema。
- 不修改其他 Days Off property 的结构。
- 不改变 `MODIFIERS` 显示规则。
- 不做跨月 pattern 推导或排班结果预览。
- 不改 Line / Pairing / Reserve 的业务语义。

## 验收标准

1. 打开 `Days Off / Days On Pattern` 配置弹窗时，可以看到三个清楚字段：`Min days on`、`Max days on`、`Minimum days off`。
2. `minDaysOn > maxDaysOn` 时不能确认保存，并显示错误提示。
3. 三个字段任一小于 1 时不能保存。
4. 输入 `minDaysOn=4`、`maxDaysOn=5`、`minDaysOff=5` 后保存，后端序列化为 `param_a=5`、`param_b=4`、`param_c=5`。
5. 已保存的 `param_a=3`、`param_b=3`、`param_c=4` 回显为 `Minimum days off=3`、`Min days on=3`、`Max days on=4`。
6. 摘要显示为类似 `Work 3-4 days, then at least 3 days off`。
7. 对应单元测试、回归测试和人工测试案例文档已补齐。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是小范围但跨 contracts、portal、server 的类型链路修复，拆分会增加接口不一致风险。
- Suggested split: 不拆分。
- Write boundaries: 主 agent 单独处理 contracts、`PairingBidControl` 渲染、Days Off 弹窗校验、规则序列化 / 反序列化、后端 Days Off 校验与对应测试、人工测试案例文档。
- Conflict risk: 中等；当前工作区已有 Days Off 未提交改动，实施时必须只做增量修改，不能覆盖现有 diff。
- Execution gate: 用户复核并确认本文档后，才进入实现。

## 实施记录

实施日期：2026-05-20

已完成：

1. `205 Days Off / Days On Pattern` 默认 bid 改为专用 `days-off-on-pattern` 结构，包含 `minDaysOff`、`minDaysOn`、`maxDaysOn`。
2. 前端配置弹窗显示 `Days on pattern` 与 `Days off minimum` 两组字段，并在 `minDaysOn > maxDaysOn` 时阻止提交。
3. 前端和后端摘要统一为 `Work N-M days, then at least X days off`。
4. 后端 `serializeRuleBid` / `deserializeRuleBid` 按旧库语义映射：
   - `paramA = minDaysOff`
   - `paramB = minDaysOn`
   - `paramC = maxDaysOn`
   - `operator = Between`
5. 后端 Days Off draft 校验新增 205 专用结构、整数范围与 days on 顺序校验。
6. `sql/seed/10-pbs-bid-property.sql` 与 `sql/migration/2026-04-30-pbs-property-catalog-visibility.sql` 中 205 的 `validation_json` 更新为 A/B/C 三字段描述。
7. 已补充自动化测试和人工测试案例：`docs/test-cases/pbs-portal/days-off-pattern-fields.md`。

## 验证记录

已通过：

```bash
pnpm --dir pbs-portal test -- pairing-bid-control.test.tsx days-off-page.test.tsx rule-bids/utils.test.ts
pnpm --dir pbs-server test -- lineholder/rule-bid-value.test.ts days-off/days-off-validation.test.ts
pnpm --dir pbs-portal exec tsc --noEmit --pretty false
pnpm --dir pbs-portal build
pnpm --dir pbs-server build
pnpm --dir pbs-portal lint -- src/features/days-off/components/days-off-bid-dialog.tsx src/features/days-off/pages/days-off-page.test.tsx src/features/pairing/components/pairing-bid-control.tsx src/features/pairing/components/pairing-bid-control.test.tsx src/features/pairing/pairing-bid-control-logic.ts src/features/pairing/pairing-bid-summary.ts src/features/rule-bids/utils.ts
git diff --check
```

说明：

- Portal 测试命令实际匹配并执行了 48 个测试文件、301 个测试。
- Server 测试命令按当前脚本实际执行了 194 个测试。
