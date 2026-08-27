# PBS Standing Bid 单页合并测试用例

## 前置条件

- PBS Portal 可正常登录。
- `GET /api/standing-bids/current` 同时返回 Lineholder 和 Reserve Standing draft。
- Standing 可见 catalog 包含：
  - `301 Reserve Preference`
  - `312 Reserve Day of Week Off`
  - `313 Reserve Work Block Size`
  - `314 Waive to Allow Carry over to be Days Off`

## 用例 1：单页结构与 Bid UI

1. 进入 `/standing-bid`。
2. 检查页面标题、Existing 区和 Add 区。
3. 检查 Add 区分类。

预期结果：

- 页面不显示 `Lineholder / Reserve` 模式 Tab。
- 页面只有一个 `EXISTING STANDING BID` 和一个 `ADD STANDING BID`。
- 分类使用与 Current Bid 相同的下划线 Tab：
  `ALL PROPERTIES / DAYS OFF / PAIRING / ROSTER / RESERVE`。
- 不显示 `Standing` 分类、收藏入口或 `BIDDING CALENDAR`。
- Existing 行使用扁平列表、类型标签、Tier 和操作区，不使用独立大卡片。

## 用例 2：Reserve 条件完整性

1. 点击 `RESERVE` 分类。
2. 检查可添加条件。

预期结果：

- 同时显示 301、312、313、314。
- 四个条件都归入 `RESERVE`，不出现单独 `Standing` 分类。
- 条件数量来自服务端可见 catalog；被服务端隐藏的条件不应被前端补出。

## 用例 3：双 context Existing 列表

1. 新增一个 `Day of Week Off`。
2. 新增一个 `Reserve Work Block Size`。
3. 刷新页面。

预期结果：

- 两条规则同时显示在统一 Existing 列表。
- `Day of Week Off` 显示 `Days Off` 类型标签。
- `Reserve Work Block Size` 显示 `Reserve` 类型标签。
- 刷新后两条规则仍存在。

## 用例 4：保存路由隔离

1. 观察网络请求。
2. 新增或编辑一个 Lineholder 条件。
3. 新增或编辑一个 Reserve 条件。
4. 分别删除上述两类条件。

预期结果：

- Lineholder 操作发送 `mode=lineholder`、`bidContext=StandingLineholder`。
- Reserve 操作发送 `mode=reserve`、`bidContext=StandingReserve`。
- 每次 payload 只包含目标 context 的 properties。
- 两类请求分别携带自己的最新 `draftVersion / draftKey / bidId / remarks`。
- 所有 Standing 请求继续使用 `periodCode=STANDING`。

## 用例 5：Current Bid 隔离

1. 记录 Current Bid Existing 内容和版本。
2. 在 Standing 页面新增、编辑和删除条件。
3. 返回 Current Bid。

预期结果：

- Current Bid 内容、版本、收藏和日历状态不变。
- Standing 操作不触发 Current Bid mutation、submit、lock、award 或 cache 刷新。

## 用例 6：版本冲突恢复

1. 模拟目标 Standing context 返回 `409 draftVersion`。
2. 执行一次新增、编辑或删除。
3. 点击冲突提示中的刷新操作。

预期结果：

- 页面不使用旧版本自动覆盖服务端。
- 刷新重新请求 Standing current endpoint，并重建两份 Standing draft。
- 另一 context 的服务端已保存数据继续显示。
- 不请求或失效 Current Bid query。

## 用例 7：响应式

分别在 1920×1080、1366×768、1280×720 打开页面。

预期结果：

- 页面无横向溢出。
- 五个分类、搜索框、Existing 操作区和 Add 行均可见可操作。
- T1-T7 在配置弹窗中保持单行。

## 用例 8：数据库可见的 18 个条件弹窗统一样式

依次搜索并打开 17 个 Lineholder 条件和 1 个 Reserve 条件。

预期结果：

- 所有弹窗主标题均为 `Configure Standing Bid`，副标题为当前条件名称。
- 新增时 T1-T7 默认均未选中，选择至少一个 Tier 后才能保存。
- 弹窗不显示 `SAVE FAVORITE`。
- Pairing、Roster、Days Off、Reserve 的字段、控件和顺序与各自 Current Bid 弹窗一致。
- Standing 页面不会出现 Current Bid 的具体日期默认值。

