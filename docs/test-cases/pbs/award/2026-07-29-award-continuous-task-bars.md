# PBS Award 同任务连续时间条人工测试

## 目标

验证 Award 月历将同一个跨日 Pairing 和连续地面任务显示为按真实起止时刻定位的连续色带，Roster Details 使用相同任务分组，并支持 Calendar、Roster Details、Selected Duty 三者联动，同时保持 Credit 和 Summary 的原始业务口径。

## 前置条件

- pbs-server 与 pbs-portal 已部署本次改动。
- 使用包含已发布 Award 数据的 Crew。
- 数据至少包含以下一种场景：
  - 同一个 `pairing_id` 跨越两个或更多日期；
  - 连续多天 VAC；
  - 连续多天 DO。
- 页面时间口径显示为 Crew Base Local Time。

## 用例 1：同一个跨日 Pairing 连续显示

1. 打开 Award 页面。
2. 找到一个同一 `pairing_id` 从第 10 日 12:00 延续到第 12 日 13:00 的 Pairing。
3. 查看月历和 Roster Details。

预期：

- 月历在同一周内只显示一条蓝色 Pairing 色带。
- 色带从第 10 日日期格约 50% 位置开始，完整跨过第 11 日，在第 12 日约 54% 位置结束。
- 色带中间没有日期格级别的断口。
- Roster Details 显示一个 Pairing 任务行，Selected Duty 仍展示全部航段明细。

## 用例 2：不同 Pairing 不连接

1. 准备两个时间首尾相接但 `pairing_id` 不同的 Pairing。
2. 查看月历。

预期：

- 两个 Pairing 分别显示为两条蓝色条。
- 即使前一条结束时间等于后一条开始时间，也不会连接。
- Pairing Number / Label 相同不能导致错误连接。

## 用例 3：连续 VAC 合并色带

1. 使用包含 Jun 22–26 连续 VAC 的 Crew。
2. 查看月历。
3. 查看 Roster Details 和 Credit。
4. 点击月历 VAC 色带。

预期：

- 月历显示一条从 Jun 22 开始、延续至 Jun 27 00:00 的黄色 VAC 色带。
- 月历不再为五天分别绘制五个带间隔的 VAC 小块。
- Roster Details 将 Jun 22、23、24、25、26 合并为一行。
- 表头保留原始 duties 数量，并同时显示合并后的 rows 数量。
- 合并行和 Selected Duty 显示完整区间 `Jun 22 - Jun 27`，Credit 为五天累计值。
- 点击月历色带后，对应 Roster 行自动高亮并滚动可见，Selected Duty 显示 VAC 完整任务。
- Summary Credit 与修改前一致。

## 用例 4：连续 DO 合并色带

1. 使用包含连续 DO 的 Crew。
2. 查看月历与 Roster Details。

预期：

- 时间连续的 DO 显示为一条绿色色带；发布数据采用前一天 `00:00` 结束、下一天 `00:01` 开始时，也视为连续。
- Roster Details 将同一连续 DO 合并为一行，Credit 显示 `--`。
- Days Off Summary 不因 Calendar 合并减少。

## 用例 5：不同类型不连接

1. 准备 VAC 后紧接 ILL，或 ILL 后紧接 DO 的数据。
2. 查看月历。

预期：

- 不同任务类型分别显示各自色带。
- 不因颜色相近、日期相邻或时间首尾相接而连接。

## 用例 6：同类型存在空档时不连接

1. 准备同一天两段 VAC，例如 00:00–04:00 和 12:00–16:00。
2. 查看月历。

预期：

- 月历显示两段 VAC。
- 04:00–12:00 的真实空档保持可见。
- 不显示为一条 00:00–16:00 的虚假连续任务。
- 只有不超过 1 分钟的发布边界差可以视为连续，更大的真实空档不能被吞掉。

## 用例 7：跨周延续

1. 准备一个从周六延续至下周一的任务。
2. 查看两行周历的边界。

预期：

- 第一周段延伸到周末右边界，延续端无伪结束留白和圆角。
- 下一周段从周首左边界开始，延续端无伪开始留白和圆角。
- 真实开始端和真实结束端仍保留 inset 与圆角。
- Hover Title / 辅助说明描述完整任务区间。
- 点击任一跨周分段，都选中同一个 Roster 行和完整 Selected Duty。

## 用例 8：Roster 行反向联动 Calendar

1. 在 Roster Details 点击一个 VAC、DO 或 Pairing 合并行。
2. 查看 Calendar 和 Selected Duty。

预期：

- Selected Duty 立即显示对应完整任务。
- Calendar 中属于该任务的所有同周或跨周分段显示选中边框。
- 可以通过键盘 Enter/Space 选择 Roster 行，通过 Tab + Enter/Space 选择 Calendar 色带。

## 用例 9：缺失或异常关系

1. 使用缺少明确开始或结束时间的地面任务。
2. 查看 Award 页面。

预期：

- 页面不崩溃。
- 缺失 `sourceItemIds` 时按原有 Event / Item ID 安全回退。
- 未知或重复 Item ID 不会造成 Roster 行重复、丢失或页面崩溃。
- 不使用 Credit Minutes 推断任务持续时间。
- 页面不新增 `null`、`undefined` 或异常堆栈文字。

## 视口回归

分别使用：

- `1920×1080`
- `1440×900`
- `1280×720`

预期：

- 连续色带不越出 Award Calendar。
- 月历不覆盖 Roster Details。
- Selected Duty 与 Reason Report 不重叠。
- 页面无新增横向滚动条或底部裁切。

## 回归范围

- Award Base Local Time。
- Calendar Lane / Conflict。
- Roster Details 选择。
- Selected Duty。
- Credit、Block、Days Off、Duties Summary。
- Reason Report。
- Dashboard / Bid 共享日历保持不变。
