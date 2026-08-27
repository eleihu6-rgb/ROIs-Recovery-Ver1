# PBS Standing Bid 单页合并与 Bid UI 对齐设计

日期：2026-07-28

## 1. 背景

当前 `Standing Bid` 页面把长期条件拆成顶部 `Lineholder / Reserve` 两个 Tab：

- Lineholder 下展示可长期复用的 `Days Off / Pairing / Roster` 条件。
- Reserve 下展示 `Reserve Preference` 和三个 Standing Reserve 专属条件。

通过 Playwright 检查真实 Portal 后确认：

- Current Reserve 页面当前只开放一个通用入口 `Reserve Preference`。
- Standing Reserve 一共只有四个条件。
- Standing 页面为了四个 Reserve 条件增加一次模式切换，用户收益很小。
- Standing 页当前使用圆角计数按钮作为分类，视觉上仍未完全对齐 Current Bid 页的下划线分类 Tab、Existing 行和 Add Property 工作区。

因此本设计将 Lineholder 与 Reserve 的 Standing 条件合并到同一个用户页面中，同时继续在后台保持两类 Standing draft 的业务隔离。

## 2. 目标

1. 删除 Standing 页面顶部 `Lineholder / Reserve` Tab。
2. 将全部长期条件放入一个 Existing 列表和一个 Add Property 工作区。
3. 页面分类统一为：
   - `All Properties`
   - `Days Off`
   - `Pairing`
   - `Roster`
   - `Reserve`
4. 删除 Standing 页面中的独立 `Standing` 分类。
5. Reserve 的四个条件全部归入 `Reserve`：
   - `301 Reserve Preference`
   - `312 Reserve Day of Week Off`
   - `313 Reserve Work Block Size`
   - `314 Waive to Allow Carry over to be Days Off`
6. 页面视觉和交互直接复用 Current Bid 页的成熟 UI 体系，不再为 Standing 设计另一套列表样式。
7. Standing Bid 与 Current Bid 继续保持完全独立的数据、接口和生命周期。

## 3. 非目标

本次不处理：

- Standing Bid 算法 fallback。
- Current Bid 与 Standing Bid 的导入、导出或自动复制。
- 各条件专用编辑器的统一接入；该工作作为后续独立阶段完成。
- Current Bid 页面、Current Reserve 页面或其业务行为调整。
- 数据库 schema、Standing API contract 或 property code 调整。
- 收藏功能；Standing 页面继续不提供收藏入口。
- Standing 具体日期输入；现有禁止绝对日期的规则保持不变。

## 4. 核心业务边界

### 4.1 UI 合并不等于业务数据合并

Standing 页面只在展示层合并条件：

- `Days Off / Pairing / Roster` 条件继续属于 `StandingLineholder`。
- `Reserve` 条件继续属于 `StandingReserve`。

后台继续保留：

- `period_code = 'STANDING'`
- `bid_context = 'StandingLineholder'`
- `bid_context = 'StandingReserve'`

不得创建一个新的混合 Standing context，也不得把 Standing 条件写入 `bid_context = 'Current'`。

### 4.2 Standing 与 Current Bid 完全隔离

Standing 页面：

- 只读取和写入 Standing API。
- 不读取或修改 Current Bid draft。
- 不复用 Current Bid 的 Query cache、draft version、收藏或当前月日历状态。
- 不触发 Current Bid submit、lock、search pairing 或 award 流程。

Current Bid UI 组件可以复用，但其业务 state 和 mutation 不得复用。

将来实现 fallback 时，系统应在没有有效 Current Bid 时选择相应 Standing context，而不是把 Current 与 Standing 两份数据合并计算。本次不实现该逻辑。

## 5. 页面设计

### 5.1 页面头部

- 页面标题保持 `Standing Bid`。
- 使用一条简短说明表达“长期备用申请”，不再根据 Lineholder / Reserve 切换说明文案。
- 删除顶部 `Lineholder / Reserve` Tab 及其占用空间。
- 不增加卡片说明、统计面板或模式概览。

### 5.2 Existing 区

标题统一为：

`EXISTING STANDING BID`

Existing 区复用 Current Bid 页的规则行视觉和交互：

- 按 Tier 组合展示，例如 `T1 ONLY`。
- 每行显示条件类型标签：
  - `Days Off`
  - `Pairing`
  - `Roster`
  - `Reserve`
- 显示条件摘要、Tier 和操作按钮。
- 编辑、删除继续使用现有 Standing mutation。
- Lineholder 与 Reserve 条件显示在同一个列表中，但每行保留不可见的来源 context。

由于 `StandingLineholder` 和 `StandingReserve` 在业务上不会同时参与同一次 award，页面不提供跨 context 的统一优先级编辑。保存时仍维持各 context 内部的顺序。

统一列表采用以下固定比较顺序，避免两个 context 的行出现跳动：