## 用例 9：Standing 不支持具体日期

1. 打开 `Prefer Off`、`Long Stretch Off / Compressed Flying`、`Work Day Preference`、任一支持 event date 的 Pairing 条件和 `Commuter Pattern`。
2. 检查日期相关控件。

预期结果：

- `Prefer Off` 不显示 Specific Dates 和 Date Range；Days of Week、已配置的 Weekends 及 Time Window 保持可用。
- `Long Stretch Off / Compressed Flying` 保留连续休息天数，不显示日期范围开关或日期选择器。
- `Work Day Preference` 支持同时选择多个星期，并保留每个星期对应的 Check-In 时间窗口。
- Pairing 不显示 event date scope，但原有时间、星期、时长等周期条件保持可用。
- `Commuter Pattern` 不显示具体日期范围。
- 保存 payload 不包含具体日期或具体日期范围。

## 用例 10：Reserve 目录遵循数据库上下文配置

1. 切换到 `RESERVE` 分类。
2. 打开 `Reserve Preference`。
3. 搜索 `Reserve Day of Week Off`、`Reserve Work Block Size` 和 `Waive to Allow Carry over to be Days Off`。

预期结果：

- `Reserve Preference` 显示 `SHORT-CALL TYPE` 和 `DATE SCOPE`，日期范围只有 Whole Month、First Half、Second Half。
- `Reserve Day of Week Off`、`Reserve Work Block Size` 和 Waiver 均不出现在当前目录。
- `StandingReserve` 保存仍使用独立 context，不与 Lineholder 草稿混合。

## 用例 11：数据库开关是目录唯一来源

1. 将测试条件在 `StandingLineholder` 的 `is_visible_in_portal` 从 1 改为 0，刷新页面。
2. 恢复为 1，再刷新页面。
3. 对同一条件分别检查 `Current` 与 `StandingLineholder` 配置。

预期结果：

- 改为 0 后只从 Add Properties 目录消失，已保存 Existing 条件仍可读取。
- 恢复为 1 后条件重新出现，不需要改代码或重新部署。
- Current 与 StandingLineholder 的显示互不串联。
- 数据库错误地打开一个没有注册编辑器的条件时，API 明确返回配置错误，不得静默过滤。

## 回归范围

- Current Bid 页面默认 UI 和数据行为。
- Days Off、Pairing、Roster、Reserve 的共享 Rule Bid 面板。
- Standing 具体日期继续为空且不可填写。
- Reserve Preference 继续只允许 `Whole Month / First Half / Second Half`。

## 用例 17：Existing 按 Tier 查看

1. 准备 T1-only、T2-only、T1+T2 和无 T7 条件的数据。
2. 依次选择 `ALL / T1 / T2 / T7`。
3. 切换筛选时检查 Add 区和网络请求。

预期结果：

- `ALL` 默认选中并展示全部 Existing 条件。
- `T1`、`T2` 只展示包含对应 Tier 的条件，多 Tier 条件在两个筛选中都显示。
- `T7` 显示当前 Tier 空状态，筛选仍保持在 T7。
- Add 条件目录、搜索和分页不变化。
- 筛选切换不触发 Standing 保存请求，也不会从完整草稿中移除隐藏条件。

## 用例 12：Prefer Off 周末展示

1. 在 Current Bid 打开 Weekends 类型的 Prefer Off。
2. 保存后检查 Existing Bid 摘要。
3. 在 Standing Bid 打开相同类型。

预期结果：

- Current 弹窗按当前 Bid Period 显示实际数量，例如 `4 weekends`。
- Current Existing 摘要显示 `Prefer off on weekends`，不得显示 `Prefer Off needs review`。
- Standing 弹窗显示 `Every weekend`，不得显示 `0 weekends`。
- Standing Existing 使用与 Current Bid 相同的绿色 `Days Off` 标签和语义摘要。
- `Weekends` 显示为 `Prefer off on weekends`；带时间窗口时显示
  `Prefer off on weekends from 18:00 to 23:59`。
- 多个星期按周一至周日顺序显示，例如
  `Prefer off on Tuesday, Friday, Saturday`，不得显示原始值顺序或 `Window 18:00-23:59`。
- Standing 仍保留 `EDIT` 和删除操作。

## 用例 13：全部 Existing 条件统一摘要与分类颜色

