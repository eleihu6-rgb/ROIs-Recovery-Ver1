# PBS Preference 条件 UI 标准

> 适用范围：`pbs-portal` 的 Pairing 条件配置弹窗、Search Pairings 中复用同一配置组件的编辑路径，以及本轮纳入统一标准的 Days Off preference 条件。
>
> 本文是后续新增、改造和修复 Pairing 条件的强制标准。Jen / 产品需求中存在明确例外时，以需求为准，但必须在对应 spec、实现说明和回归测试中留下依据。

## 1. 先复用，再新增

1. 先检查已验收的同类条件和共享组件；不能因为局部实现更快而再造一套日期、范围或 segmented control。
2. 业务弹窗使用 Portal 既有的 `PbsDialogFrame` 白色轻量弹窗体系，不迁移为后台工具风格。
3. 条件只要在 Pairing 页面和 Search Pairings 页面都可编辑，两处必须走同一 editor 与同一 payload 映射，不能分别复制 UI 逻辑。
4. 新增或重做 preference 条件时，默认使用 `pbs-portal/src/shared/components/preferences/` 下的视觉 primitives：`PreferenceConditionSection`、`PreferenceSectionTitle`、`PreferenceInlineSwitch`、`PreferenceNumberRange`、`PreferenceSegmentedControl`、`PreferenceComparisonValueControl`。这些组件只承载视觉骨架，不承载具体 bid 业务逻辑。
5. 8 组新条件的行为契约以 [PBS Preference Condition 行为统一标准设计](../../superpowers/specs/2026-07-13-pbs-preference-condition-behavior-standard-design.md) 为准；字段默认值、必填/可选、payload 清理和回显规则不能只靠局部 editor 推断。

## 2. 弹窗骨架与信息层级

- 固定顺序：标题 → `TIERS` → `PREFERENCE` → 条件专属字段 → footer。
- `TIERS` 使用 `TierToggleGroup`；是否默认选中由该条件的产品需求决定，不能把其他条件的默认值带进来。
- 标题和分组标题清楚即可。不要为了“解释更多”加入重复的说明性小字、技术 operator 或 Rule Preview；只有用户必须据此作出选择时才保留说明。
- footer 的 Cancel / Save Favorite / Add or Update Bid 沿用共享 `PairingPropertyDialogFooter` 的布局、禁用态和 pending 态。
- Section 视觉统一使用轻量标题、小间距和少量 divider。不要在每个 editor 中手写新的 uppercase 标题、required 文案、switch 样式或数字范围布局。
- 条件专属字段之间的垂直间距应保持紧凑，优先使用 `PreferenceConditionSection` 的默认 spacing；只有字段确实需要分组时才加 divider。

## 3. 选择控件与默认值

### 3.1 Award / Avoid、Any / Every

- 二选一状态必须由唯一的 state 值派生：视觉白色选中块、紫色文字、阴影、`aria-pressed` 和保存 payload 不得分别计算。
- 外观沿用已验收的 Award/Avoid segmented 规则：选中为白底 + 紫字 + 阴影；未选为透明底 + 灰字。
- `Preference`、`Duty match`、`Work-day match` 等业务上有默认值的二选一，可按 spec 设置默认值；但不能因为控件需要初始态而给 `Tiers` 或日期范围补默认。
- 非 Award/Avoid 的 segmented mode 默认使用 `PreferenceSegmentedControl`。如果某个条件需要自定义按钮，必须保持同一 state 驱动视觉选中态、`aria-pressed` 和 payload。

### 3.2 Tiers 与可选限制

- `Tiers` 默认是否为空必须逐条件遵循需求。需求未明确时保持空，并由 footer 阻止保存。
- `Limit to … date`、日期范围、事件范围等 optional 限制默认关闭或 `Any date`；不得自动填入具体日期、Specific date 或 Date range。
- 需要三种日期范围语义时，使用 `Any date / Specific date / Date range` 三选一。`Any date` 不应残留或提交限制日期值。
- 二态 optional 限制默认使用 `PreferenceInlineSwitch`，label 与 switch 保持同一行；开启后只展开必要字段，不增加解释性段落。
- switch 关闭后，保存 payload 不得包含旧隐藏字段；如果 editor 内部保留草稿，也必须确保 confirm 前输出已清理。

### 3.3 数字范围

- Min / Max 类型的范围输入默认使用 `PreferenceNumberRange`。
- 一行两列，suffix 固定在输入框右侧，例如 `days`。
- 输入为空时保留 placeholder，不自动填入默认值。
- 错误信息只在用户输入非法值后显示；不要在初始空状态显示红色错误。
- 单个条件如果需要 stepper 按钮，可以继续使用已验收的 `PbsInputNumber`，但必须保持 section 标题、间距和 required 标记一致。

