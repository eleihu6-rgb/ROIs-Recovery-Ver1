# PBS Preference 交互一致性与公共原语收口设计

日期：2026-07-12
状态：待用户确认
关联审查：[PBS 三类 Preference 条件一致性审查](../../handoff/pbs/2026-07-12-pbs-preference-family-consistency-review.md)

## 1. 背景

本轮已完成以下四个用户条件及其配置弹窗，分属三个业务域：

1. `Prefer Off`（Days Off，201）
2. `Long Stretch Off / Compressed Flying`（Days Off，204）与 `Commuter Pattern`（Line，408）
3. `Pairing Preference`（Pairing，102）

它们已经复用 `PbsDialogFrame`、`TierToggleGroup` 和 `PreferOffCalendarPicker` 的一部分能力，但关键行为仍分别实现：Tier 最后一个的处理、日期范围未完成时的状态、日历弹层是否占位、数字输入、Award/Avoid 分段选择等。继续按 feature 各自实现会使后续条件出现视觉相同而行为不同的问题。

本设计的目标是收口这批**交互原语**，让已完成的三个条件具有相同的可预期行为；不改变各条件的业务含义、后端数据合同或算法语义。

## 2. 目标

1. 所有 Preference 弹窗继续使用同一套容器、Tier、日期和数字输入交互基线。
2. 日期选择器始终是覆盖式弹层：打开时不挤压弹窗内容，不产生预留空白。
3. 日期限制的“尚未完成选择”是中性填写状态，不误报红色错误或 `0 matching runs`。
4. Preference 类条件统一允许用户取消最后一个 Tier；空 Tier 时通过 `Required` 与禁用提交表达防呆。
5. 将相同的 InputNumber 和 Award/Avoid 视觉行为收为公共组件，避免复制实现。
6. 保留各条件独立的 payload、验证规则、查询逻辑和业务文案，不做过度抽象。

## 3. 非目标

- 不新增或改动 property code（201 / 204 / 408 / 102）。
- 不改变 Prefer Off fulfilment、Long Stretch 连续休息、Commuter 工作/休息块、Pairing run 匹配的业务规则。
- 不修改 `PbsDialogFrame` 的整体视觉或基础滚动机制。
- 不在本轮重做所有 Portal 日期控件；只处理上述三个 Preference 家族。
- 不把 Pairing occurrence 的批量查询或 legacy bid 迁移和 UI 原语收口混在同一实现批次；这两项另列后续任务。
- 未经用户明确授权，不执行 `git add`、`git commit` 或 `git push`。

## 4. 方案比较

### 方案 A：维持各 feature 自行实现，仅逐项修 Pairing

优点：改动最小，短期修复截图问题最快。
缺点：同样的数字、Tier、日期范围规则仍会继续复制；下一个条件仍可能再次分叉。

### 方案 B：共享所有 Preference 的完整编辑器和 payload

优点：代码共享最大。
缺点：会把 Days Off、Line、Pairing 的完全不同业务字段塞进一个过大的组件；后续维护成本和回归风险更高。

### 推荐：方案 C——共享交互原语与状态规则，业务语义保持 feature-local

公共层只拥有控件外观、可访问性和无业务含义的状态机；每个 feature 仍负责它自己的字段、服务端校验、可用数量和摘要。这能修复现有不一致，又不会把无关的业务模型强耦合。

## 5. 公共组件边界

### 5.1 保留并继续复用

| 公共能力 | 当前实现 | 处理方式 |
| --- | --- | --- |
| 弹窗框架 | `src/shared/components/ui/pbs-dialog-frame.tsx` | 不修改视觉；继续作为唯一业务弹窗框架。 |
| Tier 按钮 | `src/shared/components/tiers/tier-toggle-group.tsx` | 保持纯展示 / 点击组件，不写入“必须至少一个 Tier”的业务分支。 |
| 日期日历 | `src/features/days-off/components/prefer-off-calendar-picker.tsx` | 迁至 `src/shared/components`，名称调整为能表达通用能力的 `PbsDatePicker`。 |
| 大号数字 stepper | `LargeStepperInput` | 以其已确认的 Ant InputNumber 类似外观为基础，演进为公共输入原语。 |

### 5.2 新增或收口的公共原语

#### `PbsInputNumber`

职责：统一数字输入、上下箭头、禁用态、边界、键盘输入和可访问性。

建议接口：

```ts
type PbsInputNumberProps = {
  ariaLabel: string
  value: number | null
  min?: number
  max?: number
  placeholder?: string
  disabled?: boolean
  size?: "compact" | "large"
  onChange: (value: number | null) => void
}
```

规则：

