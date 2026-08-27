# PBS Pairing Preference 筛选弹窗 UI 修复设计

## 状态

- 文档状态：待用户审阅
- 日期：2026-08-17
- 目标模块：`pbs-portal`
- 目标页面：Crew Portal / Bid / Configure Pairing Preference
- 目标组件：`PairingPreferenceFilterDialog`
- 目标测试：`e2e/tests/pbs-portal/pairing-preference.spec.ts`
- 明确约束：本轮只修复筛选弹窗 UI / 响应式 / Playwright 回归覆盖，不改变后端筛选语义，不改变 bid 保存 payload。

## 背景

Pairing Preference 的筛选条件已从主 picker 移入 `Pairing Filters` 弹窗，但当前 UI 在真实页面里暴露出明显体验问题：

- 输入框高度和视觉规格不统一。
- `Length / Layover Count / Credit` 的 `to` 和单位后缀挤压输入框，导致长短不一。
- 日期选择器 compact 高度过低，和其他输入框不成体系。
- 816px 宽度视口下弹窗内容显得拥挤，控件边界和间距不稳定。
- station 下拉打开后容易和弹窗滚动区域、底部按钮区域冲突。
- Playwright 当前只验证了功能链路，没有足够严格地防止截图里的布局问题再次出现。

这类问题会直接影响用户对产品专业性的判断。本轮目标不是“勉强调宽”，而是把该弹窗做成稳定、可测试、可继续扩展的操作面板。

## 目标

- 统一筛选弹窗内所有控件的尺寸、圆角、边框、字号和间距。
- 修复 816px 及更窄视口下的响应式布局问题。
- 修复 station 下拉打开后的溢出、遮挡和可点击性问题。
- 让 `Pairing Filters` 看起来像专业数据工具里的 filter panel，而不是临时堆出来的表单。
- 用 Playwright 明确覆盖截图中暴露的问题，避免后续回归。

## 非目标

- 不修改筛选字段的业务含义。
- 不修改 `preview` API contract。
- 不修改 `pairing-search` 后端 SQL。
- 不修改最终 `ADD BID` 保存逻辑。
- 不修改 `Search Pairings` 独立页面。
- 不重做 `Configure Pairing Preference` 主弹窗。
- 不引入新的 UI 框架或第三方浮层库。

## 当前问题拆解

### 控件规格不统一

当前 `PbsDatePicker` compact 模式高度约 25px，而 time / number / text input 高度约 32px。用户看到的是同一组筛选条件，但控件不在一个视觉系统里。

修复方向：

- Filter dialog 内控件统一高度为 32px。
- Date range picker 在 filter dialog 中也使用 32px 规格。
- Select button、text input、time input、number input 使用同一 border radius、border color、focus ring、font-size。

### Range 布局被单位挤压

当前 `FilterRangeField` 使用：

```text
from input | to | to input | suffix
```

当 suffix 是 `DAYS`、`COUNT`、`HH:MM` 时，输入框会被压缩，字段之间宽度不一致，截图里尤其明显。

修复方向：

- 单位不再作为右侧大后缀参与 grid 宽度。
- label 改为携带单位：
  - `Length (days)`
  - `Layover Count`
  - `Credit (HH:MM)`
- 输入区域只保留稳定三段：

```text
from input | to | to input
```

### 弹窗响应式不足

当前弹窗宽度和两列布局在 816px 视口下仍能显示，但内容密度和视觉节奏不好，容易显得“挤”和“不齐”。

修复方向：

- 弹窗宽度使用 `min(760px, calc(100vw - 32px))`。
- 内容区域使用 `container` / CSS grid 断点：
  - 宽度充足时：两列。
  - 小于阈值时：一列。
- 两列布局下每个字段宽度一致。
- 一列布局下所有字段占满宽度，底部按钮不溢出。
- 禁止弹窗主体产生横向滚动。

### 下拉层与底部按钮冲突

Station multi-select 是弹窗内的二级浮层。当前绝对定位下拉会在内容区滚动、底部 footer、视口边界之间产生冲突。

修复方向：

- 下拉层仍保持轻量自实现，不引入新依赖。
- 打开时计算可用空间：
  - 下方空间足够则向下展开。
  - 下方空间不足且上方空间更大则向上展开。
  - 最大高度受视口和弹窗边界限制。
- 下拉列表高度使用 `max-height`，内部滚动。
- 打开下拉后，filter dialog footer 的 `Clear All / Cancel / Apply Filters` 仍然可见并可点击。
- 下拉不能被外层 `overflow-y-auto` 裁切。

## 推荐方案

采用“小范围重整布局 + 强化测试”的方案：

1. 保留当前 `PairingPreferenceFilterDialog` 组件，不换技术栈。
2. 抽出稳定的 field primitives：
   - range field
   - station multi-select field
   - attribute toggle
3. 重写弹窗 grid 和 field 内部 grid。
4. 为 date picker 增加或使用适合 filter dialog 的 32px density。
5. 让 station dropdown 具备上下方向和高度约束。
6. 补 Playwright 布局回归测试。

不建议只做 CSS 临时补丁。截图里的问题不是单个 class 错了，而是布局模型不稳定。

## 交互与视觉设计

### 弹窗整体

- 标题：`Pairing Filters`
- 最大宽度：约 760px。
- 内边距：保持紧凑但不拥挤，字段分组之间要有清晰间隔。
- 背景：白色。
- 圆角：与项目弹窗体系一致，避免过大圆角。
- Footer 固定在弹窗底部，内容滚动时按钮不消失。

