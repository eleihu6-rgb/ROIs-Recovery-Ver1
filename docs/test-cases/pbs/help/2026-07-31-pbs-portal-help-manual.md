# PBS Portal Help 通用操作手册人工测试用例

> 覆盖范围：PBS Portal 顶部导航 `Help`，以及 Quick Start、Dashboard、Bid、Reserve、Standing Bid、Award、Common Questions。

## 前置条件

- 使用非生产测试环境和测试账号。
- Portal 当前存在可访问的 Bid period。
- 测试账号可见至少一个 Days Off、Pairing、Roster、Reserve 和 Standing Bid property。
- 测试账号具备可查看的合成或脱敏 Award 数据。
- 测试过程中不得截取、记录或提交真实机组身份、排班或 Award 数据。

## 测试用例

### PBS-HELP-001 Help 入口与通用目录

步骤：

1. 登录 Portal。
2. 点击顶部导航 `Help`。
3. 查看首页分类和左侧目录。

预期结果：

- 进入 `/help`，顶部 `Help` 高亮。
- 页面显示 `Help Center`。
- 显示 Quick Start、Dashboard、Bid、Reserve、Standing Bid、Award、Common Questions。
- 不显示独立 Tier 分类。
- 不按前舱、后舱或其他岗位拆分内容。

### PBS-HELP-002 Quick Start 完整路径

步骤：

1. 打开 `Quick Start / PBS Portal overview`。
2. 打开 `Before you begin`。
3. 打开 `Complete a Bid`。

预期结果：

- Overview 解释 Dashboard、Bid、Reserve、Standing Bid、Award 的用途。
- Before you begin 指导检查身份、`BID INFORMATION-LOCAL TIME`、月份和 Current/Standing 选择。
- Complete a Bid 按顺序说明 Dashboard → Bid → 配置条件 → T1-T7 → ADD BID → Existing list → Award。
- 明确 Award 需要结果发布后查看，不暗示保存 Bid 后立即产生结果。

### PBS-HELP-003 Dashboard

步骤：

1. 打开 `Dashboard / Overview`。
2. 打开 `Dashboard / User and bid information`。
3. 打开 `Dashboard / Read the bidding calendar`。
4. 打开 `Dashboard / Pre-assigned duties`。
5. 对照真实 Dashboard。

预期结果：

- 文案包含 `BID INFORMATION-LOCAL TIME`、`BIDDING CALENDAR`、`MESSAGE CENTER`。
- `User and bid information` 说明 `BID START`、`BID END`、`REMAINING`、`BASE`、`FLEET`、`POSITION`、`SENIORITY`、`LANGUAGE`、`EXISTING CREDIT`、`TRAINING MONTH`、`LAST LOGIN`。
- `REMAINING` 明确说明 open period 只显示天和小时，不显示分钟；closed period 显示 `Closed`。
- `EXISTING CREDIT` 明确说明来自当前 roster period 的 manday summary，不是新编辑 bid 算出来的。
- 日历说明包含月份、`T1-T7`、日期单元格和保存活动。
- 日历说明包含 `23/33` 这种 Days Off capacity badge、唯一 crew 去重、绿色/黄色/红色含义。
- `Pre-assigned duties` 说明 `Duties`、`Covered days`、`Pairing`、`Days Off`、`Reserve`、`Training`、`Deadhead`、`Unavailable` 和 `Duty Details`。
- `Pre-assigned duties` 明确说明这些数据来自 period roster data，可在 Award 发布前显示，不依赖 Award 发布状态。
- 不声称 Dashboard 可以完成当前没有提供的编辑操作。
- Dashboard 截图来自真实 Portal 组件，仅含合成数据。

### PBS-HELP-004 Bid 添加条件

前置数据：

- 当前 Bid period 可编辑。
- 至少一个 Bid property 可见。

步骤：

1. 打开 `Bid / Add Bid properties`。
2. 按文章说明进入真实 Bid。
3. 选择 DAYS OFF、PAIRING 或 ROSTER。
4. 配置必填字段并选择至少一个 T1-T7。
5. 点击 `ADD BID`。

