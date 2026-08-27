# PBS Pairing Preference 可筛选选择器原型设计

## 1. 背景

当前 `Pairing Preference` 弹窗使用 Pairing Number 搜索框和候选建议列表，适合用户已经知道 pairing number 的场景，但不便于用户先按 Base、Route、Date、Days、Credit 或 Rank 缩小范围，再从候选 pairing 中选择。

参考项目将 Pairing Preference 设计为可搜索、可筛选、可多选的 pairing 表格。此次先制作开发期 HTML 原型，用来确认该交互是否适合 PBS Portal；不修改产品代码、API、数据库或算法导出。

## 2. 原型目标

- 保留 PBS Portal 已验收的 Pairing 条件弹窗骨架。
- 保留 `TIERS`、`Award / Avoid`、`Cancel / Save Favorite / Add Bid`。
- 将单一 Pairing Number 搜索框升级为可搜索、可筛选、可多选的 pairing picker。
- 用户不需要事先知道 pairing number，也能通过业务信息定位 pairing。
- 明确区分“候选列表筛选条件”和“最终保存的 bid 内容”。

## 3. 已确认的产品语义

- Search 和 Filters 只用于缩小当前候选列表。
- 筛选条件不保存到 Pairing Preference bid。
- Pairing picker 只贡献用户明确勾选的 stable pairing IDs 和对应可读 labels；Search、Filters、page 等 picker 状态不进入 bid。
- Pairing Preference 现有的 `dateScope`、`minimumRequired`、`maximumRequired` 继续按原行为保存；本原型不能删除或改写这些字段。
- 切换搜索、筛选或分页后，已经选择的 pairing 继续保留。
- prototype 使用 mock pairing 数据，不调用真实 API。

## 4. 推荐布局

原型使用宽版 `Configure Pairing Preference` 弹窗，信息顺序保持：

1. Dialog title
2. `TIERS · REQUIRED`
3. `PREFERENCE`：`Award / Avoid`
4. `PAIRINGS · REQUIRED`
5. Search / Filters toolbar
6. Pairing 多选表格
7. Pagination
8. 现有 `LIMIT TO RUN DATE` 与日期范围
9. 根据 matching runs 展示的现有 `FULFILMENT`
10. Footer

弹窗不改成参考项目的独立页面，也不跳转到 Search Pairings 页面。宽版弹窗既能容纳数据表格，又能保持用户正在配置一个 bid condition 的上下文。

## 5. Pairing picker

### 5.1 搜索

顶部提供一个统一搜索框：

`Search pairing, base, route, or rank...`

原型搜索以下字段：

- Pairing number
- Base
- Route
- Rank

搜索采用即时本地过滤，用来模拟正式实现中的 debounced server-side search。

### 5.2 Filters

点击 `Filters` 展开紧凑 filter panel，包含：

- Pairing start date：From / To
- Check-in time：From / To
- Check-out time：From / To
- Pairing days：Min / Max
- Pairing credit：Min / Max hours
- `Clear filters`

各筛选维度之间使用 AND；同一维度的 From / To 或 Min / Max 使用闭区间，任一端可单独填写。规则如下：

- Pairing start date 比较 pairing origin/start date，端点 inclusive。
- Check-in / Check-out 比较本地时间，端点 inclusive；原型不接受 `From > To`，不模拟跨午夜窗口。
- Pairing days 使用正整数，`Min <= Max`。
- Pairing credit 使用十进制小时，`Min <= Max`。
- 任一范围非法时显示该范围错误，并禁用 `Apply filters`。
- `Filters` badge 按激活的逻辑维度计数；例如同时填写 Min/Max days 仍计为一个 active filter。

### 5.3 表格

表格列为：

- Checkbox
- Pairing
- Base
- Route
- Dates
- Days
- Credit
- Rank

表头显示：

- `N selected`
- `M of T pairings`

表头 checkbox 只选择或取消选择当前筛选结果中的当前可见页，不代表选择所有服务器查询结果。

- 当前页没有选中项：unchecked。
- 当前页部分选中：indeterminate。
- 当前页全部选中：checked。
- 点击表头 checkbox 不会取消其他页或当前筛选不可见的选择。
- 点击行内 checkbox 时阻止 row click 冒泡，避免一次点击切换两次。

### 5.4 选择状态

- 点击 checkbox 或整行可以选择 pairing。
- 选中行使用轻量紫色背景和左侧选中标记。
- 选择状态独立于当前搜索和筛选结果。
- 筛选导致已选 pairing 暂时不可见时，顶部 selected count 仍保持准确。
- 提供 `Clear selection`，只清选择，不清搜索和筛选。

### 5.5 分页

原型提供简单上一页 / 下一页和页码状态，模拟正式实现的 server-side pagination。

- 每页显示固定数量 mock rows。
- 搜索或筛选变化后回到第一页。
- 翻页不清除已选 pairing。

