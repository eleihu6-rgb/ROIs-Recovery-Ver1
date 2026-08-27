# PBS Work Day Preference 日期与星期一致性校验设计

## 背景

`Work Day Preference` 同时支持：

- 一个或多个 Work Day，以及每个 Work Day 对应的 Check-In 时间窗口；
- 可选的 Specific Dates 或 Date Range 日期限制。

搜索端会把日期限制与 Work Day 条件按 `AND` 组合，并要求同一个 Duty 的当地 Check-In 事件同时满足日期、星期和时间窗口。当前 Portal 只校验日期格式和时间窗口完整性，没有校验日期范围与所选星期是否存在交集，因此可以保存必然返回 0 条结果的条件。例如：

- Work Day：Tue
- Check-In：15:35-19:35
- Specific Date：2026-07-01（Wed）

该条件能够保存，但不可能命中任何 Pairing。

## 目标

- 在 `Configure Work Day Preference` 编辑器中即时识别“日期限制与所选 Work Day 完全无交集”的条件。
- 保留用户输入，不自动修改 Work Day、时间窗口或日期。
- 条件无效时显示明确错误，并通过现有 validity 流程禁用 `ADD BID` / `UPDATE BID`。
- 日期或 Work Day 调整后，只要重新存在有效交集，错误立即消失并恢复保存能力。

## 非目标

- 不修改 Pairing 搜索 SQL、算法导出或后端 API 合约。
- 不改变 Work Day Preference 的业务语义。
- 不自动选择、删除或替换用户输入的日期和星期。
- 不限制日期选择器只能点击与当前 Work Day 匹配的日期。
- 不处理仓库中其他日期/星期组合条件。

## 现有行为

前端 `WorkDayPreferenceEditor` 的有效性判断目前包括：

- 至少选择一个 Work Day；
- 每个 Work Day 的 Check-In 起止时间完整且不相等；
- Specific Dates 非空且日期格式有效；
- Date Range 起止日期格式有效，且结束日期不早于开始日期。

搜索端会对每个 Duty 的首个 `brief_start_utc` 按出发机场时区转换为当地 `event_date` 和 `event_time`，再应用：

1. 日期限制；
2. Work Day 对应的星期；
3. 该 Work Day 对应的 Check-In 时间窗口。

因此，前端新增校验必须与该 `AND` 语义保持一致。

## 交互设计

### 无效状态

当日期限制与所选 Work Day 完全没有交集时：

- 保留所有已填写内容；
- 在日期选择区域下方显示错误：
  `Selected dates do not match the selected work days.`
- 错误文本使用现有表单错误视觉规范；
- 动态错误使用 `role="alert"`（或项目已有的等价 `aria-live` 规范），确保错误在不移动焦点时也会被辅助技术播报；
- 日期输入区域通过 `aria-describedby` 关联该错误文本。若共享日期编辑器尚不支持描述关联，只增加满足本需求所需的窄接口，不改变其他调用方行为；
- 编辑器调用 `onValidityChange(false)`；
- 外层配置对话框沿用现有机制禁用 `ADD BID` 或 `UPDATE BID`。

### 恢复状态

用户执行以下任一操作并使日期与星期重新存在交集后，错误立即消失：

- 增加或切换 Work Day；
- 修改 Specific Dates；
- 修改 Date Range；
- 关闭 `LIMIT TO EVENT DATE`。

时间窗口的既有校验保持独立；日期与星期恢复一致后，如果时间窗口仍不完整，保存按钮仍保持禁用。

## 校验规则

### 无日期限制

`dateScope` 为 `null` 时，不进行日期与星期交集校验，维持现有行为。

### Specific Dates

把每个有效日期转换为 ISO weekday，并与所有已选择 Work Day 比较：

- 至少一个日期匹配任一已选择 Work Day：通过交集校验；
- 所有日期都不匹配：交集校验失败。

示例：

| Work Day | Specific Dates | 结果 |
|---|---|---|
| Tue | 2026-07-01 (Wed) | 无效 |
| Tue | 2026-06-30 (Tue) | 有效 |
| Tue | 2026-06-30 (Tue), 2026-07-01 (Wed) | 有效 |
| Tue, Wed | 2026-07-01 (Wed) | 有效 |

### Date Range

判断闭区间 `[from, to]` 内是否至少存在一天的 ISO weekday 与任一已选择 Work Day 相同：

- 存在至少一天：通过交集校验；
- 完全不存在：交集校验失败。

实现应避免按大范围逐日遍历。日期范围达到 7 天时必然覆盖所有星期，可直接判定存在交集；不足 7 天时最多检查 7 个日期。

### 日期计算

- 使用 ISO 日期字符串 `YYYY-MM-DD` 进行确定性计算；
- 使用 UTC 构造日期并读取 UTC weekday，避免浏览器本地时区造成日期偏移；
- 日期格式、空值和范围顺序仍由现有校验负责；只有基础日期校验通过后才执行星期交集判断。

## 组件与代码边界

预计修改范围：