预期结果：

- Help 使用 `EXISTING BID PROPERTIES`、`ADD BID PROPERTIES`、`DAYS OFF`、`PAIRING`、`ROSTER`、`Search Bid Properties`、`ADD BID`。
- 保存等待期间文章提示不要重复提交。
- 保存成功后，真实页面 Existing list 出现对应记录、摘要和 Tier 标签。

### PBS-HELP-005 Bid 查看、编辑与删除

前置数据：

- Current Bid 已存在至少一个测试条件。

步骤：

1. 打开 `Review, edit, and delete`。
2. 在真实 Bid 切换活动 Tier。
3. 找到测试条件并点击 `EDIT`。
4. 修改条件或 Tier，点击 `UPDATE BID`。
5. 删除该测试条件。

预期结果：

- 文章说明条件可能只在所属 Tier 显示。
- 修改后摘要和 Tier 标签更新。
- 删除后记录从当前 Tier view 消失。

### PBS-HELP-006 Favorites 与 Search Pairings

前置数据：

- 存在一个合成 Favorite。
- 当前 Bid 有可搜索的 Pairing rule。

步骤：

1. 打开 `Favorites and Search Pairings`。
2. 对照真实页面检查 `FAVORITED PROPERTIES`、`SELECT TX`、`ADD TO BID`。
3. 检查 `REFRESH`、`VIEW RULES`、`SEARCH PAIRINGS` 和 `ALL PAIRINGS`。

预期结果：

- 文章说明 Favorite 保存可复用条件，加入 Bid 时选择 T1-T7。
- 文章说明更新 Favorite 不会自动更新早先生成的 Existing Bid。
- Pairing Search 控件名称与真实页面一致。

### PBS-HELP-007 Roster 中的 Reserve Preference

前置数据：

- Bid 的 `ROSTER` 分类中 Reserve Preference 可见。

步骤：

1. 打开 Bid 的 Overview、`Add Bid properties` 和 `Roster / Line Conditions`。
2. 在真实 Bid 页面切到 `ROSTER`，点击 `Reserve Preference` 的添加按钮。
3. 选择 `SHORT-CALL TYPE`、`DATE SCOPE` 和 `APPLY TO TIERS`。
4. 点击 `ADD BID`。

预期结果：

- Help 不再出现独立 Reserve 页面、Reserve 顶部导航或 Standing Bid 的 `RESERVE` tab 操作说明。
- Help 说明 Reserve Preference 从 `Bid -> ADD BID PROPERTIES -> ROSTER` 或 `Standing Bid -> ROSTER` 进入。
- Help 说明 `PRAM`、`PRMM`、`PRPM`、`CRAM`、`CRPM`、`RESA / RESB` 的时间窗口或配置含义。
- Help 说明 Current Bid Reserve Preference 可用 `Whole Month`、`First Half`、`Second Half`、`Date Range`、`Specific Dates`，Standing Bid Reserve Preference 只支持 `Whole Month`、`First Half`、`Second Half`。
- 保存成功后 Existing list 出现对应 Roster row，但底层仍写入 reserve draft。
- 文章说明按钮不可用时应检查的必填项。

### PBS-HELP-008 Standing Bid

前置数据：

- 至少一个 Standing property 可见。

步骤：

1. 打开 Standing Bid 的 Overview 和 `Add and manage Standing Bid`。
2. 在真实 Standing Bid 选择一个可见 property。
3. 配置条件并选择 T1-T7，点击 `ADD BID`。
4. 使用 ALL/T1-T7 筛选。
5. 编辑并删除该测试条件。

预期结果：

