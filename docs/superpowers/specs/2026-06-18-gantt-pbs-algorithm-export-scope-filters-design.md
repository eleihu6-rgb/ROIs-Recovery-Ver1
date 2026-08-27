# Gantt PBS Algorithm Export Scope Filters 设计

## 背景

Gantt 的 `PBS > PBS Admin > Admin Tools` 已接入 `Algorithm Export`，用于导出 PBS 保存规则算法包。当前导出只支持按 `periodCode` 导出完整 period 包，另有一个 YEG 14 crew 测试包走固定 crew scope。

用户希望把 `Algorithm Export` 做成更接近 Scenario 的 `Scope Filters` 卡片：Period 从已有 PBS period 下拉选择，导出时支持按 crew 维度过滤，包括 `Division`、`Status`、`Bases`、`Fleet Quals`。用户已确认不做日期范围筛选，导出范围仍由 PBS period 决定。

## 目标

1. `Algorithm Export` 的 `Period Code` 从手动输入改为下拉选择已有 PBS period。
2. 在 `Algorithm Export` 区域增加 `Scope Filters` 卡片，视觉参考 Scenario detail panel 的 `scenario-scope-filters`。
3. 第一版只实现 `Crew Filters`，字段包括：
   - `Division`
   - `Status`
   - `Bases`
   - `Fleet Quals`
4. 导出前根据这些条件解析出 crewIds，再把 crew scope 应用到算法包内所有相关 CSV：
   - `DAYSOFF.csv`
   - `PAIRING_SCORE.csv`
   - `RESERVE_SCORE.csv`
   - `LINE_RULES.csv`
5. 筛选条件只影响导出的 crew 范围，不改变 PBS period，也不引入日期范围。

## 非目标

- 不新增日期范围选择。
- 不做 Scenario 的 `Pairing Filters`。
- 不筛 pairing material 本身；pairing score / reserve score 内部仍按当前 rule 条件匹配 pairing。
- 不改变算法包文件结构、文件名主体或 CSV header。
- 不改变保存规则的业务含义。
- 不把 `RoCrewFilter` 组件直接绑定到 PBS admin 业务类型。
- 不处理 crew bid import 的 scope UI，本设计只覆盖 algorithm export。

## 用户界面设计

### 页面位置

入口保持不变：

```text
Top Nav: PBS
Sidebar: PBS Admin > Admin Tools
Section: Algorithm Export
```

### Algorithm Export 区块

`Algorithm Export` 区域改为两层：

1. 顶部操作行：
   - `Period Code` 下拉
   - `Current Package` 下载按钮
   - `YEG Test Package` 下载按钮
2. 下方 `Scope Filters` 卡片：
   - 标题：`Scope Filters`
   - 子区块：`Crew Filters`
   - 字段布局参考 Scenario 卡片

### Period 下拉

使用现有 period options 数据源。当前 `PbsAdminTools` 已调用 `fetchPeriodOptions()`，实现时应复用这份数据。

行为：

- 默认值优先使用当前已有默认值 `Jun 2026`，但如果 period options 中不存在，则使用 options 第一项。
- 下拉 label 使用 `periodCode`。
- 下载时必须有 period，否则按钮 disabled。

### Scope Filters 卡片

视觉参考：

```text
SCOPE FILTERS

⌄ Crew Filters

Division [All v]           Status [Active v]
Bases    [All bases v]     Fleet Quals [+ Add]

FILTER: * / * / * / ACTIVE
```

字段定义：

| 字段 | UI | 默认值 | 说明 |
| --- | --- | --- | --- |
| `Division` | Select | `ALL` | `P`=Pilots，`C`=Cabin，`A`=Airmarshal，`ALL`=不限制 |
| `Status` | Select | `ACTIVE` | `ACTIVE`=正常可用 crew，`ALL`=不限制 |
| `Bases` | MultiSelect | `[]` | 空数组代表 All bases |
| `Fleet Quals` | TagInput | `[]` | 空数组代表 all fleet quals |

FILTER 摘要格式：

```text
<division> / <bases> / <fleetQuals> / <status>
```

示例：

```text
* / * / * / ACTIVE
P / YEG,YVR / B737,A320 / ACTIVE
```

### 组件复用策略

推荐新建 PBS 专属小组件，例如：

```text
gantt/src/components/pbs/algorithm-export-scope-filters.tsx
```

