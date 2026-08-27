# PBS 关闭周期隐藏删除按钮设计

## 背景

当前 Bid 周期关闭后，后端会用 `423` 拦截草稿修改，这是正确的兜底行为。但前端 Existing Bid Properties 行里仍显示删除按钮，用户点击后会看到删除确认框和原始请求失败信息，体验不合理。

## 目标

- 当 `currentPeriod.canEditBid !== true` 时，隐藏 Existing Bid Properties 行内的删除按钮。
- 关闭周期下不允许用户从该入口触发删除请求。
- 后端 `423` 校验保持不变，作为安全兜底。

## 范围

- 只改 Existing Bid Properties 的删除按钮展示逻辑。
- 不改编辑按钮逻辑。
- 不改下方 Add / Save / Search / Feedback / View Rules 等按钮逻辑。
- 不改后端接口和数据库。

## 推荐方案

在页面或 section 传参处根据 `isPeriodReadOnly` 控制 `onDelete` 是否传给行组件；行组件收到无删除回调时不渲染删除按钮。

该方案最小、清晰，并复用现有组件对 optional action 的模式。

`currentPeriod.canEditBid !== true` 按现有页面逻辑继续作为 fail-closed 规则：只有服务端明确返回 `canEditBid: true` 时才显示删除入口；`false`、`null`、`undefined` 都视为只读，不显示删除按钮。

## 备选方案

- 保留删除按钮但禁用：仍会让用户误以为关闭周期存在删除动作，不符合当前诉求。
- 点击后 toast 提示只读：仍保留了无效入口，且截图里的问题不会根治。

## 验收标准

- 关闭周期 Existing Bid Properties 行不显示删除按钮。
- 点击区域不再出现删除确认框。
- 不会调用删除接口。
- 开放周期删除按钮仍正常显示和工作。
- 现有只读态和后端 `423` 兜底不被移除。

## 测试计划

- 更新对应 PBS Portal 单元/组件测试：
  - 关闭周期不显示删除按钮。
  - 关闭周期无法打开删除确认框。
  - 关闭周期不会调用删除接口。
  - 开放周期删除按钮仍正常显示。
- 如当前 E2E 基础环境可用，补充或运行对应 PBS Portal Playwright 路径验证关闭周期真实 UI 不显示删除入口。
- 运行受影响的测试文件，并在交付时报告 PASS / FAIL。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 单点 UI 行为改动，涉及文件少，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: 预计只碰 pbs-portal 对应页面/section/测试。
- Conflict risk: 低。
- Execution gate: 用户确认本 spec 后再实现。