### 5.6 确定性 mock 数据

原型 page size 为 6，使用以下固定数据：

| Stable pairing ID | Pairing number / label | Base | Route | Start / End | Check-in / Check-out | Days | Credit | Rank |
|---|---|---|---|---|---|---:|---:|---|
| 501001 | 100227 | YVR | V4151 | 2026-07-22 / 2026-07-22 | 06:10 / 10:10 | 1 | 4.0 | CA+FO |
| 501002 | 100257 | YVR | V4103 | 2026-07-22 / 2026-07-22 | 08:30 / 14:25 | 1 | 5.9 | CA+FO |
| 501003 | 100259 | YVR | V4133 | 2026-07-22 / 2026-07-22 | 12:05 / 18:35 | 1 | 6.5 | CA+FO |
| 501004 | 167669 | YVR | PRMM | 2026-07-22 / 2026-07-23 | 23:20 / 05:15 | 2 | 4.0 | — |
| 501005 | 100273 | YVR | V4105 | 2026-07-22 / 2026-07-23 | 07:00 / 16:10 | 2 | 9.2 | CA+FO |
| 501006 | 100276 | YVR | V4150 | 2026-07-22 / 2026-07-23 | 09:15 / 15:45 | 2 | 6.5 | FO |
| 501007 | 100284 | YVR | V4106 | 2026-07-22 / 2026-07-23 | 15:30 / 20:25 | 2 | 4.9 | CA |
| 501008 | 100286 | YVR | V4140 | 2026-07-23 / 2026-07-26 | 06:40 / 18:00 | 4 | 19.3 | CA+FO |
| 501009 | 200101 | YYZ | T202 | 2026-07-24 / 2026-07-25 | 05:45 / 13:55 | 2 | 8.2 | FO |
| 501010 | 200115 | YYZ | T315 | 2026-07-25 / 2026-07-27 | 10:20 / 19:15 | 3 | 14.0 | CA |
| 501011 | 100310 | YVR | V4201 | 2026-07-26 / 2026-07-28 | 11:10 / 21:05 | 3 | 12.1 | CA |
| 501012 | 200190 | YYZ | T410 | 2026-07-27 / 2026-07-27 | 16:00 / 21:10 | 1 | 5.2 | CA+FO |

表格 `PAIRING` 列和 pairing number 搜索使用 `pairingNumber`；选择 identity 和 payload 使用 `pairingId`；`pairingLabels` 与 IDs 同序保存可读 pairing number。

验收固定结果：搜索词 `YVR` 加 `Days Min=2 / Max=4` 后恰好返回 6 条 pairing numbers：`167669`、`100273`、`100276`、`100284`、`100286`、`100310`，对应 stable IDs：`501004`、`501005`、`501006`、`501007`、`501008`、`501011`。

## 6. 现有 Pairing Preference 字段必须保留

Picker 只替换当前 `PAIRING NUMBER` autocomplete 区域。选择至少一个 pairing 后继续展示现有字段：

- `LIMIT TO RUN DATE` switch，默认关闭。
- 开启后选择 `Specific Date` 或 `Date Range`。
- Date Range 使用一个标准范围 picker 语义，不设计成两个独立日历。
- 日期范围变化后重新计算 mock matching runs。
- matching runs 为 1 时，原有数量规则自动视为 `1 / 1`，不显示 fulfilment 输入。
- matching runs 至少为 2 时展示 `FULFILMENT`、`Minimum required`、`Maximum required`。
- 清空全部 pairing 时清理 date scope 和 fulfilment values，保持当前 editor 的隐藏字段清理行为。

字段契约：

| 字段 | 新增默认值 | 有效性 | 保存 / 回显 |
|---|---|---|---|
| Tiers | 空 | 至少一个 | 保存并回显 active tiers |
| Action | Award | Award 或 Avoid | 保存并回显 action |
| Pairing IDs | 空 | 至少一个 stable ID | 保存 IDs；编辑时跨页预选 |
| Pairing labels | 与 ID 对齐 | 不单独决定有效性 | 有 label 时保存并回显；缺失时用 ID 作为 fallback |
| Date scope | null | 开启后必须完整 | 保存并回显 specific date / date range |
| Minimum required | null | fulfilment 出现时至少填写 min/max 之一 | 保存并回显 |
| Maximum required | null | 不得小于 min，不得超过 matching runs | 保存并回显 |

### 6.1 编辑与回显