复用基础 UI：

- `gantt/src/components/scenario/multi-select.tsx`
- `gantt/src/components/scenario/filter/tag-input.tsx`
- `gantt/src/components/scenario/filter/collapsible-section.tsx`
- `gantt/src/components/scenario/filter/use-base-options.ts`

不直接复用 `RoCrewFilter`，因为它绑定 `RoFilterParams['crew']`，直接引入会把 Scenario 类型耦合到 PBS admin。

## API 设计

### Query 参数

扩展现有接口：

```text
GET /api/admin/algorithm-export
GET /api/admin/algorithm-export/yeg-test-package
```

新增 query：

```typescript
type PbsAlgorithmExportQuery = {
  periodCode: string
  division?: 'P' | 'C' | 'A' | 'ALL'
  status?: 'ACTIVE' | 'ALL'
  bases?: string[]
  fleetQuals?: string[]
}
```

由于 GET query 需要 URL 编码，前端传参建议：

```text
periodCode=Jun%202026
division=ALL
status=ACTIVE
bases=YEG&bases=YVR
fleetQuals=B737&fleetQuals=A320
```

兼容策略：

- 不传新增字段时，等价于当前全量导出。
- `division=ALL` 不限制 division。
- `status=ALL` 不限制 status。
- `bases` 为空或缺省不限制 base。
- `fleetQuals` 为空或缺省不限制 fleet quals。

### YEG Test Package

`YEG Test Package` 保留原有固定 YEG 14 crew scope。新增筛选条件第一版只作用于 `Current Package`。

理由：

- YEG test package 是固定测试场景，继续保证可重复输出。
- 如果同时叠加用户筛选，容易让测试包因为筛选条件变空或缺 crew，破坏测试语义。

## 后端设计

### Scope 模型

扩展 `live-server/src/services/algorithm-export/export-scope.ts`：

```typescript
export type AlgorithmExportCrewFilters = {
  division?: 'P' | 'C' | 'A' | 'ALL'
  status?: 'ACTIVE' | 'ALL'
  bases?: readonly string[]
  fleetQuals?: readonly string[]
}

export type AlgorithmExportScope = {
  crewIds?: readonly string[]
  crewSortRank?: ReadonlyMap<string, number>
  filters?: AlgorithmExportCrewFilters
}
```

第一版推荐不要把复杂 filter SQL 分散塞进 4 个 CSV query，而是在 service 层先解析 crew scope：

```text
query filters -> load matching crewIds -> AlgorithmExportScope.crewIds -> existing CSV exporters
```

这样可复用当前已存在的 `buildCrewScopeSql(scope.crewIds)`，减少修改面。

### Crew 筛选来源

推荐 crewIds 查询逻辑：

```text
from <pbsSchema>.pbs_bid b
join <pbsSchema>.pbs_user u on u.crew_id = b.crew_id
left join <liveSchema>.crew c on c.crew_id = b.crew_id
where b.period_code = :periodCode
  and b.bid_context = 'Current'
  and division filter
  and status filter
  and bases filter
  and fleet quals exists filter
```

字段语义：

| 筛选 | 来源 | 语义 |
| --- | --- | --- |
| `Division` | 优先 `pbs_user.division`，必要时可 fallback `crew.division` | `ALL` 不限制 |
| `Status=ACTIVE` | `pbs_user.status = 0` 且 `pbs_user.eff_dt <= now()` 且 `(exp_dt is null or exp_dt > now())` | `ALL` 不限制 |
| `Bases` | `pbs_user.base` | 多选 OR |
| `Fleet Quals` | `liveSchema.crew_fleet.fleet_specific` | 多选 OR，当前有效：`eff_dt <= now()` 且 `(exp_dt is null or exp_dt > now())` |

排序：

- 默认按 `crew_id` 排序，与当前导出保持稳定。
- YEG test package 保持原有 `crewSortRank`。

### 空结果处理

如果筛选条件解析出来的 crewIds 为空：

- 仍返回 `.tgz` 文件。
- 4 个 CSV 只含 header 或空内容，沿用当前 exporter 对空数据的处理。
- 前端不额外阻止下载。

理由：这是 admin 工具，空包能明确表达“当前筛选没有匹配 crew”，也避免把“无数据”当接口异常。

### 安全与校验

后端 query 校验：

