# PBS 左侧日历 DO / RES 双指标设计

## 背景

Reserve 页面前端入口已经删除，原 Reserve 页面中按日期展示的 `Need / Off` 数字不应该因此丢失。现在 PBS 共享左侧日历已经有 Days Off 容量 badge，例如 `DO 38/21`，其含义是 `requestedDayOffCount / maxDaysOffCount`。用户确认左侧日历日期格空间足够，希望同一天同时展示 Days Off 容量和 Reserve Coverage 两套指标，而不是按上下文二选一。

## 目标

- 在共享左侧日历中同时展示两类日期指标：
  - `DO requested/max`：Days Off 申请人数 / 当天最大可休息人数。
  - `RES need/off`：Reserve 需求人数 / 当天可 off 人数。
- 复用现在小 badge 的视觉风格，增加清晰前缀，避免用户误读裸数字。
- 将字号、行距和间距调小，确保两个指标可以在日期格底部稳定显示。
- 不恢复 Reserve 页面，不新增单独 Reserve 顶部导航。
- 不影响 Pairing 蓝条、Off 绿条、Tier 选择、Days Off 日历编辑等现有行为。
- Reserve Coverage 应作为共享左侧日历的补充数据加载；失败时不能影响原日历和 DO 指标。

## 非目标

- 不改变 Reserve Coverage 的计算公式。
- 不改变 Days Off 容量的计算公式。
- 不新增数据库表或 migration。
- 不解决 Reserve Preference 条件本身的新增、编辑、保存逻辑。
- 不为了两个小指标重做整个月历布局，不移动 Pairing/Off 事件条的业务位置。

## 当前数据来源

### Days Off 容量

来源：`GET /api/bidding-calendar/current`

当前 response 中已有：

- `dayOffCapacity[].date`
- `dayOffCapacity[].requestedDayOffCount`
- `dayOffCapacity[].maxDaysOffCount`
- `dayOffCapacity[].totalCrewCount`
- `dayOffCapacity[].pairingDemandCount`
- `dayOffCapacity[].reserveDemandCount`
- `dayOffCapacity[].preAssignedDayOffCount`

当前 UI 显示为：`requestedDayOffCount/maxDaysOffCount`，例如 `38/21`。

### Reserve Coverage

来源：`GET /api/reserve-bids/current/coverage`

当前 response 中已有：

- `days[].date`
- `days[].requiredReserveCount`
- `days[].availableOffCount`

建议 UI 显示为：`RES requiredReserveCount/availableOffCount`，例如 `RES 0/89`。

## 方案对比

### 方案 A：同一日期格显示两行小指标（推荐）

将共享日历的底部 badge 泛化为 `calendarMetricBadges` 数组，每个日期格最多显示两行：

- 第一行：`DO 38/21`
- 第二行：`RES 0/89`

`DO` 仍来自 `GET /api/bidding-calendar/current` 的 `dayOffCapacity`。`RES` 来自 `GET /api/reserve-bids/current/coverage`。Reserve Coverage 作为补充查询加载，成功则显示 `RES`，失败或缺少对应日期则只显示 `DO`，不能导致整个日历空白。

优点：

- 信息完整，Reserve 页面删除后，用户仍能在左侧日历看到原 Reserve Coverage。
- `DO` 和 `RES` 前缀明确，比裸 `38/21` 更容易理解。
- 不需要用户切换页面或上下文才能对比 Days Off 压力和 Reserve 需求。
- 不改现有后端合同，只是前端多合并一个已有接口。

缺点：

- 日期格底部空间会更紧，需要精细控制字号、行距和 badge 尺寸。
- 默认页面会额外请求 Reserve Coverage，必须保证它不阻塞首屏日历渲染。

### 方案 B：后端把 Reserve Coverage 合并进 `bidding-calendar/current`

后端在 `GET /api/bidding-calendar/current` 里同时返回 Days Off 容量和 Reserve Coverage，前端按需要展示。

优点：

- 前端数据来源更集中。

缺点：

- 默认日历接口会变重，所有页面都必须等待 reserve coverage SQL。
- 当前项目刚做过 calendar 性能优化，这个方向有首屏回退风险。

结论：不推荐第一版采用。

### 方案 C：按上下文二选一显示

默认显示 `DO`，进入 ROSTER / Reserve Preference 后切换成 `RES`。

优点：

- UI 最省空间。
- 默认页面不需要额外请求 Reserve Coverage。

缺点：

- 用户无法同屏对比 `DO` 与 `RES`。
- 用户已经明确希望同时显示，两者二选一不符合新方向。

结论：不推荐。

### 方案 D：共享日历同屏显示 DO 与 RES

左侧共享 `BIDDING CALENDAR` 在同一日期格底部同时显示 Days Off 容量和 Reserve Coverage。字号和 badge 高度缩小，采用两行堆叠：

