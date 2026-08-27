# PBS BIDDING CALENDAR 折叠与 Dashboard 固定布局人工测试用例

## 范围

验证 PBS Portal 共享工作台页面的 `BIDDING CALENDAR` 可以收起和展开，同时确认 Dashboard 不参与折叠，始终保持左侧用户信息、中间日历、右侧 `MESSAGE CENTER` 的固定三栏布局。

## 前置条件

- 使用支持 PBS Portal 的测试账号登录。
- 当前 bid period 可正常加载。
- 浏览器允许使用 `localStorage`。
- 至少访问 `Dashboard`、`Pairing`、`Tier`、`Days Off`。

## 用例 1：Dashboard 保持固定三栏布局

1. 清空当前站点的 localStorage，或使用新的浏览器 profile。
2. 打开 PBS Portal Dashboard。
3. 观察页面三栏布局和日历 header。

预期结果：

- 左侧显示用户信息卡片。
- 中间显示 `BIDDING CALENDAR`，日历 header 中显示当前 bid period 状态。
- 右侧显示 `MESSAGE CENTER`，保持固定窄列比例，不应被拉伸成大面积空白。
- 页面上不出现 `Collapse bidding calendar` 按钮。
- 页面上不出现 `Expand bidding calendar` 按钮。
- 中间日历卡片底部圆角和月历最后一行不应被页面壳层裁切；如果内容高度超过当前视口，允许页面自然纵向滚动。

## 用例 1.1：Dashboard 忽略共享工作台折叠偏好

1. 先进入 Pairing 或 Tier 页面，收起 `BIDDING CALENDAR`。
2. 确认共享工作台页面左边缘显示 `Expand bidding calendar`。
3. 切换到 Dashboard。

预期结果：

- Dashboard 中间日历仍完整显示。
- Dashboard 不显示左边缘展开按钮。
- Dashboard 右侧 `MESSAGE CENTER` 仍为固定窄列比例。
- 回到 Pairing 或 Tier 页面时，共享工作台折叠偏好仍按原逻辑保留。

## 用例 1.2：Dashboard loading 态不顶到导航下方

1. 使用慢网速或测试环境模拟当前 bid period 接口加载较慢。
2. 打开 PBS Portal Dashboard。
3. 在 `Loading bidding calendar...` 可见时观察页面顶部和滚动条。

预期结果：

- `BIDDING CALENDAR` loading 面板完整显示在固定顶部导航下方，不应被导航遮挡。
- 页面不应出现可把 Dashboard 内容滚到导航下方的额外纵向滚动空间。
- loading 骨架呈现日历结构，不应显示两块大面积灰色占位。

## 用例 1.3：Dashboard 月历底部不被裁切

1. 打开 PBS Portal Dashboard。
2. 将浏览器调整到接近 `1920x1080` 或当前常用工作分辨率。
3. 观察中间 `BIDDING CALENDAR` 卡片底部和月历最后一行。

预期结果：

- 中间日历卡片的底部圆角完整可见或可通过页面滚动自然到达。
- 月历最后一行日期和事件不应被卡片内部 `overflow` 裁掉。
- 右侧 `MESSAGE CENTER` 不应挤压或覆盖中间日历。

## 用例 2：共享工作台收起日历后右侧业务区扩展

1. 打开 Pairing、Tier 或 Days Off 页面。
2. 在默认展开状态下点击 `Collapse bidding calendar` 按钮。
3. 观察页面布局。

预期结果：

- 左侧 `BIDDING CALENDAR` 平滑收起，不保留布局宽度。
- 右侧业务区扩展，占用原日历区域。
- 页面左边缘出现不占布局宽度的 `Expand bidding calendar` 浮动按钮。
- `Expand bidding calendar` 按钮不得遮挡右侧业务面板标题、表格 header 或第一行内容。
- 隐藏日历中的日期格、Tier 按钮和 Pairing / Days Off 操作入口不可点击。
- 收起过程按当前配置约 0.4 秒连续过渡，不应瞬间跳到收起完成；系统启用减少动态效果时可直接切换。

## 用例 3：共享工作台刷新后保持收起偏好

1. 在 Pairing、Tier 或 Days Off 页面保持日历收起状态。
2. 刷新浏览器页面。
3. 等待页面加载完成。

预期结果：

- 日历仍保持收起。
- 左边缘仍显示 `Expand bidding calendar` 浮动按钮。
- 右侧业务区仍为扩展布局。
- 页面业务数据正常加载。

## 用例 4：共享工作台展开日历后恢复原布局

1. 在收起状态下点击 `Expand bidding calendar` 按钮。
2. 观察页面布局和日历内容。

预期结果：

- 左侧 `BIDDING CALENDAR` 恢复显示。
- 日历 header、Tier matrix、日期格和 bid 事件正常显示。
- 当前 bid period 状态仍正常。
- 日历 header 中标题、当前 period 状态和收起按钮应在同一行视觉对齐，不应出现上下参差。
- 展开过程按当前配置约 0.4 秒连续过渡，不应突然跳回完整宽度。

## 用例 5：共享工作台跨页面切换保持折叠状态

1. 在 Pairing 页面收起 `BIDDING CALENDAR`。
2. 在 PBS Portal 中依次切换到 `Tier`、`Days Off`。
3. 回到 Pairing。

预期结果：

- 共享工作台页面中日历保持收起。
- 左边缘的展开按钮始终可用。
- 右侧页面内容不出现异常空白列或横向溢出。
- 不因页面切换重新展开或重置折叠偏好。

## 用例 6：active Tier 在收起 / 展开后保持

1. 在共享工作台页面展开日历。
2. 选择一个非默认 Tier，例如 `TIER-03`。
3. 点击收起按钮。
4. 再点击左边缘展开按钮。

预期结果：

- 展开后 `TIER-03` 仍保持选中。
- 日历数据没有被清空或切到默认 Tier。

## 用例 7：Days Off 页面编辑入口不被破坏

1. 打开 `Days Off` 页面并展开日历。
2. 点击一个可编辑日期，确认 Days Off 操作弹层可打开。
3. 取消操作。
4. 收起日历，再展开日历。
5. 再次点击同一日期。

预期结果：

- 展开后 Days Off 日期操作入口仍可正常打开。
- 收起动作不会触发 Days Off 保存或 mutation。
- 取消 / 保存按钮状态符合原有规则。

## 用例 8：Pairing 页面日历加 bid 入口不被破坏

1. 打开 `Pairing` 页面并展开日历。
2. 点击可添加 pairing bid 的日期。
3. 确认 Pairing bid 弹层可打开。
4. 取消操作。
5. 收起日历，再展开日历。
6. 再次点击同一日期。

预期结果：

- 展开后 Pairing bid 弹层仍可正常打开。
- 收起动作不会触发 Pairing bid 保存。
- 已有 Pairing bid 事件点击详情仍正常。

## 回归范围

- Dashboard 当前 period header。
- Dashboard 宽屏三栏比例，重点检查右侧 `MESSAGE CENTER` 不被拉宽。
- Dashboard loading 态不产生额外纵向滚动。
- Dashboard 中间日历底部不被裁切。
- Pairing 日历加 bid 和 bid detail。
- Days Off 日历编辑。
- Tier 选中状态跨共享工作台页面保持。
- 共享工作台缩放布局，重点检查 1920x1080、1366x768 和 1080 以下窗口。