- `periodCode` 必填。
- `division` 只允许 `P/C/A/ALL`。
- `status` 只允许 `ACTIVE/ALL`。
- `bases` 与 `fleetQuals` trim 后去空、去重、统一大写。
- 数组长度建议限制为 50，避免异常 URL 或过大 SQL 参数。
- 不接受任意 SQL 片段；所有值使用参数化查询。

## 前端设计

### State

在 `PbsAdminTools` 中为 algorithm export 新增状态：

```typescript
type AlgorithmExportFilters = {
  division: 'P' | 'C' | 'A' | 'ALL'
  status: 'ACTIVE' | 'ALL'
  bases: string[]
  fleetQuals: string[]
}
```

默认：

```typescript
{
  division: 'ALL',
  status: 'ACTIVE',
  bases: [],
  fleetQuals: [],
}
```

### API client

扩展：

```text
gantt/src/services/pbs-admin-tools-api.ts
```

`downloadAlgorithmPackage(periodCode, variant, filters)` 负责把数组 query 编码为重复参数：

```text
bases=YEG&bases=YVR
fleetQuals=B737&fleetQuals=A320
```

### UI 行为

- `Current Package` 带 filters 下载。
- `YEG Test Package` 不带 filters，并在按钮附近或 tooltip 里保持测试包固定语义。
- 更改 filter 后，不自动下载，用户点击按钮后才请求。
- FILTER 摘要实时更新。

## 测试与验证

### 前端

1. `gantt && npx tsc --noEmit`
2. 浏览器检查：
   - `Admin Tools > Algorithm Export` 显示 `Scope Filters`。
   - Period 是下拉，不是纯文本输入。
   - Division / Status / Bases / Fleet Quals 可操作。
   - FILTER 摘要随选择变化。
   - 点击 `Current Package` 请求 URL 带 query filters。

### 后端

1. 新增或扩展 algorithm export service 测试：
   - 不传 filter 等价全量。
   - `division=P` 只返回 pilot crew。
   - `bases=YEG` 只返回 YEG crew。
   - `fleetQuals=B737` 只返回当前有效 B737 crew。
   - `status=ACTIVE` 排除禁用/过期账号。
   - 多选 base/fleet 为 OR。
2. `live-server` 新增文件路径不应产生 TS 编译错误。
3. 浏览器 smoke：
   - 用筛选条件导出 `Current Package` 成功下载 `.tgz`。

## 风险与注意事项

1. `pbs_user` 是 PBS 投影表，可能与 live `crew` 数据存在同步滞后；本功能以 PBS 管理导出为准，优先使用 `pbs_user`。
2. `Fleet Quals` 来自 live `crew_fleet`，如果该表缺数据，筛选结果可能为空。
3. `Status=ACTIVE` 的“active”语义已按用户确认解释为 PBS 用户正常账号且未过期，不是 `pbs_bid.status`。
4. YEG test package 不叠加用户筛选，避免固定测试包被破坏。
5. 当前 full build 可能仍受仓库已有 unrelated TS 错误影响，验证时需要区分新改动路径与既有错误。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本任务跨前端 UI、API query、后端 scope，但文件数量有限且接口契约需要连续一致；拆分会增加集成成本。
- Suggested split: 不拆分。
- Write boundaries: 单 agent 修改 `gantt/src/components/pbs/`、`gantt/src/services/pbs-admin-tools-api.ts`、`packages/contracts/pbs-algorithm-export.*`、`live-server/src/routes/admin/pbs-algorithm-export.ts`、`live-server/src/services/algorithm-export/`。
- Conflict risk: 中等。当前工作区已有 PBS admin 相关未提交改动，需要在现有基础上继续修改，不能重置。
- Execution gate: 用户确认本 spec 后再实现。

## 验收标准

1. 用户能在 `Admin Tools > Algorithm Export` 选择 PBS period。
2. 用户能用 Scenario 风格的 `Scope Filters` 配置 crew scope。
3. `Current Package` 下载请求携带筛选条件。
4. 后端根据 `Division / Status / Bases / Fleet Quals` 筛出 crewIds。
5. 4 个导出 CSV 都只包含匹配 crew 的规则数据。
6. 不选择任何筛选时，导出结果与当前行为保持一致。
7. 不引入日期范围。
8. `YEG Test Package` 仍保持固定 YEG 14 crew 测试包行为。
