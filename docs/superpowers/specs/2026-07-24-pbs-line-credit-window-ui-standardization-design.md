# PBS Line「Credit Window Preference」弹窗 UI 统一设计

## 1. 背景

`Credit Window Preference` 的业务合同、公司级 `DELTA_HOURS` 配置以及
`line_rules.csv` 导出规则已经在
[PBS Line「Credit Window Preference」参考项目对齐设计](./2026-07-24-pbs-line-credit-window-reference-parity-design.md)
中确定。

当前弹窗已经可以表达 `More credit / Less credit`，但内部布局和控件没有完全遵循
[PBS Preference 条件 UI 标准](../../modules/pbs/pairing-condition-ui-standard.md)：

- 当前先显示 `BID`，后显示 `TIERS`，与统一顺序不一致。
- `More credit / Less credit` 使用本条件手写的按钮样式，没有复用统一 segmented control。
- section 标题、required 状态和 footer 仍有局部手写实现。
- 公司配置说明被放入较重的独立边框卡片，视觉层级高于其辅助信息职责。

本次只统一该弹窗的 UI 骨架与交互表现，不重新设计 Credit Window 的业务含义。

## 2. 目标

1. 让 `Credit Window Preference` 与当前 Bid 条件弹窗使用同一信息层级和共享组件。
2. 固定内容顺序为：标题 → `TIERS` → `PREFERENCE` → 公司配置说明 → footer。
3. `More credit / Less credit` 使用项目统一的 segmented control 视觉和可访问性语义。
4. 保留公司定义的 credit-window 说明，但降低其视觉权重。
5. 新建、编辑、保存收藏三个入口保持相同 UI、状态与校验行为。
6. 使用真实 UI 的 Playwright 回归覆盖本次调整。

## 3. 非目标

- 不修改 Bid 数据结构：

  ```ts
  {
    type: "credit-window-preference";
    direction: "more" | "less";
  }
  ```

- 不修改 `DELTA_HOURS` 字典配置、配置 API、数据库 migration 或 seed。
- 不修改 TXT 批量导入。
- 不修改 `line_rules.csv` 导出合同：
  - `More credit` → `MAX_CREDIT_WINDOW`
  - `Less credit` → `MIN_CREDIT_WINDOW`
- 不修改其他 Days Off、Pairing 或 Line 条件。
- 不批量重构所有 Line 弹窗或全局共享组件。
- 不修改产品标题层级；继续使用：
  - 主标题：`Configure Line Bid`
  - 副标题：`Credit Window Preference`

## 4. 方案比较

### 方案 A：本条件迁移到现有共享组件（推荐）

只调整 `Credit Window Preference` 的弹窗内容，复用已有：

- `PbsDialogFrame`
- `TierToggleGroup`
- `PreferenceConditionSection`
- `PreferenceSectionTitle`
- `PreferenceSegmentedControl`
- `PbsBidDialogFooter`

优点：

- 直接符合现有 UI 标准。
- 改动范围小，不影响其他条件。
- 后续共享组件修复可自然覆盖本条件。
- 不引入新的视觉或业务抽象。

### 方案 B：保留手写控件，仅复制标准 CSS

优点是短期代码改动少，但会继续保留重复的 section、按钮和 footer 实现；后续样式、禁用态或
可访问性调整仍可能再次偏离标准，因此不采用。

### 方案 C：同时修改共享组件并批量迁移所有 Line 条件

可以一次性统一更多页面，但明显扩大影响面，且不是本次需求；不同 Line 条件仍有各自业务字段，
容易引入无关回归，因此不采用。

## 5. 推荐 UI 设计

### 5.1 弹窗结构

弹窗最终顺序固定为：

```text
Configure Line Bid
Credit Window Preference

TIERS · REQUIRED
[T1] [T2] [T3] [T4] [T5] [T6] [T7]

PREFERENCE
[ More credit | Less credit ]
Aims for up to 5h above/below the crew's period credit target...
The ±5h credit-window adjustment is company-defined.

CANCEL   SAVE FAVORITE   ADD BID
```