- 右侧固定上下箭头；浏览器原生 spinner 隐藏。
- `null` 允许显示 `--`，供 Pairing 的可选 min/max 使用。
- 递增、递减和手动输入都受 `min/max` 约束。
- 只负责单一数字的合法边界；不判断两个字段之间的关系。

调用方负责：`minimum <= maximum`、是否必填、何时展示错误、动态可用数量上限。

#### `AwardAvoidSegmentedControl`

职责：统一 `Award` / `Avoid` 的两段选择外观和键盘语义。

建议接口：

```ts
type AwardAvoidSegmentedControlProps = {
  value: "award" | "avoid"
  disabled?: boolean
  onChange: (value: "award" | "avoid") => void
}
```

它不理解 Long Stretch 或 Pairing 的数据结构；各 feature 自己映射字段值。

#### `PbsDatePicker`

职责：提供 single、multiple 和 range 选择 UI、覆盖式弹层定位、清除、范围高亮和 period 边界禁用。

它是**受控的纯 UI 组件**：只接收 / 发出 single、multiple、range 值及 open / clear 事件，负责 portal 定位、范围选择和第二次点击关闭。它不负责决定“日期是否必填”“当前日期范围是否存在 pairing run”“日期窗口长度是否足以容纳 Long Stretch”，也不接收 query result / error。所有可见状态、文案、禁用和 payload 仍由调用 feature 派生。

如需共享日期完整性判断，只新增无业务输入的 pure helper，例如 `getDateSelectionCompleteness(mode, value)`；它不接收 occurrence、查询结果或错误。

## 6. 统一交互契约

### 6.1 弹窗和响应式

- 继续复用 `PbsDialogFrame`。
- 弹窗内容可滚动，header / footer 保持稳定。
- 共享日期日历使用 portal / fixed overlay 锚定在输入框附近，并根据视口空间向上或向下展开。
- 日历打开时**禁止**通过 `reservePopoverSpace` 或等效占位元素推开下方内容。
- `PbsDatePicker` 不再公开可改变布局流的 `reservePopoverSpace` 参数。

### 6.2 日期范围的状态机

日期限制有四个可见状态：

| 状态 | 触发条件 | UI 表现 | 提交 |
| --- | --- | --- | --- |
| Off | 日期限制开关关闭 | 不显示 picker；不使用旧缓存日期 | 是否可提交由其他字段决定 |
| Incomplete | 开关已开，但 single 未选日期，或 range 仅有起点 | 中性引导，例如 `Select a run date` / `Select an end date`；不显示红色错误、`0 matching runs` 或业务失败计数 | 禁用 |
| Resolving | 日期已完整，依赖数据正在查询 | 显示 `Loading matching runs…` 的中性状态 | 禁用 |
| Resolved | 日期已完整且查询成功 | 有匹配时显示真实数量；无匹配时显示明确错误 | 有匹配时由其他字段决定；无匹配时禁用 |
| Failed | 日期已完整但所依赖的业务查询失败 | 显示明确错误，例如 `Unable to validate pairing run dates.` | 禁用 |

范围选择规则：

1. 第一次日期点击写入 start。
2. 第二次点击写入 end；若早于 start，自动按时间顺序归一化。
3. 完成 end 后关闭日历。
4. 清除后回到 Incomplete，不把清除动作立即标为红色失败。

在 `Incomplete` 状态，禁止显示任何由 scope 派生出的 matching count、可用数量上限或“无匹配”文案；只有 `Resolved` 且查询成功时才能显示 count（包括真正的 0）。

适用范围：

- Pairing Preference：Specific Date、Date Range。
- Long Stretch：可选 Date Range。
- Commuter Pattern：可选 Date Range。
- Prefer Off：沿用现有多日期 / 范围行为；若其保存规则需要完整 range，也遵守同一中间态原则。

### 6.3 日期限制开关与最终 payload

本轮不改变既有条件的业务 payload。日期 UI 的共享只影响填写状态，最终序列化必须继续遵循下表；任何 `Incomplete` / `Resolving` / `Failed` 状态均不得提交。

| 条件 | Off：UI / 内存状态 | Off：最终 payload | 日期完整后的最终 payload | 语义来源 |
| --- | --- | --- | --- | --- |
| Prefer Off（201） | 不适用统一的 Limit switch；按当前四种 mode 管理输入 | 维持当前 mode 的既有 tag / config 语义 | 仅当前 mode 的完整合法值 | `2026-07-10-pbs-prefer-off-unified-condition-design.md` |
| Long Stretch（204） | Limit switch 关闭；界面不展示日期 | 继续提交当前 bid month 的 `from/to` | 用户选定的 range `from/to` | `2026-07-11-pbs-long-stretch-off-commuter-pattern-existing-condition-enhancement-design.md` |
| Commuter Pattern（408） | Limit switch 关闭；界面不展示日期 | `dateRange: null` / 不写入 `dateRange`，以现有 serializer 为准 | `{ dateRange: { from, to } }` | 同上 |
| Pairing Preference（102） | Limit switch 关闭；界面不展示日期 | `dateScope: null`，不得带旧缓存日期 | `{ mode: "specific_date", date }` 或 `{ mode: "date_range", from, to }` | `2026-07-11-pbs-pairing-preference-jen-aligned-design.md` |

