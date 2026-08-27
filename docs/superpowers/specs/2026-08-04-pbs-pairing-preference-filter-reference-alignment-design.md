# PBS Pairing Preference 筛选栏参考样式对齐设计

## 目标

将 `Configure Pairing Preference` 的筛选栏对齐
`/Users/lei/Codehub/Flair_PBS_Optimization_Report` 中 `Configure Bidding → Pairing Preference` 的筛选结构，解决当前控件尺寸不统一、Credit 控件拥挤和整体排版不协调的问题。

## 页面结构

桌面宽度足够时，筛选条件与操作按钮优先在一行展示：

`Dates [Start date · TO · End date]  Check-in [From] → [To]  Length [Min] → [Max] days  Check-out [From] → [To]  Clear / Apply`

宽度不足时允许自然换行，禁止压缩到文字、图标或值相互覆盖。操作按钮换行后保持右对齐。

当前 Pairing Preference 弹窗内采用紧凑密度：在不缩放 DOM 的前提下减小控件高度、字号、内边距、组间距和列最小宽度，使日期、时间、Length 与操作按钮在当前桌面弹窗宽度内完整展开。日期值必须保持单行，不允许 `YYYY-MM-DD` 折成两行。

参考项目只约束本次的字段集合、字段顺序与输入类型；本项目继续保留显式 `Apply filters`，并按用户要求在空间允许时使用单行布局，不照搬参考项目的固定两列排版。

## 控件规则

- `Dates`：复用共享 `PbsDatePicker` 的 `range` mode，显示标准 `Start date · TO · End date` 范围入口，并通过同一张覆盖式日历完成起止日期选择。
- `PbsDatePicker` 直接接收当前 `periodCode`，因此只能选择当前投标周期内的有效日期；现有周期边界校验继续作为提交保护。
- 为共享 `PbsDatePicker` / `PreferOffCalendarPicker` 增加 `density?: "default" | "compact"`；默认值为 `default`，只有 Pairing Preference 筛选栏传入 `compact`，避免影响 Days Off、Reserve、Line 与其他调用方。
- `compact` 仅调整日期入口：目标高度 36px（`h-9`）、12px 字体（`text-xs`）、水平内边距 8px（`px-2`）和更小的内部 gap；覆盖式日历的尺寸、定位、缩放适配、键盘语义和选择行为保持不变。
- 移除 Pairing Preference 对原生 `input type="date"` 的特殊放行，恢复全项目禁止原生日期输入的 UI 守卫。
- `Check-in`、`Check-out`：使用独立且等宽的原生浏览器 `input type="time"`，中间显示 `→`。
- `Length`：使用两个独立且等宽的 `input type="number"`，`min=1`，中间显示 `→`，末尾显示 `days`。
- 删除 `Pairing Credit` 筛选，以及本次上一版新增且已无其他消费者的共享 `PbsDurationPicker`、导出和测试。
- 移除仅为 Pairing Credit / Length 下拉选项提供动态上限的前后端 bounds route、service、cache、query、contract 和测试；Length 继续由前后端现有校验保护。
- 保留通用 Pairing Preview 合同中的 `creditMinutesMin/Max`、Zod 校验和 SQL 筛选能力，避免破坏其他 Pairing Search 消费者；本次只是不再从 Pairing Preference 筛选栏发送该条件。
- Date Range 外框与 Check-in、Length、Check-out 控件组使用相同高度、圆角、边框、字体、焦点态和水平间距。
- 紧凑模式通过日期入口和筛选控件的真实尺寸调整实现，禁止对筛选栏或日期入口增加 `transform: scale()`，避免文字模糊、点击区域与视觉位置不一致。覆盖式日历原有用于适配页面视觉缩放的定位 `transform: scale(...)` 保留，不属于本限制。
- Check-in、Length、Check-out 与操作按钮统一为 36px 高、12px 字体；范围输入水平内边距 8px，组内 gap 保持紧凑但不得让值、箭头或 `days` 后缀重叠。
- 桌面紧凑布局优先给 Date Range 分配足够宽度；时间、Length 和按钮使用满足完整文案与值显示的最小宽度，不得依赖文字换行换取单行排布。