编辑已有条件时，最后一个按钮沿用共享 footer 的 `UPDATE BID` 文案。

### 5.2 Tiers

- `TIERS` 位于 `PREFERENCE` 之前。
- 继续复用 `TierToggleGroup`。
- 至少选择一个 Tier 才能保存。
- 新建条件不自动选择 Tier。
- 编辑时正确回显已有 Tier。
- required 文案由共享 section 标题能力呈现，不在本条件内重复手写红色文本。

### 5.3 Preference

- section 标题统一为 `PREFERENCE`，不再使用 `BID`。
- 使用 `PreferenceSegmentedControl` 显示：
  - `More credit`
  - `Less credit`
- 新建条件继续默认选择 `More credit`，保持现有业务行为。
- 选中态、`aria-pressed` 和保存的 `direction` 必须由同一个 state 派生：
  - `More credit` → `direction: "more"`
  - `Less credit` → `direction: "less"`
- 选中项使用统一的白底、紫色文字和阴影；未选项使用灰色文字。

### 5.4 公司配置说明

说明文案保留在 `PREFERENCE` section 内，紧跟 segmented control，不再使用独立的大边框卡片。

按当前选择显示：

- `More credit`：
  `Aims for up to {N}h above the crew's period credit target, capped at their credit max.`
- `Less credit`：
  `Aims for up to {N}h below the crew's period credit target, floored at their credit min.`
- 两种方向共同显示：
  `The ±{N}h credit-window adjustment is company-defined.`

要求：

- `{N}` 继续来自配置 API，不在前端硬编码。
- 使用项目辅助文本的 typography 和颜色 token。
- 文案可以自然换行，但不使用独立卡片、警告色或额外标题。
- 配置不可用时，保留当前不可用提示并禁止保存；本次只让其排版与 section 一致，不改变错误合同。

### 5.5 Footer

- 仅当当前条件为 `Credit Window Preference` 时复用 `PbsBidDialogFooter`，不在该条件内重新拼装按钮。
- `line-bid-dialog.tsx` 的现有 footer 被其他 Line 条件共用；本次不得把其他 Line 条件一起迁移。
  实现应在 footer 渲染层做 Credit Window 专属分支，其他 Line 条件继续走原有 footer 路径。
- 保持当前动作：
  - `CANCEL`
  - `SAVE FAVORITE`
  - `ADD BID` 或 `UPDATE BID`
- 沿用共享 footer 的禁用态、pending 态和按钮顺序。
- 下列任一情况禁止保存：
  - 未选择 Tier。
  - Credit Window 配置不可用。
  - 保存请求正在处理中。
- 如果共享 footer 是工作树中其他任务已新增但尚未提交的文件，实现时应直接集成该组件，不复制，
  也不得覆盖其他任务的未提交改动。
- `TIERS → PREFERENCE` 的顺序调整同样只发生在 Credit Window 专属内容分支，不改变其他 Line
  条件的 section 顺序。

## 6. 数据流与行为保持

本次不改变现有数据流：

1. 打开弹窗后读取公司级 Credit Window 配置。
2. 用户只选择 Tier 和 `More credit / Less credit`。
3. 保存时仅提交 `direction`，不提交 `deltaHours`。
4. 编辑时从已有 `direction` 回显选中项。
5. 收藏与正式 Bid 使用相同 value 结构。
6. CSV 导出时由后端读取最新公司配置并生成 401/402 规则。

因此，本次 UI 调整不会改变已导入 Bid、现有 Bid、算法导出或字典配置。

## 7. 可访问性与视觉约束

- segmented control 使用语义化 `button` 和准确的 `aria-pressed`。
- Tier 按钮继续提供可访问名称和选中状态。
- 键盘焦点边框不得被弹窗容器或 footer 裁切。
- 所有颜色、间距、字体、圆角和 disabled 状态使用现有 token/共享组件，不新增 magic value。
- 产品 UI 文案保持英文。
- 不增加 Rule Preview、内部 property code、CSV rule type 或 JSON 等技术信息。

## 8. 实现范围

预计只触达：