这张表是 UI 收口的防回归约束。若现有 serializer 与表中既有设计不一致，暂停当前 UI 重构并单独提出 contract 设计；不得静默改写后端语义。

### 6.4 Tier

Preference 家族新增条件默认 T1；编辑时按保存值回显。

- 用户可取消最后一个活动 Tier。
- 0 Tier 时标题 / 辅助状态显示 `Required`。
- `ADD BID` 和 `SAVE FAVORITE` 禁用；不弹错误 toast、不强制自动回选 T1。
- 再选任意 Tier 后自动恢复可提交状态。
- 服务端最终校验仍要求至少一个 Tier。

`TierToggleGroup` 本身不承担这个策略；由一个轻量 helper 在各 dialog 复用相同的选择 / 必填状态计算，避免每个 dialog 手写不同的“最后一个”分支。

### 6.5 数字输入与错误时机

- 所有同尺寸的 quantity / pattern 输入使用 `PbsInputNumber`。
- min/max 成对字段紧邻布局，表达它们是一组约束，不使用过宽分散布局。
- field 尚未触碰时不显示红色校验；用户修改字段或尝试提交后才显示必填 / 关系错误。
- Pairing 选择了 pairing number 不等于已经触碰 quantity，因此不应立即显示 `Enter minimum required, maximum required, or both.`。
- 非法组合必须在按钮可点击前被防呆：例如 `minimum > maximum`、`maximum > matching runs`。
- `null` 点击递增时从 `min`（若未提供则从 0）开始；处于 `min` 时递减箭头 disabled。
- 编辑期间允许暂时清空为 `null`；非数字字符拒绝写入 value；超出边界的有效数字在 blur 时 clamp。提交前仍由 feature 做最终关系校验。

## 7. 逐条件落地

### 7.1 Prefer Off

- 将现有本地 `PreferOffInputNumber` 替换为 `PbsInputNumber`。
- 保持现有 fulfilment 语义和 “可用周期为 0/1 时隐藏 Fulfilment” 的行为。
- 继续使用共享多日期 / range picker，不改变 Weekend、Time Window 或 period count 规则。

### 7.2 Long Stretch Off / Compressed Flying

- 将最低连续休息天数的 stepper 改为共享 `PbsInputNumber`（large）。
- Award / Avoid 改为共享 segmented control。
- 开启但未完成日期范围时采用 Incomplete 中性状态；日期窗口完整后才执行“窗口长度不少于连续休息天数”的业务错误判断。

### 7.3 Commuter Pattern

- Work min/max 和 Off days 改为共享 `PbsInputNumber`（large）。
- 保持 `minDaysOn <= maxDaysOn` 和现有业务上限规则。
- Date Range 使用共享中间态；关闭开关后 payload 不保留旧的 `dateRange`。

### 7.4 Pairing Preference

- 初始打开时不显示 `LIMIT TO RUN DATE`、Fulfilment 或 Pairing Number 必填红字；用户先完成 Pairing Number 选择。
- 移除给日历传入 `reservePopoverSpace` 的行为，修复当前打开日历后 FULFILMENT 被空白推开的布局问题。
- Specific Date / Date Range 在 Incomplete 时不显示红字，也不显示 `0 matching runs`。
- 只有日期完整、occurrence 查询成功且匹配数为 0 时，显示 `No selected pairing operates inside this date scope.`。
- matching run 为 0 或 1 时隐藏 Fulfilment；0 时保持不可提交，1 时系统归一化为 `minimumRequired: 1` 与 `maximumRequired: 1`，不要求用户重复填写唯一值。
- 删除最后一个 Pairing Number 时，清空 `dateScope` 与数量值，回到不显示日期限制和 Fulfilment 的初始状态。
- Quantity 区域使用 `PbsInputNumber`；仅在字段被触碰或用户尝试提交后显示错误。
- Pairing Tier 遵循本 spec 的可清空规则。

## 8. Pairing 的后续独立事项（不纳入本次 UI 原语改动）

### 8.1 Occurrence N+1

目前每个 selected pairing id 会独立请求一次 occurrence。多选会导致并发 N+1。后续应设计一个批量 occurrence 查询接口，由后端一次验证 / 返回多个 pairing id 在 period 内的 occurrence。

### 8.2 Legacy `pairing-occurrence-list` 编辑语义

