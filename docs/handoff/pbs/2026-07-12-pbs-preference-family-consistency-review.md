# PBS 三类 Preference 条件一致性审查（2026-07-12）

## 范围与结论

本次仅做审查与记录，**未修改产品代码、数据库或 Git 状态**。

已完成的新一轮条件：

1. Prefer Off
2. Long Stretch Off / Commuter Pattern（分别位于 Days Off / Line）
3. Pairing Preference

结论：三个条件已经共用了弹窗框架、Tier 外观和月历主体；但决定用户体验的行为规则仍分散在各功能内。若继续按当前方式新增条件，日历弹层、日期范围校验、Tier 最后一项、数字输入和 Award/Avoid 的行为会逐步分叉。下一轮应先做一次小范围的“Preference interaction primitives”收口，再继续扩展新条件。

## 已经共享且应继续由公共层维护的部分

| 能力 | 当前公共实现 | 使用情况 | 审查结论 |
| --- | --- | --- | --- |
| 弹窗外框、遮罩、滚动、Esc、footer | `src/shared/components/ui/pbs-dialog-frame.tsx` | Days Off、Line、Pairing 均使用 | 已统一；继续作为唯一业务弹窗框架。 |
| Tier 按钮外观、键盘语义 | `src/shared/components/tiers/tier-toggle-group.tsx` | Days Off、Line、Pairing 均使用 | 视觉已统一；它只负责展示与点击，不应暗含业务选择规则。 |
| 单日期 / 日期范围日历 UI | `src/features/days-off/components/prefer-off-calendar-picker.tsx` | Prefer Off、Long Stretch、Commuter、Pairing 均使用 | 日历选择、跨月展示和 range 的“先起点、后终点”已统一。当前目录归属不准确：它已是跨功能组件。 |
| 大号上下 stepper 外观 | `LargeStepperInput` | Long Stretch、Commuter 已使用 | Pairing / Prefer Off 仍各有近似实现，尚未收口。 |

## 已确认的问题和统一原则

### 1. Pairing 的日历弹层错误占位，造成截图中的大块空白

`PairingPreferenceEditor` 给两种日期选择都传入了 `reservePopoverSpace`；公共日历在打开时因此插入与日历等高的普通文档流占位。日历本身已经通过 portal/fixed 定位弹出，不需要占位。

结果就是截图二中日历下方到 FULFILMENT 之间的空白；Long Stretch 和 Commuter 没有传此属性，所以没有同样问题。

统一规则：日历永远为锚定输入框的覆盖式弹层，不推动弹窗内容；完成日期范围第二次选择后关闭。只有明确的非弹层日历场景才允许另行设计，不通过这个布尔参数临时改变布局。

### 2. “日期范围已开启但尚未填完”不应是错误，也不应显示 0 matching runs

Pairing 目前一打开 Limit to Run Date，或切换到 Date Range 后只选到起点，就立即显示红色 `Select a valid date range.`，并根据不完整范围计算 `0 matching runs`。这会把正常的填写中间态误画成失败状态。

统一状态规则：

| 状态 | 页面表现 | 是否允许保存 |
| --- | --- | --- |
| 未开启日期限制 | 不显示日期控件与 run 计数 | 由其余字段决定 |
| 已开启、尚未完成选择 | 正常中性提示（例如“Select a start date” / “Select an end date”），不显示红字、不显示 0 | 不允许保存 |
| 已完成选择，查询中 | 显示 Loading，不作为校验错误 | 不允许保存 |
| 已完成选择，无匹配 run | 显示明确红色业务错误 | 不允许保存 |
| 已完成选择且有匹配 run | 显示真实数量 | 由数量 / Tier 等其余规则决定 |

这个规则适用于 Pairing 的 Specific Date / Date Range，也适用于 Long Stretch 与 Commuter 的可选 Date Range；各功能的 payload 字段可以不同，不应强行合并数据模型。

### 3. Tier 视觉已共享，但“最后一个是否能取消”在三个条件中不一致

Prefer Off、Long Stretch、Commuter 允许取消最后一个 Tier，并以 Required 状态禁用 Add Bid；Pairing Preference 目前阻止取消最后一个 Tier。后者与新设计中“允许无 Tier、此时 Required”的方向不一致，也让同一组 Tier 按钮产生不同的隐含规则。

统一规则：Preference 类条件默认允许用户清空 Tier；空值必须有清晰 Required 状态，并使 Add Bid / Save Favorite 不可用。`TierToggleGroup` 保持无业务判断；每个 dialog 应通过同一个轻量的选择策略 / helper 实现该规则，而不是各自写“最后一个不能取消”的分支。

