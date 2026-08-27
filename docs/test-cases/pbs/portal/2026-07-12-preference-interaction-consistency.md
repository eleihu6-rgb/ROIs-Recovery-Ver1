# PBS Preference 交互一致性 QA 用例

## 前置条件

- 使用可编辑的 PBS bid period 登录 Portal。
- Days Off、Line、Pairing 均可看到 Prefer Off、Long Stretch、Commuter Pattern、Pairing Preference。

## 1. 共享日期弹层

1. 分别打开 Prefer Off、Long Stretch、Commuter Pattern、Pairing Preference 的日期控件。
2. 记录日历打开前后紧随日期区的下一分区位置（例如 Pairing 的 FULFILMENT）。

预期：日历覆盖在输入框附近，不被弹窗裁剪；下方分区不被日历预留空白推开。

## 2. 日期范围中间态

1. 在 Pairing Preference 选择一个 Pairing Number。
2. 打开 `LIMIT TO RUN DATE`，切换 `Date Range`。
3. 仅选择起始日期。

预期：显示中性 `Select a start date.` / `Select an end date.`；不出现红色 `Select a valid date range.`、不出现 `0 matching runs`；Add Bid 保持禁用。

## 2.1 初始与清空状态

1. 新建 Pairing Preference，但不选择 Pairing Number。
2. 选择任一 Pairing Number 后再将其移除。

预期：两种状态均只保留核心配置和 Pairing Number 输入；不显示 `LIMIT TO RUN DATE`、Fulfilment、`Select at least one pairing number.` 红字或残留的数量值；Add Bid 保持禁用。

## 3. Pairing 查询结果

1. 完成一个没有 matching run 的日期 / 范围。
2. 再选择存在 matching run 的日期 / 范围。

预期：仅在完整选择且查询完成后显示无匹配红字。匹配数为 0 时不显示 Fulfilment，且 Add Bid 保持禁用；恰好 1 个 matching run 时同样不显示 Fulfilment，系统保存为 `minimumRequired: 1`、`maximumRequired: 1`；匹配数不少于 2 时显示真实 run 数量与数量输入。数量字段在用户输入或尝试提交前不应因仅选择 Pairing Number 而提前报错。

## 4. 新增默认值与 Tier Required

1. 分别新建 `Pairing Preference`（102）、`Prefer Off`（201）、`Long Stretch Off / Compressed Flying`（204）和 `Commuter Pattern`（408）。
2. 检查所有 Tier；再选择任意一个 Tier。
3. 新建 `Airport Preference`（168），不做任何选择；随后确认 `Preference` 与 `Airport Event` 的初始状态。
4. 打开一个已有的 Airport Preference，检查其已保存的 Tier、Action、Event、location 和日期限制。

预期：

- 102、201、204、408 新增时所有 Tier 均未选中，显示 `REQUIRED`，`ADD BID` / `SAVE FAVORITE` 禁用；选择任意 Tier 后才允许继续。
- 102 新增时 `Award` 仍为默认选择；Pairing Number、日期与 fulfilment 不产生新默认值。
- 168 新增时所有 Tier 均未选中，但 `Award` 默认选中、`Landing` 默认选中；`LIMIT TO EVENT DATE` 关闭且不显示日期选择器。
- 编辑既有 bid 或直接新增已保存 favorite 时，必须保留保存时的 Tier 和全部业务字段，不用上述新增默认值覆盖。

## 5. 数字输入

1. 检查 Prefer Off、Long Stretch、Commuter、Pairing min/max。
2. 通过上下箭头到达边界，手动输入超范围值后移开焦点。

预期：Prefer Off 不显示 fulfilment / flexible quantity / min/max；Long Stretch、Commuter、Pairing 的数字输入都有一致的右侧上下按钮；到 min/max 时对应按钮不可用；超范围值在失焦时回到合法边界；Pairing 空值显示 `--`。

## 回归范围

- Prefer Off 的 Specific Dates / Date Range / Days of Week / Weekends 仍能保存。
- Long Stretch 关闭日期限制时仍提交整月范围。
- Commuter 关闭日期限制时不写旧 `dateRange`。
- Pairing 关闭日期限制时提交 `dateScope: null`。