- Help 包含 `EXISTING STANDING BID`、`ADD STANDING BID`、`Configure Standing Bid`、`UPDATE BID`。
- 明确 Current Bid 有已保存业务条件时优先使用，Current 为空时 Standing 兜底。
- 明确 Standing Bid 不显示左侧 `BIDDING CALENDAR`，因为它编辑的是 reusable 条件，不是单个 current-period calendar。
- 明确特定年月日、具体 Pairing occurrence 等只适用于特定周期的条件不出现在 Standing。
- 明确 Standing Pairing dialog 隐藏 `Limit to Event Date`。
- 明确 Standing Reserve `DATE SCOPE` 只支持 `Whole Month`、`First Half`、`Second Half`。
- 明确 `Airport Preference` 空结果 `No airports or cities match`、`Flight Number Preference` 至少输入一个字符才搜索、`Time Between Flights` limits 加载失败时显示 `Unable to load the Time Between Flights limits.` 和 `Retry`。
- 保存、筛选、编辑和删除结果与文章一致。

### PBS-HELP-009 Award

前置数据：

- 合成或脱敏 Award 已发布。

步骤：

1. 打开 `Award / View a published Award`。
2. 对照真实 Award。
3. 选择一个 duty 或 activity。

预期结果：

- Help 包含 Roster Details、Selected Duty、Reason Report Preview 或 Award Explanation。
- Help 说明 `Award period` 只在存在可读 published / final / mis-award-closed 周期时出现。
- Help 说明 `Published`、`Final`、`Mis-award Closed`、`Awaiting publication`、`Scheduled`、`Award period not configured`。
- Help 说明 `Period`、`Duties`、`Days Off`、`Pairings`、`Credit Hours`、`Block Hours`。
- Help 说明 `0`、`--`、`Missing data` 的区别。
- Help 说明 `Reason Report` 没有 explanation 时会 disabled。
- 文章说明 Award 是发布后的结果视图。
- Award 截图仅使用合成数据。

### PBS-HELP-010 Common Questions 与恢复步骤

步骤：

1. 打开 `Common Questions`。
2. 检查 ADD BID 不可用、保存确认、Tier 过滤、Current/Standing 选择、加载失败和保存失败。

预期结果：

- 每个问题提供可执行的下一步。
- 不暴露原始 API、Axios/RPC、异常对象、堆栈或内部实现。
- 提醒报告问题时不得提供密码或敏感排班信息。

### PBS-HELP-011 搜索、截图与禁止用语

步骤：

1. 在 Help 搜索框依次输入 `standing`、`search pairings`、`bid properties` 和无匹配关键字。
2. 打开 Dashboard、Bid、Reserve、Standing Bid、Award 的 Overview。
3. 检查所有文章。

预期结果：

- 搜索只显示匹配主题。
- 五篇 Overview 各显示一张可加载的当前页面截图。
- 截图不包含真实身份或排班数据。
- 不出现 `Layer`。
- 不出现按用户身份或岗位贴标签、拆分操作说明的内容。
- 不出现算法细节、投标策略或结果承诺。

### PBS-HELP-012 窗口适配

步骤：

1. 分别使用 2048×1024、1366×768 和 1366×640 窗口打开 Help。
2. 展开多个左侧分类。
3. 阅读长文章并滚动。
4. 打开 Dashboard Overview 和 Bid Overview。

预期结果：

- 左侧目录和右侧文章区域不互相遮挡。
- 左侧目录与右侧文章可独立滚动，滚动一侧时另一侧位置不变。
- 宽屏下内容画布水平居中，正文和截图同宽、左右边缘对齐，截图不超过原图宽度。
- 文章、表格和截图可阅读，不出现横向内容丢失。

### PBS-HELP-013 截图全屏预览

步骤：

1. 打开任意包含页面截图的 Overview。
2. 使用鼠标点击截图，再分别使用 `Enter` 和 `Space` 打开。
3. 使用滚轮和 `+` / `-` 键调整比例。
4. 放大后使用鼠标拖动和方向键查看不同区域。
5. 按 `0` 恢复初始视图，随后分别使用 `Esc`、遮罩和右上角悬浮关闭按钮退出。
6. 在 1366×640 与 2048×1024 窗口重复检查。

预期结果：

- 大图预览覆盖 Portal 主要区域，但不超出视口。
- 预览不显示紫色标题栏或白色工具栏，图片填满预览区域，仅右上角显示悬浮关闭按钮。
- 缩放限制在 50%–400%，到达边界后不会继续变化。
- 图片不能被拖到完全离开视口，按 `0` 恢复 100% 和居中。
- 关闭后焦点回到原截图，底层 Help 页面没有横向溢出。