### 3.4 数字比较

- 用户必须选择比较符号并输入数值时，默认使用 `PreferenceComparisonValueControl`。
- 标准布局为左侧 operator select、右侧 number input；select 直接显示 `<` / `=` / `>` / `Between`，不使用 `Less than` / `Exactly` / `More than` 的长文案按钮。
- `<` / `=` / `>` 必须保留准确的无障碍语义，例如 `Less than` / `Equal to` / `More than`。
- `Between` 只在业务允许区间比较时出现；选中后右侧显示 `From` / `To` 两个输入。
- suffix 固定在输入框右侧，例如 `legs` / `days`。
- placeholder 使用中性输入提示，例如 `Enter legs` / `Enter days`；不要用 `1-5` 这类范围型 placeholder 暗示固定可填范围。
- 切换 operator 时，保存 payload 必须清理隐藏字段：非 `Between` 不提交 `from/to`，`Between` 不提交单值。
- 该标准适用于 `Flight Legs per Duty`、`Month-End Carryover` 以及后续同类数字比较条件；日期范围、星期、时间窗口和业务 mode 不套用此控件。

## 4. 日期与日期范围

- 所有 Pairing 条件的日期选择使用共享 `PbsDatePicker`；禁止为单个条件改用 `PortalDatePicker` 或手写文本输入式日历。
- 单日、多日与范围分别使用标准 `single`、`multiple`、`range` mode，并传入当前 bid period 的 `periodCode`。
- `Date range` 必须是一个标准范围控件：`Start date · TO · End date` 与同一张覆盖式日历。禁止两个相互独立的日期输入框或两个独立浮层。
- 日期仅可从当前 bid period 的有效日期中选择；已保存历史值必须可正确回显。
- `Specific dates / weekdays` 这类组合条件中，日期和星期的业务关系、空值规则及 payload 必须按 property 的明确契约实现，不能由 UI 文案推断。

## 5. 布局、焦点与可访问性

- 控件不得被弹窗边缘、footer 或容器 `overflow` 裁切；聚焦外框和数值单位必须完整可见。
- 交互按钮必须使用语义化 `button`，有准确的英文 aria label；切换项提供 `aria-pressed`，开关提供正确的 switch 语义。
- 可点击控件有 `cursor-pointer`，禁用状态不可点击且与 enabled 状态清晰区分。
- UI 文案保持产品英文；测试可依赖稳定的可访问名称，不依赖视觉位置或临时 CSS 结构。

## 6. 实现前与交付前检查

### 实现前

1. 在 spec 中列出该条件的每个字段：是否必填、是否有默认值、是否为 optional、保存 payload 和编辑回显规则。
2. 逐项映射到现有标准组件；若没有可复用组件，先说明为什么不能复用，再创建最小的新组件。
3. 若需求图与已验收条件不同，先出原型并获得确认，不自行推断默认状态或额外说明文案。

### 交付前

1. 更新 focused Vitest：初始态、切换态、日期/范围、payload 或有效性。
2. 更新 Playwright：真实 Pairing 页面至少覆盖新增或编辑主路径；共享编辑器变化同时覆盖 Search Pairings 回显。
3. 运行 focused Vitest、相关 Playwright、`cd pbs-portal && npm run lint -- --quiet`、`cd pbs-portal && npm run build`、`npm run check:ui` 与 `git diff --check`。
4. 如果改动触达共享 editor、dialog shell、mapper 或 Search Pairings 回显路径，优先补跑 `cd pbs-portal && npm test`；未运行时交付说明必须写明原因和剩余风险。
5. 对 UI bug，测试必须包含会捕获原始错误的断言，例如 selected class 与 `aria-pressed` 同步、范围 picker 只有单一入口、焦点外框不裁切。

## 7. 当前基准条件

后续实现优先与以下已验收路径对照：

- `Prefer Off`
- `Long Stretch Off / Compressed Flying`
- `Pairing Preference`
- `Airport Preference`
- `Pairing Check-In / Check-Out Time`
- `Flight Legs per Duty`
- `Work Day Preference`
- `Pairing Length`

这些条件不要求视觉完全一模一样；字段语义不同可以有不同 editor。但弹窗骨架、默认值纪律、日期交互、选择态、可访问性、隐藏字段清理和验证门槛必须一致。

新增条件或重做已上线条件时，默认按上述路径逐步迁移到共享 preference primitives。已上线条件不要求一次性批量重构；只有在被触碰、修复或新增同类能力时才迁移，避免无关大改。