- 原型在 dialog 外提供明确标记为 prototype-only 的状态入口：`New bid`、`Load existing example`、`Load favorite example`，不属于产品 UI。
- existing example 预选至少两个 stable pairing IDs，并回显 Tier、Avoid、date scope 和 fulfilment。
- favorite example 回显其已保存的 stable IDs/labels、Tier、Action、date scope 和 fulfilment；从 favorite 加入 bid 时不得经过另一套 picker mapper。
- 预选 pairing 即使不在当前页或当前筛选结果中，selected count 仍准确。
- 如果某个已保存 ID 当前候选不可查，选择区仍以 `Pairing <ID>` fallback 保留，不静默丢失；prototype 使用 `pairingId=599999` 且无 label 演示该状态。
- existing 状态 footer 使用 `UPDATE BID`；favorite example 保持 `ADD BID`，同时可重新 `SAVE FAVORITE`。提交后均只输出当前 Pairing Preference contract 字段。

## 7. Footer 与有效性

- 初始 Tier 为空，Pairing 选择为空。
- `Award` 默认选中。
- `SAVE FAVORITE`、`ADD BID`、`UPDATE BID` 统一使用完整 editor validity：至少一个 Tier、至少一个 Pairing、date scope 完整且有 matching run、fulfilment 至少填写 min/max 之一、`min <= max` 且不超过 matching runs。
- `ADD BID` 启用后显示选中数量，例如 `ADD BID · 3`。
- edit example 使用 `UPDATE BID · N`。
- Search / Filters 是否为空不影响有效性。

## 8. 状态反馈

原型需要展示并可验证：

- 默认列表状态
- 搜索有结果
- 搜索无结果
- Filters 展开 / 收起
- Filters active 数量
- 多选、取消选择、清空选择
- 当前页全选
- 翻页后选择保持
- Footer disabled / enabled
- `Load existing example` 的跨页预选与 `UPDATE BID`
- `Load favorite example` 的完整回显与再次 Add / Save
- Submit 后展示 prototype payload preview，便于确认没有保存 query / filters / page

正式实现阶段还需要补 loading、API error 和 retry；静态原型只呈现列表、empty 和交互状态。

## 9. 视觉与可访问性

- 沿用 PBS Portal 白色轻量弹窗、紫色选中态和现有 footer 风格。
- 表格保持航空业务工具需要的信息密度，但避免参考项目中过于紧凑的内部测试工具感。
- 使用语义化 button、checkbox、search input 和清晰 aria label。
- 键盘 focus ring 不被弹窗或表格容器裁切。
- 小屏下表格允许横向滚动；不压缩到无法辨认字段。

## 10. 原型文件范围

制作两个内容一致的自包含 HTML：

- `.superpowers/brainstorm/pairing-preference-filterable-picker-20260716/pairing-preference-filterable-picker-v2.html`（canonical source）
- `pbs-portal/.superpowers/pairing-preference-filterable-picker-v2.html`

两个文件均为开发期、mock-data、无业务服务依赖的原型。不会修改 `pbs-portal/src`。

## 11. 非目标

- 不修改 `propertyCode` 或 Pairing Preference payload。
- 不实现真实 API、数据库查询或服务端筛选。
- 不把 Search Pairings 页面整体嵌入弹窗。
- 不保存 filter criteria。
- 不改变 Pairing Preference 的 Award / Avoid 或 Tier 语义。
- 不改变现有 run date / fulfilment 业务语义。
- 不在本阶段决定正式产品组件拆分和后端查询参数。

## 12. 原型验收

- 页面能独立打开，无外部资源依赖。
- Search、Filters、Clear filters、多选、当前页全选、Clear selection 和分页可操作。
- 使用固定 mock data 断言 `YVR + Days 2–4` 的结果数量和 pairing IDs。
- 搜索和筛选不会清除已选 pairing，表头 checkbox 的 unchecked / indeterminate / checked 正确。
- Footer 有效性符合完整 editor validity；incomplete date scope 或非法 fulfilment 必须禁用所有保存动作。
- `Load existing example` 能回显 pairing IDs、Tier、Avoid、date scope 和 fulfilment，并显示 `UPDATE BID`。
- `Load favorite example` 能回显 stable IDs/labels、Tier、Action、date scope 和 fulfilment，并可再次 `ADD BID` / `SAVE FAVORITE`。
- 执行 Add/Update 后，payload preview 只包含 action、tiers、pairing IDs/labels、date scope、minimum/maximum；不得包含 search、filters、page 或 selected-row UI 状态。
- canonical HTML 与 Portal 预览副本字节级一致。
- 内嵌 JavaScript 可解析。
- 使用 Playwright 或等价浏览器检查完成一条完整交互路径。
- `git diff --check` 通过。

## 13. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是单个自包含视觉原型，HTML、CSS、mock data 和交互强耦合，拆分会增加整合成本。
- Suggested split: 不拆分。
- Write boundaries: 本 spec 与两个 `.superpowers` HTML 原型文件。
- Conflict risk: Low；但当前工作区存在其他未提交功能改动，本任务不得修改或提交它们。
- Execution gate: 用户审阅并批准本 spec 后开始制作 HTML。
