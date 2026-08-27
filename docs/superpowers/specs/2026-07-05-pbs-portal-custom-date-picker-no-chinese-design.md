# PBS Portal 自研日期选择器与中文日期占位清理 Spec

## 背景

PBS Portal 是员工端英文产品界面。根目录 `CLAUDE.md` 明确要求：产品 UI 默认使用 English，中文只允许在用户明确要求中文或配置中文 i18n 时出现。

当前用户在 `Days Off` 配置弹窗中发现日期输入框显示 `年/月/日`。扫描后确认，这不是硬编码中文 UI 文案，而是浏览器原生 `input type="date"` 根据系统 / 浏览器 locale 自动渲染出来的本地化占位。即使代码里没有中文字符串，用户仍会看到中文，所以必须处理。

同时，单纯把日期控件改成 `type="text"` 虽然可以彻底避免中文占位，但会让员工只能手动输入 `YYYY-MM-DD`，体验不够好。更合理的方向是：**不用 native date input，但自己提供一个 Portal 风格的轻量日期选择器**。

## 扫描结论

### 硬编码中文

`pbs-portal/src` 中的中文命中主要是：

- `pbs-portal/src/version.ts`：中文注释。
- `pbs-portal/src/app/layout/use-dashboard-header-layout.ts`：中文注释。
- `pbs-portal/src/features/pairing/components/pairing-bid-control.test.tsx`：测试输入值 `"北京"`。

这些不是用户可见 UI 文案，不是本次 bug 的直接来源。

### 用户可见中文来源

当前仍存在这些 native date input：

- `pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx`
  - `Prefer Off date`
  - `Prefer Off range from`
  - `Prefer Off range to`
- `pbs-portal/src/features/reserve/components/reserve-bid-dialog.tsx`
  - `Reserve date for ...`
- `pbs-portal/src/features/reserve/components/reserve-date-scope-control.tsx`
  - `date range from`
  - `date range to`
  - `specific date`
- `pbs-portal/src/features/pairing/components/pairing-bid-control-inputs.tsx`
  - shared `BidDateInput`

这些控件会在中文系统 / 中文浏览器下显示 `年/月/日`。

### 暂不处理项

`type="time"` 当前在截图里显示为 `--:--`，没有中文化问题。本次不扩大范围修改 time input，避免无必要改变已有交互。

## 目标

1. PBS Portal 所有用户可见日期输入不再出现 `年/月/日` 等中文本地化占位。
2. 日期输入空值时统一显示 `YYYY-MM-DD`。
3. 用户可以点击日历图标选择日期，不要求纯手动输入。
4. 仍允许键盘输入 `YYYY-MM-DD`。
5. 保存值和 API payload 保持 `YYYY-MM-DD` 不变。
6. 覆盖 `Days Off / Reserve / Pairing` 中所有 native date input。
7. 增加自动化保护，避免后续重新引入 `type="date"`。

## 非目标

- 不引入第三方 date picker 依赖。
- 不改后端接口。
- 不改数据库结构。
- 不重做完整日历系统。
- 不修改 time input。
- 不修改中文注释、中文开发文档或测试中的非 UI 中文数据。
- 不改变已保存 bid summary 的日期展示逻辑。

## 方案比较

### 方案 A：继续使用 native `type="date"`，加 `lang="en-US"`

优点：

- 改动最小。
- 保留浏览器原生日历控件。

缺点：

- 不可靠。Chrome / Safari / Edge 对 `lang` 的处理不完全一致。
- placeholder 和弹层 UI 仍可能跟随操作系统 locale。
- 不能保证中文系统下不出现中文。

结论：不采用。

### 方案 B：改成 `type="text"`，只显示 `YYYY-MM-DD`

优点：

- 最稳定。
- 实现简单。
- 不会出现中文占位。

缺点：

- 员工必须手动输入日期。
- 比原生日期选择体验明显退化。

结论：不作为最终方案，仅作为底层输入能力。

### 方案 C：自研 `PortalDatePicker`

做法：

- 底层 input 使用 `type="text"`，固定 placeholder 为 `YYYY-MM-DD`。
- 右侧显示 calendar icon。
- 点击 input 或 icon 打开 Portal 风格的轻量日历 popover。
- 点击日期后写入 `YYYY-MM-DD`。
- 保留键盘输入能力。
- 日历 UI 全部由我们自己渲染，固定英文星期 / 月份，不受浏览器 locale 影响。

优点：

- 彻底解决中文 UI。
- 保留点选日期体验。
- UI 风格可控，能与 PBS Portal 现有弹窗和日历一致。
- 不引入第三方依赖。

缺点：

- 实现量大于纯 text input。
- 需要补充分层测试和 E2E。

结论：推荐采用。

## 组件设计

### 1. `IsoDateInput`

路径：

- `pbs-portal/src/shared/components/ui/iso-date-input.tsx`

职责：

- 提供固定英文 / ISO 占位输入。
- 使用 `type="text"`。
- 固定 `placeholder="YYYY-MM-DD"`。
- 设置 `inputMode="numeric"`、`maxLength={10}`、`autoComplete="off"`。
- 不做复杂业务校验，只保持输入组件通用。
- 支持透传 `className`、`aria-label`、`disabled`、`value`、`onChange`。

### 2. `PortalDatePicker`

路径：

- `pbs-portal/src/shared/components/ui/portal-date-picker.tsx`

职责：

- 组合 `IsoDateInput` 和日历 popover。
- 输入值仍是 `YYYY-MM-DD` 字符串。
- 点击 input / icon 打开日历。
- 日历默认展示：
  - 当前 value 所在月份；如果 value 无效或为空，则展示当前业务上合理的默认月份。
  - 没有传默认月份时，使用当前真实月份。
