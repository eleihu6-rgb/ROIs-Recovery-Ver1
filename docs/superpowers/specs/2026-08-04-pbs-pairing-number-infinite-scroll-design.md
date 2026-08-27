# PBS Pairing Number 无限滚动选择设计

## 目标

改善 `Search Pairings` 页面结果筛选区的 `Pairing Number` 多选体验：用户不输入内容时，点击下拉框即可浏览当前可用 Pairing Number，并可持续向下滚动选择；输入内容后继续支持远程搜索。

## 范围

- 仅修改 `All Pairings` 结果筛选区的 `Pairing Number` 下拉框。
- `Airport`、`Date Range`、`Time From/To` 的行为不变。
- 不引入 Ant Design 或新的第三方依赖。
- 不修改数据库结构，不需要 migration。

## 交互设计

1. 点击空白的 `Pairing Number` 控件时，立即加载并展示前 30 个选项，不再显示重复的 `Search Pairing Number` 空提示。
2. 默认选项限定在当前 bid period、登录用户的 Base 和 Rank，按 Pairing Number 升序排列。
3. 下拉列表接近底部时自动加载下一批 30 个选项，直到没有更多数据。
4. 输入搜索词后等待 300ms，清空旧分页并从第一页远程搜索；继续滚动时加载该搜索词的下一页。
5. 选择后保留现有多选标签；已加载的已选 Pairing Number 仍保留在下拉列表的自然排序位置，以勾选状态和 `aria-selected=true` 表达。再次点击可取消选择，这与常见多选 Select 行为一致。
6. 下拉列表使用固定行高的窗口化渲染，只渲染可见行及少量 overscan；即使用户持续加载大量选项，也不同时创建上万个 DOM 节点。
7. 组件保持标准 `combobox -> listbox -> option` 语义，维护 `aria-expanded`、`aria-controls`、`aria-activedescendant`、`aria-selected`、`aria-setsize` 和 `aria-posinset`。键盘支持上下方向键、Home/End、Enter 和 Esc；激活项必须自动滚入并保持在虚拟窗口中。`Home` 定位当前已加载首项；`End` 只定位当前已加载末项并异步预取下一页，禁止为了 End 顺序拉取全部数据。
8. 首批加载失败时显示下拉局部错误态和可访问的 Retry；后续加载失败时在列表底部显示 Retry，不影响已加载选项和已选值。Retry/加载期间禁止重复请求。

## 后端契约与查询

新增结果筛选专用的 Pairing Number 选项读取接口，避免改变现有 Pairing Bid/Occurrence 自动完成接口的语义。

- 请求：`periodCode`、可选 `query`、可选 `cursor`、`limit`（前端固定 30，后端最大 50）。
- 响应：`options: Array<{ value: string; label: string }>`、`nextCursor: string | null`、`totalCount`。`totalCount` 是 Base/Rank/period/query 和规范化去重生效后、cursor 条件生效前的当前 best-effort 总数；已选项仍属于总数和 listbox 位置。
- `value` 使用现有 external pairing label 口径：优先 `interface_id`，回退 `pairing_label`，禁止使用内部 `pairing.id`。
- 使用 `upper(trim(external pairing label))` 作为返回值、去重键和唯一升序排序键；大小写不同但规范化后相同的标签只返回一次。
- 返回当前 period、actor Base/Rank 范围内去重后的 Pairing Number。
- 游标采用版本化 base64url JSON，至少包含版本、最后一个规范化 Pairing Number、规范化 query、periodCode 和服务端派生的 scope fingerprint。fingerprint 基于游标版本及当前 actor Base/Rank 生成；后端解码后校验格式以及 query/periodCode/scope 是否与当前请求一致。畸形、跨用户范围或条件不匹配返回受控 400，不执行选项 SQL。
- 下一页使用参数化的 `normalized_label > cursor.lastLabel`，并按同一规范化标签升序；查询按 `limit + 1` 判断是否存在下一页，避免深分页的高成本 `OFFSET`。由于排序键在结果集中已去重，因此跨页没有同值歧义。
- 无数据库快照的并发约定：滚动期间新增且排在游标之前的标签不会补入当前会话；重新打开下拉或改变搜索条件后重新查询。既有页不得重复或漏掉游标之后的稳定数据。
- 搜索继续使用转义后的大小写无关包含匹配；空搜索不执行无边界全量返回，只返回一页。

