# PBS Pairing 搜索结果筛选组件化设计

## 1. 背景与目标

PBS Portal 的 `Search Pairings` 页面目前使用普通输入框筛选 Pairing Number、日期和 Airport，用户需要记忆并手工输入值。本次将筛选区改为可选择的控件：

- `Pairing Number`：支持远程搜索和多选。
- `Airport`：支持搜索当前 Base、当前 Period 可用机场并多选。
- `Date From / Date To`：合并为共享 Date Range 选择器。
- `Time From / Time To`：继续使用现有时间选择器。

## 2. 范围与非目标

### 范围

- PBS Portal 搜索结果筛选 UI、状态和请求映射。
- Pairing 搜索共享合同、pbs-server 入参校验和 SQL 条件。
- 前端测试、后端测试和真实 UI Playwright 回归。

### 非目标

- 不改变 Search Criteria、Bid 属性或算法输入。
- 不改变 Pairing 搜索基础的 Base、Rank、Roster Period 限制。
- 不修改数据库结构，不需要 migration。
- 不重做搜索结果卡片、分页或时间选择器。

## 3. 交互设计

### Pairing Number

- 使用可搜索多选组件，输入至少一个字符后调用现有 Pairing Number autocomplete API。
- 选项展示 Pairing Number 和有效日期信息；选择后显示为可删除标签。
- 请求使用标准化后的 Pairing Number，而不是让用户自由提交任意文本。

### Airport

- 与 Pairing Number 共用同一个可搜索多选组件。
- 复用现有 airport-options 路由，并扩展响应增加专供结果筛选的 `filterAirports`。该列表覆盖当前 Base、当前 Period 中所有航段的 departure、arrival、duty-start、duty-end 机场并去重，确保选项范围与后端筛选谓词一致。
- 选择后显示机场代码标签，不接受选项外的自由文本。

### Date Range

- 使用现有共享 `PbsDatePicker`，`mode="range"`。
- 起止日期保持现有 `originDateFrom`、`originDateTo` 请求含义，并受当前 Period 日历范围约束。

### 其他交互

- `Clear` 一次清除 Pairing Number、Airport、Date Range 和时间范围。
- 修改任一筛选后保持现有 debounce、重置到第 1 页并重新请求的行为。
- 加载、空结果和请求失败在对应下拉组件内展示稳定文案，不暴露原始异常。
- 键盘可打开、搜索、选择和删除选项；控件提供 combobox/listbox 可访问语义。

## 4. 过滤语义与 API 合同

共享 `PbsSearchPairingsPreviewFilters` 增加：

```ts
pairingNumbers?: string[]
airports?: string[]
```

兼容策略：

- 暂时保留现有 `pairingNumber?: string`、`airport?: string`，避免旧调用立即失效。
- 非空 `pairingNumbers` 使用外部展示编号的精确 OR；否则 `pairingNumber` 继续使用原有模糊 `LIKE` 语义。
- 非空 `airports` 使用机场代码精确 OR；否则 `airport` 继续使用原有单值精确语义。
- 新旧字段同时存在时数组优先，不把旧单值合并进数组，避免改变旧字段语义。
- pbs-server 对数组做 trim、uppercase 和去重。每个数组最多 50 项；Pairing Number 每项 1–32 字符；Airport 每项必须匹配 `^[A-Z0-9]{2,4}$`。
- Portal 新 UI 只发送数组字段。

SQL 语义：

- `pairingNumbers` 内部为 OR：精确复用 autocomplete 的 `buildPairingExternalLabelExpression`（合法 `interface_id` 优先，否则 `pairing_label`）匹配任意所选值；不使用内部 `p.id`，也不使用会回退到 `p.id` 的 display expression。
- `airports` 内部为 OR：任一航段的 departure、arrival、duty-start 或 duty-end airport 命中任一所选值。
- Pairing Number、Airport、Date Range、Time Range 以及既有基础条件之间均为 AND。
- 继续参数化 SQL，不拼接用户值。