- `pbs-portal/src/features/pairing/components/work-day-preference-editor.tsx`
  - 增加日期与 Work Day 交集判断；
  - 将结果并入现有 `isWorkDayPreferenceBidValueValid`；
  - 在日期编辑器下方显示错误状态。
- `pbs-portal/src/shared/components/preferences/optional-event-date-scope-editor.tsx` 及必要的日期控件文件
  - 仅在现有接口无法满足时，增加错误描述 ID / `aria-describedby` 的窄传递能力；
  - 默认值保持现有调用方行为不变。
- `pbs-portal/src/features/pairing/components/work-day-preference-editor.test.tsx`
  - 覆盖 Specific Dates、Date Range、恢复状态和跨午夜窗口回归。
- 必要的 Pairing 页面测试
  - 验证配置对话框中的保存按钮随 validity 正确禁用和恢复。
- `e2e/tests/pbs-portal/pairing-search.spec.ts` 或 touched-area 对应 Playwright 文件
  - 通过真实 UI 验证不匹配条件不能保存，修正后可以保存。
- `docs/test-cases/pbs/pairing-search/2026-07-22-work-day-preference-date-weekday-validation.md`
  - 提供测试人员可独立执行的 QA 人工测试案例；
  - 覆盖新建条件、旧 Draft、Specific Dates、Date Range、修正恢复、关闭日期限制及既有时间窗口回归。

优先在现有编辑器文件内保留小型纯函数，不新增跨模块抽象。只有在实现中发现同一校验已经被其他组件复用时，才考虑提取共享工具。

## 数据流

1. 用户选择 Work Day 并填写 Check-In 时间窗口。
2. 用户启用日期限制并选择 Specific Dates 或 Date Range。
3. 编辑器先执行现有结构与格式校验。
4. 基础校验通过后，计算日期限制与 Work Day 的星期交集。
5. 编辑器组合所有校验结果并调用 `onValidityChange`。
6. 外层配置对话框根据 validity 控制保存按钮。
7. 若交集为空，编辑器同时渲染错误文本；用户修正后立即清除。

## 错误处理与兼容性

- 对已经存在但无交集的旧 Draft，打开编辑器时显示错误并禁止再次保存，直到用户修正或关闭日期限制。
- 不自动删除旧数据，也不在列表页静默改写摘要。
- 本次不增加后端拒绝逻辑，因此直接调用 API 或历史导入数据仍按现有后端行为处理；本 spec 只解决 Portal 页面交互问题。
- 如果后续要求所有入口都禁止此类条件，应单独设计共享业务校验和后端错误响应。

## 测试设计

### 组件单元测试

- Tue + 2026-07-01 (Wed)：无效并显示错误。
- Tue + 2026-06-30 (Tue)：有效且无错误。
- Tue + 一个匹配日期、一个不匹配日期：有效。
- Tue + 不包含星期二的短 Date Range：无效。
- Tue + 包含星期二的 Date Range：有效。
- 关闭日期限制后：错误消失，若其他字段完整则恢复有效。
- 修改 Work Day 为匹配星期后：错误消失。
- 跨午夜时间窗口继续有效。

### 页面测试

- 配置对话框中，无交集时 `UPDATE BID` 禁用。
- 修正 Work Day 或日期后，按钮恢复可用。
- 错误文本位于日期控件附近，具备动态播报语义，并通过 `aria-describedby` 与日期输入区域关联。

### Playwright

- 从真实 Pairing 页面打开 Work Day Preference 配置。
- 输入 Tue、有效时间窗口和 2026-07-01。
- 验证错误提示出现且保存按钮禁用。
- 改为 Wed。
- 验证错误消失且保存按钮可用。

### 必需验证

- `cd pbs-portal && npm test`：Portal 模块测试；开发过程中可先运行 touched-area Vitest，但最终交付需运行模块测试；
- `cd pbs-portal && npm run lint`：Portal lint；
- `cd pbs-portal && npm run build`：Portal TypeScript/build；
- 仓库根目录 `npm run check:ui`：UI 标准检查；
- 对应真实 UI Playwright 回归；
- 按 `docs/test-cases/pbs/pairing-search/2026-07-22-work-day-preference-date-weekday-validation.md` 执行关键人工检查并记录结果。

## 验收标准

- `Tue + 2026-07-01 (Wed)` 无法通过 Portal 保存。
- 页面明确解释无效原因，而不是只禁用按钮。
- 错误可被辅助技术即时感知，并与日期输入区域建立描述关联。
- 改为匹配的 Work Day 或日期后，无需关闭对话框即可恢复保存。
- Specific Dates 与 Date Range 均遵循“至少存在一个匹配日期”的规则。
- 不修改用户输入，不改变现有 Pairing 搜索结果口径。
- 现有时间窗口、跨午夜时间和无日期限制行为无回归。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在同一编辑器、有效性函数及紧密关联测试，协调成本高于并行收益。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal` Work Day Preference 编辑器、相关测试及单一 Playwright 用例。
- Conflict risk: 多个 agent 容易同时修改相同组件和测试文件。
- Execution gate: spec 经用户审阅并明确批准实施后再修改功能代码。
