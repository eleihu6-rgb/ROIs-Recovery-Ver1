# PBS Bid 合并工作台人工测试用例

## 前置条件

- 使用 Lineholder crew 登录 PBS Portal。
- 当前 Bid Period 处于可编辑状态。
- 测试账号具备至少一个 Days Off、Pairing、Roster（内部 Line）条件和一个收藏条件。

## PBS-BID-001 导航与默认状态

1. 查看顶部导航。
2. 点击 `Bid`。

预期结果：

- 顶部只显示一个 `Bid` 入口，不再显示 `Days Off`、`Pairing`、`Line`。
- 页面进入 `/bid`。
- `ADD BID PROPERTIES` 默认选中 `FAVORITED PROPERTIES`。
- 收藏为空时显示空态，不自动切到其他 Tab。

## PBS-BID-002 Existing 与分类 Tab

1. 依次切换 `FAVORITED PROPERTIES`、`DAYS OFF`、`PAIRING`、`ROSTER`。
2. 在每个 Tab 搜索条件。
3. 滚动 Available 列表。

预期结果：

- `EXISTING BID PROPERTIES` 始终同时显示三类已保存条件，不受 Tab 或搜索过滤。
- 每个分类 Tab 只显示本分类条件。
- Roster 条件的类型 badge、收藏分组和 Bid Review 模块标签显示 `Roster`。
- `Forget Line`、`Configure Line Bid` 等具体 property 和弹窗名称保持不变。
- 不显示 `ALL PROPERTIES` 和分页控件。
- 切换 Tab 后搜索词清空，列表回到顶部。

## PBS-BID-003 Existing 编辑与 Pairing 能力

1. 分别点击 Days Off、Pairing、Roster Existing 行。
2. 修改条件或 Tx 并保存。
3. 点击 Pairing 行的 `PREVIEW`。
4. 操作 `REFRESH`、`VIEW PAIRING RULES`、`SEARCH CURRENT RULES`。

预期结果：

- 三类 Existing 行打开各自原有的配置弹窗。
- 保存、删除和 Tx 修改成功。
- Pairing Preview 进入 `/bid/pairing/search` 并只预览该行。
- Pairing Rules 以独立 Dialog 打开，统一 Existing 列表不被替换。
- Search Current Rules 使用当前 Tx 的完整 Pairing 条件。

## PBS-BID-004 日历双模式

1. 点击一个没有 Existing 事件的具体日期。
2. 在浮层切换 `DAYS OFF` 与 `PAIRING`。
3. 关闭浮层，再点击另一个日期。
4. 点击星期标题。
5. 点击已有 Days Off 和 Pairing 日历事件。

预期结果：

- 日期浮层同时提供 `DAYS OFF` 和 `PAIRING` Tab。
- 同一浏览器会话中记住上次选择。
- 星期标题直接执行 Days Off 批量行为。
- 已有事件直接打开所属类型，不再显示类型选择。

## PBS-BID-005 连续跨分类写入

1. 添加 Days Off 条件。
2. 不刷新页面，添加 Pairing 条件。
3. 不刷新页面，从 `ROSTER` Tab 添加 Line 条件。
4. 从 Pairing Search 返回后再修改 Days Off。

预期结果：

- 所有操作成功，不出现 stale `draftVersion` / 409 冲突。
- Existing、Tier Summary、Calendar 和 Pairing Count 使用最新草稿状态。

## PBS-BID-006 旧路由与 Search 返回

依次访问：

- `/days-off`
- `/pairing`
- `/line`
- `/pairing/search`

预期结果：

- 三个旧主页面重定向到 `/bid`。
- 旧 Search 地址重定向到 `/bid/pairing/search`。
- 从 Pairing Search 返回 `/bid` 后自动选中 `PAIRING` Tab。

## PBS-BID-007 页面与列表滚动边界

分别使用 `1920×1080`、`1366×600` 和 `1024×768` 视口：

1. 打开 `/bid`。
2. 将鼠标放在 Available Property 行列表中滚动到中间，再滚动到底部并继续向下滚动。
3. 如果 Existing Property 行超过可见高度，将鼠标放在 Existing 行列表中重复上述操作。
4. 切换 `FAVORITED PROPERTIES`、`DAYS OFF`、`PAIRING`、`ROSTER`。

预期结果：

- 浏览器页面本身没有纵向滚动，顶部导航和完整左侧日历位置保持不变。
- `EXISTING BID PROPERTIES`、`ADD BID PROPERTIES`、分类 Tab、工具按钮和搜索框始终可见。
- Available Property 行列表占用剩余高度并独立滚动；到达顶部或底部后继续滚动不会带动浏览器页面。
- Existing Property 只有行容器在超过最大高度时独立滚动，不挤掉下方 Add 区域。
- 切换分类 Tab 后 Available Property 行列表回到顶部。

## PBS-BID-008 Existing 摘要、列对齐与删除

1. 准备包含 Pairing Preference 的草稿，payload 同时含有 `pairingIds` 和 `pairingLabels`。
2. 打开 `/bid`，检查 Pairing、Days Off、Roster Existing 行。
3. 点击 Pairing 行的删除图标，然后点击 `Cancel`。
4. 再次打开删除确认并点击 `Delete`。
5. 模拟一次删除接口失败后重试。

预期结果：

- Pairing Preference 显示 `Award pairing CRAM` 或 `Award pairings CRAM, ABC123` 等业务文案。
- 页面不显示 JSON、`pairingIds`、内部 pairing ID；payload 缺少可用 label 时显示 review-only 安全文案。
- 所有行保持 `TYPE | SUMMARY | TIERS | ACTIONS` 列对齐，操作列固定宽度。
- Pairing 行显示 `PREVIEW` 和删除图标；Days Off、Roster 行只显示删除图标。
- 点击行主体继续进入编辑；点击删除图标只打开确认，不触发编辑。
- 删除提交期间目标行、Preview 和确认按钮禁用，重复点击只发出一次请求。
- 删除成功后该行消失并刷新对应草稿视图；删除失败时保留该行、显示错误并恢复所有操作。

## PBS-BID-009 Existing Tx 筛选

1. 不选择左侧 calendar 的任何 Tx，打开 `/bid`。
2. 点击左侧 `T2`。
3. 再次点击左侧 `T2`。

预期结果：

- 默认显示 `T1 only`，Existing 列表展示 tiers 包含 `T1` 的 bid。
- 选择 `T2` 后显示 `T2 only`，Existing 列表只展示 tiers 包含 `T2` 的 bid。
- 再次点击 `T2` 后取消主动选择，回到默认 `T1 only`。
- 详细步骤见 `docs/test-cases/pbs/bid/2026-07-20-bid-tier-tx-filter.md`。
