# PBS Days Off Shared Employee 最少共享天数修复设计

日期：2026-05-20  
状态：已确认并实施  
范围：只修复 `Shared Days Off With Employee` (`propertyCode=206`) 的员工号 + 最少共享天数语义，不调整其他 Days Off 条件。

## 背景

用户在 Days Off 条件列表中看到 `Shared Days Off With Employee`，询问该条件含义以及是否应填写 crew 和天数。

只读核对旧库与 AA 参考资料后，确认 `206 Shared Days Off With Employee` 不是单纯选择员工号，而是要求：

- `param_a = employee ID`
- `param_b = minimum days`

旧库原始说明：

```text
Set Condition Days Off Opposite Employee E Minimum N
```

旧库 validation 结构：

```text
A = Employee Number
B = Min Shared Days
```

旧库示例：

```text
Set Condition Days Off Opposite Employee 19 Minimum 4
Set Condition Days Off Opposite Employee 817 Minimum 12
```

当前代码与 seed 只表达了 `Employee Number`：

- `packages/contracts/pbs-days-off-bids.js` 中 `206` 默认是 `tag-list`
- `sql/seed/10-pbs-bid-property.sql` 中 `206` validation 只有 `crew_id`

因此当前 UI / 数据模型缺失 `Min Shared Days`，不能完整表达旧库语义。

## 目标

1. `Shared Days Off With Employee` 弹窗中同时填写员工号和最少共享休息天数。
2. 保存时保持旧库语义：
   - `param_a = employeeNumber`
   - `param_b = minimumDays`
3. 回显历史 / 已保存数据时能恢复员工号和最少共享天数。
4. 对 `206` 增加必要校验：员工号必填，最少共享天数必须为安全整数且不小于 1。
5. 不影响 `Prefer Off`、`Min Consecutive Days Off In Window`、`Days Off / Days On Pattern` 等其他 Days Off 条件。

## 推荐方案

新增一个专用 bid value 类型表达 206：

```ts
{
  type: "crew-days-off-share";
  employeeNumber: string;
  minimumDays: number;
  min?: number;
  max?: number;
}
```

推荐原因：

- 206 的语义是“单个员工 + 数字阈值”，不是普通多值 `tag-list`。
- 专用类型能避免后续维护者误把员工号当成列表 token 处理。
- 序列化 / 反序列化逻辑可以明确映射到旧库 `param_a` / `param_b`。

## 备选方案

复用 `tag-list`，额外增加 `minimumDays` 字段。

不推荐原因：

- `tag-list` 本身表示多值列表，和 206 的“一个员工 + 最少天数”语义不一致。
- 容易影响 Pairing / Line 中已有 `tag-list` 控件和摘要逻辑。
- 后续排查数据时不容易看出 206 的特殊结构。

## UI 设计

打开 `Configure Days Off Bid` 并选择 `Shared Days Off With Employee` 时，表单应显示：

- `Employee Number` 输入框
- `Minimum shared days` 数字输入

建议默认值：

- `employeeNumber = ""`
- `minimumDays = 1`
- `min = 1`

展示摘要建议：

```text
Employee 817, minimum 12 shared days
```

当员工号为空或天数无效时：

- 禁用确认按钮。
- 显示简短错误提示，例如：
  - `Employee number is required.`
  - `Minimum shared days must be at least 1.`

## 数据流

### 默认 property

`206 Shared Days Off With Employee` 默认 bid 从：

```ts
{ type: "tag-list", values: [], suggestions: [] }
```

改为：

```ts
{ type: "crew-days-off-share", employeeNumber: "", minimumDays: 1, min: 1 }
```

### 保存映射

`serializeRuleBid` 对 `crew-days-off-share` 映射为：

```ts
{
  operator: "In",
  paramA: employeeNumber,
  paramB: String(minimumDays),
  paramC: null
}
```

### 回显映射

`deserializeRuleBid` 对 `crew-days-off-share` 从已保存数据恢复：

```ts
{
  employeeNumber: paramA ?? fallback.employeeNumber,
  minimumDays: parsed(paramB) ?? fallback.minimumDays
}
```

## 后端校验

只针对 `propertyCode=206` 增加校验：

- bid 类型必须是 `crew-days-off-share`
- `employeeNumber.trim()` 不能为空
- `minimumDays` 必须是 safe integer
- `minimumDays >= 1`

本轮不做员工号是否存在于 crew 主数据的校验，避免引入额外依赖和查询成本。后续如果需要，可以单独做“员工号存在性/同 base/同 seat”校验设计。

## 测试设计

### 单元测试

需要补充或更新以下单元测试：

1. `pbs-server/src/services/lineholder/rule-bid-value.test.ts`
   - 验证 `crew-days-off-share` 能序列化为 `operator=In`、`paramA=employeeNumber`、`paramB=minimumDays`。
   - 验证已保存的 `paramA` / `paramB` 能反序列化回 `employeeNumber` / `minimumDays`。
   - 验证摘要格式能表达员工号和最少共享天数。

2. `pbs-server/src/services/days-off/days-off-validation.test.ts`
   - 验证 `206` 接受合法的员工号和最少共享天数。
   - 验证员工号为空时返回校验错误。
   - 验证最少共享天数小于 1、非安全整数时返回校验错误。
   - 验证 `206` 使用错误 bid 类型时返回校验错误。

