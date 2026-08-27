# Bid Feedback 人工测试用例

## 前置条件

- Crew 用户存在当前可用 Bid Period。
- Current Bid 或 Standing Bid 至少包含一个 Pairing / Days Off 属性。

## 测试步骤

1. 登录 Crew Portal，进入 `Bid`。
2. 确认工具栏只显示一个紧凑的 `Feedback` 文字按钮且不带图标；存在冲突时，右上角红色角标显示冲突数量，不再显示独立警告按钮。
3. 点击 `Bid Feedback`，确认白色弹窗打开，且不显示全局说明条和 `BID CONFLICTS` 黄色区域。
4. 检查 Award、Avoid、Days Off 标签以及 Bids / Calendar 切换。
5. 检查 Bids 视图为左侧紧凑列表、右侧选中项详情；首次打开、切换标签和翻页后默认选中第一条。
6. 点击左侧不同 Pairing / Days Off 行，确认右侧详情同步更新；Award Pairing 的 Eligibility 统一显示 unavailable。
7. 检查 Pairing 的报到、释放时间明确使用 Crew Base Local Time。
8. 创建同一 Pairing 同时匹配 Award 与 Avoid 的 Bid，确认工具栏红色角标计数更新。
9. 创建 22:00–06:00 的跨午夜 Days Off 时间窗并导出算法包，确认 CSV 的结束 UTC 时间落在下一本地日。
10. 让 Crew 缺少有效基地时区并导出，确认发布失败且没有静默丢失该 Crew 的 Days Off 行。
11. 准备 Rank 不匹配、Base 不匹配、Pre-assignment 重叠和原 Team Rule 会阻止的 Award Pairing，确认四类 Pairing 仍保留在 Award 列表。
12. 创建 Pairing Number 的具体 Occurrence Bid，确认只匹配同一个 `pairingId + originDate`，相同 Pairing 的其他日期不进入 Feedback。
13. 在 `roster_flight` 分别准备 `PA`、`IMP`、`MA`、`CR` 来源，确认 Bid Feedback 不执行 Pre-assignment eligibility 判断，四类 Pairing 不因该判断被过滤。
14. 检查 Award 列表：所有 Award 行状态列为空，不显示对号、叉号或浅红失败背景；选中任意行后仍以浅蓝选中底为主。
15. 确认 `/api/bid-feedback/current` 响应不包含 `eligibleScore` 或 `exportDirection`，但仍保留 `rawScore` 和 `rawDirection`。
16. 执行 Scenario Publish Roster，确认不再读取 `TEAM_RULES_RESOLUTION.json`，发布行不再写入 `scenario_publish_snapshot_id`。
17. 对当前 Crew 配置原本会阻止 Pairing 的 `not_do` / `only_do` Team Rule，确认 Bid Feedback 仍保留对应 Award Pairing，Eligibility 显示 `N/A` / `Eligibility unavailable`。
18. 打开 Feedback，确认 Award Pairing 的 `checked=[]`、`unavailable=[rule_engine]`、`reasons=[]`。
19. 确认旧 eligible/ineligible cache 不命中新版 Feedback 响应。
20. 分别切换 Award 与 Avoid，确认 `Pairing / Base / Start / End / Days / Credit` 表头与每行对应数据全部居中对齐。
21. 确认列表和右侧详情中的 Credit 均显示为 `HH:MMh`（例如 `5:10h`）；分别在桌面宽度和窄屏上下布局下检查，不应出现内容截断或横向滚动条。
22. 确认 Pairing 表头与未选中普通数据行使用同一白色背景，仅以浅色下边框分隔；表头高度和字重不应明显压过数据行，选中行仍保留淡紫底色。

## 预期结果

- 弹窗反馈来自当前有效结构化 Bid，不读取 CSV。
- Award Pairing 统一声明 `Eligibility unavailable` / `N/A`，不误称已经完成 Rank、Base、Pre-assignment 或 Rule Engine eligibility 校验。
- Pairing Bid 在 Tier 合并前只按 Period、有效 FLY 和 Bid 条件匹配候选，不因 Rank/Base/Pre-assignment/Team Rule eligibility 被静默过滤。
- `IMP/MA/CR/PA` 均不触发 Bid Feedback eligibility 失败；第一阶段只展示 unavailable 状态。
- Scenario Publish Roster 和 Bid Feedback 不再依赖 Team Rule Snapshot 运行链。
- Award 与 Avoid 使用同一列布局；所有表头和数据内容居中对齐，Credit 统一带 `h` 单位。
- Pairing 表头和普通数据行在视觉上是一张连续表格，不出现灰色大表头与白色数据区割裂成两层的效果。
- 桌面端列表和详情并排；较窄窗口改为上下排列，不产生横向滚动。
- Portal 显示基地本地时间；算法 Days Off CSV 保持 UTC。
- 错误使用统一页面/消息语义，不暴露内部异常堆栈。
