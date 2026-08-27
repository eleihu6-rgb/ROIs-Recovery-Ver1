# Credit Window Preference 参考项目对齐测试用例

## 前置条件

- Bid Period 处于可编辑状态。
- `dictionary` 中存在：
  - `parent_code = PBS_LINE_CREDIT_WINDOW_CONFIG`
  - `code = DELTA_HOURS`
  - `code_value = 5`
- 使用具有 Line Bid 权限的 Crew 登录 PBS Portal。

## PBS Portal

1. 进入 `Bid`，切换到 `ROSTER`。
2. 添加 `Credit Window Preference`。
3. 确认弹窗内容顺序为 `APPLY TO TIERS · REQUIRED` → `PREFERENCE` → 公司配置说明。
4. 确认默认选择 `More credit`，且使用与其他 Bid 条件一致的 segmented control 选中态。
5. 未选择 Tier 时，确认 `SAVE FAVORITE` 和 `ADD BID` 均不可用。
6. 确认页面没有 `Custom`、Minimum/Maximum credit 输入框。
7. 确认提示位于 `PREFERENCE` 区域内，没有独立的重边框卡片，并显示：
   - `Aims for up to 5h above...`
   - `The ±5h credit-window adjustment is company-defined.`
8. 选择 `Less credit`，确认 segmented control 选中态同步切换，提示改为
   `Aims for up to 5h below...`。
9. 选择至少一个 Tier，确认保存按钮启用并保存。
10. 确认 Existing Bid 显示 `Less credit`，不显示 JSON。
11. 编辑该条件改为 `More credit`，确认 Tier、方向和提示正确回显，保存后 Existing Bid
    显示 `More credit`。
12. 收藏并从 Favorite 添加，确认仍只保存方向；Standing Lineholder 同样验证。
13. 打开一个非 Credit Window 的 Line 条件，确认其 section 顺序、footer 和保存行为未改变。

## 服务端与配置异常

1. 缺少 `DELTA_HOURS` 时打开弹窗：
   - 显示配置不可用。
   - `ADD BID` 禁用。
2. 将 `DELTA_HOURS` 设置为非整数、`0` 或大于 `20`，验证结果同上。
3. 直接向保存 API 提交旧 `mode: high/low/custom` 或携带自定义上下限，确认请求被拒绝。

## TXT 批量导入

1. 导入包含 `Maximum Credit Window` 的 NPBS TXT：
   - 生成 429 Bid `{type:"credit-window-preference",direction:"more"}`。
2. 导入包含 `Minimum Credit Window` 的 NPBS TXT：
   - 生成 429 Bid `{type:"credit-window-preference",direction:"less"}`。
3. 在 Portal Existing Bid 中确认分别显示 `More credit`、`Less credit`。

## 算法导出

1. 导出含 More credit 的 Crew：
   - `Code_ID=401`
   - `Rule_ID=401`
   - `Rule_Type=MAX_CREDIT_WINDOW`
   - `Parameters_JSON={"deltaHours":5}`
2. 导出含 Less credit 的 Crew：
   - `Code_ID=402`
   - `Rule_ID=402`
   - `Rule_Type=MIN_CREDIT_WINDOW`
   - `Parameters_JSON={"deltaHours":5}`
3. 导出不含 429 的包，确认不依赖 `DELTA_HOURS`。
4. 导出含 429 但配置缺失或非法的包，确认导出明确失败，不生成错误参数。

## Migration 数据检查

1. `mode=high` 转为 `direction=more`。
2. `mode=low` 转为 `direction=less`。
3. `mode=custom` 只删除对应 429 group/favorite。
4. 同一 Bid 的其他条件、Tier 和 Bid 本身保留。
5. 受影响 Tier 的 `group_seq` 连续，`total_groups` 与实际 group 数一致。
