# PBS 左侧日历弹窗外部点击关闭设计

## 状态

- 日期：2026-05-07
- 模块：`pbs-portal`
- 状态：待实施

## 背景

`/days-off` 和 `/pairing` 页面共用左侧 `BIDDING CALENDAR`。当前点击日期或星期头后会打开 `actionPopover`，用户必须点击 `Cancel` 才能关闭，或者点击另一个日期直接打开新的弹窗。

期望交互是：当弹窗已经打开时，第一次点击弹窗外部只关闭当前弹窗，不穿透触发被点击位置的原本动作。用户需要第二次点击目标日期、星期头或事件，才执行新的选择。

## 目标

1. `/days-off` 日历弹窗打开后，点击弹窗外部先关闭弹窗。
2. `/pairing` 日历添加 pairing bid 弹窗打开后，点击弹窗外部先关闭弹窗。
3. 外部点击不触发新的日期选择、weekday 选择、pairing bid 添加入口或事件详情入口。
4. 弹窗内部交互保持不变，包括勾选 tier、搜索 pairing number、`Cancel`、`SAVE BID`、`ADD BID`。
5. 保存中状态不被外部点击打断，避免请求未完成时清掉 pending UI。

## 推荐方案

在共享组件 `ScheduleEventCalendar` 内处理外部点击。

弹窗存在时，在页面内容层和弹窗之间增加透明关闭层：

- 关闭层覆盖当前 viewport，确保点击右侧工作区空白处也会先处理当前弹窗。
- 关闭层层级高于日期 cell、weekday 触发点和 calendar event。
- 关闭层层级低于 `actionPopover`，因此弹窗内部按钮、输入框和 checkbox 仍能正常操作。
- 点击关闭层只调用现有 `actionPopover.onCancel()`。
- 当 `actionPopover.cancelDisabled` 为 `true` 时，关闭层继续吞掉外部点击但不调用 `onCancel()`，避免保存中点击穿透到底层日期按钮。

这个方案把行为收口在共享日历组件里，`DashboardSchedulePanel` 不需要为 days off 和 pairing 分别写重复拦截逻辑。

## 备选方案

### 文档级 pointer 监听

在 `document` 上监听外部点击，并用 ref 判断是否点在弹窗内。

优点：可以覆盖整个页面。  
缺点：更容易受 React 事件顺序、StrictMode、测试环境和弹窗内部控件影响，需要额外处理穿透与卸载时机。

### 业务 handler 中拦截

在日期、weekday、event 的点击 handler 里判断是否已有 pending 弹窗。

优点：改动直观。  
缺点：逻辑分散，容易漏掉入口，也不适合处理日历外部区域点击。

## 测试

1. `ScheduleEventCalendar` 单测：
   - 弹窗打开时存在外部关闭层。
   - 点击外部关闭层会调用 `onCancel`。
   - 点击弹窗内部按钮不通过关闭层触发关闭。
   - `cancelDisabled` 时不渲染外部关闭层。
2. `SharedBiddingWorkbenchLayout` 交互测试：
   - `/pairing` 中先打开 pairing bid 弹窗，再点击另一个日期，旧弹窗关闭，新的弹窗不会立即打开。
   - `/days-off` 中先打开 day off 弹窗，再点击另一个日期，旧弹窗关闭，新的弹窗不会立即打开。

## 不包含

- 不改 API、保存逻辑、数据结构或查询缓存策略。
- 不调整弹窗定位、尺寸、样式主题。
- 不引入新的依赖。
- 不处理 pairing bid 详情 dialog 的遮罩点击关闭，本轮只处理左侧日历 `actionPopover`。