## 前端结构

- 扩展结果筛选多选组件，使远程数据源支持 `initial page + next cursor + fetch next page`。
- 使用 TanStack Query 的无限查询能力管理分页、请求去重和加载状态。
- Pairing Number 接入新选项接口；Airport 继续使用当前本地选项数组，不受影响。
- 搜索词或 period 变化时，缓存键随条件变化并取消/忽略旧请求响应，列表回到首批，避免不同条件之间串数据。
- 同一次打开期间保留已经加载的最小选项对象，支持用户向上回滚；虚拟窗口限制 DOM 数量。关闭下拉时先取消该 query key 的全部 in-flight 请求，再移除该次无限查询缓存，释放全部分页数组；迟到响应不得复写缓存或已关闭组件状态。已选值保存在筛选状态中，不随缓存释放丢失，重新打开时从首批加载并按值恢复已加载 option 的选中状态。
- 预期当前周期通常远少于一万条；即使加载一万条，也只保留两个短字符串字段，不保存日期或 Pairing 明细。不得把完整 Pairing 卡片数据放入该缓存。

## 验收标准

- 空输入点击 Pairing Number，能看到可选 Pairing Number。
- 不输入任何文字，持续滚动可以加载并选择后续 Pairing Number。
- 输入内容后只显示匹配项，并能继续滚动加载更多匹配项。
- 多选结果仍按 `pairingNumbers[]` 发送到 Preview API。
- 大量选项加载后，下拉 DOM 只保留可见窗口数量级的 option。
- 键盘可以浏览、选择和关闭虚拟列表；End 仅移动到已加载末项并预取下一页，不引发全量读取。读屏可获知当前位置、当前 best-effort 总数与选中状态。
- 关闭下拉后分页缓存被清理，再次打开从首批重新加载，已选标签保持不变。
- 当前 Airport、Date Range、Time 和 Clear 行为无回归。

## 验证

- 后端：游标首批/下一批连续页无重无漏、大小写重复标签、空查询、搜索查询、Base/Rank/period 限制、scope fingerprint、畸形游标和条件不匹配游标测试；验证 `totalCount` 在 cursor 之前计算且为去重后的范围总数。
- 前端：空输入首批加载、滚动加载、搜索重置、过期响应忽略、选择/取消后总数与位置语义、首批及后续页错误重试、防重复 fetch、关闭时取消请求并清理缓存测试。
- 无障碍：组件测试覆盖全部 ARIA 关系以及上下/Home/End/Enter/Esc；虚拟滚动时激活 option 始终挂载；End 只允许一次下一页预取，不允许触发连续全量加载。
- Playwright：真实点击空下拉、滚动触发第二页、键盘选择第二页选项，并确认 Preview 请求携带所选值。
- 动态 SQL门禁：fixture/结构完整性检查、generated SQL coverage、远端 PostgreSQL `EXPLAIN` 或最小只读执行，以及 Pairing Number 选项 HTTP smoke 均须通过。
- 执行 Portal test/lint/build、PBS Server test/TypeScript 和 `npm run check:ui`。
- 新增或更新 `docs/test-cases/pbs/pairing/` 下对应 QA 人工测试案例，覆盖空输入滚动、搜索、键盘、错误恢复和既有筛选回归。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: API 游标、前端无限查询与同一个下拉组件紧密耦合，串行实现和验证更安全。
- Suggested split: 不拆分。
- Write boundaries: PBS contract/server、Portal 组件/service/tests、E2E/QA 文档。
- Conflict risk: Low，但当前工作区已有上一阶段未提交改动，必须在同一差异范围内谨慎追加。
- Execution gate: 本规格审查通过并由用户确认后实施。
