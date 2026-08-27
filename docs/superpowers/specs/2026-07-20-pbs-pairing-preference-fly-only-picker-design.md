# PBS Pairing Preference 仅展示 FLY Pairing 设计

## 1. 背景

`Pairing Preference` 的可选 Pairing 表格当前复用 `all_pairings` 预览查询。该查询会按登录用户的 Base、Rank 和 bid period 过滤，但不会区分 `pairing.assignment_group`，因此 Jun 2026 候选列表同时包含：

- `FLY`：正常飞行 Pairing。
- `RES`：CRAM、CRPM、PRAM、PRPM 等 Reserve Pairing。
- `GRD`：地面任务 Pairing。

参考项目将 Pairing Score 与 Reserve Score 分开处理。`Pairing Preference` 应只允许员工选择正常飞行 Pairing，不应把 Reserve 或 Ground 任务作为候选。

## 2. 目标

将 `Pairing Preference` 的候选表格限制为：

```text
pairing.assignment_group = 'FLY'
```

最终效果：

- 不显示 `RES` Pairing。
- 不显示 `GRD` Pairing。
- 搜索、Filters、分页和总数全部基于 FLY 候选集合计算。
- 现有 Pairing ID 保存与回显语义保持不变。

## 3. 范围

### 3.1 包含

- `PairingPreferencePicker` 发起的 `all_pairings` 请求。
- Pairing Search contract 中用于表达 picker 候选范围的内部请求字段。
- `pbs-server` all-pairings 查询对该范围字段的校验和 SQL 过滤。
- 前端组件测试、后端服务测试和真实 Playwright 回归。
- Pairing Preference QA 人工测试文档。

### 3.2 不包含

- 不改变独立 `SEARCH PAIRINGS` 页面默认的 All Pairings 候选范围。
- 不改变其他 Pairing condition 的搜索 matcher。
- 不改变 Current Rules 的 AND / OR / Award / Avoid 搜索语义。
- 不改变 Pairing 详情接口。
- 不改变 Pairing Preference 保存的 `pairingIds` payload。
- 不修改算法导入或导出。
- 不修改数据库 schema、seed 或 migration。
- 项目尚未上线，不兼容历史上已保存的非 FLY Pairing Preference 数据。

## 4. 方案比较

### 方案 A：Picker 请求携带 FLY-only 范围标记（采用）

`PairingPreferencePicker` 在调用 `previewAllPairings` 时传递明确的候选范围，例如 `pairingScope: "fly"`。后端在数据库分页和统计前增加：

```sql
and upper(btrim(p.assignment_group)) = 'FLY'
```

优点：

- 只影响 Pairing Preference picker。
- 总数、分页、搜索和 Filters 都准确。
- 不会改变独立 Search Pairings 页面。
- 行为由后端保证，前端无法误选非 FLY 数据。

### 方案 B：所有 Pairing Search 全局只显示 FLY（不采用）

在 `executePreviewQuery` 的基础候选池全局增加 FLY 条件。

问题：

- 会改变 All Pairings、Current Rules 和其他条件搜索的现有范围。
- 影响面超过本需求。

### 方案 C：前端收到结果后过滤（不采用）

在 `PairingPreferencePicker` 中删除非 FLY rows。

问题：

- 后端 `totalItems` 和 `totalPages` 仍包含 RES/GRD。
- 每页可能出现数量不足或空页。
- Select All 和跨页选择行为不可靠。

## 5. 数据与接口设计

### 5.1 请求

在 `PbsSearchPairingsPreviewFilters` 增加受控的内部候选范围字段：

```ts
pairingScope?: "fly";
```

只有 `PairingPreferencePicker` 发送。字段的完整 wire path 是：

```ts
{
  preview: {
    mode: "all_pairings",
    filters: {
      pairingScope: "fly",
      // 其余 query/date/time/days/credit filters
    },
  },
}
```

`pairingService.previewAllPairings` 必须把 picker 传入的字段保留在真实 POST body 的
`preview.filters.pairingScope` 中；`pbs-server` 的 `allPairingsFiltersSchema` 必须显式接受
`z.literal("fly").optional()`。独立 Search Pairings 页面不发送该字段，因此保持当前行为。

### 5.2 后端查询

`buildAllPairingsResultFilter` 在 `pairingScope === "fly"` 时生成 FLY 条件。该条件必须在 SQL 查询内、分页前生效，使以下值均只基于 FLY：

- `summary.totalItems`
- `summary.pairingIdCount`
- `pagination.totalItems`
- `pagination.totalPages`
- 当前页 `results`

候选范围与现有筛选条件使用 AND 组合：

```text
Base
AND Rank
AND Bid Period
AND assignment_group = FLY
AND Query/Date/Time/Days/Credit filters
```

### 5.3 Reserve 识别说明

本需求不是通过 CRAM、CRPM、PRAM、PRPM 文案前缀过滤，而是正向限定 `assignment_group='FLY'`。这样可以同时排除：

- 当前和未来的 Reserve call types。
- Ground Pairings。
- 其他不属于正常飞行的 Pairing group。

