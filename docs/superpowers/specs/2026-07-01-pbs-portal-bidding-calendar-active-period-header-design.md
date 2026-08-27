# PBS Portal BIDDING CALENDAR Active Period Header 调整设计

## 背景

当前 PBS Portal 已经接入 `activePeriod`，会在右侧业务面板顶部显示：

- `Bidding open for Jun 2026`
- `Open May 01, 00:00 · Close May 08, 23:59`

时间显示已经按“管理员配置的墙上时间”处理，不再跟随浏览器所在时区转换。

但当前独立提示条占用了右侧面板纵向空间，并且和用户理解上的“当前可申请周期 / 当前日历月份”不够靠近。左侧 `BIDDING CALENDAR` 标题条右侧存在明显空白，更适合承载这个周期状态。

## 目标

把 active period 状态从独立大提示条调整为 `BIDDING CALENDAR` 标题行右侧的紧凑状态块，使用户在看日历时能直接看到当前申请周期和开放窗口。

## 范围

本次只调整 PBS Portal 前端显示位置和样式：

- 左侧 `BIDDING CALENDAR` 标题行右侧显示 active period 状态。
- 标题条视觉上缩短为只包裹 `BIDDING CALENDAR` 标题区域，右侧留给状态块。
- 右侧业务面板中不再显示独立的 active period banner，避免重复。
- 保留现有只读 / 可申请业务判断，不改变后端接口、不改变 bid 保存校验。
- 保留当前 wall-time 显示口径：管理员配置 `May 01 00:00`，任何地区浏览器都显示 `May 01, 00:00`。

## 非目标

- 不重新设计整个左侧日历。
- 不调整日历中的日期格、Tier 行、事件块。
- 不修改 PBS Period / Business Time 管理端逻辑。
- 不新增新的周期状态字段或后端接口。

## 推荐方案

采用“本地化日历标题行增强”的方案：

1. 在 `DashboardSchedulePanel` 内部为 `BIDDING CALENDAR` 使用专用标题行布局。
2. 左侧标题块沿用现有紫色竖条和浅紫底色，但宽度改为内容宽度，不再铺满整行。
3. 右侧放置紧凑版 active period 状态块：
   - OPEN：绿色轻量状态。
   - 非 OPEN / 不可编辑：琥珀色轻量状态。
   - 文案保留英文产品 UI：
     - `Bidding open for Jun 2026`
     - `Open May 01, 00:00 · Close May 08, 23:59`
     - 或 `Read-only for Jun 2026`
4. 将现有 `ActivePeriodBanner` 拆成可复用展示组件，支持：
   - `variant="banner"`：保留现有大块样式作为 fallback 或其他页面需要时使用。
   - `variant="compact"`：用于 `BIDDING CALENDAR` 标题右侧。
5. 移除 Pairing / Rule Bid 右侧面板里独立 banner 的渲染，让用户只在左侧共享日历标题处看到一次状态。

## 备选方案

### 方案 A：直接把现有 banner 放进标题行

优点：改动少。

缺点：现有 banner padding / 圆角 / 高度较大，放入 32px 标题行会显得拥挤，不符合截图中希望“标题条缩短一点，右边放状态”的视觉意图。

### 方案 B：修改全局 `PanelStripHeader` 支持右侧内容

优点：以后所有面板标题都能复用右侧 slot。

缺点：`PanelStripHeader` 被多个页面使用，改变宽度和布局容易影响无关页面。当前需求只针对 `BIDDING CALENDAR`，全局改动收益不高。

### 方案 C：在 `DashboardSchedulePanel` 做局部标题行增强

优点：影响面最小，符合 `BIDDING CALENDAR` 共享区域的特殊性，不扰动其他面板标题。

缺点：会在该组件内保留一个专用标题布局。

推荐采用方案 C。

## 组件设计

### `ActivePeriodBanner`

继续保留为共享组件，但增加紧凑展示能力：

- `activePeriod?: PbsActivePeriod`
- `variant?: "banner" | "compact"`
- `className?: string`

