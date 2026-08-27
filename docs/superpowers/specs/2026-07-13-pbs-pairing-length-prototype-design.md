# PBS Pairing Length 可交互原型设计

日期：2026-07-13
状态：待用户确认后制作原型
范围：仅制作独立、可交互的视觉原型；不修改 `pbs-portal` 产品代码、property catalog、后端、数据库、测试或现有 bid 行为。

## 1. Jen 文档原文依据

来源：`init-docs/Bidding Options V1(2).xlsx`，`Sheet1` 第 9 行。它紧跟在 `Work Day Preference` 之后。

| 字段 | 内容 |
| --- | --- |
| Category | `Pairing` |
| Final Bid Option | `Pairing Length` |
| Purpose | `Crew bids for pairing duration by number of days.` |
| Required Fields / Inputs | `Min days, max days, date range, award/avoid` |
| Rules / Defaults | `Add date range.` |
| Notes for Developers | `Keep.` |

结论：Jen 要保留 `Pairing Length`，并在“按 pairing 持续天数表达偏好”的基础上加入 `date range`。

## 2. 已确认业务语义

- `Pairing Length` 判断对象是整个 pairing 的持续天数，不是单个 duty 的 legs、duty count 或 TAFB。
- `Min days` / `Max days` 表达 pairing duration by number of days。
- `date range` 按 pairing start date 判断：pairing 的开始日期落在 `From` / `To` 闭区间内才命中。
- `date range` 是可选约束；未填写时仅按 pairing length 判断。
- `Award` / `Avoid` 沿用当前 Pairing bid 条件标准。

## 3. 原型方案对比

### 方案 A：只做长度范围

只显示 `Min days` / `Max days`，不做日期范围。优点是最简单，也最接近当前 `propertyCode=112` 的已有能力；缺点是没有落地 Jen 明确写的 `Add date range`，因此不符合本轮目标。

### 方案 B：长度范围 + pairing start date range

显示 `Min days` / `Max days`，并提供可选 `From` / `To` 日期范围。日期范围按 pairing start date 判断。优点是完整覆盖 Jen 文档，语义清晰，UI 也能沿用前面已验收的 Pairing 条件弹窗标准；缺点是后续产品实现时需要确认 `112` 是否扩展 payload，或是否吸收已有隐藏 `132` 的 date scoped pairing length 能力。

### 方案 C：长度范围 + 任意重叠 date range

显示 `Min days` / `Max days`，但日期范围按 pairing span 与所选日期区间是否重叠判断。优点是能覆盖跨日 pairing；缺点是 Jen 文档没有写“overlap”，用户已确认本轮按 pairing start date 判断，所以暂不采用。

推荐方案：方案 B。

## 4. 原型界面与交互

原型复用已经验收的 Pairing 条件 UI 基线，尤其对齐 `Flight Legs per Duty` 和 `Work Day Preference`：紧凑白色弹窗、半透明遮罩、紧凑标题栏、全大写 section caption、Tier 按钮、Award/Avoid 分段控件、英文日期触发器和右下角 footer。不创建新的视觉体系。

弹窗标题：`Configure Pairing Length`。

填写区按以下顺序显示：

1. `TIERS · REQUIRED`：T1–T7 多选，初始为空。
2. `PREFERENCE`：`Award | Avoid`，新建默认 `Award`。
3. `PAIRING LENGTH · REQUIRED`：
   - `Min days`
   - `Max days`
   - 两个字段为整数天数，最小值为 1。
   - 允许只填 `Min days` 或只填 `Max days`，用于表达 “at least N days” 或 “up to N days”。
   - 两个都填时必须 `Min days <= Max days`。
4. `LIMIT TO PAIRING START DATE`：
   - 使用与 `Prefer Off`、`Long Stretch Off / Compressed Flying`、`Pairing Preference`、`Airport Preference`、`Pairing Check-In / Check-Out Time` 一致的可选日期范围选择方式。
   - 默认关闭；关闭时不显示 From / To，也不限制日期。
   - 打开后显示 `From date` / `To date`，使用 Portal 风格英文日期触发器和日历弹层，不使用浏览器原生 `input[type=date]`。
   - 打开后 From / To 必须成对填写，且 From 不晚于 To。
5. footer：`CANCEL`、`SAVE FAVORITE`、`ADD BID`，右对齐。

不显示技术 operator、payload、`RULE PREVIEW`、实时自然语言结果句、说明卡片或额外浮层。完成度只通过 footer 启用状态表达。

## 5. 默认状态与完成度

新增时：

- Tiers 均未选。
- `Award` 默认选中。
- `Min days` / `Max days` 为空。
- date range 开关关闭，`From date` / `To date` 不显示。
- `SAVE FAVORITE` 和 `ADD BID` 均禁用。

footer 启用条件：

- 至少选择一个 Tier。
- `Award` / `Avoid` 有合法值。
- `Min days` 或 `Max days` 至少填写一个。
- 已填写的天数字段都是正整数。
- 如果 Min / Max 都填写，则 `Min days <= Max days`。
- date range 开关关闭时不校验日期；打开时 From / To 都存在且 `From <= To`。

点击 `SAVE FAVORITE` 或 `ADD BID` 在原型中只保留按钮视觉，不发请求、不保存、不写数据。

## 6. 原型实现边界

在新的 `.superpowers/brainstorm/<session>/pairing-length-v1.html` 中生成自包含 HTML/CSS/JavaScript。若需要让 Codex 桌面端稳定预览，可在被 Git 忽略的 `pbs-portal/.superpowers/` 保留同一份仅开发期副本。

- 仅本地 DOM state 驱动 tier、preference、days、date range 和 footer 状态。
- 不导入 Portal 运行时、React、业务 service 或 API client。
- 不写入 `pbs-portal/src`、`packages/contracts`、`pbs-server`、`sql`、`e2e` 或 `docs/test-cases`。
- 不创建 Git 提交或推送。

## 7. 验收标准

1. 打开原型时显示 `Award` 默认选中，但 Tier、Min/Max、日期范围为空，两个 footer 主操作禁用。
2. 选择 Tier 并填写合法 Min 或 Max 后，若日期范围为空，footer 主操作启用。
3. 同时填写 Min 和 Max 时，`Min days <= Max days` 才能启用主操作。
4. date range 开关默认关闭；打开后才显示 From / To。
5. 日期范围必须成对填写；只填 From 或只填 To 时主操作禁用。
6. 日期范围按 pairing start date 文案呈现，但不显示冗长解释句。
7. 视觉与前面 Pairing 条件原型一致：紧凑弹窗、开关式可选日期范围、英文日期触发器、无浏览器原生日期输入、无规则预览卡片。
8. 所有交互仅改变原型界面，无网络请求或数据写入。

## 8. Multi-Agent Parallelism Assessment

- Recommendation: No。
- Rationale: 原型只包含一个孤立 HTML 文件，拆分编写会增加协调成本。
- Suggested split: 不拆分实现；如需要，完成后可独立做一次只读审阅。
- Write boundaries: 原型限定在新的 `.superpowers/brainstorm/` 会话目录和 `pbs-portal/.superpowers/` 开发期副本。
- Conflict risk: Low；不会触碰当前 Work Day Preference 产品实现线程正在处理的 `pbs-portal/src` / `pbs-server` 文件。
- Execution gate: 用户审阅并确认本 spec 后，才开始生成原型 HTML。