- `pbs-portal/src/features/line/components/line-bid-dialog.tsx`
- 与该弹窗有关的 focused Vitest
- 与 Credit Window 新建/编辑有关的 Playwright 用例

仅当现有测试夹具无法表达本次状态时，才做最小测试辅助调整。不得借此重构无关 Line 条件。

## 9. 测试与验收

### 9.1 Focused Vitest

至少覆盖：

1. 新建弹窗顺序为 `TIERS` 在 `PREFERENCE` 之前。
2. 默认选中 `More credit`。
3. 点击 `Less credit` 后：
   - selected state 正确。
   - `aria-pressed` 正确。
   - helper text 切换为 below/floored 语义。
   - 保存 payload 为 `direction: "less"`。
4. 未选择 Tier 时两个保存动作不可用。
5. 配置不可用时显示提示且不可保存。
6. 编辑已有 Bid 时 Tier 和 direction 正确回显。
7. `ADD BID / UPDATE BID` 和 `SAVE FAVORITE` 继续调用原有保存路径。
8. 打开一个非 Credit Window 的代表性 Line 条件，验证它仍走原 footer，按钮、禁用态和 section
   顺序不变。

### 9.2 Playwright

通过真实 Bid 页面完成：

1. 打开 Line → `Credit Window Preference`。
2. 验证标准 section 顺序和标题。
3. 选择 Tier 与 `Less credit`，添加 Bid。
4. 在 Existing Bid Properties 中打开编辑，验证 Tier、direction 和说明文案回显。
5. 更新为 `More credit` 并验证保存结果。
6. 验证弹窗内没有 `Custom` 或可编辑 credit 数值。
7. 验证两行 helper text 位于 `PREFERENCE` section 内，旧的独立说明 card/wrapper 不存在。

### 9.3 交付命令

实现完成后至少运行：

```bash
(cd pbs-portal && npm test -- <focused-test>)
(cd e2e && npx playwright test --config=config/playwright.config.ts --project=pbs-portal <credit-window-focused-spec>)
(cd pbs-portal && npm run lint -- --quiet)
(cd pbs-portal && npm run build)
npm run check:ui
git diff --check
node .gitnexus/run.cjs detect-changes --scope compare --base-ref main
```

### 9.4 验收标准

- 弹窗视觉顺序为标题 → `TIERS` → `PREFERENCE` → helper text → footer。
- `TIERS`、segmented control、section 和 footer 均复用现有共享实现。
- helper text 清楚但不再显示为独立重边框卡片。
- 新建、编辑、收藏的现有业务行为不变。
- Bid payload、配置 API、数据库和 CSV 导出无变化。
- focused Vitest、Playwright、build、UI gate 和变更影响检查全部通过。

## 10. 风险与控制

- **共享 footer 集成风险**：Line dialog 当前可能包含其他条件共用 footer 逻辑。实现时只替换等价展示，
  必须限定在 Credit Window 分支并复用现有回调和 validity；其他条件保留原 footer，并补一个代表性
  非 Credit Window 回归测试。
- **测试定位风险**：测试不得依赖按钮视觉位置；使用 role、accessible name 和 `aria-pressed`。
- **工作树冲突风险**：实现前检查未提交改动，特别是共享 footer；保留并集成已有工作，不回退或重复创建。
- **视觉回归风险**：除 focused 测试外必须运行 `npm run check:ui` 和真实 Playwright。

## 11. Multi-Agent Parallelism Assessment

- **Recommendation:** No
- **Rationale:** 改动集中在同一个 Line dialog、同一状态与同一组测试，拆分后会频繁修改相同文件，
  协调成本和冲突风险高于并行收益。
- **Suggested split:** 由单一实现者完成 UI 与 focused test；完成后可由独立 reviewer 只读审查 spec、
  diff 和测试结果。
- **Write boundaries:** 仅限 Line dialog、对应 focused test、Credit Window Playwright 和本 spec。
- **Conflict risk:** 多个 agent 同时修改 `line-bid-dialog.tsx` 或共享 footer 会产生高冲突。
- **Execution gate:** 用户明确批准本 spec 后才开始实现；本 spec 阶段不改业务代码、不提交 Git。
