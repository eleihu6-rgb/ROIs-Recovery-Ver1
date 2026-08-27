# Pairing Preference 可筛选 Pairing Picker QA

## 目标

验证 `Pairing Preference` 不再使用单一 `PAIRING NUMBER` 搜索输入框，而是在同一个配置弹窗中展示当前用户、base、rank 和 bid period 可用的 Pairing 表格，并支持搜索、组合筛选、分页多选、Favorite 与 Existing Bid 回显。

本条件严格对齐标准答案：保存语义只有选中的稳定 Pairing IDs。搜索、Filters 和分页只用于缩小候选列表，不进入 bid payload；员工端不显示 `LIMIT TO RUN DATE`、`FULFILMENT`、`Minimum required` 或 `Maximum required`。

## 前置条件

- 使用有当前 bid period 的 Lineholder 用户登录 PBS Portal。
- 当前用户有明确 base 和 rank。
- 当前 bid period 至少存在两页可用 Pairing，且包含不同日期、时长、credit、route。

## PP-01 初始状态

1. 进入 `Pairing` 页面。
2. 在 Available Properties 中打开 `Pairing Preference`。

预期：

- 弹窗标题为 `Configure Pairing Preference`。
- 默认 `Award`，Tier 默认不选。
- 显示 `PAIRINGS · REQUIRED`、搜索框、`Filters`、Pairing 表格及分页。
- 表格列为 `Pairing / Base / Route / Dates / Days / Credit / Rank`。
- 不再显示旧的 `PAIRING NUMBER` 单输入框。
- 不显示 `LIMIT TO RUN DATE`、`FULFILMENT`、`Minimum required`、`Maximum required`。
- 未选 Tier 或 Pairing 时，`SAVE FAVORITE` 与 `ADD BID` 禁用。

## PP-01A 标准答案 payload

1. 选择 Tier、Award/Avoid，并从表格选择多个 Pairing。
2. 使用搜索或 Filters 改变当前可见列表。
3. 点击 `ADD BID`。

预期：

- payload 仅包含 `type=pairing-preference`、`pairingIds`、可选 `pairingLabels`。
- payload 不包含 `dateScope`、`minimumRequired`、`maximumRequired`。
- 已选项在搜索、筛选和翻页后保持，筛选条件本身不保存。
- Existing/Favorite 摘要只显示 Pairing labels，不追加日期或数量描述。

## PP-01B 拒绝旧数据形态

- property `102` 提交 `pairing-id-list` 或 `pairing-occurrence-list` 时，API 返回 400。
- `pairing-preference` payload 额外携带 `dateScope`、`minimumRequired` 或 `maximumRequired` 时，API 返回 400。
- 旧 TXT `Pairing Number ...` / `Limited to N` 不自动转换，导入结果明确提示必须从 filterable picker 重新选择稳定 Pairing IDs。

## PP-02 快速搜索

1. 在搜索框分别输入 Pairing number、base、rank、机场和 route（例如 `YVR-YYZ`）。
2. 输入两个以上空格分隔 token。

预期：

- 输入停止约 300ms 后请求刷新，页面不需要点击额外 Search 按钮。
- 每个 token 都必须命中，单个 token 可匹配 Pairing label、base、rank 或机场。
- route token 同时约束两个机场。
- 搜索结果始终只包含当前用户 base、rank 和 bid period 可见数据。

## PP-03 组合筛选

1. 打开 `Filters`。
2. 分别配置 Pairing start date、Check-in time、Check-out time、Pairing days、Pairing credit 的 From/To。
3. 点击 `Apply filters`。

预期：

- 所有已填写条件按 AND 组合，并在服务端分页前生效。
- credit 允许小数小时，传给后端时按分钟过滤。
- 非法日期/时间、Min 大于 Max、负数 credit 不发送请求，并显示明确错误。
- `Clear filters` 清空筛选但不清除已选择 Pairing。

## PP-04 当前页全选和跨页选择

1. 选择第一页一条 Pairing。
2. 点击表头 checkbox 选择当前页。
3. 翻到下一页，再选择一条 Pairing。
4. 返回上一页。

预期：

- 表头 checkbox 只选择/取消当前页。
- 已选择 Pairing 使用稳定 Pairing ID 保存，跨页、搜索和筛选后不丢失。
- 顶部 selected count 和 selected chips 正确更新。
- 返回上一页时原选择仍为 checked。
- `Clear selection` 才会清空全部选择。

## PP-05 Filters 只影响候选视图

1. 选择一条 Pairing。
2. 打开 `Filters`，设置 Dates / Days / Credit / Rank 等筛选。
3. 应用筛选并继续选择其他 Pairing。

预期：

- 筛选只改变表格候选项，不清除之前选择。
- 保存 payload 只包含所有已选 Pairing IDs/labels。
- Filters 中的日期、天数、credit、rank 等字段不进入 Pairing Preference payload。
- 弹窗始终不出现 run-date 与 fulfilment 控件。

## PP-06 保存、Favorite 与编辑回显

1. 选择 Tier、Award/Avoid、多条 Pairing，并添加 Bid。
2. 重开 Existing Bid。
3. 以同样配置保存 Favorite，并从 Favorite 重新加入。

预期：

- payload 使用 `pairing-preference`，仅包含 `pairingIds` 和可选 `pairingLabels`。
- Existing 和 Favorite 均完整回显 stable ID 对应的 label，不回显日期或数量修饰。
- 不执行额外 occurrence availability 请求；有效性只要求至少选择一个 stable Pairing ID。

## PP-07 加载、空态与失败态

预期：

- 初次加载显示 skeleton。
- 无结果显示 `No pairings match the current search and filters.`。
- 请求失败显示错误和可重试操作。
- 翻页或筛选刷新时不清除已选 Pairing。

## 自动化收据要求

- Portal focused Vitest：filter mapper、picker 跨页选择、Pairing page、Search Pairings page。
- Server focused node tests：route validation、all-pairings SQL filters、mapper、actor scope。
- Playwright：真实打开 `Pairing Preference`、筛选、跨页选择、保存 payload。
- `pbs-portal npm run lint -- --quiet`
- `pbs-portal npm run build`
- `pbs-server npm run build`
- 根目录 `npm run check:ui`，hard violations 必须为 0。
- `git diff --check`
