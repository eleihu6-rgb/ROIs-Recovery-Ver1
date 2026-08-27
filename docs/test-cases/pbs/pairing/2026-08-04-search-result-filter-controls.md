# PBS Pairing 搜索结果筛选组件测试用例

## 前置条件

- 使用存在开放 PBS Period、可查询 Pairing 的机组账号登录。
- 进入 `Bid → Pairing → ALL PAIRINGS`，打开 `Search Pairings` 页面。

## PBS-3650：Pairing Number 空输入无限滚动多选

1. 打开 Pairing Number 下拉，不输入任何内容。
2. 确认立即显示第一批 Pairing Number，而不是重复的搜索提示。
3. 滚动到列表底部，确认自动加载下一批且没有重复或跳号。
4. 从后续批次选择一个 Pairing Number，再从第一批选择另一个。
5. 确认两个值均显示为可删除标签并等待结果刷新。

预期：选项范围符合当前 Period、Base、Rank；请求发送 `pairingNumbers` 数组；结果匹配任意一个所选 Pairing Number；服务器分页总数同步更新。

## PBS-3650A：Pairing Number 输入后远程搜索

1. 打开 Pairing Number 下拉并输入部分编号。
2. 确认旧的默认列表进入 Loading 后替换为匹配项。
3. 滚动匹配结果并选择一个 Pairing Number。
4. 清空输入并重新打开。

预期：搜索条件变化后从首批重新加载，不混入旧搜索结果；重新打开空输入列表仍从第一批开始。

## PBS-3651：Airport 搜索多选

1. 打开 Airport 下拉并搜索机场代码。
2. 选择两个不同机场。
3. 等待结果刷新。

预期：请求发送 `airports` 数组；结果中每个 Pairing 至少有一个航段的 departure、arrival、duty-start 或 duty-end 命中任一所选机场。

## PBS-3652：跨字段 AND

1. 同时选择两个 Pairing Number 和两个 Airport。
2. 选择一个 Date Range。
3. 等待结果刷新。

预期：同字段所选值按 OR；Pairing Number、Airport、Date Range 之间按 AND；结果和总数来自服务器完整数据集而非当前页前端过滤。

## PBS-3653：删除与 Clear

1. 删除一个 Pairing Number 标签。
2. 确认请求只保留另一个 Pairing Number。
3. 点击 `Clear`。

预期：所有 Pairing Number、Airport、Date Range 和 Time Range 均被清除；页码回到第 1 页；请求 filters 为空。

## PBS-3654：键盘与错误状态

1. 使用键盘聚焦并打开两个多选组件。
2. 使用上下方向键、Home、End、Enter 浏览和选择 Pairing Number，再使用 Esc 关闭。
3. 确认 End 只加载下一批，不连续下载全部选项。
4. 分别模拟 Pairing Number 首批和后续批次加载失败，点击 Retry。
5. 在后续批次加载时关闭下拉。

预期：combobox/listbox/option 语义、选中状态和当前位置可感知；Retry 只触发一次；关闭后请求被取消，重新打开可正常加载；不显示原始异常信息。

## PBS-3654A：大数据渲染性能

1. 使用包含大量 Pairing Number 的测试周期持续向下滚动。
2. 在浏览器开发工具中观察下拉列表 DOM。

预期：已加载数据可持续增长，但页面只渲染当前可见 option 和少量缓冲行，不创建与全部数据等量的 option DOM；滚动和选择无明显卡顿。

## PBS-3655：兼容旧单值请求

1. 直接调用 preview API，仅发送旧 `pairingNumber` 或旧 `airport`。
2. 再发送新数组字段与旧字段同时存在的请求。

预期：旧 Pairing Number 保持模糊匹配，旧 Airport 保持单值精确匹配；非空新数组优先，不与旧字段合并。

## PBS-3656：筛选栏尺寸与下拉选项对齐

1. 清空所有筛选条件，观察 Pairing Number、Date Range、Airport、Time From、Time To 和 Clear。
2. 确认六个控件单行高度、底部位置和外框圆角一致，五个字段标题字号、字重、行高及标题间距一致。
3. 分别打开 Pairing Number 和 Airport 下拉，观察未选中选项。
4. 选择一个选项，观察选中标记的位置。
5. 连续选择多个值直到标签换行。

预期：空值和单行状态下六个控件高度均为 `40px`、可见外框圆角均为 `4px`；标题样式统一为 `11px / 800 / 14px`，标题与控件间距为 `6px`；选项文字从左侧 `12px` 内容边距开始，未选中项左侧没有空白图标槽；已选项显示浅蓝底、蓝色文字和位于右侧的蓝色勾选标记；多选标签换行后控件可以自然增高且不裁剪内容，所有字段标题仍顶部对齐，Date Range、Time 和 Clear 仍与多选控件首行顶部对齐。

## PBS-3657：跨午夜时间与 Date Range 布局

1. 选择完整 Date Range，分别在 `1920×1080` 和项目支持的较窄视口观察筛选栏。
2. 输入普通时间窗口 `08:00 → 15:00`，确认结果请求成功。
3. 输入跨午夜窗口 `15:53 → 08:59`，确认结果请求成功。
4. 分别仅填写 Time From、仅填写 Time To，再输入相同开始和结束时间。
5. 模拟结果接口返回 400。

预期：Date Range 的两个日期、`TO`、清除和日历图标始终位于同一行且不裁剪；普通窗口按同日闭区间筛选；跨午夜窗口每天匹配 `15:53–24:00` 或 `00:00–08:59`；单边界与相等时间保持既有语义；页面使用持久化错误状态展示 `Unable to refresh pairing results. Adjust the filters or try again.`，不显示 Axios message、响应正文或内部异常。
