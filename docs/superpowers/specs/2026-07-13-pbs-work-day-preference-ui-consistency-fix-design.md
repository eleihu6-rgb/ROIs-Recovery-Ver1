# PBS Work Day Preference UI 一致性修复设计

日期：2026-07-13
状态：已实施并完成验证，待用户审阅

## 1. 问题与目标

`Work Day Preference`（property `110`）已经具备正确的业务 payload，但其日期控件和 `WORK-DAY MATCH` 的视觉选中态没有遵循此前已验收的 PBS Pairing 条件标准。

本次只修复 UI 一致性：

- 日期选择必须与 `Prefer Off`、`Long Stretch Off / Compressed Flying`、`Pairing Preference`、`Airport Preference`、`Pairing Check-In / Check-Out Time` 使用同一套共享日期选择体验。
- `Any work day / Every work day` 必须像 `Award / Avoid` 一样，真实选中值、`aria-pressed`、紫色文字和白色选中块完全一致，不能出现文字与白色高亮落在不同按钮上的情况。
- 不改变 property code、保存 payload、后端校验、搜索 SQL、数据库数据或已执行的 migration。

## 2. 根因

当前 `WorkDayPreferenceEditor` 错误使用 `PortalDatePicker`；此前已验收条件使用的是共享 `PbsDatePicker`（底层为 `PreferOffCalendarPicker`）。前者是独立的文本输入 + 日历实现，后者是 PBS 标准的覆盖式日历及多选/范围交互。

`WORK-DAY MATCH` 目前复用了普通 `PairingPropertyChoiceGroup`，而非 Pairing Preference 系列的 segmented control 视觉规则。两套 class 的背景、文字与外框组合在同一组内，造成实际值与视觉高亮冲突。

## 3. 修复设计

### 3.1 日期控件统一

`WorkDayPreferenceEditor` 改为使用 `PbsDatePicker`：

- `Specific dates / weekdays`：`mode="multiple"`，复用标准日期 chip、清除/删除操作、覆盖式日历和 bid-period 内可选日期范围。
- `Date range`：`mode="range"`，复用标准单容器 `Start date · TO · End date` 与同一覆盖式日历；不显示两个独立的 `YYYY-MM-DD` 文本框。
- 日期 picker 的日期限制、浮层位置、焦点、选中态和范围中间态全部继承共享组件，不为 `110` 编写独立日历样式。
- 星期 Mon–Sun 仍保留在具体日期/星期模式内；日期与星期的业务语义继续为 OR。

### 3.2 Work-day match 统一

新增或复用一个仅表达二选一的 segmented control 外观，采用与现有 `AwardAvoidSegmentedControl` 完全相同的规则：

- 选中项：白色面、紫色文字、阴影。
- 未选项：透明面、灰色文字。
- `aria-pressed` 和 class 都从同一个 `draft.quantifier` 派生；不允许由焦点或另一套 class 改写选中背景。
- 初始值仍为 `Any work day`；切换为 `Every work day` 后，视觉和实际 payload 同步为 `quantifier: "every"`。

### 3.3 不变项

- Tiers 默认空、Award 默认、Any work day 默认、两种模式草稿保留、footer 启用规则均保持现有已确认业务行为。
- 具体日期/星期保存 `date-or-dow-list + In`，范围保存 `date-range + Between`。
- 不改通用 `DateOrDowListControl`，不影响 Departure / Layover / Enroute 等其他日期 property。

## 4. 验收标准

1. 打开 Work Day Preference 时，具体日期日历的触发器、popover、日期 chip 与 Prefer Off / Airport Preference 一致。
2. 切到 `Date range` 时，只出现一个标准范围 picker；点击起止日期使用同一张覆盖式日历，不出现两个独立文本框。
3. 新增默认 `Any work day` 时，只有 Any 显示白色选中块和紫色字；点击 Every 后，只有 Every 显示该状态，且 `aria-pressed="true"` 与 payload 都是 `every`。
4. 日期、星期、范围、保存 favorite、已有 bid 编辑回显与当前业务契约不回退。
5. 自动化覆盖：
   - Portal 单测验证新的 picker mode、默认/切换 work-day match 的 `aria-pressed` 与 selected class 一致。
   - Playwright 在真实 Pairing 页面验证具体日期、范围以及 Any/Every 的视觉/语义同步。
   - 既有 `Work Day Preference` payload 和 favorite 复用 E2E 继续通过。
6. 运行 focused Vitest、Playwright、`npm run lint`、`npm run build`、`npm run check:ui` 与 `git diff --check`。

## 5. Multi-Agent Parallelism Assessment

- Recommendation: No。
- Rationale: 日期控件和 quantifier 状态均集中在同一 editor / dialog，拆分会增加状态与样式再次不一致的风险。
- Execution gate: 用户审阅本 spec 并明确批准实施后，才修改代码；不自行提交 Git。