- 第一行：`DO requested/max`
- 第二行：`RES need/off`

优点：

- 用户可以在同一日期直接对比 days-off 请求压力和 reserve 覆盖压力。
- 不依赖当前右侧页面或 tab，Dashboard / Bid / Days Off / Pairing / ROSTER 行为一致。
- 保留现有两条接口，reserve coverage 失败时只隐藏 RES 行，不影响 DO 和日历主体。

缺点：

- 每个日期格会更密，需要控制字号、高度和底部间距。

结论：采用。

## UI 设计

### Badge 文案

- Days Off：`DO 38/21`
- Reserve：`RES 0/89`

说明：

- `DO` = Days Off。
- `RES` = Reserve。
- 斜杠前后数值沿用对应业务原始含义，不混用。

### Badge 颜色

第一版沿用当前 Days Off 三色规则：

- 绿色：左值小于右值。
- 黄色：左值等于右值。
- 红色：左值大于右值。

对于 `DO`：

- 左值 = requested day off count。
- 右值 = max day off count。

对于 `RES`：

- 左值 = required reserve count。
- 右值 = available off count。

备注：Reserve 的业务语义不是“申请数 / 容量”完全同构，但第一版先按相同视觉规则表达压力。如果业务后续确认 Reserve 颜色需要单独规则，可以只调整 tone 计算，不改数据结构。

### 展示位置

- 继续使用当前日期格底部居中区域，但改为最多两行纵向堆叠。
- `DO` 和 `RES` 使用更小字号、更小高度、更紧凑行距。
- 两个 badge 统一左右居中，宽度不撑满日期格。
- 有 Pairing/Off 事件条时，badge 仍在底部；事件条和 badge 不互相挤压。
- muted 的跨月日期不显示 badge，保持当前行为。

### 展示规则

- Dashboard、Bid、Days Off、Pairing、ROSTER 等所有共享左侧日历场景都统一显示 `DO` + `RES`。
- 如果某一天只有 DO 数据，没有 RES 数据：只显示 `DO`。
- 如果某一天只有 RES 数据，没有 DO 数据：只显示 `RES`。
- 如果两个接口都没有该日期数据：不显示指标。
- muted 的非当前月份日期不显示任何指标。

### Badge 视觉合并与放大提示

用户反馈两行小 badge 中间有缝隙，且小字号对部分用户不够友好。保留两行数据，但把它们视觉上作为一个整体展示：

- 多个指标共用一个外层容器，外层负责圆角、阴影和裁切。
- `DO` 和 `RES` 行之间不再使用纵向 gap；两种颜色直接贴合，形成一个上下分区的合并 badge。
- 单行指标仍显示为一个完整圆角 badge；双行指标只让外层有完整圆角，内部行不单独产生上下间隙。
- 颜色规则不变：每一行仍按自己的 `numerator / denominator` 单独判定绿色、黄色、红色。
- 默认小 badge 继续放在日期格底部居中，不能挤压或遮挡 Pairing 蓝条、Off 绿条。
- 鼠标悬停或键盘 focus 到日期格时，显示一个只读放大提示层。
- 放大提示层按同样的行顺序、同样的颜色、同样的文案渲染 `DO x/y` 和 `RES x/y`，比例放大，不重新解释业务含义。
- 放大提示层不参与点击，不改变日期格点击、weekday 点击、event 点击的行为。
- 放大提示层仅作为可读性增强；无障碍语义仍以每行 badge 的 `aria-label` 为准。

推荐实现方式：

- 在 `ScheduleEventCalendar` 的 date cell 上使用 hover/focus 状态控制提示层，避免给小 badge 本身打开 pointer events。
- 小 badge 容器保持 `pointer-events-none`，日期点击区域仍由原来的 overlay 处理。
- 新增一个内部渲染函数或小组件负责同时渲染“正常尺寸”和“放大尺寸”，避免 DO/RES 文案拼接逻辑重复散落。
- 放大层使用绝对定位浮在日期格上方或底部附近，不改变 calendar grid 的实际高度。

## 技术设计

### 前端类型

在 `pbs-portal/src/shared/components/schedule/types.ts` 中，把 `ScheduleCalendarCell.metricBadge` 调整为数组形式：

```ts
type ScheduleCalendarMetricBadge = {
  type: "days_off" | "reserve";
  label: "DO" | "RES";
  numerator: number;
  denominator: number;
  ariaLabel: string;
};

type ScheduleCalendarCell = {
  metricBadges?: ScheduleCalendarMetricBadge[];
};
```

原 `dayOffCapacity` 可继续作为内部兼容字段保留，便于现有 Days Off 计算和测试不被大范围改动。

### 前端映射

