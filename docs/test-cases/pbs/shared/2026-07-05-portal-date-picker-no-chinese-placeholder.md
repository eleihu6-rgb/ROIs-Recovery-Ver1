# PBS Portal 日期选择器英文占位回归测试

## 目标

验证 PBS Portal 员工端所有可见日期输入不再使用浏览器原生 `type="date"`，不会在中文系统或中文浏览器下显示 `年/月/日`，并且仍然支持点击日历选择日期。

## 前置条件

- 本地启动 `pbs-server` 与 `pbs-portal`。
- 使用可编辑当前 bid period 的测试员工账号登录 PBS Portal。
- 浏览器或操作系统语言可以切到中文，以复现历史问题。

## 测试步骤

1. 进入 `Days Off` 页面。
2. 在 `ADD DAYS OFF PROPERTIES` 中打开 `Prefer Off` 配置弹窗。
3. 检查 `Prefer Off date` 输入框。
4. 点击输入框右侧日历图标，选择任意日期，再点击 `ADD DATE`。
5. 切换到 `Date Range`，检查 `Prefer Off range from` / `Prefer Off range to`。
6. 进入 `Reserve` 页面，打开 `Short Call Type`，切到 `Specific Dates`，检查日期输入并通过日历选择日期。
7. 进入 `Pairing` 或 `Line` 中包含日期条件的属性，检查日期输入框表现。

## 预期结果

- 所有日期输入空值占位都显示 `YYYY-MM-DD`。
- 不出现 `年/月/日`。
- 点击日历图标会出现英文日历，星期显示 `SUN MON TUE WED THU FRI SAT`。
- 点击日期后输入框写入 `YYYY-MM-DD`。
- 手动输入 `YYYY-MM-DD` 仍可正常添加或保存 bid。
- `type="time"` 输入不受影响，仍按原有时间输入行为工作。

## 回归范围

- `Days Off`：`Prefer Off` 单日期与日期范围。
- `Reserve`：`Reserve Day On`、`Reserve Prefer Off`、`Short Call Type` 的日期 scope。
- `Pairing`：所有通过 `BidDateInput` 渲染的日期条件。
- `Line`：复用 `ReserveDateScopeControl` 的日期条件。
