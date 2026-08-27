# PBS Work Day Preference 可交互原型设计

日期：2026-07-13
状态：v2 原型已重做，待用户验收
范围：仅制作独立、可交互的视觉原型；不修改 `pbs-portal` 产品代码、property catalog、后端、数据库、测试或现有 bid 行为。

## 1. 背景与目标

现有 Pairing property `110` 的技术名称为 `Any/Every Duty On Date / Day`。它的业务含义是：按 pairing 内每个 duty 的工作日期或星期几，表达 award / avoid 偏好。

Jen 的 TO-BE 名称为 `Work Day Preference`。本原型的目标是让机组人员清楚表达“我希望 / 避免 pairing 在哪些工作日期或星期几出现 duty”，而不要求他们理解旧的 property 名称、operator 或底层 payload。

原型必须能演示完整填写路径，但不提交、保存、发送网络请求或写入任何数据。

## 2. 已确认业务语义

- 判断对象是 pairing 内的每一个 duty 的开始日期；不是 pairing 起始日期，也不是工作天数。
- `Any work day`：任一 duty 命中即命中。
- `Every work day`：每一个 duty 都必须命中。
- `Specific dates or weekdays` 对应既有 `In` 语义：可选多个具体日期、多个星期几，二者之间为 OR。
- `Date range` 对应既有 `Between` 语义：仅有起止日期，不能混入星期几。

例如：`Avoid + Any work day + Jun 23–Jun 27` 表示避免任一 duty 落在该区间内的 pairing。

## 3. 原型界面与交互

原型复刻已确认的 PBS Pairing 弹窗视觉基线，尤其对齐此前的 Check-In / Check-Out Time 与 Flight Legs per Duty 原型：紧凑白色弹窗、半透明遮罩、紧凑标题栏、全大写 section caption、Tier 按钮、分段控件与右下角 footer。不创建产品页面或新视觉体系。

弹窗标题：`Configure Work Day Preference`。

填写区按以下顺序显示：

1. `Tiers · Required`：T1–T7 多选，初始为空。
2. `Preference`：`Award | Avoid`，新建默认 `Award`。
3. `Work-day match`：`Any work day | Every work day`，新建默认 `Any work day`。
4. `WHEN SHOULD THE WORK DAY OCCUR? · REQUIRED`：二选一模式，分段按钮文案为单行 `Specific dates / weekdays | Date range`。
   - `Specific dates / weekdays`：使用 Portal 风格的 `Select dates` 触发器和日历弹层，选中日期显示为可删除 chip；下方点选 `Mon`–`Sun`。至少填一项，日期与星期之间为 OR。
   - `Date range`：使用两个 Portal 风格的 `From date` / `To date` 触发器与日历弹层；两个日期都必填，且 From 不晚于 To。此模式不显示星期控件。
5. 不显示 `RULE PREVIEW`、实时英文结果句、模式说明小字或 `Interactive prototype` 浮层。完成度只通过 footer 的启用状态表达。

底部的 `SAVE FAVORITE` 与 `ADD BID` 在未完整填写时禁用；填写完成后仅切换视觉状态，点击仍不执行任何操作。切换两种模式时，各模式内已填写的草稿保留，但提交语义只取当前模式。

### 3.1 v2 视觉约束

- 不使用浏览器原生 `input[type=date]`，避免出现本机语言的“年/月/日”占位符和与 Portal 不一致的控件样式。
- 弹窗、标题、关闭按钮、section 间距、Tier、Award/Avoid、Any/Every、日期触发器和 footer 的尺寸与比例复用此前 Pairing 原型；不再使用上一版 780px 宽、宽松表单的通用设计。
- 日期区域保持单列、信息密度适中：具体模式中先为日期触发器与 chip，再为一行星期按钮；范围模式中为一行两个日期触发器。不要额外包一层大面积灰色面板。
- footer 只保留 `CANCEL`、`SAVE FAVORITE`、`ADD BID`，右对齐；没有分割线以上的预览卡片。
- `Any work day` / `Every work day` 是完整按钮文案；正式帮助或摘要需要说明时，`Every` 的含义是“每一个 duty 必须落在所选日期或星期之一”，并非要求每个所选星期都出现。

## 4. 原型实现边界

在新的 `.superpowers/brainstorm/<session>/work-day-preference-v1.html` 中生成自包含 HTML/CSS/JavaScript。若需要让 Codex 桌面端稳定预览，可在被 Git 忽略的 `pbs-portal/.superpowers/` 保留同一份仅开发期副本，并通过已运行的 Vite `@fs` 本地地址访问；该副本不被产品 import、build 或发布链路引用。

- 仅本地 DOM state 驱动控件选中态、日期/星期选择、完成度和 footer 按钮状态。
- 不导入 Portal 运行时、React、业务 service 或 API client。
- 不写入 `pbs-portal/src`、`packages/contracts`、`pbs-server`、`sql`、`e2e` 或 `docs/test-cases`。
- 不创建 Git 提交或推送。

## 5. 验收

1. 打开时显示 `Award + Any work day`，但 Tiers 和时间条件为空，两个 footer 主操作均禁用。
2. 原型视觉与此前 Pairing 原型一致：紧凑 modal、英文 Portal 日期触发器、单行模式切换、无浏览器原生日期占位符、无 Rule Preview 卡片或浮层说明。
3. 具体日期/星期模式允许日期和星期同时选择；日期范围模式仅显示 From / To 日期触发器。
4. 不完整或非法的日期范围不会启用操作按钮；界面不显示实时英文结果句。
5. 切换模式时保留各自草稿，不混淆两种表达；用户可以一眼分辨“指定日期/星期”与“连续日期范围”。
6. 所有交互仅改变原型界面，无网络请求或数据写入。

## 6. Multi-Agent Parallelism Assessment

- Recommendation: No。
- Rationale: 原型只包含一个孤立 HTML 文件，拆分编写会增加协调成本。
- Suggested split: 不拆分实现；仅进行独立文档审阅。
- Write boundaries: 原型限定在新的 `.superpowers/brainstorm/` 会话目录；当前另一窗口继续独占 `pbs-portal/src/features/pairing/**` 的 107 实现与验证。
- Conflict risk: Low。
- Execution gate: 独立审阅通过，并由用户审阅本文件后，才开始生成原型 HTML。
