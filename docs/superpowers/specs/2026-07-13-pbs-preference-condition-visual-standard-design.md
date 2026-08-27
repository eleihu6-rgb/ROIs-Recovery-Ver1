# PBS Preference Condition 视觉统一标准设计

## 背景

当前 PBS Portal 已新增或改造了一批员工端 bid 条件：

- Prefer Off
- Long Stretch Off / Compressed Flying
- Pairing Preference
- Airport Preference
- Pairing Check-In / Check-Out Time
- Flight Legs per Duty
- Work Day Preference
- Pairing Length

这些条件已经复用了部分基础组件，例如 `PbsDialogFrame`、`TierToggleGroup`、`AwardAvoidSegmentedControl`、`PbsDatePicker` 和 `PairingPropertyDialogFooter`。但每个 editor 仍然各自组织 section、标题、间距、required 标记、divider、输入布局和 optional date limit，导致同类弹窗视觉密度不一致。

本设计目标是把 Pairing Length 先收敛为更简洁的 UI，并沉淀一套后续条件可复用的视觉标准，避免后续每个条件单独拼 UI。

## 目标

1. 让 Pairing Length 弹窗更简洁、轻量、可扫描。
2. 抽出小而稳定的 Preference Condition UI primitives，而不是一次性重构成大型表单框架。
3. 更新项目 Pairing 条件 UI 标准文档，让后续条件默认遵守同一套视觉骨架。
4. 保持现有业务行为不变：Tier 必选、Award/Avoid 默认、Min/Max days 校验、可选 pairing start date range、Save Favorite / Add Bid 行为不变。

## 非目标

- 不一次性重构全部已开发条件。
- 不改变任何 bid payload、server validation、search SQL 或数据库契约。
- 不引入新的 UI 依赖。
- 不把 Portal 员工端弹窗迁移到后台 `AppDialog` 风格。
- 不新增解释性文案或 Rule Preview。

## 推荐方案

采用渐进式标准化：

1. 新增一组小型共享组件，放在 `pbs-portal/src/shared/components/preferences/`：
   - `PreferenceConditionSection`
   - `PreferenceSectionTitle`
   - `PreferenceInlineSwitch`
   - `PreferenceNumberRange`
2. Pairing Length editor 先迁移到这组 primitives。
3. 更新 `docs/modules/pbs/pairing-condition-ui-standard.md`，把这些 primitives 定为后续 Pairing / Days Off preference 条件的默认视觉标准。
4. 后续改其它条件时逐步迁移，避免一次性大范围改动。

### 为什么不直接全量重构

这些条件的业务字段差异较大：Prefer Off 有多日期/星期/范围，Airport Preference 有 airport/city 和 event，Check-In/Out 有 time operator，Flight Legs 有 quantifier 和 operator。一次性抽象成通用 form schema 会让组件过重，反而降低可维护性。

当前更稳的边界是抽视觉 primitives，不抽业务流程。

## 视觉标准

### 弹窗骨架

固定顺序保持不变：

1. Header title
2. `TIERS`
3. `PREFERENCE`
4. 条件专属字段
5. optional date / limit section
6. Footer

### Section 标题

统一使用轻量 section header：

- 字号保持小号 uppercase。
- letter spacing 降低，避免视觉过重。
- required 标记保留，但只在需要用户完成输入的 section 上出现。
- 不把大段说明文字放在 section 下方。

推荐语义：

- `TIERS · REQUIRED`
- `PREFERENCE`
- `PAIRING START DATE`

如果弹窗标题已经清楚表达条件名称，条件专属 section 可以省略重复标题。例如 Pairing Length 弹窗已显示 `Configure Pairing Length`，Min / Max 字段也能表达输入语义，因此不再显示 `PAIRING LENGTH · REQUIRED`。

### 间距

Pairing Length 当前看起来不简洁的主要原因是 section 间距和标题重量偏大。新标准：

- section 垂直间距收敛到 14-16px。
- 同一 section 内 label 到 control 的距离收敛到 4-6px。
- divider 只用于 optional date limit 这类语义分隔，不在每个小块之间反复出现。

### 数字范围

`PreferenceNumberRange` 负责统一 Min / Max 输入：