### 4. 数字输入框正在复制，外观和空值语义可能继续漂移

目前至少有三套相似 stepper：

- `PreferOffInputNumber`：必填数字；较小尺寸。
- `LargeStepperInput`：Long Stretch / Commuter 使用；大号数字。
- `OptionalNumberInput`：Pairing 使用；支持 `null` / `--`。

它们都重复了边框、上下箭头、disabled、min/max、clamp 等视觉和交互细节。Pairing 和 Long Stretch / Commuter 的 UI 已接近，后续不应再复制一套。

建议抽出公共的 `PbsInputNumber` 视觉原语，提供：`value: number | null`、`min`、`max`、`placeholder`、`disabled`、`ariaLabel`、尺寸和 `onChange`。组件只处理输入 / step / 可访问性；“最小值不能超过最大值”“为空是否允许”“何时显示错误”“可用 run 数量上限”仍由各 feature 负责。

### 5. Award / Avoid 也有两套近似 segmented control

Long Stretch 与 Pairing Preference 均有 Award / Avoid 双项选择，样式和语义近似但各自实现。建议作为上述公共交互原语的一部分收口为无业务含义的 `AwardAvoidSegmentedControl`，由调用方提供字段和值，不把 Long Stretch / Pairing 的 payload 逻辑放入公共组件。

### 6. Pairing Preference 还有两个功能性风险

1. 每选一个 Pairing Number 就发起一次 occurrence 请求；多选时会形成并发 N+1。应由后端提供批量 occurrence 查询或一次性按 pairing IDs 查询的接口，再由前端过滤日期范围。
2. 旧的 `pairing-occurrence-list` 编辑时会被映射为整月 `pairing-preference`，并以 occurrence 数量作为最大值。用户只改 Tier / Award-Avoid 时，范围可能被扩大。这是保存前必须单独确认的兼容性风险。

## 推荐的收口边界（避免“过度通用”）

应共享：

- `PbsDialogFrame`
- `TierToggleGroup` 的视觉与无障碍语义
- 覆盖式 `PbsDatePicker`（从 `days-off` feature 目录移到 `shared/components`）
- 日期选择中间态的通用状态 / 文案策略
- `PbsInputNumber`
- `AwardAvoidSegmentedControl`

不应共享：

- Prefer Off 的 fulfilment 计算
- Long Stretch / Commuter 的工作-休息模式业务字段
- Pairing occurrence 查询、匹配 run 的数量上限
- 各条件后端 payload、Zod 校验和错误文案中的业务事实

原则：共享“控件和状态机规则”，保留“业务语义和数据合同”。

## 建议实施顺序（需单独确认后才开始）

1. **先修 Pairing 当前行为**：移除 `reservePopoverSpace`；将日期范围的中间态从错误中分离；不完整日期不显示 0 matching runs。
2. **统一 Tier 规则**：Pairing 允许清空最后一个 Tier，并沿用 Required + 禁用操作的已验证模式。
3. **抽公共数字 / Award-Avoid 原语**：只替换已完成的三个条件，保持样式、键盘和边界值完全一致。
4. **日历搬迁与测试**：将跨 feature 的日历移到 shared；补 Playwright 真实弹窗用例，覆盖日历不撑开布局、日期范围中间态、空 Tier、数字 min/max。
5. **Pairing 数据层单独处理**：批量 occurrence 查询与 legacy bid 迁移语义需要单独设计和后端测试，不与 UI 原语重构混在一个提交中。

## 验收基线

- 三个条件在小屏 / 大屏均使用同一个弹窗滚动与 footer 行为。
- 打开任何日期选择器，弹窗中下方内容的位置不跳动、不被预留空白撑开。
- 选择 range 第一个日期时是中性引导；第二个日期完成前不会显示红色错误或 0 matching。
- 三个条件的最后一个 Tier 都能取消；空 Tier 时无法保存但原因明确。
- 相同尺寸的数字输入具备一致的箭头、disabled、边界和键盘输入行为。
- Pairing 中真正的“无匹配 run”只在完整日期范围 / 日期已选定且查询完成后才出现。

## 本次记录的关联截图问题

Pairing Preference 截图中的：

- 空 Date Range 立即出现红字；
- `0 matching runs` 在日期未完成时出现；
- 打开日历后 FULFILMENT 被大块空白推开；
- 数量为空时过早显示红色校验；

均已纳入上面的状态规则。数量字段同样建议遵循“用户触碰字段后或尝试提交后再显示错误”，而非仅因为已选择 Pairing Number 就立即报错。