- 现有 `bidding-calendar-mappers.ts` 继续从 `dayOffCapacity` 生成 `DO` badge。
- Reserve Coverage mapper 把 `/reserve-bids/current/coverage` 的 `days` 按 `date` 合并到同一批 calendar cells，生成 `RES` badge。
- `schedule-event-calendar.tsx` 只负责按 `metricBadges` 顺序渲染 `label numerator/denominator`，不关心数据来源。
- badge 顺序固定为 `DO` 在上、`RES` 在下，避免页面间跳动。

### 数据请求策略

- 共享左侧日历默认加载 `bidding-calendar/current`，保持原首屏路径。
- 同时异步请求 `/reserve-bids/current/coverage`，但不得阻塞日历主体渲染。
- Reserve Coverage 成功后补齐 `RES` badge；失败时不显示 `RES`，不影响 `DO`、Pairing/Off 事件、Tier 选择和日期点击。
- 不为 Reserve Coverage 失败弹出频繁 toast，避免干扰用户；必要时仅保留非阻塞日志或低干扰状态。

### 后端

- 复用现有 `reserve-coverage-service.ts`。
- 不新增 SQL。
- 不新增 migration。
- 不改变 `/api/bidding-calendar/current`。

## 验收标准

- Dashboard 默认日历同时显示 `DO x/y` 和 `RES need/off`。
- Bid / Days Off / Pairing / ROSTER 共享左侧日历都同时显示 `DO` 与 `RES`，有缺失数据时只隐藏缺失的那一行。
- Days Off 相关页面显示 `DO x/y`，且颜色规则与当前保持一致。
- Reserve Coverage 显示 `RES need/off`，且颜色规则与当前一致。
- Pairing 蓝条、Off 绿条仍正常显示，不被 badge 遮挡或挤出。
- 跨月 muted 日期不显示指标 badge。
- Reserve Coverage 请求失败不导致整个日历空白，`DO` 仍可显示。
- 现有 days off capacity 的 aria-label 需要更新为包含 `DO`。
- Reserve badge 需要有明确 aria-label，例如 `Reserve coverage for 2026-06-23: need 0, available off 89`。

## 测试计划

### 单元 / 组件测试

- `bidding-calendar-mappers.test.ts`
  - 验证 Days Off capacity 被映射成 `DO requested/max`。
  - 验证 Reserve Coverage 被映射成同一日期下第二个 `RES need/off` badge。
  - 验证 Reserve Coverage 缺失或失败时仍保留 `DO` badge。
  - 验证已有 `requested/max` 数值和颜色规则不变。
- `schedule-event-calendar.test.tsx`
  - 验证同一日期同时渲染 `DO 23/33` 和 `RES 0/89`。
  - 验证双行 badge 使用合并容器渲染，中间无 gap，颜色仍按各自行数值独立计算。
  - 验证放大提示层包含同一组 `DO` / `RES` 内容，且默认不占布局空间。
  - 验证两行 badge 不拦截日期点击。
  - 验证 muted 日期不显示 badge。

### Playwright 回归

- Dashboard：
  - 打开 `/pbs/dashboard`。
  - 左侧/中间日历正常显示。
  - 默认 badge 同时显示 `DO` 和 `RES` 前缀。
  - hover 一个同时有 `DO` 和 `RES` 的日期格，确认出现放大的合并 badge，颜色与小 badge 一致。
  - hover 后再点击日期格或事件条，原有日期/事件交互不被放大层阻断。
- Bid / Days Off：
  - 打开 Bid 页面。
  - Days Off / Pairing / ROSTER tab 切换后左侧日历都同时显示 `DO` 和 `RES`。
  - 原有 Off 绿条、Pairing 蓝条不受影响。
- Roster / Reserve Preference：
  - 进入 Reserve Preference 相关配置入口。
  - 左侧日历仍同时显示 `DO` 和 `RES`，Reserve Preference 新增/编辑不受影响。
  - 日期格布局不溢出、不遮挡事件条。

## 风险与缓解

- 风险：同一日期两行 badge 可能和 Off / Pairing 事件条视觉拥挤。
  - 缓解：字号和高度缩小，指标固定在底部；必要时只在有数据的日期显示，空数据不占位。
- 风险：Reserve Coverage 查询较慢。
  - 缓解：Reserve Coverage 异步补齐，不能阻塞 `bidding-calendar/current` 的首屏渲染。
- 风险：用户混淆 DO 与 RES 两套分母含义。
  - 缓解：badge 加前缀，Help 同步解释。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这次改动主要集中在共享日历类型、mapper、一个组件渲染和少量页面上下文切换，文件耦合较紧；拆多 agent 容易在同一类型/组件上冲突。
- Suggested split: 不建议拆分。实现后可以用一个独立 review/test pass 检查 UI 和回归。
- Write boundaries: 单 agent 修改 `pbs-portal` 的 schedule types/component、dashboard/bid mapper、相关 tests 和 Help。
- Conflict risk: 多 agent 同时改共享日历类型和 tests 冲突风险较高。
- Execution gate: 用户确认 spec 后再实现。
