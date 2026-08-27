# PBS Pairing Configure Dialog 输入法 Enter 行为修正设计

## 背景

`Configure Pairing Bid` 弹窗中的部分 `BID` 输入框是 tag-list 类型。用户输入一个值后，可以按 `Enter` 或逗号把当前文本加入 bid token 列表。

当前实现没有判断输入法 composition 状态。用户使用中文、日文等输入法时，按 `Enter` 选择候选词，也会被控件误认为“提交 token”，导致错误内容被加入输入框，体验很差。

## 目标

- 输入法正在 composition 时，`Enter` 只交给输入法处理，不提交 token。
- 输入法结束后，普通 `Enter` 仍保持原有“添加 token”行为。
- 逗号提交 token 的原行为保持不变。
- 修正范围限定在 Pairing `Configure Pairing Bid` 使用的 tag-list 输入控件。

## 非目标

- 不修改 Reserve / Line 其他页面的 date input Enter 行为。
- 不重构 `PairingBidControl` 的整体结构。
- 不改变 autocomplete 选择逻辑。
- 不改变 token 解析、大小写规范化、去重逻辑。

## 方案

在 `pbs-portal/src/features/pairing/components/pairing-bid-control.tsx` 的 `TagListControl` 输入框 `onKeyDown` 中增加 IME composition 判断：

- 如果 `event.nativeEvent.isComposing === true`，直接 return。
- 只有在非 composition 状态下，`Enter` 或逗号才执行原有逻辑：
  - `event.preventDefault()`
  - `commitTokens()`

为了兼容部分浏览器在 composition 结束附近可能上报 `key === "Process"` 的情况，可以同时避免处理 `Process` 键。

## 测试

在 `pbs-portal/src/features/pairing/components/pairing-bid-control.test.tsx` 增加或调整覆盖：

1. 输入普通文本后按 `Enter`，仍会添加 token。
2. 输入法 composition 状态下按 `Enter`，不会添加 token。
3. 输入普通文本后按逗号，仍会添加 token。

## 验收标准

- 中文输入法选词时按 `Enter` 不会把候选文本误加为 bid token。
- 非输入法状态下按 `Enter` 仍可正常添加 token。
- 逗号提交 token 不受影响。
- Pairing bid control 单元测试通过。
- Pairing feature 相关测试通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个控件和对应测试，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pairing-bid-control.tsx` 与 `pairing-bid-control.test.tsx`。
- Conflict risk: 低。
- Execution gate: 文档写入后直接按本设计实现。