### PBS-HELP-014 左侧 BIDDING CALENDAR

前置数据：

- 当前 Bid period 可查看；如需验证添加操作，当前周期必须可编辑。
- 日历中至少存在一个 Pairing 条目。
- 日历中至少存在一个 Days Off capacity badge，例如 `23/33`。

步骤：

1. 打开 `Bid / Use the bidding calendar`。
2. 检查文章专用截图实际显示 `BIDDING CALENDAR` 标题、当前周期状态、月份、`T1-T7`、日期格、至少一个合成彩色 Bid 条目、Days Off capacity badge 和收起按钮。
3. 按 Help 指引切换 Tier、点击日期、点击星期标题并打开已有 Pairing 条目。
4. 收起并重新展开左侧日历。
5. 阅读 `23/33` 这类 `requested/max` 容量说明。
6. 阅读绿色、黄色、红色的容量含义。
7. 阅读 Dashboard、Bid、Reserve 的操作边界。

预期结果：

- Help 明确 `23/33` 表示已申请人数 / 当日最多可申请人数。
- 同一个 crew 在同一天多个 Tier 申请 Days Off 时，容量统计只计一次。
- 绿色表示未达到上限，黄色表示刚好达到上限，红色表示超过上限。
- Help 不暗示 Dashboard 可以编辑 Bid，也不暗示 Reserve 页面可以配置 Pairing 条件。

### PBS-HELP-015 Bid Conditions 参考目录

前置数据：

- 测试环境当前 Portal 可见 catalog 至少包含 Current Bid 的 Days Off、Pairing、Roster / Line、Reserve 条件。
- Standing Bid 页面可访问。

步骤：

1. 打开 `Help`。
2. 在左侧目录找到 `Bid Conditions`。
3. 展开 `Bid Conditions`，确认目录下没有 `All Bid Conditions`。
4. 依次打开 `Days Off Conditions`、`Pairing Conditions`、`Roster / Line Conditions`、`Reserve Conditions` 和 `Standing Bid Conditions`。
5. 检查每个二级目录下面是否显示具体 bid condition 三级条目。
6. 点击 `Pairing Conditions -> Flight Number Preference`，确认右侧直接定位到 `Flight Number Preference` 卡片。
7. 点击 `Pairing Conditions` 二级标题，确认右侧回到 Pairing Conditions 页面顶部。
8. 在 Help 搜索框分别输入 `work day preference`、`credit window preference`、`reserve preference`。
9. 对照真实 Bid、Reserve、Standing Bid 页面中可添加的 property 列表。
10. 检查每个 Bid Conditions topic 顶部的图文说明和截图。
11. 打开 `Pairing Conditions -> Pairing Preference`，检查 `Key controls` 是否说明搜索框、`Filters`、row checkbox、selected count 和 `ADD BID`。
12. 打开 `Pairing Conditions -> Pairing Check-In / Check-Out Time`，检查 `Key controls` 是否说明 `Limit to Event Date` 关闭和打开的区别。
13. 打开 `Pairing Conditions -> Pairing Length` 和 `Pairing Conditions -> Flight Number Preference`，检查是否分别有 `Limit to Pairing Start Date`、`Limit to Flight Date` 的独立控件说明和截图。
14. 打开 `Pairing Conditions -> Work Day Preference`，检查 Help 是否明确“只选周几、不填时间也可以保存”。
15. 打开 `Reserve Conditions -> Reserve Preference`，检查 `DATE SCOPE` 的 Whole Month、First Half、Second Half、Date Range、Specific Dates 说明。
16. 打开 `Pairing Conditions -> Flight Number Preference`，检查 Help 是否说明 Type 只影响 suggestions，至少输入一个字符才开始搜索。
17. 打开 `Pairing Conditions -> Airport Preference`，检查 Help 是否说明 option 来源和 `No airports or cities match`。
18. 打开 `Pairing Conditions -> Time Between Flights`，检查 Help 是否说明 configured limits 加载、disabled 状态、`Unable to load the Time Between Flights limits.` 和 `Retry`。
19. 点击新增控件级截图进入全屏预览，再关闭预览返回文章。