### 分组

保留当前分组，但布局更规整：

- `Basic`
  - Pairing Start Dates
  - Check-in
  - Check-out
  - Length (days)
- `Stations`
  - Route Station
  - Layover Station
- `Layover / Credit`
  - Layover Count
  - Credit (HH:MM)
- `Attributes`
  - Redeye
  - DHD

### 字段规格

所有输入类控件：

- 高度：32px。
- 字号：统一为当前 portal 小型表单字号。
- 圆角：统一。
- 边框：统一。
- focus ring：统一。
- disabled 样式：统一。
- placeholder 颜色：统一。

Range 字段：

- `to` 文字居中，颜色弱化。
- from/to 输入框等宽。
- 单位进入 label 或 placeholder，不挤压输入区。

Station select：

- 未选择：显示 placeholder。
- 已选择：显示 code chips，允许换行但不能撑坏按钮高度。
- 选项列表有搜索框。
- 选项列表打开后不影响弹窗 footer 可用性。

## Playwright 验收标准

需要新增或更新 `pairing-preference.spec.ts` 中的覆盖：

### 桌面布局

视口：`1440 x 900`

断言：

- 打开 `Pairing Filters` 后可见。
- 所有 input / select trigger 高度一致。
- Date range trigger 高度与其他输入一致。
- `Length (days)`、`Credit (HH:MM)` 不再出现右侧大后缀挤压。
- 弹窗主体无横向 overflow。
- 点击 `Apply Filters` 后 payload 保持正确。

### 816px 视口布局

视口：`816 x 1256`

断言：

- 弹窗宽度不超过视口。
- 弹窗主体无横向 overflow。
- 两列或一列布局下字段不重叠、不被截断。
- `Clear All`、`Cancel`、`Apply Filters` 始终可见。
- `Apply Filters` 按钮可点击。

### 低宽度缩放布局

视口：建议覆盖 `816 x 1256` 和 `640 x 900`。

断言：

- `Pairing Filters` 必须挂在 `scaled-page-dialog-portal-root` 下，和 `Configure Pairing Preference` 使用同一个 workbench 缩放体系。
- 低宽度下弹窗视觉比例随 workbench canvas 缩小，而不是脱离 canvas 用未缩放的 body portal 尺寸撑满屏幕。
- `getBoundingClientRect().width / offsetWidth < 1`，证明弹窗真实继承 canvas scale。
- 字段仍保持专业的两列 filter panel 布局，不因为 viewport media query 强行退化成截图里的超高单列表单。
- 每个字段不溢出自身容器。
- Footer 按钮不溢出。

### Station 下拉

断言：

- 打开 Layover Station 下拉后，下拉列表没有被弹窗裁切。
- 下拉列表自身可滚动。
- 下拉打开时 footer 按钮仍可见。
- 选择 station 后 chip 显示正常，不撑破 select trigger。

### 业务回归

继续保留并通过：

- `Apply Filters` 请求参数正确。
- `Clear All` 只清 draft，点击 `Apply Filters` 后才清除已应用筛选。
- 已选 pairing 不因筛选变化而丢失。
- check-in / check-out 筛选仍能提交正确参数。

## 验证命令

实现完成后至少运行：

```bash
cd /Users/lei/Codehub/rois-ai/e2e
npx playwright test --config=config/playwright.config.ts --project=pbs-portal --no-deps tests/pbs-portal/pairing-preference.spec.ts -g "PBS-3530|PBS-3535|PBS-3537"
```

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
pnpm exec vitest run src/features/pairing/components/pairing-preference-picker.test.tsx src/features/pairing/components/pairing-preference-picker-filters.test.ts
pnpm run build
```

```bash
cd /Users/lei/Codehub/rois-ai
npm run check:ui
git diff --check
```

如实现只改前端 UI，不需要重跑 pbs-server 后端测试；如果触碰筛选 payload 或 contract，则必须补跑 pbs-server 相关测试。

## 风险与处理

- 风险：`PbsDatePicker` 是共享组件，直接修改 compact density 可能影响其他调用方。
  处理：优先增加 filter dialog 专用 density 或在调用侧传入可控 class，避免影响其他页面。

- 风险：station dropdown 位于被缩放的 workbench 中，直接使用 viewport 坐标会出现二次缩放或位置偏移。
  处理：复用项目已有 `resolveScaledDropdownPosition`，dropdown 本身继续 body portal，并按触发器真实 visual scale 缩放。

- 风险：Playwright 视觉断言过脆。
  处理：断言布局事实，例如无横向 overflow、控件高度一致、按钮可见，不用截图像素比对。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 变更集中在一个弹窗组件和一组 Pairing Preference E2E，用多 agent 会增加冲突成本。
- Suggested split: 不拆分。
- Write boundaries: 单 agent 修改 `PairingPreferenceFilterDialog`、必要的 date picker 调用方式、相关测试。
- Conflict risk: Low，前提是不触碰后端和保存逻辑。
- Execution gate: 用户确认本 spec 后再实现。

## 验收标准

- 截图中的输入框大小不一致、后缀挤压、字段错位问题消失。
- 816px / 640px 宽度下弹窗继承 workbench 缩放，布局专业、可读、无横向溢出。
- station 下拉打开后不挡住或破坏 footer 操作。
- Playwright 覆盖上述 UI 适配问题。
- 原有 Pairing Preference 筛选功能测试继续通过。
