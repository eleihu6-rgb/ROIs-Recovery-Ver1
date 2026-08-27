# PBS Award 页面自适应布局回归测试

## 目的

验证 Award 页面在展示 Award Calendar 和 Roster Details 时，整页按照 PBS Portal 其他主页面的方式等比例缩放；左侧日历不会覆盖右侧卡片，也不会通过卡片内部横向滚动条来掩盖布局问题。

## 前置条件

- PBS Portal 可正常访问。
- 测试账号可登录 PBS Portal。
- 当前用户存在已发布或可展示的 Award 数据。
- 浏览器窗口分别使用 `1920 x 1080`、`1440 x 900` 和 `1280 x 720`。
- 准备两种 Reason Report 数据：
  - 有至少 3 条原因说明，其中至少一条为可换行的长文本。
  - 无原因说明，`View Reason Report` 为禁用状态。
- 当前 Award 至少包含足够多的 roster rows 和一个多航段 Pairing，以便
  `Roster Details` 表格和 `Selected Duty` 都产生内部纵向滚动。

## 测试步骤

1. 登录 PBS Portal。
2. 点击顶部导航 `Award`。
3. 等待页面加载完成，确认页面标题为 `AWARD`。
4. 查看左侧 `JUN 2026 AWARD CALENDAR` 或当前月份 Award Calendar。
5. 查看右侧 `ROSTER DETAILS` 和 `Reason Report Preview`。
6. 将浏览器调整到 `1440 x 900` 或类似笔记本宽度。
7. 观察整个 Award 页面是否按比例缩小。
8. 检查 Award Calendar、Roster Details、Selected Duty、Reason Report Preview 是否仍保持相对布局。
9. 将浏览器继续调整到 `1280 x 720`。
10. 选择一个多航段 Pairing，分别滚动 `Roster Details` 表格和
    `Selected Duty` 内容。
11. 确认滚动其中一个区域时，另一个区域的位置和滚动进度不变。
12. 在 Reason Report 有 3 条长文本时，检查 `Selected Duty` 的底边没有进入
    `Reason Report Preview`。
13. 切换到 Reason Report 无数据状态，重复检查两个区域不重叠。
14. 恢复 `1920 x 1080`，确认主要区域顺序和基准布局未变化。

## 预期结果

- Award Calendar 不覆盖 `ROSTER DETAILS`。
- `ROSTER DETAILS` 的表头、行数据、Selected Duty / Pairing Preview 区域都可以正常查看。
- 左右两个 panel 边界清晰，不出现跨卡片内容重叠。
- `1280 x 720` 下 `Selected Duty` 完整位于 `Reason Report Preview` 上方，
  两个卡片之间保留正常间距。
- Reason Report 有数据和无数据两种状态均不遮挡 `Selected Duty`。
- `Roster Details` 表格和 `Selected Duty` 分别在自己的区域内部滚动；
  一个区域滚动不会带动或重置另一个区域。
- 滚动到底部后，最后一条 roster row 和 Selected Duty 的最后一条航段仍可查看，
  内容不会被裁剪。
- 页面整体按比例缩放，和 Dashboard / Pairing 等页面的适配方式一致。
- Award Calendar 不出现横向滚动条。
- 页面不依赖浏览器级横向滚动来查看右侧内容。
- 页面、Award 画布和右侧栏不出现额外的横向或纵向页面级滚动。
- Loading 态和加载完成后的布局宽度一致，不出现明显跳动。

## 异常 / 边界场景

- Award 数据为空时，右侧应显示稳定空状态，不被左侧日历遮挡。
- Award 日历中 pairing / day off / activity 较多时，事件条仍应留在日历卡片内。
- `View Reason Report` 按钮禁用或可用时，不应影响下方左右 panel 布局。
- Reason Report 三条说明均为长文本并发生换行时，Preview 可以自然增高，但不得
  将 Roster Details 压出右侧栏或覆盖 Selected Duty。
- 多航段 Pairing 明细超过 Selected Duty 可用高度时，只允许 Selected Duty 内容区
  滚动，不允许卡片本身突破边界。

## 回归范围

- `/award` 页面。
- Award Calendar。
- Roster Details。
- Reason Report Preview。
- 顶部 Award summary cards 不应因本次布局修复出现明显挤压或换行异常。