1. 比较已选 Tier 中的最小值，顺序为 `T1` 至 `T7`；
2. 比较分类顺序：`Days Off` → `Pairing` → `Roster` → `Reserve`；
3. 比较来源 context 内原有的 `rowSeq`；
4. 比较来源 context：`lineholder` 先于 `reserve`；
5. 最后使用稳定行标识或 property code 作为兜底。

多 Tier 行只以最小 Tier 参与排序，完整 Tier 标签仍正常展示。该顺序只用于页面展示，不产生跨 context 的统一 `rowSeq`。

### 5.3 Add 区

标题统一为：

`ADD STANDING BID`

分类使用 Current Bid 页相同的下划线 Tab 样式：

- `ALL PROPERTIES`
- `DAYS OFF`
- `PAIRING`
- `ROSTER`
- `RESERVE`

要求：

- 删除当前 Standing 页的胶囊计数按钮。
- 删除 `Standing` 分类。
- Reserve 专属 `312 / 313 / 314` 与 `301` 一起放入 `RESERVE`。
- 数量从当前 API 返回的可见 catalog 动态计算，不在前端硬编码。
- 搜索框、Property 行、圆形添加按钮、分页和空状态复用 Current Bid 页现有组件与尺寸。
- 不显示 `FAVORITED PROPERTIES`。

### 5.4 UI 一致性硬约束

Standing 页面不创建新的卡片、分类按钮或列表体系。必须优先复用 Current Bid 页现有的：

- 浅紫色 section header。
- Existing rule row。
- Property 类型标签。
- 下划线分类 Tab。
- 搜索框。
- Available property row。
- 圆形添加按钮。
- 分页。
- loading、empty 和 error 骨架。

Standing 页面不显示 Current Bid 左侧的 Bidding Calendar，因为 Standing 不绑定具体 bid month。

## 6. 前端数据流

### 6.1 加载

继续使用现有 Standing current response：

- `lineholderDraft`
- `reserveDraft`
- `propertyCatalog.lineholder`
- `propertyCatalog.reserve`

前端 mapper 生成一个统一页面模型，并为每个 Existing / Available property 附加内部来源：

- `lineholder`
- `reserve`

来源必须由服务端返回的 catalog / draft context 决定，不得根据显示文案猜测。

统一页面模型必须保留两份完整的 context 快照，不能折叠成一份 `draftMeta`：

```text
contexts.lineholder = {
  draftKey,
  bidId,
  draftVersion,
  remarks,
  properties
}

contexts.reserve = {
  draftKey,
  bidId,
  draftVersion,
  remarks,
  properties
}

rows = 带来源 context 的合并展示投影
```

具体字段名可以沿用现有 API 类型，但以上字段的含义和归属不能改变。共享展示组件可以消费 `rows`；保存 callback 必须接收目标 context，不能接收一份合并后的 `draftMeta`。

### 6.2 新增

- 用户从统一 Add 区选择条件。
- 前端根据 property 的内部来源选择目标 Standing draft。
- 只使用目标 context 的行重建完整 properties payload，并保留该 context 自己的 `draftKey / bidId / draftVersion / remarks`。
- 只调用该 context 的 Standing save mutation。
- 另一份 Standing draft 不参与请求，也不修改其 `draftVersion`。

### 6.3 编辑和删除

- Existing 行保留其来源 context。
- 编辑或删除时，只重建并更新对应 `StandingLineholder` 或 `StandingReserve` 的完整 draft payload。
- 成功后使用服务端返回结果刷新统一页面模型。
- 不得把当前页面合并后的完整行数组错误写回某一个 context。

### 6.4 版本冲突

两份 Standing draft 继续独立维护 `draftVersion`。

- Lineholder mutation 使用 Lineholder version。
- Reserve mutation 使用 Reserve version。
- 一类 mutation 失败或冲突时，不回滚或覆盖另一类已保存数据。

### 6.5 Query cache 与 409 冲突

- Standing current 数据使用独立于 Current Bid 和 Current Reserve 的 query key。
- 目标 context mutation 可以更新 Standing cache 中对应的 context 快照，再重建合并投影；不得直接写入或失效 Current Bid cache。
- mutation 成功后如需重新校验，只失效 Standing current query。
- 遇到 `409 draftVersion` 冲突时，不使用猜测版本或旧版本自动重试，也不回滚另一个 context。
- 页面显示冲突提示和刷新操作；用户执行刷新后，从 Standing current endpoint 重新加载两份 Standing draft，并以服务端权威数据重建统一页面模型。
- 重新加载两份 Standing draft 是为了得到一致的 Standing 页面快照；它仍不得失效、重新拉取或修改 Current Bid query。

## 7. 条件和编辑器边界

本次只合并页面骨架、列表和分类。

现有 Standing 条件弹窗暂时保持当前实现；后续独立阶段再统一接入 Current Bid 的专用编辑器。后续编辑器统一必须继续遵守：

