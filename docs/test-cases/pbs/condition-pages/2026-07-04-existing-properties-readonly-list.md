# PBS 条件页 Existing Properties 只读列表回归测试

## 前置条件

- PBS Portal 可登录，当前 period 处于可编辑 OPEN 阶段。
- 测试用户在 `Days Off` 至少有两条同名 `Prefer Off` existing 条件，且 Bid 内容不同。
- 测试用户在 `Pairing` 和 `Line` 至少各有一条 existing 条件。

## 操作步骤

1. 打开 `Days Off` 页面，查看 `EXISTING DAYS OFF PROPERTIES`。
2. 确认同名 `Prefer Off` 以两条独立行展示，而不是合并成一条。
3. 检查每条 existing 行的 `BID` 文本是否完整换行显示，不出现横向截断。
4. 检查 existing 行右侧是否有独立 `ACTIONS` 列，编辑和删除图标在该列内。
5. 切换到 `Pairing` 页面，检查 existing 行的 `BID / TIERS / COUNT / ACTIONS` 是否对齐。
6. 切换到 `Line` 页面，检查 existing 行的 `BID / TIERS / ACTIONS` 是否对齐。

## 预期结果

- `Days Off` 的重复 `Prefer Off` 保持多行展示，每行代表一个独立 bid。
- Existing 行的 property 名称不再显示成输入框样式。
- Existing 行的 bid 内容是只读文本块，长内容完整展示并自动换行。
- `TIERS` 只表示当前已保存 bid 的适用 tier，不再与新增弹窗里的 tier 选择混淆。
- `ACTIONS` 列清晰承载编辑、预览、删除等操作，不挤占 property 或 bid 内容空间。

## 异常与边界场景

- 长日期列表：确认 `BID` 文本不被省略号截断。
- 同名不同 bid：确认同一个 property 名可以出现多行。
- 只读 period：确认 existing 行仍可读，但编辑/删除操作应按只读规则禁用。
- 小宽度窗口：确认右侧列表不出现明显横向滚动或按钮换行错位。

## 回归范围

- `Days Off` existing 条件列表。
- `Pairing` existing 条件列表及 count 列。
- `Line` existing 条件列表。
- `FAVORITED PROPERTIES / ALL PROPERTIES` 排序和新增入口不应受影响。
