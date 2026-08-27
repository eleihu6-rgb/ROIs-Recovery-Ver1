# PBS Pairing 配置弹窗 Portal 风格与长列表回归测试

## 目的

验证 Pairing 配置弹窗恢复为 PBS Portal 员工端白色轻量弹窗风格，同时确认大量 `CONFIRMED RUNS` 不会把弹窗撑出浏览器视口。

## 前置条件

- PBS Portal 可正常访问。
- 测试账号可登录并进入 `Pairing` 页面。
- 当前 bid period 有 Pairing Number 可选数据。
- 至少准备一条包含较多 confirmed run dates 的 `Pairing Number` bid 或 criteria。

## 测试步骤

1. 登录 PBS Portal。
2. 进入顶部导航 `Pairing`。
3. 在 `ADD PAIRING PROPERTIES` 中打开 `Pairing Number`。
4. 观察弹窗外观。
5. 输入或选择多个 pairing number / run date，形成较多 `CONFIRMED RUNS`。
6. 确认 `CANCEL`、`SAVE FAVORITE`、`ADD BID` 或 `UPDATE BID` 是否仍可见。
7. 滚动弹窗内容区域，确认可以查看完整表单和 run 列表。
8. 删除一条 confirmed run，再保存。
9. 进入 `Search Pairings`，编辑已有 `Pairing Number` criteria，重复第 4-8 步。

## 预期结果

- 弹窗不显示蓝色 `AppDialog` 标题栏。
- 弹窗为 Portal 既有风格：灰色遮罩、白色圆角卡片、左上 `Configure Pairing Bid`、副标题为 property 名称。
- 右上角关闭按钮为轻量 `X` 图标。
- 大量 `CONFIRMED RUNS` 不会撑爆弹窗。
- 弹窗顶部不被导航栏遮挡。
- 底部操作按钮稳定可见。
- 保存、删除 run、切换 `Entire Month / Specific Date` 行为不变。

## 异常 / 边界场景

- 只有少量 run date 时，弹窗不应出现多余的大面积空白。
- 25 条以上 confirmed runs 时，内容区域可以滚动，底部按钮仍可操作。
- pending / saving 状态下关闭按钮和操作按钮应正确 disabled。
- `SAVE FAVORITE` 不应因为还原外壳而改变可用条件。

## 回归范围

- Pairing 主页面添加 property。
- Pairing 主页面编辑 existing property。
- Search Pairings criteria 编辑。
- `Pairing Number` 的 entire-month 和 specific-date 两种模式。
- 普通 Pairing property，例如 `Prefer Pairing Length`、`Layover at City`。
