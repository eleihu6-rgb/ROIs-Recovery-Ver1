# PBS Days Off / Days On Pattern UI 表达优化设计

日期：2026-05-20  
状态：已确认并实施  
范围：只优化 `Days Off / Days On Pattern` (`propertyCode=205`) 在 `Configure Days Off Bid` 弹窗里的 UI 文案与布局；不改字段结构、保存映射、后端校验或其他 Days Off 条件。

## 背景

`Days Off / Days On Pattern` 已按 AA / 旧库语义修复为三个字段：

```text
Set Condition Pattern Between A and B Days On, with C Days Off
```

当前字段映射保持不变：

```text
param_a = min days off
param_b = min days on
param_c = max days on
operator = Between
```

用户复查弹窗后反馈：当前 UI 把字段拆成两块：

```text
Days on pattern
Min days on [3] - Max days on [5]

Days off minimum
Minimum days off [4]
```

虽然数据语义正确，但视觉上比较散，容易让人误以为 `Minimum days off` 也应该有 `Max / Min` 切换按钮，或者误解为三项互不相关的设置。

## 目标

1. 让用户一眼看出这是一个完整 pattern 条件，而不是三个孤立字段。
2. 明确 `Between` 只作用在 `days on` 范围上。
3. 明确 `days off` 是 `at least / minimum`，不提供 `Max days off` 或 `Min / Max` 切换。
4. 保持当前数据结构和保存语义不变。
5. 保持弹窗整体风格与现有 PBS Portal 表单一致。

## 推荐方案

把 `days-off-on-pattern` 控件改成一句规则式布局：

```text
Pattern

Work between [ 3 ] and [ 5 ] days on
Then at least [ 4 ] days off
```

右侧 / read-only 摘要继续保持：

```text
Work 3-5 days, then at least 4 days off
```

推荐原因：

- 和 AA / 旧库原文最接近：`Between A and B Days On, with C Days Off`。
- `between ... and ...` 能直接说明前两个数字是一组范围。
- `at least` 能直接说明休息天数是最小值，不需要额外 `Min / Max` 切换。
- 比现在的 section + label 重复更紧凑，弹窗里不显得乱。

## 备选方案

### 方案 A：保留分组，只把标题改清楚

示例：

```text
Work block length
Min days on [3] - Max days on [5]

Required rest after block
At least [4] days off
```

优点：改动小。  
缺点：仍然像多个独立表单项，不如规则句式直接。

### 方案 B：增加 `Min / Max` 切换按钮

不推荐。旧库示例里的 `Days Off (Minimum)` 表示 C 是最少休息天数，当前没有证据显示 205 支持 `Maximum days off`。如果加切换，会创造旧库没有的语义，后端也没有对应字段保存。

## UI 细节

控件建议结构：

```text
Pattern
┌──────────────────────────────────────────────┐
│ Work between [ 3 ] and [ 5 ] days on         │
│ Then at least [ 4 ] days off                 │
└──────────────────────────────────────────────┘
```

视觉要求：

- `Pattern` 使用当前 `BID` 下的小标题风格即可，不新增强装饰。
- 两行规则放在一个轻量区域内，使用统一行高和 gap，避免当前上下两块割裂。
- 输入框继续使用当前 `StepperInput` 样式，宽度保持稳定。
- 文案使用固定英文 UI copy：
  - `Work between`
  - `and`
  - `days on`
  - `Then at least`
  - `days off`
- `aria-label` 可以继续沿用现有：
  - `... min days on`
  - `... max days on`
  - `... minimum days off`

## 不做范围

- 不新增 `Max days off`。
- 不新增 `Min / Max` operator toggle。
- 不改 `days-off-on-pattern` 类型字段。
- 不改 `paramA / paramB / paramC` 保存映射。
- 不改服务端 Days Off 校验逻辑。
- 不改 `Prefer Off`、`Min Consecutive Days Off In Window`、`Shared Days Off With Employee`。

## 测试设计

需要更新：

1. `pbs-portal/src/features/pairing/components/pairing-bid-control.test.tsx`
   - 断言新 UI 文案：`Pattern`、`Work between`、`and`、`days on`、`Then at least`、`days off`。
   - 保持三个输入触发 `onChange` 的测试。

2. `pbs-portal/src/features/days-off/pages/days-off-page.test.tsx`
   - 打开 `Days Off / Days On Pattern` 弹窗时断言规则句式出现。
   - 保持 `minDaysOn > maxDaysOn` 阻止提交。
   - 保持合法值提交 payload 不变。

3. `docs/test-cases/pbs-portal/days-off-pattern-fields.md`
   - 更新人工测试预期，从分组式字段文案改为规则句式文案。

## 验收标准

1. 弹窗中 205 的 BID 区域显示为规则句式：`Work between [minDaysOn] and [maxDaysOn] days on`，下一行 `Then at least [minDaysOff] days off`。
2. 用户不会看到暗示 `days off` 可切换为 Max 的控件。
3. 三个字段的输入和校验行为不变。
4. 保存 payload 仍为 `days-off-on-pattern`，字段仍是 `minDaysOff`、`minDaysOn`、`maxDaysOn`。
5. 现有 205 摘要、后端序列化和校验测试继续通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是单个控件的小范围 UI 表达优化，拆分会增加沟通成本。
- Suggested split: 不拆分。
- Write boundaries: 主 agent 只修改 `PairingBidControl` 的 205 控件 JSX、相关前端测试和人工测试案例文档。
- Conflict risk: 低到中；当前工作区已有 205 字段语义修复未提交，实施时必须在既有 diff 上继续增量修改，不回滚前序改动。
- Execution gate: 用户复核并确认本文档后，才进入实现。

## 实施记录

实施日期：2026-05-20

已完成：

1. `DaysOffOnPatternControl` 从两段分组式字段改为规则句式布局：

   ```text
   Pattern
   Work between [minDaysOn] and [maxDaysOn] days on
   Then at least [minDaysOff] days off
   ```

2. 保留原有三个输入的 `aria-label`，因此输入定位、无障碍语义和测试操作路径不变。
3. 未新增 `Max days off` 或 `Min / Max` 切换按钮。
4. 未修改 `days-off-on-pattern` 类型字段、保存映射、后端校验或摘要逻辑。
5. 已更新前端自动化测试与人工测试案例。

## 验证记录

已通过：

```bash
pnpm --dir pbs-portal test -- pairing-bid-control.test.tsx days-off-page.test.tsx
pnpm --dir pbs-portal exec tsc --noEmit --pretty false
pnpm --dir pbs-portal lint -- src/features/pairing/components/pairing-bid-control.tsx src/features/pairing/components/pairing-bid-control.test.tsx src/features/days-off/pages/days-off-page.test.tsx
pnpm --dir pbs-portal build
git diff --check
```

说明：

- Portal 测试命令实际匹配并执行了 48 个测试文件、301 个测试。
- `pnpm --dir pbs-portal build` 仍有既有 Vite chunk size warning，但构建成功。
