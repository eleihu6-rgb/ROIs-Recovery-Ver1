# PBS Pairing Preference 筛选选择组件设计

## 目标

将 `Configure Pairing Preference` 弹窗中展开的筛选条件从自由文本输入改为可选择控件，避免用户手工输入日期、时间、天数和 Credit，同时保持现有筛选参数与后端查询语义不变。

## 范围

- `Pairing Start Date`：复用 `PbsDatePicker` 的 `range` 模式，只允许选择当前 bid period 内的日期。
- `Check-In Time` / `Check-Out Time`：使用统一的时间范围选择器，分别选择 From / To。保持现有查询语义：Check-In 允许 `22:00 → 08:00` 这类跨午夜范围；Check-Out 仍要求 From 不晚于 To，本次不扩展其后端业务语义。
- `Pairing Days`：使用 Min / Max 数字选择控件，不再使用自由文本输入。
- `Pairing Credit`：新增可复用的 `HH:MM` 时长范围选择组件。交互形式与时间选择器一致，但小时值不限制在 `0-23`，必须支持超过 24 小时的 Credit；分钟按合法分钟值选择。
- 保留现有 `Clear filters`、`Apply filters`、已应用筛选数量、分页与已选 Pairing 状态。

## 组件与数据规则

1. 日期控件复用现有 `PbsDatePicker`，不再创建独立日期输入框。
2. 普通时间范围与 Credit 时长范围必须是两个不同语义的组件：
   - 普通时间是一天内的时刻。
   - Credit 是累计时长，超过 24 小时不得归零或截断。
3. 新增一个当前周期筛选边界查询，由服务端从完整 Pairing 池（不是当前分页结果）返回 `maxDurationDays` 与 `maxCreditMinutes`。`Pairing Days` 提供 `1..maxDurationDays` 的选择项；Credit 时长组件据 `maxCreditMinutes` 生成小时选择范围。前端不得从当前页推断边界，也不得硬编码业务最大值。
4. 时间与 Credit 均按 1 分钟精度选择，保存格式分别保持 `HH:MM` 时刻与整数 Credit 分钟。Credit 组件必须按 `maxCreditMinutes` 约束最终总分钟数，例如最大值为 `12:15` 时不得选择 `12:16-12:59`。
5. UI 草稿继续转换为现有筛选字段：`originDateFrom/To`、`timeFrom/To`、`releaseTimeFrom/To`、`durationDaysMin/Max`、`creditMinutesMin/Max`；不新增替代字段。
6. 所有范围继续支持仅选择 From 或仅选择 To，分别表达下限或上限。两端同时存在且 Min 大于 Max 时，在对应控件附近显示可访问的字段错误，不显示原始请求异常。
7. 当前周期边界加载失败时，Days 与 Credit 控件进入禁用错误态并提供可键盘操作的 Retry；日期、Check-In、Check-Out 和 Pairing 列表仍可使用，不展示原始 HTTP/异常文本。

## 交互与视觉

- 所有控件保持当前筛选栏统一高度、圆角、边框和焦点样式。
- 用户可以仅用鼠标完成全部选择，也支持键盘操作。
- 弹层不得被 Pairing Preference 弹窗或表格滚动容器裁切。
- 选择后清晰显示值；清除单项或点击 `Clear filters` 后恢复空状态。

## 验收标准

- 五组筛选条件均不要求用户手工键入值。
- 日期只能从当前 bid period 选择。
- Check-In 支持普通范围和跨午夜范围；Check-Out 保持现有非跨午夜范围校验。
- Credit 可选择并正确提交 `24:00` 以上的时长。
- 现有筛选、分页、已选 Pairing 和 Apply/Clear 行为不回归。
- 更新 focused Vitest、真实页面 Playwright 和对应 PBS QA 测试案例；通过 Portal build、lint、`check:ui` 与相关回归测试。

## 非目标

- 不修改 Pairing 搜索算法。
- 不改变已发布的 Pairing 数据。
- 不重做整个 Pairing Preference 弹窗或其他 Bid Property 编辑器。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 组件、筛选草稿和查询契约紧密耦合，改动规模有限，单一实现链路更容易保证一致性。
- Suggested split: 不拆分实现；完成后独立审查 spec 与测试覆盖。
- Write boundaries: `pbs-portal` Pairing Preference picker、必要的共享 preference 组件、对应 contract/server 边界与测试文档。
- Conflict risk: 多人同时修改 picker 与筛选 contract 容易冲突。
- Execution gate: 用户审阅并批准本 spec 后才实施。