## 方案比较

- 推荐：`PbsDatePicker` `range` mode。符合 Pairing Condition UI Standard，只提供一个范围入口和一张日历，并原生支持 `periodCode`。
- 不采用：`EnglishDateRangePicker`。虽然来自共享 UI，但内部仍是两个独立日期 picker，不符合 Pairing 条件要求的单一范围入口。
- 不采用：两个 `PortalDatePicker` 或两个原生 date input。会重复当前问题，并违反 Pairing Condition UI Standard。

## 行为保持

- Check-in 继续支持跨午夜范围，例如 `22:00 → 08:00`。
- Check-out 保持现有非跨午夜校验。
- 日期、Length、Check-in、Check-out 继续映射到现有 Preview 筛选字段。
- `Clear filters`、`Apply filters`、筛选数量、分页和已选 Pairing 状态不变。
- 不修改 Pairing 搜索算法、数据库结构或已发布数据。

## 验收标准

- 在 `1440×900` 及以上视口、1120px Pairing Preference 对话框中，四组条件和操作按钮在同一行完整显示。
- Date Range 的开始/结束日期均保持单行；时间值、`days` 后缀和 `Clear filters` / `Apply filters` 文案不裁切、不换行。
- 在 `1024×768` 视口允许有序换成两行；不得出现水平溢出、遮挡或被弹窗裁切，操作按钮保持右对齐。
- 四组控件高度、圆角和边界视觉一致。
- Date Range 是一个标准范围控件；其整体高度与其余三组范围控件一致。
- 页面不再出现 `Pairing Credit` 筛选。
- Length 可通过数字输入完成，Check-in / Check-out 使用浏览器原生时间选择。
- 窄屏下有序换行，按钮保持可见且可操作。
- focused Vitest 覆盖：Credit 不渲染且不请求 bounds、active filter count 最大为 4、Length 正整数与 Min/Max 顺序、Check-in 跨午夜、Check-out 反向拒绝、Clear/Apply、分页和已选 Pairing 保持。
- 日期测试验证仅存在一个标准 Date Range 入口，日历只能选择当前投标周期日期，并拒绝提交周期外日期。
- 原生日期输入守卫恢复为零例外，确保后续 Pairing 条件继续复用标准组件。
- Playwright 使用真实弹窗覆盖 `1440×900` 单行 DOM 几何断言与 `1024×768` 换行/无溢出断言。
- Playwright 同时断言 Date Range 日期文本不换行、紧凑控件计算高度一致，并验证共享日期组件的默认密度调用方不受影响。
- focused Vitest 验证省略 `density` 与显式 `density="default"` 的入口尺寸/结构等价，`compact` 入口严格低于 default（36px 对 40px），且两种密度使用同一范围选择日历行为。
- 新增或更新 `docs/test-cases/pbs/pairing/` 下的 QA 人工用例，覆盖 1440 单行、1024 换行、四类筛选行为以及 Credit/bounds 已移除。
- 删除 bounds 后更新 route、service、cache、query、contract 相关测试。

## 验证命令

- `cd pbs-portal && pnpm test`
- `cd pbs-portal && pnpm run lint`
- `cd pbs-portal && pnpm run build`
- `cd pbs-server && pnpm exec tsc --noEmit --pretty false`
- `cd pbs-server && node --env-file=.env --import tsx --test src/routes/pairing-search.test.ts src/services/pairing-search/pairing-search-service.test.ts`
- `cd e2e && npx playwright test --config=config/playwright.config.ts --project=pbs-portal tests/pbs-portal/pairing-preference.spec.ts --grep 'PBS-3530' --reporter=list`（覆盖 1440 单行、1024 换行、日期不换行与范围选择）
- `cd /Users/lei/Codehub/rois-ai && npm run check:ui`

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在同一筛选组件、合同清理和紧密相关测试，拆分会增加冲突风险。
- Suggested split: 不拆分，实现后统一回归。
- Write boundaries: Pairing Preference picker、废弃 bounds 合同/服务、相关自动化与 QA 文档。
- Conflict risk: 多个 agent 会同时触碰 picker 和筛选 contract。
- Execution gate: 用户审阅并批准本设计文档后实施。