## 6. 前端行为

- Pairing Preference 表格初次打开时只加载 FLY Pairings。
- Header 中的 `total` 只统计 FLY Pairings。
- Quick Search 只搜索 FLY 集合。
- Pairing start date、Check-in、Check-out、Pairing days、Pairing credit Filters 只作用于 FLY 集合。
- Select Current Page 只选择当前页 FLY Pairings。
- 切换筛选和分页时，已选择的 FLY Pairing IDs 保持不变。
- 清除筛选不会恢复 RES/GRD。
- 保存和编辑继续使用稳定 `pairing.id`。

## 7. 历史数据策略

项目尚未上线，不增加旧数据兼容：

- 实施前提是测试库和当前开发草稿中不存在需要保留的非 FLY Pairing Preference。
- Picker 不为历史非 FLY Pairing ID 提供特殊候选行。
- 不新增 fallback 查询。
- 不按 pairing number 或 label 恢复非 FLY 选择。
- Editor 不额外发起查询来校验或剔除旧 selected chips。
- 本次只验收 FLY Pairing 的保存和编辑回显。
- 本次不主动清理数据库中的历史草稿；若测试数据中存在非 FLY Pairing Preference，先删除并重新创建测试 bid。

## 8. 测试设计

### 8.1 后端测试

更新 `pairing-search-service.test.ts`：

- `pairingScope: "fly"` 生成 `assignment_group = 'FLY'` SQL。
- FLY 条件位于 `filtered_pairings` 候选 CTE 内，在分页和 summary 之前生效。
- 未传 `pairingScope` 时，不增加 FLY 条件，证明独立 Search Pairings 行为未改变。
- FLY scope 与 query/date/time/days/credit filters 使用 AND 组合。

更新 route 测试：

- `preview.filters.pairingScope: "fly"` 通过 Zod 校验并原样传给 service。
- 非法值（例如 `"res"`）返回 400。

### 8.2 前端测试

更新 `pairing-preference-picker.test.tsx`：

- 初次请求包含 `pairingScope: "fly"`。
- 应用 Filters 后的请求仍保留 `pairingScope: "fly"`；清除 Filters 若复用初始 React Query 缓存，则缓存本身必须来自 FLY-only 请求。
- 分页请求仍保留 FLY scope。
- 已选择 Pairing 在筛选和分页后保持。

更新 `pairing-service` 测试：

- 真实 POST body 包含 `preview.filters.pairingScope === "fly"`。
- 未传 scope 的独立 All Pairings 请求不产生该字段。

### 8.3 Playwright

通过真实 Portal UI 验证：

1. 打开 `Configure Pairing Preference`。
2. 拦截并断言初始请求的 `preview.filters.pairingScope === "fly"`。
3. 确认表格中不存在 CRAM、CRPM、PRAM、PRPM。
4. 确认不存在已知 GRD Pairing。
5. 使用 Search、应用 Filters、清除 Filters 和翻页，并断言所有实际发出的请求都保留 FLY scope；清除 Filters 允许复用初始 FLY-only 缓存。
6. 确认上述操作后仍不出现 RES/GRD。
7. 跨页选择 FLY Pairing并保存。
8. 重新编辑，确认 FLY Pairing 选择正确回显。

### 8.4 QA 人工测试

在 `docs/test-cases/pbs/pairing/` 增加本功能测试案例，记录：

- Base、Rank、Jun 2026 前置条件。
- FLY / RES / GRD 对照数据。
- 总数、分页、筛选和保存回显验收。
- 独立 Search Pairings 页面回归。

## 9. 验收标准

- Pairing Preference 候选表格只返回 `assignment_group='FLY'`。
- CRAM、CRPM、PRAM、PRPM 和 GRD 均不显示。
- 表格总数和分页不包含 RES/GRD。
- 所有表格 Filters 只在 FLY 数据集上运行。
- 已选状态、保存 Pairing IDs 和编辑回显不回归。
- 独立 Search Pairings 页面和其他 Pairing condition 搜索不受影响。
- 聚焦单元测试、Playwright、`pbs-portal` lint/build、`pbs-server` build、`npm run check:ui` 和 `git diff --check` 通过。

## 10. 风险与控制

- **风险：误改所有 Pairing Search 候选池。**
  - 控制：FLY scope 只由 Pairing Preference picker 显式传递。
- **风险：前端过滤导致分页错误。**
  - 控制：过滤必须在后端 SQL 分页和 summary 之前完成。
- **风险：按名称过滤遗漏未来 Reserve 类型。**
  - 控制：正向限定 `assignment_group='FLY'`。
- **风险：共享 contract 改动影响其他调用方。**
  - 控制：字段可选；未传时保持原行为，并补负向回归测试。

## 11. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: contract、picker 请求和后端分页查询紧密耦合，改动范围较小，拆分会增加协调成本。
- Suggested split: 不拆。
- Write boundaries: `packages/contracts`、Pairing Preference picker、pairing search service、相关测试和 QA 文档。
- Conflict risk: Low。
- Execution gate: 用户审阅并明确批准本 spec 后才进入实现。
