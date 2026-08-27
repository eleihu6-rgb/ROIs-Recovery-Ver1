# PBS Pairing All Pairings 浏览与添加入口设计

日期：2026-06-25  
状态：待用户 review，未进入实现  
范围：PBS Portal Pairing 页新增 `ALL PAIRINGS` 入口，复用 Search Pairings 页面浏览当前用户可见 pairing，并支持把选中的 pairing 保存为 `Pairing Number` 条件。

## 背景

用户反馈在 Pairing 页面无法方便地看到当前 bid period 下有哪些任务环，导致挑选 pairing 时需要依赖记忆或额外查询。现有 `/pairing/search` 页面已经具备 pairing 结果列表、分页、详情卡和从条件 preview 进入的能力，但“无条件进入”时只显示空壳，不会自动加载所有可见 pairing。

当前代码状态：

- Pairing 页已有 `/pairing/search` 路由。
- Existing rules 和单个 available property 已经可以跳转到 Search Pairings 进行 preview。
- `POST /pairing-search/preview` 当前支持：
  - 单条件 preview。
  - `current_rules` preview。
  - `criteria` preview。
- 后端 `criteria` preview 目前拒绝空条件，返回 `Add at least one pairing search criterion.`。

因此本功能需要一个明确的 “all pairings” 搜索模式，而不是把空 criteria 当作隐式全量查询。

## 目标

1. 在 Pairing 页 `ADD PAIRING PROPERTIES` 区域增加 `ALL PAIRINGS` 按钮。
2. 点击按钮后进入现有 `/pairing/search` 页面。
3. Search Pairings 页面自动展示当前用户可见的 pairing 列表。
4. “所有 pairing” 必须受当前系统限制过滤，不展示全库数据：
   - 当前 bid period / `periodCode`。
   - 当前登录用户对应的 base。
   - 当前登录用户对应的 rank / composition 可见范围。
   - `is_deleted = 0`。
5. 用户可以从结果中选择某个 pairing，并保存成 `Pairing Number` 条件。
6. 保存后的数据结构必须与用户手动在 Pairing 页面添加 `Pairing Number` 条件一致。

## 非目标

- 不新建独立 All Pairings 页面。
- 不绕过现有 Search Pairings 结果卡和分页组件。
- 不展示全库 pairing。
- 不改变现有 `SEARCH PAIRINGS` current rules preview 行为。
- 不改变现有单条件 preview、criteria preview 的语义。
- 不引入旧数据兼容或迁移。

## 用户流程

### 浏览流程

1. 用户进入 Pairing 页面。
2. 在 `ADD PAIRING PROPERTIES` 区域看到搜索框和 `ALL PAIRINGS` 按钮。
3. 点击 `ALL PAIRINGS`。
4. 系统跳转到 `/pairing/search`。
5. Search Pairings 页面以 `all-pairings` 模式加载当前用户可见 pairing。
6. 用户可以翻页、查看 pairing detail card。

### 添加流程

1. 用户在 Search Pairings 页面找到目标 pairing。
2. 点击结果卡上的 `ADD PAIRING`。
3. 系统弹出 tier 选择。
4. 用户选择目标 tier。
5. 系统保存为 `Pairing Number` 条件。
6. 保存成功后建议回到 `/pairing` 页面，并显示成功提示。
7. Pairing 页 `EXISTING PAIRING PROPERTIES` 中出现新增的 `Pairing Number` 条件。

## UI 设计

### Pairing 页入口

位置：`ADD PAIRING PROPERTIES` 区域，现有 search input 左侧。

按钮文案：

```text
ALL PAIRINGS
```

布局建议：

- 与现有搜索框同一行。
- 按钮使用和现有功能按钮一致的高度、圆角、字号。
- 搜索框保留原有行为，只负责过滤 available pairing properties。
- `ALL PAIRINGS` 不改变当前 available property tab，不重置用户输入。

### Search Pairings 页面

新增 all-pairings 展示模式：

- 页面标题继续使用 `Search Pairings`。
- Criteria 区域不要显示误导性的 `No search criteria selected.`。
- 可以显示一条轻量说明，例如：

```text
Showing all pairings available for this bid period.
```

如果不想新增说明，也可以在 all-pairings 模式下折叠 Criteria 区域，只保留 results 区域。

结果卡动作：

```text
ADD PAIRING
```

动作语义：把该 pairing 保存成 `Pairing Number` 条件，而不是只加入临时 search criteria。

## API 设计

复用现有接口：

```text
POST /pairing-search/preview
```

新增 preview payload：

```json
{
  "periodCode": "Jun 2026",
  "preview": {
    "mode": "all_pairings",
    "page": 1,
    "pageSize": 30
  }
}
```

响应继续复用 `PbsSearchPairingsPreviewResponse`：

```json
{
  "mode": "all_pairings_preview",
  "summary": {
    "pairingIdCount": 120,
    "totalItems": 280
  },
  "pagination": {
    "page": 1,
    "pageSize": 30,
    "totalItems": 280,
    "totalPages": 10
  },
  "results": []
}
```

### 后端查询语义

`all_pairings` 不传业务条件，后端查询 condition 可使用恒真条件：

```sql
true
```

但必须继续应用 `executePreviewQuery` 当前公共过滤：

- `p.is_deleted = 0`
- `p.base = actorBase`
- actor rank filter
- bid period date range filter

