# PBS Days Off Prefer Off 入口拆分 QA

日期：2026-07-08
范围：PBS Portal `Days Off` 页面 Add Properties、Configure Days Off Bid 弹窗、configured favorite。

> 历史废弃：本用例描述的是 2026-07-08 的三入口过渡方案。
> 当前 `Prefer Off` 以单一入口展示，并在弹窗内提供 `Specific Dates`、`Date Range`、`Days of Week`、`Weekends` 和可选 `TIME WINDOW`。
> 当前行为以 `docs/test-cases/pbs/days-off/2026-07-10-prefer-off-unified-condition.md` 和 `docs/superpowers/specs/2026-07-15-pbs-prefer-off-remove-fulfilment-design.md` 为准。

> 更新：2026-07-08 可见性恢复后，旧 Days Off property 已重新显示。
> 本用例仍覆盖 `201 Prefer Off` 被拆成 `Dates / Days of Week / Date Range` 的 UI 行为；
> 当前完整 catalog 可见性以
> `docs/test-cases/pbs/condition-properties/2026-07-08-bid-property-visibility-restore.md` 为准。

## 前置条件

- 已执行 migration：`sql/migration/2026-07-08-pbs-days-off-hide-consecutive-days-off.sql`
- `pbs-server` 已重启，或已清理 Redis key：`pbs:f8_pbs:days-off:property-catalog:v1`
- 使用可登录 PBS Portal 的 lineholder 用户。

## 测试步骤

1. 登录 PBS Portal。
2. 打开 `Days Off` 页面。
3. 在 `ADD DAYS OFF PROPERTIES` 中切换到 `ALL PROPERTIES`。
4. 确认 `201 Prefer Off` 以以下三个 Days Off 新增入口显示：
   - `Dates`
   - `Days of Week`
   - `Date Range`
5. 搜索以下旧入口，确认它们已按最新可见性恢复重新显示：
   - `Min Consecutive Days Off`
   - `Max Consecutive Days On`
   - `Min Consecutive Days Off In Window`
   - `Days Off / Days On Pattern`
   - `Employee Schedule Preference`
   - `Day of Week Off`
6. 分别点击 `Add Dates`、`Add Days of Week`、`Add Date Range`。
7. 在弹窗中确认只有 `TIERS` 和对应的日期 / 星期 / 日期范围输入。
8. 确认弹窗不显示：
   - `PREFER OFF TYPE`
   - `Dates` / `Days of Week` / `Date Range` 二次切换按钮
   - `Weekends`
   - `TIME WINDOW`
   - `All or Nothing`
   - `Minimum N`
9. 添加一条 `Dates` bid，选择至少一个 Tier，保存。
10. 将一条 configured favorite 保存后，切换到 `FAVORITED PROPERTIES`，确认名称和内容可复用。

## 预期结果

- `ALL PROPERTIES` 中不再直接显示 `Prefer Off`，而显示 `Dates`、`Days of Week`、`Date Range` 三个清晰入口。
- 三个入口保存到后端时仍使用 `propertyCode=201`。
- 此前隐藏的 Days Off 旧条件已恢复出现在新增列表。
- 配置弹窗由外层入口锁定类型，不再出现内部 mode 切换。
- `Weekends` 不再作为单独模式出现；用户如需周末，可在 `Days of Week` 中选择 `Saturday` / `Sunday`。
- `TIME WINDOW`、`All or Nothing`、`Minimum N` 不再显示。
- 已存在的 201 草稿或 favorite 按内容显示为 `Dates` / `Days of Week` / `Date Range`。

## 异常 / 边界场景

- 旧数据如果包含 `Weekends`，编辑时应打开为 `Days of Week`，并选中 `Saturday` / `Sunday`。
- 旧数据如果包含 `Window HH:MM-HH:MM`、`All or Nothing` 或 `Minimum N`，页面不崩溃；重新保存时 UI 不再提交这些 modifier。
- 搜索已恢复显示的旧 property 名称时应返回可新增入口。

## 回归范围

- `Days Off` 当前草稿新增、编辑、删除仍正常。
- configured favorite 保存与直接新增仍正常。
- Days Off algorithm export 仍能从 201 bid 展开为具体日期。