- 支持月份前后切换。
- 点击日期后：
  - 调用 `onValueChange(nextIsoDate)`。
  - 关闭 popover。
- Escape 关闭。
- 点击外部关闭。
- disabled 时不可打开。

### 3. 日历视觉

原则：

- 不使用浏览器原生日历 UI。
- 英文 weekday header：`SUN MON TUE WED THU FRI SAT`。
- 月份标题使用英文，例如 `JUN 2026`。
- 日期单元使用数字。
- 选中日期使用 PBS Portal 紫色高亮。
- hover 状态明确。
- popover 宽度控制在输入框附近，不撑开弹窗。

可优先参考现有 Portal 日历视觉：

- `pbs-portal/src/shared/components/calendar/month-grid-calendar.tsx`
- `pbs-portal/src/shared/components/calendar/award-mini-calendar.tsx`

但不要把业务事件日历直接耦合到 date picker。date picker 应该是独立输入组件。

## 替换范围

把以下 `type="date"` 替换成 `PortalDatePicker`：

- `pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx`
- `pbs-portal/src/features/reserve/components/reserve-bid-dialog.tsx`
- `pbs-portal/src/features/reserve/components/reserve-date-scope-control.tsx`
- `pbs-portal/src/features/pairing/components/pairing-bid-control-inputs.tsx`

保留原有：

- `aria-label`
- `className`
- `value`
- `disabled`
- `onChange` / 状态更新语义
- `ISO_DATE_PATTERN` 校验和按钮 disabled 条件

## 行为细节

### 手动输入

- 用户可以直接输入 `2026-06-10`。
- 输入过程中不自动插入符号，避免干扰复制粘贴。
- 业务按钮继续用现有校验控制 disabled。

### 日历选择

- 点击日历日期写入 `YYYY-MM-DD`。
- 单日期输入：选择后关闭。
- range 输入：from / to 各自独立选择，不自动补齐另一端。

### 默认月份

优先级：

1. 当前 value 的月份。
2. 业务传入的 `defaultMonth`。
3. 当前系统日期月份。

后续如果要和 PBS active period 强绑定，可以再扩展 `defaultMonth`，本次不把 date picker 绑定到 PBS period store。

## 测试方案

### Vitest

新增或更新：

- `pbs-portal/src/shared/components/ui/portal-date-picker.test.tsx`
  - 空值显示 `YYYY-MM-DD`。
  - input 的 `type` 是 `text`，不是 `date`。
  - 点击 icon 打开英文日历。
  - 点击日期返回 `YYYY-MM-DD`。
  - Escape 关闭。
  - disabled 时不能打开。
- `pbs-portal/src/features/days-off/pages/days-off-page.test.tsx`
  - `Prefer Off date` 使用 `YYYY-MM-DD` placeholder。
  - 点击日历选择日期后可以 `ADD DATE`。
- `pbs-portal/src/features/reserve/pages/reserve-page.test.tsx`
  - Reserve specific date 可以通过 date picker 选择日期。
- `pbs-portal/src/features/pairing/components/pairing-bid-control.test.tsx`
  - `BidDateInput` 不再渲染 native date input。

### Static Guard

新增 guard 测试或脚本断言：

- `pbs-portal/src` 不允许出现 `type="date"`。
- 如果未来确实要引入 native date input，必须显式修改 guard 并说明原因。

### Playwright

新增或更新一个真实 UI 回归：

- 进入 `Days Off`。
- 打开 `Configure Days Off Bid`。
- 选择 `Prefer Off` 的 `Dates`。
- 断言日期输入 placeholder 是 `YYYY-MM-DD`。
- 点击 calendar icon。
- 选择一个日期。
- 点击 `ADD DATE`。
- 断言日期 chip 出现。
- 断言页面没有出现 `年/月/日`。

### QA 文档

新增：

- `docs/test-cases/pbs/shared/2026-07-05-portal-date-picker-no-chinese-placeholder.md`

内容覆盖：

- 中文系统 / 中文浏览器下验证。
- Days Off 单日期。
- Days Off 日期范围。
- Reserve 日期。
- Pairing 日期条件。

## 验收标准

1. `rg 'type="date"' pbs-portal/src` 无命中。
2. 空日期输入显示 `YYYY-MM-DD`。
3. 点击日历可以选择日期。
4. 中文系统 / 中文浏览器下不出现 `年/月/日`。
5. 保存到业务状态和后端 payload 的值仍是 `YYYY-MM-DD`。
6. `Days Off / Reserve / Pairing` 日期输入行为正常。
7. 不引入第三方依赖。
8. `pnpm lint` 通过。
9. `pnpm build` 通过。
10. 相关 Vitest 通过。
11. 至少一个真实 UI Playwright 回归通过。
12. `npm run check:ui` 通过，hard violations 为 0。

## 风险与处理

- **Popover 层级被弹窗裁切**：优先把 popover 放在输入组件附近，并确保父弹窗内容区不会 `overflow: hidden` 裁掉；如果确实需要，可以使用 React portal，但先不默认上复杂方案。
- **日期选择器与已有业务日历耦合过重**：组件只处理日期选择，不承载 bid / period / pairing 业务。
- **键盘可访问性不足**：第一版至少支持 Escape 关闭、button aria-label、可点击日期按钮；完整键盘方向键导航后续可增强。
- **另一个窗口有未提交 Dashboard 改动**：实现和提交时必须精确 stage 本次文件，避免混提交。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在共享输入组件、四个调用点和测试，单 agent 更容易保持一致性。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/shared/components/ui`、Days Off / Reserve / Pairing 调用点、相关测试、QA 文档。
- Conflict risk: 中等。当前工作区有其他窗口 Dashboard 改动，提交时需要严格只提交本次文件。
- Execution gate: 用户确认本 spec 后再实现。