当前旧类型编辑时可能被归一化为整月 Pairing Preference，并以 occurrence 数量作为最大值。用户只改 Tier 或 Award/Avoid 时可能无意扩大原范围。必须在单独的兼容设计中确定以下之一：

1. 保留旧类型为只读 / 仅删除；
2. 显式提示转换范围并要求确认；
3. 为旧 occurrence 精确构建新的 date scope / max 语义。

在此项确认前，不应把其当作普通的无损编辑。

## 9. 影响范围与实现边界

预期涉及：

- `pbs-portal/src/shared/components/**`：新增 / 迁移纯 UI 原语。
- `pbs-portal/src/features/days-off/**`：Prefer Off、Long Stretch 的调用替换与 feature 验证。
- `pbs-portal/src/features/line/**`：Commuter 的调用替换与 feature 验证。
- `pbs-portal/src/features/pairing/**`：Pairing 的调用替换、日期状态和校验显示修复。
- 对应 Playwright / 组件测试。

不涉及：

- `packages/contracts/**`、`pbs-server/**`、数据库 migration、算法导出。

若实现中发现现有前端 validation 与服务端最终校验已不一致，只记录并暂停；不得在此 UI 收口中擅自扩展 API 合同。

## 10. 测试与验收

### 自动化

新增或更新组件测试与 Playwright，覆盖真实 Portal UI：

1. 四个调用点（Prefer Off、Long Stretch、Commuter、Pairing）使用共享日期 picker；每个含日期控件的模式都能打开日历，且下方 section 的 layout box 不发生占位式下移。
2. range 第一次选日期后显示中性 end-date 引导；不出现红色错误和 `0 matching`。
3. range 第二次选日期后自动关闭并显示完整范围。
4. 每个 Preference 条件均可取消最后一个 Tier；按钮转为 disabled，重新选择后恢复。
5. stepper 的上下箭头、键盘输入、min/max disabled 状态在各调用点一致。
6. Pairing 分别覆盖 `Incomplete`、`Resolving`、`Resolved-zero`、`Failed`：只有完整 scope 查询成功且无匹配时显示无匹配错误；quantity 仅在触碰 / 提交后显示错误。
7. 对 204、408、102 断言日期 Off 状态下的实际提交请求，验证第 6.3 节的 payload 不被 UI 重构改变。

组件测试负责 picker 的 range 点击、清除、第二次点击关闭、数字输入的空值 / blur clamp，以及无业务的日期完整性 helper。Playwright 使用确定的测试数据或 route mock；不得依赖会变化的远端 pairing run。

日历不挤压布局的断言方式：记录打开前后同一 dialog 内 Pairing 的 `FULFILMENT` 或其他紧随日期区的 section 的 `getBoundingClientRect().top`，允许误差不超过 1px。

最小验证命令（实施阶段执行）：

```bash
(cd pbs-portal && npm run check:ui)
npx playwright test --config=e2e/config/playwright.config.ts --project=pbs-portal <相关用例>
```

实施前应根据 `e2e/config/playwright.config.ts` 与 module guide 复核项目名称和 spec 路径；最终交付必须列出实际运行命令与 PASS / FAIL。

### 人工验收

- 窄屏幕下弹窗内部滚动正常，footer 保持可访问。
- 日历不会被弹窗裁剪，也不会留下与日历等高的空白。
- 输入过程中不出现“填写一半即报错”的红色噪音。
- 相同控件在三个条件里有相同的 hover、focus、disabled 和边界行为。

## 11. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 共享组件变动影响现有 Days Off 日期选择 | 保持 props 兼容；先补现有 picker 行为测试，再迁移调用点。 |
| 迁移时让业务验证落入公共组件 | 公共组件只暴露控件状态；所有业务错误由 feature 计算并传入。 |
| Pairing 的加载状态与无匹配混淆 | 用明确的 Incomplete / Resolving / Resolved 状态机及独立测试断言。 |
| Tier 允许清空导致无效请求 | 前端禁用动作，服务端的既有最终校验保持不变。 |
| UI 重构顺手扩大为 contract / backend 改动 | 本 spec 明确不触碰后端；发现 contract 问题时另起设计。 |

## 12. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 共享组件与四个调用点高度耦合，且 UI 状态机必须一次性一致；并行写代码会提高冲突与行为不一致风险。
- Suggested split: 不拆分实现；可在实现完成后进行独立只读测试审查。
- Write boundaries: 主 agent 统一维护 shared components 与四个 feature 调用点。
- Conflict risk: High。当前工作树已有未提交的 Pairing Preference 实现和其他用户改动，不能让多个写入者同时触碰相邻组件。
- Execution gate: 用户确认本 spec 后，再编写实施计划；未经确认不改产品代码。
