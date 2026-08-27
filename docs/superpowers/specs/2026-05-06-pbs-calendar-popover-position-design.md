# PBS 日历 Pairing Bid 弹窗定位修复设计

## 状态

- 日期：2026-05-06
- 模块：`pbs-portal`
- 状态：已确认并实施

## 背景

Pairing 页面左侧 `BIDDING CALENDAR` 中，点击靠右日期或第一行日期添加 pairing bid 时，`PAIRING BID` 弹窗会被裁剪。截图中倒数第二列靠右溢出，点击 `03` 这类第一行日期时顶部裁剪更明显。

当前 shared calendar 的 action popover 使用 `absolute` 定位，并挂在日历内部。它只对第 1 列和第 7 列做了简单内收，且日期 cell 默认都向上弹出。Pairing 添加弹窗宽度为 `380px`，内容高度也明显高于 Days Off 弹窗，因此在靠右列和第一行更容易被外层 `overflow` 裁掉。

## 目标

1. Pairing 添加弹窗在第一行日期打开时不再顶部裁剪。
2. Pairing 添加弹窗在倒数第二列、最后一列等靠右位置打开时不再右侧裁剪。
3. 保持 shared calendar 通用能力，不把 Pairing 专属判断写进 shared 组件。
4. 不改变 Pairing 添加保存、Tx 选择、loading/disabled/message 业务逻辑。
5. 用测试覆盖定位策略，避免后续回退。

## 方案

### 横向定位

把 cell / weekday action popover 的横向定位统一改为按左边缘定位：

- 先计算目标列中心点。
- 再减去弹窗宽度的一半，让弹窗视觉上仍然对齐被点击列。
- 最后用 CSS `clamp()` 限制在日历左右边距内。

这样第 6 列、宽弹窗、不同 `width` 的弹窗都能按同一策略内收，不再只处理第 1 / 第 7 列。

### 纵向定位

日期 cell popover 保持原来的靠近日期策略，但第一行改为从首行格子底部下方打开：

- `row === 1`：从第一行 cell 底部下方展开，避免顶部被外层容器裁剪，也避免遮挡被点击的日期格。
- `row > 1`：继续从目标行上方弹出，保持原来的交互习惯。

Weekday header popover 暂不改变纵向逻辑，因为它本来就是“星期头上方”的行为，本轮问题来自日期 cell。

## 测试

- 更新 `schedule-event-calendar.test.tsx`：
  - 普通日期 cell 使用 `clamp()` 横向定位。
  - 第一行日期 cell 在首行底部下方打开，`transform` 不再向上平移。
  - 靠右日期 cell 内收到日历右侧安全边距内。
  - weekday popover 横向也使用同一套边界策略。

## 不包含

- 不引入 floating-ui / portal。
- 不改 Pairing bid 添加 API 或保存逻辑。
- 不改 Days Off / Pairing 的业务语义。
- 不改变日历整体高度和视觉密度。