- 复用 Current Bid 已有条件 editor。
- Standing 不提供收藏。
- Standing 的绝对日期区域保持空值和不可填写。
- Reserve Preference 只允许 `Whole Month / First Half / Second Half`。
- 不改变 Current Bid editor 的业务行为。

## 8. 错误处理与可访问性

- 加载失败使用页面级持久错误状态和恢复动作。
- 新增、编辑、删除的短时失败使用项目统一 message/toast 入口。
- `draftVersion` 冲突提示用户刷新后重试，不静默覆盖。
- 不向用户展示原始异常、Axios/RPC 信息或堆栈。
- 分类使用真正的 Tab 语义和键盘导航。
- 添加、编辑、删除操作提供明确 accessible name。
- 类型区分不只依赖颜色，同时显示文字标签。

## 9. 验收标准

1. Standing 页面不再显示 `Lineholder / Reserve` Tab。
2. 页面只有一个 `EXISTING STANDING BID` 和一个 `ADD STANDING BID`。
3. 分类只有 `All Properties / Days Off / Pairing / Roster / Reserve`。
4. 页面不显示 `Standing` 或 `FAVORITED PROPERTIES` 分类。
5. `301 / 312 / 313 / 314` 全部出现在 `Reserve` 分类。
6. Lineholder 与 Reserve Existing 条件可同时显示在统一列表中。
7. 新增、编辑、删除 Lineholder 条件只写 `StandingLineholder`。
8. 新增、编辑、删除 Reserve 条件只写 `StandingReserve`。
9. 所有 Standing 保存继续使用 `period_code = 'STANDING'`。
10. Standing 操作不会改变 Current Bid 数据、版本、收藏或页面缓存。
11. 页面 Existing、分类 Tab、搜索、Property 行和分页视觉与 Current Bid 一致。
12. 页面无左侧 Bidding Calendar、无大卡片、无胶囊分类按钮。
13. 1280、1366、1920 宽度下无横向溢出。

## 10. 验证策略

### 10.1 前端 focused tests

- mapper 正确合并两份 draft 和两份 catalog。
- mapper 保留两份完整且独立的 context 快照，共享 rows 不生成合并的 `draftMeta`。
- 每条 property 保留正确来源 context。
- Existing 合并行遵循固定的 Tier → 分类 → 来源 `rowSeq` → context → 稳定标识比较器。
- 分类为五个目标分类，Reserve 四项完整。
- 页面无模式 Tab、无 Standing 分类、无收藏。
- Lineholder / Reserve mutation 分别使用正确 mode 和 draftVersion。
- mutation payload 只由目标 context 的行重建，并保留该 context 自己的元数据。
- 一类保存失败不污染另一类页面数据。
- Standing 与 Current Bid 使用独立 query key；Standing mutation 不写入或失效 Current Bid cache。
- `409` 不自动覆盖；刷新重新加载两份 Standing draft，且不触碰 Current Bid cache。

### 10.2 后端回归

后端 contract 不变，但仍运行 Standing service / route focused tests，确认：

- 两类 context 继续独立保存。
- 非法跨 context property 被拒绝。
- 具体日期继续被拒绝。
- T1-T7 和版本冲突规则不变。

### 10.3 Playwright

使用真实 Portal UI 覆盖：

1. 页面没有 `Lineholder / Reserve` Tab。
2. 五个分类和 Reserve 四项条件可见。
3. 添加一个 Lineholder 条件，请求使用 `StandingLineholder`。
4. 添加一个 Reserve 条件，请求使用 `StandingReserve`。
5. 两类条件同时出现在统一 Existing 列表。
6. 编辑、删除分别写回正确 context。
7. 导航到 Current Bid，确认 Standing 操作没有改变 Current Bid。
8. 模拟目标 context 的 `409`，确认不会自动覆盖；执行刷新后重新加载两份 Standing draft，另一 context 的服务端已保存数据仍正常显示。
9. 观察请求或 query state，确认冲突刷新只调用 Standing current endpoint，不触发 Current Bid 重新加载或 mutation。
10. 视觉结构与 Bid 页一致并通过 1280 / 1366 / 1920 布局检查。

前端样式修改后必须运行 `npm run check:ui`，硬违规为零。

## 11. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次核心修改集中在 Standing page、mapper 和同一组前端测试，页面模型与 mutation routing 紧密耦合；并行编辑会增加冲突和错误合并风险。用户也明确要求按步骤推进。
- Suggested split: 单人依次完成页面模型、UI、focused tests、Playwright 和 QA 文档。
- Write boundaries: 主要限制在 `pbs-portal/src/features/standing-bid/**`、Standing E2E 和对应 QA 文档；只有确有必要时才最小扩展共享 Rule Bid presentation props。
- Conflict risk: Medium。共享 UI 组件可能影响 Current Bid，必须保持默认行为并跑回归。
- Execution gate: 书面 spec 经评审并由用户确认后，才制定实施计划和开始代码修改。