`formatDateTime` 保持现有 UTC 字段读取方式，用于实现 wall-time 显示。

### `DashboardSchedulePanel`

在标题区域使用：

- 左侧：局部标题块，显示 `BIDDING CALENDAR`。
- 右侧：`ActivePeriodBanner variant="compact"`。
- 当没有 `activePeriod` 时，右侧不显示状态块，标题行仍然正常。
- 在窄宽度或缩放场景下，标题和状态块允许换行，但不遮挡月份标题和日历。

### 右侧业务面板

从以下位置移除独立 banner：

- Pairing 右侧面板。
- Rule Bid 右侧面板。

只保留原有 read-only 禁用逻辑和点击时 warning，不移除业务保护。

## 数据流

不改变数据来源：

```text
pbs-server activePeriod
  -> page data / bidding calendar response
  -> DashboardSchedulePanel activePeriod
  -> ActivePeriodBanner compact display
```

`DashboardSchedulePanel` 继续按已有优先级取 active period：

1. Pairing page data draft meta。
2. Days Off page data draft meta。
3. Server bidding calendar response。

## 验收标准

- `BIDDING CALENDAR` 标题条不再铺满整行，右侧能显示 active period 紧凑状态。
- Portal 页面不再出现右侧独立大 banner 的重复提示。
- OPEN 周期显示开放状态和 bid open / close 时间。
- CLOSED / DRAFT / 不在窗口内显示 read-only 状态和原因。
- 时间显示仍为管理员配置的墙上时间，不受用户浏览器时区影响。
- 没有 active period 时，标题行不显示空占位或异常文案。
- 日历月份标题、Tier matrix、calendar grid 布局不被遮挡。

## 测试计划

### 自动化测试

- 更新 `dashboard-page.test.tsx`：
  - 断言 `BIDDING CALENDAR` 标题行右侧显示 active period 紧凑状态。
  - 断言不再出现旧位置的大 banner。
- 更新已有 active-period wall-time 测试或补充共享组件测试：
  - `2026-05-01T00:00:00.000Z` 显示为 `May 01, 00:00`。
  - 不显示 `May 01, 08:00` 或 `May 09, 07:59`。
- 如右侧面板测试依赖 banner 文案，需要同步改为断言 read-only 禁用逻辑仍存在。

### 手工 QA

更新或新增 `docs/test-cases/pbs/period/` 下的 QA 用例：

- OPEN 周期：标题右侧显示绿色紧凑状态。
- Read-only 周期：标题右侧显示琥珀色紧凑状态。
- 不同时区浏览器：显示同一组 wall-time。
- Pairing / Rule Bid / Dashboard 切换：状态只显示在左侧日历标题处，不重复。

### 验证命令

预计执行：

```bash
cd pbs-portal && npm run test -- src/features/dashboard/pages/dashboard-page.test.tsx src/features/line/pages/line-page.test.tsx
cd pbs-portal && npm run build
npm run check:ui
git diff --check
```

## 风险与控制

- 风险：`PanelStripHeader` 是共享组件，直接改会影响其他页面。
  - 控制：不改全局标题组件，优先在 `DashboardSchedulePanel` 局部实现。
- 风险：移除右侧 banner 后，用户可能在非日历视线区域看不到状态。
  - 控制：左侧 `BIDDING CALENDAR` 是跨页面固定区域，状态跟随共享日历显示。
- 风险：紧凑状态在较窄宽度下拥挤。
  - 控制：使用 flex wrap / min-width 控制，必要时让状态块换行。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次是小范围 Portal UI 布局调整，主要集中在共享日历面板和 active period 展示组件，拆多 agent 会增加协调成本。
- Suggested split: 不建议拆分。
- Write boundaries: 单 agent 修改 `pbs-portal` 相关组件、测试和 QA 文档即可。
- Conflict risk: 多 agent 容易同时改 `DashboardSchedulePanel` 和 `ActivePeriodBanner`，冲突风险高于收益。
- Execution gate: 用户确认本 spec 后再实施。