1. 分别保存或准备一条 Days Off、Pairing、Roster、Reserve Standing 条件。
2. 打开 `EXISTING STANDING BID`。
3. 对照 Current Bid / Current Reserve 中相同 payload 的摘要。
4. 将数据库当前隐藏的 218、410、312、313、314 在隔离测试环境打开后重复检查。

预期结果：

- `Days Off` 使用绿色标签、`Pairing` 使用紫色标签、`Roster` 使用橙色标签、
  `Reserve` 使用灰色标签。
- 每行主体只显示一条语义摘要，不再重复显示“property 名称 + raw value”两行内容。
- `Commuter Pattern` 示例显示 `Work 4–5 days, then 4 days off`。
- 218、312 的星期按配置顺序显示；313 显示 work block 数字范围；314 显示 waiver 语义。
- 410 与 Current Bid 使用相同 Mixed Block 摘要。
- 428 配置可用时显示配置百分比；配置不可用时显示既有不可用提示，不硬编码百分比。
- 301 的 Whole Month、First Half、Second Half 文案与 Current Reserve formatter 一致。
- 所有行继续显示 Tier、`EDIT` 和删除操作。
- 展示层只消费 API 返回的 catalog/draft，不会把数据库隐藏条件补回页面。

## 用例 14：Standing 无日期条件可以通过真实接口保存

1. 使用真实 Standing 页面打开 `Long Stretch Off / Compressed Flying`。
2. 设置连续休息天数并选择 Tier，不填写任何具体日期，保存。
3. 打开 Lineholder `Mixed Line Bid`，确认默认 `Mixed Line` 不可保存；分别选择 `Reserve Only` 和 `Pairing Only` 后保存。
4. 编辑已有 Lineholder `Mixed Line Bid`，选择 `Mixed Line` 后保存。
5. 检查 Existing 行和保存请求结果。

预期结果：

- 两个条件均不返回 `400 Invalid Standing Bid payload.`。
- Long Stretch payload 的 `from` / `to` 均为空，Existing 摘要显示
  `Award at least N consecutive days off`。
- Long Stretch 仅一端为空的异常 payload 被 route 拒绝。
- Long Stretch 双端为具体日期的 payload 被 Standing service 拒绝。
- Lineholder `Mixed Line Bid` 保存 `bid.type = "flag"` 和显式 `action = "award" | "avoid"`。
- 编辑回 `Mixed Line` 会从 Standing Lineholder draft 中移除该 427 row，不保存 `action = "mixed"`。
- Standing Reserve catalog 继续不显示 `propertyCode=427`。
- Current Bid 的日期校验没有被 Standing 专用 schema 放宽。

## 用例 15：保存期间弹窗内容不清空

1. 打开任意 Standing 条件，填写条件并选择 Tier。
2. 在慢速网络下点击 `ADD BID` 或 `UPDATE BID`。
3. 在请求仍未完成时检查弹窗内容、按钮和 Existing 列表。
4. 分别验证成功、失败和失败后重试。

预期结果：

- 保存期间已填写的条件和 Tier 保持不变，不恢复默认值或闪空。
- 主按钮显示 `ADDING...` / `UPDATING...`，取消、关闭和重复提交不可用。
- 成功后 Existing 列表立即显示服务端确认的摘要，随后弹窗关闭。
- 失败后弹窗保持打开，用户输入不丢失，按钮恢复并可直接重试。
- 失败时通过全局消息提示，不在正常业务内容中插入原始异常信息。

## 用例 16：页面高度适配与分页固定可见

1. 分别以 2048×1152、1920×1080、1366×768、1280×720 打开 Standing Bid。
2. 准备足以让 Existing 列表和 Available Properties 列表都超出各自可视高度的数据。
3. 分别滚动 Existing 列表和 Available Properties 列表。

预期结果：

- 页面顶部不再显示重复的 `Standing Bid` 标题、副标题和分隔线。
- `EXISTING STANDING BID` 最多占主面板约 40% 高度，超出部分在该区域内滚动。
- Available Properties 的分类、搜索框和分页区保持固定，仅属性行区域滚动。
- 滚动任一列表时，另一列表、分类、搜索框和分页区的位置不发生变化。
- 四种视口尺寸下分页区始终完整可见，页面无横向溢出。
- Days Off、Pairing、Roster、Reserve 等复用 Rule Bid 面板的页面保持原有高度行为。