这样它等价于“当前用户可见的所有 pairing”，不是数据库全量 pairing。

## 前端状态设计

`PairingSearchLocationState` 扩展：

```ts
previewMode?: "current-rules" | "all-pairings";
```

进入 all-pairings 时传递：

```ts
{
  previewMode: "all-pairings",
  draftMeta
}
```

Search 页面派生：

```ts
const isAllPairingsPreview = locationState?.previewMode === "all-pairings";
```

query enable 条件：

- `all-pairings` 模式只要求 `periodCode` 有值。
- 不要求 `criteriaItems.length > 0`。

query fn：

- `all-pairings` 调用新的 `pairingService.previewAllPairings(page, pageSize, periodCode)`。
- `current-rules` 和 `criteria` 保持现状。

## 保存 Pairing Number 条件

从 result card 添加 pairing 时，需要构造与手动添加 `Pairing Number` 一致的 draft property。

建议保存为 `pairing-id-list`：

```json
{
  "type": "pairing-id-list",
  "pairingIds": ["T4520"],
  "pairingLabels": ["T4520"]
}
```

如果结果对象中同时有稳定内部 pairing id 和显示 pairing number，应遵循当前手动输入 `Pairing Number` 的存储规则：

- 展示给用户的是 pairing number / label。
- 保存结构必须与 `Pairing Number` 手动弹窗保存后的结构一致。
- 不再新增一套 all-pairings 专用 bid 结构。

保存 API 复用现有 Pairing draft property add 流程：

```text
pairingService.addCurrentDraftProperty(...)
```

保存成功后：

- 同步 draft identity。
- invalidate pairing calendar / pool count 相关 query。
- 回到 `/pairing`。

## 数据流

```text
Pairing Page
  -> click ALL PAIRINGS
  -> navigate("/pairing/search", { previewMode: "all-pairings", draftMeta })
  -> Search Pairings Page
  -> POST /pairing-search/preview { mode: "all_pairings" }
  -> render pairing cards
  -> click ADD PAIRING
  -> choose tier
  -> add Pairing Number property
  -> navigate("/pairing")
```

## 错误处理

- all-pairings 查询失败：复用现有 Search Pairings preview error UI。
- 无结果：显示现有 empty results 状态，文案可保持 `0 pairing numbers, 0 total results`。
- 保存失败：复用 `pairing.message.addPropertyError`。
- draftMeta 缺失：显示错误提示，不执行保存。
- 用户未选择 tier：tier dialog 不允许确认或保持默认 T1。

## 测试范围

### 后端

1. `POST /pairing-search/preview` 接受 `mode: "all_pairings"`。
2. all-pairings mode 返回 `all_pairings_preview` metadata。
3. all-pairings mode 仍应用 actor base、rank 和 periodCode 过滤。
4. all-pairings mode 支持分页。
5. 现有 `criteria` 空条件仍保持拒绝，避免语义混淆。

### 前端单测

1. Pairing 页渲染 `ALL PAIRINGS` 按钮。
2. 点击 `ALL PAIRINGS` 跳转 `/pairing/search`，state 包含 `previewMode: "all-pairings"`。
3. Search Pairings all-pairings 模式会请求 all-pairings preview。
4. all-pairings 模式不显示 `No search criteria selected.`。
5. 点击结果卡 `ADD PAIRING` 后弹出 tier 选择。
6. 确认后保存为 `Pairing Number` 条件。

### Playwright / E2E

1. 打开 Pairing 页面。
2. 点击 `ALL PAIRINGS`。
3. 验证进入 Search Pairings 页面并展示结果。
4. 选择一个 pairing。
5. 选择 tier 并保存。
6. 验证回到 Pairing 页面后 Existing Pairing Properties 出现 `Pairing Number` 条件。

## 验收标准

1. 用户可以从 Pairing 页进入 all-pairings 浏览。
2. 展示结果只包含当前用户可见范围内的 pairing。
3. 用户可以从结果中添加 pairing。
4. 添加后生成的 `Pairing Number` 条件与手动添加一致。
5. 现有 search criteria、current rules preview、available property 搜索不受影响。
6. 前端 build 和相关测试通过。

## 风险与注意事项

1. `Pairing Number` 当前存在 pairing number / internal pairing id / occurrence id 的语义差异，实现时必须复用手动添加的 mapper，避免再次出现导入与手动存储不一致的问题。
2. all-pairings 不能绕过 actor base/rank/period 过滤，否则会泄露用户不可见 pairing。
3. Search Pairings 页面已有多种 preview mode，新增 mode 时要避免影响 `current-rules` 和 `criteria` 的 query enable 判断。
4. 如果 result card 当前没有足够的 add action 扩展点，优先小范围扩展组件 props，不重写 card。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动虽然跨 contract、pbs-server、pbs-portal 和测试，但核心是同一个 `all_pairings` preview contract 与一个用户流程。拆多 agent 容易造成 contract、前端 state 和保存结构不一致。
- Suggested split: 暂不拆分。
- Write boundaries: `packages/contracts/pbs-search-pairings.*`、`pbs-server/src/routes/pairing-search.ts`、`pbs-server/src/services/pairing-search/*`、`pbs-portal/src/features/pairing/*`、相关测试和 E2E。
- Conflict risk: Medium。主要风险在 Search Pairings 页面已有 preview modes 和 `Pairing Number` 存储语义。
- Execution gate: 用户 review 本 spec 并确认后，再进入实现。