示例：选择 `T4520 / T4528` 与 `YVR / YYZ`，含义为：

```text
(Pairing Number = T4520 OR T4528)
AND
(Airport = YVR OR YYZ)
AND
其他日期、时间和基础范围条件
```

## 5. 组件与数据流

### 前端

- 在 pairing feature 内新增小型结果筛选多选组件，Pairing Number 和 Airport 共用。
- `PairingResultFiltersBar` 负责组合两个多选组件、`PbsDatePicker`、现有时间输入和 Clear。
- `SearchPairingsPage` 继续持有筛选状态、debounce、分页重置和 preview query，不新增第二套数据流。
- Pairing Number 复用 `pairingService.searchPairingIds`；Airport 复用 `pairingService.getAirportOptions` 新增的 `filterAirports`，原有 landing、layover、work-start 和 Airport Preference 字段保持兼容。

### 后端

- 合同与 route schema 接受有长度和格式边界的数组字段并保留旧单值字段。
- preview query builder 将多选数组映射为参数化 OR 条件。
- airport-options 查询扩展 `filterAirports` 数据，不新增路由或新的数据库访问链路。

## 6. 测试与验收

### 自动化测试

- Portal 组件/页面测试：搜索并选择多个 Pairing Number、多个 Airport、删除标签、Date Range、Clear、分页重置和请求 payload。
- pbs-server route/service/query 测试：数组校验、规范化、空白项、重复项、超限、格式错误、新旧字段优先级、同字段 OR、跨字段 AND、旧单值兼容和参数化 SQL。
- airport-options 后端测试覆盖普通 departure、arrival、非首 duty-start 和 duty-end，确保 `filterAirports` 与筛选谓词闭合。
- Playwright：通过真实页面选择两个 Pairing Number、两个 Airport 和 Date Range，验证请求及结果刷新；验证 Clear。
- 新增人工测试用例 `docs/test-cases/pbs/pairing/2026-08-04-search-result-filter-controls.md`。
- 动态 SQL 按 `generated-sql-safety-standard` 完成 fixture/结构检查、远端 PostgreSQL `EXPLAIN` 或最小只读执行，以及 preview HTTP smoke。
- 执行 pbs-portal `npm test`、`npm run lint`、`npm run build`，pbs-server TypeScript 与相关测试，以及根目录 `npm run check:ui`。

### 验收标准

- Pairing Number 和 Airport 均可搜索、多选、删除选择。
- 同字段 OR、跨字段 AND，服务器分页总数正确。
- 日期不再依赖手工输入，使用统一 Date Range。
- 时间、分页、Clear 和现有 Search Pairings 流程不回归。
- 所有必需检查通过且无 UI hard violation。

## 7. 风险与控制

- Airport 选项必须限定当前 Base 和 Period，避免展示无效值。
- `filterAirports` 必须覆盖筛选 SQL 检查的 departure、arrival、duty-start、duty-end 四类字段，不能只复用现有 landing/layover 子集。
- Pairing Number 必须与 autocomplete 共用 `buildPairingExternalLabelExpression`，确保 `interface_id` 与 `pairing_label` 的优先级完全一致，且不能回退或误用数据库内部 Pairing ID。
- 多选数组必须参数化传入 PostgreSQL，禁止动态拼接 SQL 值。
- 保留旧单值字段只是兼容措施，新 Portal 不再生成自由文本筛选值。

## 8. Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 前端控件与后端合同/查询可以独立实现，并在集成测试阶段汇合。
- Suggested split: Agent A 负责 `pbs-portal` 组件及前端测试；Agent B 负责 `packages/contracts`、`pbs-server` 和后端测试；主 Agent 负责集成、Playwright 与最终验证。
- Write boundaries: 两个实现 Agent 不编辑对方目录；主 Agent 只在集成阶段处理跨层适配。
- Conflict risk: Low，主要交汇点是最终合同字段名称与请求 payload。
- Execution gate: spec 审查通过并由用户明确批准后开始。
