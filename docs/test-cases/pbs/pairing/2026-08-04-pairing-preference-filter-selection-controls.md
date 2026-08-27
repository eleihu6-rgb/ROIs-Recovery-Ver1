# Pairing Preference 筛选栏参考样式回归用例

## 目标

确认 `Configure Pairing Preference` 的筛选栏与参考项目字段和控件类型一致，仅保留 `Dates`、`Check-in`、`Length`、`Check-out`，并在桌面端优先单行展示。

## 前置条件

- 当前用户存在开放的 PBS 投标周期。
- 当前用户的 Base / Rank 下存在可见 FLY Pairing。
- 打开 `Bid → Pairing → Pairing Preference` 配置弹窗。

## 用例一：1440px 桌面布局

1. 将浏览器视口设为 `1440×900`。
2. 点击 `Filters`。

预期：

- `Dates`、`Check-in`、`Length`、`Check-out` 和两个操作按钮在同一行。
- Date Range、时间、Length 和按钮均缩小到约 25px 高度，文字约为 9px；时间与 Length 的 From / To 等高、等宽。
- `Dates`、`Check-in`、`Length`、`Check-out` 四组平均分配可用宽度，按钮组按内容宽度靠右。
- 开始/结束日期保持单行，时间值、`days` 后缀和两个按钮文案不换行、不裁切。
- 不显示 `Pairing Credit`，也不请求 `preference-filter-bounds`。
- 筛选区域无水平溢出、遮挡或裁切。

## 用例二：1024px 窄屏布局

1. 将浏览器视口设为 `1024×768`。
2. 打开同一筛选栏。

预期：

- 空间不足时使用两列三行：第一行 `Dates + Check-in`，第二行 `Length + Check-out`，第三行放右对齐按钮，不被压缩到文字或值重叠。
- `Clear filters`、`Apply filters` 保持可见、可操作并靠右排列。
- 筛选区域无水平滚动条。

## 用例三：日期范围

1. 点击标准 Date Range 控件。
2. 在同一张日历中依次选择开始日期和结束日期并应用。

预期：

- 页面只有一个标准 Date Range 入口，不出现原生浏览器日期输入框。
- 点击后只打开一张覆盖式日历，并显示 `Start date · TO · End date`。
- 日历仅允许选择当前投标周期内的日期；周期外日期不可选且不能提交。
- 选择完成后范围正确回显，开始日期不得晚于结束日期。
- Days Off、Reserve、Line 等未启用 compact 的共享日期入口保持原有默认尺寸。

## 用例四：时间与 Length

1. 将 Check-in 设为 `22:00 → 08:00`。
2. 将 Length 设为 `2 → 4 days`。
3. 点击 `Apply filters`。

预期：

- Check-in 使用原生时间控件并支持跨午夜。
- Length 使用原生数字输入，提交 `durationDaysMin=2`、`durationDaysMax=4`。
- 已选择的 Pairing 不会因筛选或翻页丢失。

## 用例五：Check-out 与清除

1. 将 Check-out 设为 `18:00 → 08:00` 并应用。
2. 再点击 `Clear filters`。

预期：

- 反向 Check-out 显示可访问的局部校验错误，不发送 Preview 请求。
- 清除后四组条件恢复空值，筛选数量恢复为零，Pairing 列表恢复完整可见池。