3. `pbs-portal/src/features/pairing/components/pairing-bid-control.test.tsx`
   - 验证 `crew-days-off-share` 渲染员工号输入框和最少共享天数输入框。
   - 验证修改员工号会触发正确的 `onChange`。
   - 验证修改最少共享天数会触发正确的 `onChange`。

4. `pbs-portal/src/features/days-off/pages/days-off-page.test.tsx`
   - 验证打开 `Shared Days Off With Employee` 弹窗时显示两个字段。
   - 验证员工号为空时不能提交并显示错误。
   - 验证填写员工号和最少共享天数后提交 payload 包含新结构。

### 回归测试

需要覆盖以下已有功能不被破坏：

1. `Prefer Off`
   - 仍显示 `MODIFIERS`。
   - 日期 / 星期选择和 `All or Nothing`、`Minimum required` 保存语义不变。

2. `Min Consecutive Days Off In Window`
   - 仍显示连续天数 N 和日期窗口。
   - 日期窗口顺序校验仍生效。

3. `Days Off / Days On Pattern`
   - 现有 pattern 输入和保存行为不变。
   - 不因新增 `crew-days-off-share` 影响 `stepper-range`。

4. 通用 bid 控件
   - 现有 `tag-list`、`tag-list-date`、`stepper`、`stepper-date-range` 测试继续通过。

### 人工测试案例

人工测试用例需同步写入：

```text
docs/test-cases/pbs-portal/days-off-shared-employee-min-days.md
```

测试用例至少包含：

1. 打开 Days Off 页面，搜索并选择 `Shared Days Off With Employee`。
2. 打开配置弹窗，确认显示 `Employee Number` 和 `Minimum shared days`。
3. 员工号留空，确认 `ADD BID` / `SAVE` 不能提交并显示错误。
4. 输入员工号 `817`，最少共享天数 `12`，保存成功。
5. 重新打开或查看右侧详情，确认摘要表达“员工 817，至少共享 12 天休息日”。
6. 回归检查 `Prefer Off`：`MODIFIERS` 仍只在 `Prefer Off` 显示。
7. 回归检查 `Min Consecutive Days Off In Window`：连续天数 N 和日期范围仍正常。

## 不做范围

- 不修改数据库 schema。
- 不修改其他 Days Off property 的结构。
- 不改变 `MODIFIERS` 显示规则。
- 不做员工号 autocomplete。
- 不做 employee master lookup。
- 不改旧库导入脚本以外的历史数据迁移。

## 验收标准

1. 打开 `Shared Days Off With Employee` 配置弹窗时，可以看到员工号输入和最少共享天数输入。
2. 员工号为空时不能确认保存，并显示错误提示。
3. 最少共享天数为空、非整数或小于 1 时不能确认保存，并显示错误提示。
4. 输入员工号 `817`、最少共享天数 `12` 后保存，后端序列化为 `param_a=817`、`param_b=12`。
5. 已保存的 `param_a=19`、`param_b=4` 回显为员工号 `19`、最少共享天数 `4`。
6. `Prefer Off`、`Min Consecutive Days Off In Window`、`Days Off / Days On Pattern` 的现有行为不变。
7. 对应单元测试、回归测试和人工测试案例文档已补齐并通过复核。

## 实施与验证记录

已实施：

- 新增 `crew-days-off-share` bid 类型表达员工号与最少共享休息天数。
- `206 Shared Days Off With Employee` 默认 bid 改为 `{ employeeNumber, minimumDays }`。
- 前端 `PairingBidControl` 增加员工号输入与 `Minimum shared days` 数字输入。
- Days Off 弹窗增加员工号必填与最少共享天数校验。
- 后端序列化 / 反序列化映射到 `param_a=employeeNumber`、`param_b=minimumDays`。
- 后端 Days Off 校验增加 206 专用校验。
- SQL seed / migration 中 206 validation 说明同步为 `A=Employee Number`、`B=Min Shared Days`。
- 人工测试用例已写入 `docs/test-cases/pbs-portal/days-off-shared-employee-min-days.md`。

已运行并通过：

```bash
pnpm --dir pbs-portal exec tsc --noEmit --pretty false
pnpm --dir pbs-portal lint -- src/features/days-off/components/days-off-bid-dialog.tsx src/features/days-off/pages/days-off-page.test.tsx src/features/pairing/components/pairing-bid-control.tsx src/features/pairing/components/pairing-bid-control.test.tsx src/features/pairing/pairing-bid-control-logic.ts src/features/pairing/pairing-bid-summary.ts src/features/rule-bids/utils.ts
pnpm --dir pbs-portal test -- pairing-bid-control.test.tsx days-off-page.test.tsx rule-bids/utils.test.ts
pnpm --dir pbs-server build
pnpm --dir pbs-server test -- lineholder/rule-bid-value.test.ts days-off/days-off-validation.test.ts
```

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是一个小范围但跨 contracts、portal、server 的类型链路修复，拆分会增加接口不一致风险。
- Suggested split: 不拆分。
- Write boundaries: 主 agent 单独处理 contracts、`PairingBidControl` 渲染、Days Off 弹窗校验、规则序列化 / 反序列化、后端 Days Off 校验与对应测试。
- Conflict risk: 中等；当前工作区已有 Days Off 未提交改动，实施时必须只做增量修改，不能覆盖现有 diff。
- Execution gate: 用户复核并确认本文档后，才进入实现。