预期结果：

- `Bid Conditions` 左侧目录不显示 `All Bid Conditions`。
- `Days Off Conditions`、`Pairing Conditions`、`Roster / Line Conditions`、`Reserve Conditions` 和 `Standing Bid Conditions` 下方显示对应具体 bid condition 三级条目。
- 点击具体 bid condition 三级条目时，右侧打开对应分组页面并定位到对应 condition 卡片。
- `Days Off Conditions` 有 `Configure Prefer Off` 和 `Configure Long Stretch Off / Compressed Flying` 两个独立弹窗截图。
- `Pairing Conditions` 有 12 个独立弹窗截图：`Configure Pairing Preference`、`Configure Check-In / Check-Out Time`、`Configure Flight Legs per Duty`、`Configure Work Day Preference`、`Configure Pairing Length`、`Configure Flight Number Preference`、`Configure Redeye Preference`、`Configure Deadhead Flying`、`Configure Time Between Flights`、`Configure Month-End Carryover`、`Configure Airport Preference`、`Configure Efficient Flying First`。
- `Roster / Line Conditions` 有 4 个独立弹窗截图：`Configure Minimum Base Layover`、`Configure Commuter Pattern`、`Configure Mixed Line Bid`、`Configure Credit Window Preference`。
- `Reserve Conditions` 有 `Configure Reserve Preference` 弹窗截图。
- 所有截图正常加载，没有 broken image；截图全屏预览可打开和关闭。
- 每个 condition 卡片都有 `Where to open it`、`How to configure it`、`Key controls`、`Example`、`After saving` 和 `Watch out`。
- `Days Off Conditions` 顶部有“两种入口”说明：左侧日历从日期出发，`ADD BID PROPERTIES -> DAYS OFF` 从条件类型出发。
- `Pairing Conditions` 顶部有“两种入口”说明：左侧日历从可见 exact pairing entry 出发，`ADD BID PROPERTIES -> PAIRING` 从 pairing rule 出发。
- `Pairing Preference` 额外包含搜索框局部截图、`Pairing Filters` 弹窗截图和 row selection / selected count 局部截图。
- `Pairing Preference` 明确说明搜索和 Filters 只缩小候选 pairing list，不会保存为 bid；只有 selected rows 会被 `ADD BID` 保存。
- `Pairing Conditions` 顶部有 `Date-scope labels` 对照：`Event Date`、`Flight Date`、`Pairing Start Date`、`Reserve Date Scope` 和开关 off/on 的含义。
- `Limit to Event Date` / `Limit to Flight Date` / `Limit to Pairing Start Date` 说明关闭态表示整段周期生效，打开态表示只在选定日期或日期范围内评估规则，并且各自有对应 label 的真实截图或控件说明。
- Help 明确 date scope 不是 Pairing Preference 的 Filters，也不是修改 bid period。
- `Work Day Preference` 明确说明 weekday-only 配置可以不填时间窗口。
- `Reserve Preference` 明确说明 `DATE SCOPE` 是保存到 Reserve Preference 里的生效范围，不是页面筛选器，也不是 Pairing 的 event-date / flight-date / pairing-start-date 限制。
- `Reserve Preference` 明确说明 PRAM、PRMM、PRPM、CRAM、CRPM、RESA / RESB 的时间窗口或配置含义。
- `Reserve Preference` 明确说明 Standing Reserve 只支持 Whole Month、First Half、Second Half。
- `Flight Number Preference` 明确说明 Type 不是选择结果，flight-number autocomplete 至少输入一个字符才搜索。
- `Airport Preference` 明确说明机场/城市选项依赖当前账号、base、period、event type 和搜索文本；空状态是 `No airports or cities match`。
- `Time Between Flights` 明确说明 editor 需要先加载 configured limits；加载失败时使用 `Retry`。
- Days Off 至少包含 `Prefer Off` 和 `Long Stretch Off / Compressed Flying`。
- Pairing 至少包含 `Pairing Preference`、`Pairing Check-In / Check-Out Time`、`Flight Legs per Duty`、`Work Day Preference`、`Pairing Length`、`Flight Number Preference`、`Redeye Preference`、`Deadhead Flying`、`Time Between Flights`、`Month-End Carryover`、`Airport Preference` 和 `Efficient Flying First`。
- Roster / Line 至少包含 `Minimum Base Layover`、`Commuter Pattern`、`Mixed Line Bid` 和 `Credit Window Preference`。
- Reserve 包含 `Reserve Preference`。
- Standing Bid 说明 reusable 条件；`Standing Bid Conditions` 三级目录和正文都不显示 Current-only 的 `Pairing Preference` 卡片。
- Help 不显示隐藏或当前未支持的条件，例如 `Reserve Day On`、`Reserve Prefer Off`、`Day of Week Off`。
- 搜索具体条件名时能显示对应二级 topic 和三级 bid condition 条目，并能点击定位。
- 全文继续使用 `Tier` / `T1-T7`，不出现旧术语 `Layer`。