- 一行两列。
- label 使用 `Min days` / `Max days`。
- suffix 使用 `days`，位置固定，不挤压输入文本。
- 错误只在真正输入非法值后显示。
- 空值保持 placeholder，不自动填默认值。

### Optional date limit

`PreferenceInlineSwitch` 负责统一 `LIMIT TO ... DATE`：

- label 和 switch 在同一行。
- 默认关闭。
- 开启后只显示一个标准 `PbsDatePicker mode="range"`。
- 日期范围控件保持一行：`Start date · TO · End date`。
- 未选择完整范围时 footer 保持 disabled。

## Pairing Length 具体调整

Pairing Length 将保持现有字段和业务行为，但视觉上改为：

- Header 下方减少整体空白。
- `PREFERENCE` 和 Award/Avoid 控件更贴近。
- 不显示重复的 `PAIRING LENGTH · REQUIRED` section title。
- Min / Max inputs 宽度稳定，避免输入区显得过大。
- `LIMIT TO PAIRING START DATE` 改为一个轻量 optional section；开启后只展开日期范围控件。
- 不显示旧的 operator / technical bid 控件。

## 后续条件复用规则

后续新增或修复这些条件时默认使用同一套 primitives：

- Prefer Off
- Long Stretch Off / Compressed Flying
- Pairing Preference
- Airport Preference
- Pairing Check-In / Check-Out Time
- Flight Legs per Duty
- Work Day Preference
- Pairing Length

迁移原则：

1. 新条件必须直接用 primitives。
2. 已上线条件只在被触碰时逐步迁移。
3. 不因为视觉统一改变保存 payload。
4. 如果业务需求要求不同布局，必须在 spec 中写明例外原因。

## 文件范围

预计修改：

- `pbs-portal/src/shared/components/preferences/`
  - 新增 preference condition visual primitives。
- `pbs-portal/src/features/pairing/components/pairing-length-editor.tsx`
  - 迁移到共享 primitives，简化视觉。
- `pbs-portal/src/features/pairing/components/pairing-length-editor.test.tsx`
  - 更新初始态、switch、日期范围和 payload 测试。
- `docs/modules/pbs/pairing-condition-ui-standard.md`
  - 补充视觉 primitives 和后续条件复用规则。
- `e2e/tests/pbs-portal/condition-default-favorites.spec.ts`
  - 保持或补充 Pairing Length UI 断言，确保真实弹窗路径仍通过。

不预计修改：

- `pbs-server`
- `packages/contracts`
- `sql`
- pairing search SQL

## 验收标准

1. Pairing Length 弹窗视觉更简洁，section 间距更紧凑，不显得像多块独立表单拼接。
2. Pairing Length 功能不变：
   - Tier 未选时不能 Add Bid。
   - Min/Max days 至少填一个。
   - Min > Max 时不能 Add Bid。
   - date limit 默认关闭。
   - date limit 开启后必须选择完整 range。
   - payload 仍为 `pairing-length-preference`。
3. 新共享 primitives 可被后续条件复用，不包含 Pairing Length 专属业务逻辑。
4. 标准文档明确后续 preference 条件默认使用这些 primitives。
5. 测试通过：
   - focused Vitest for Pairing Length editor。
   - focused Playwright for Pairing Length real dialog path。
   - `npm run lint -- --quiet`
   - `npm run build`
   - `npm run check:ui`
   - `git diff --check`

## 关键假设

- UI 文案继续使用英文。
- 这次只改视觉标准和 Pairing Length 实现，不改业务 payload。
- 已有 Work Day / Airport / Check-In-Out 等条件暂不批量迁移，避免扩大风险。
- 后续条件若被开发或重做，应按本标准实现。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次改动集中在小范围 UI primitives、Pairing Length editor 和标准文档，拆分多 agent 的协调成本高于收益。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/shared/components/preferences/`、`pbs-portal/src/features/pairing/components/pairing-length-editor.tsx`、相关测试和标准文档。
- Conflict risk: Medium。当前工作区已有未提交变更，需要避免覆盖既有 Work Day / Pairing Length 实现。
- Execution gate: 用户确认本 spec 后再进入代码实现。