### PBS-HELP-016 Dashboard 预占信息与左侧字段

前置数据：

- Dashboard 当前周期可查看。
- 测试账号或截图数据中存在 pre-assigned duties。

步骤：

1. 打开 `Dashboard / Overview`。
2. 检查截图中的左侧 `BID INFORMATION-LOCAL TIME`。
3. 检查截图中的左侧 `USER INFORMATION`。
4. 检查截图中的右侧 `MESSAGE CENTER`。
5. 阅读 `Pre-assigned Duties`、`Duties`、`Covered days` 和 `Duty Details` 说明。

预期结果：

- Help 说明 `BID START`、`BID END`、`REMAINING`。
- Help 说明 `REMAINING` 是粗粒度显示，open period 只显示天和小时，不显示分钟；closed period 显示 `Closed`。
- Help 说明 `USER INFORMATION` 包含 `BASE`、`FLEET`、`POSITION`、`SENIORITY`、`LANGUAGE`、`EXISTING CREDIT`、`TRAINING MONTH`、`LAST LOGIN`。
- Help 说明 `MESSAGE CENTER` 当前展示 `Pre-assigned Duties`。
- Help 说明 `Duties` 是当前 period 的预占 duty 总数。
- Help 说明 `Covered days` 是这些预占 duty 覆盖的唯一日期数量。
- Help 说明 `Duty Details` 是可滚动的预占 duty 明细列表。
- Help 不再展示或说明旧的 `TOTAL BIDDER`、`TARGETED LINE`、`TARGETED RESERVE`。
- Help 不再展示 Dashboard 右侧旧的 fleet / sub-fleet pool count。

### PBS-HELP-017 Pairing Filters 操作说明

前置数据：

- `Bid` 页面可查看。
- 至少存在一个可配置 Pairing property。

步骤：

1. 打开 `Bid / Configure Pairing Preference` Help topic。
2. 阅读 `Pairing Filters` 小节。
3. 在真实 `Configure Pairing Preference` 弹窗中点击 `Filters`。
4. 对照 Help 检查弹窗字段。

预期结果：

- Help 说明 `Filters` 打开 `Pairing Filters` 弹窗。
- Help 说明 Filters 只缩小可选 pairing list，不会直接保存 bid。
- Help 说明筛选后仍需选择 pairing，并通过 `ADD BID` 或 `UPDATE BID` 保存。
- Help 覆盖 `Pairing start dates`、`Check-in`、`Check-out`、`Length`、`Route station`、`Layover station`、`Layover count`、`Credit`、`Redeye`、`DHD`。
- Help 说明 `Credit` 使用 `HH:MM`。
- Help 说明 `Clear All`、`Cancel`、`Apply Filters` 的作用。
- Help 不使用旧 `Layer` 术语。

## 自动化回归

```bash
cd e2e
npx playwright test -c config/playwright.config.ts --project=pbs-portal tests/pbs-portal/help/ --reporter=list --no-deps
```

重新生成安全截图：

```bash
cd e2e
npx tsx scripts/capture-pbs-portal-help-screenshots.ts
```
