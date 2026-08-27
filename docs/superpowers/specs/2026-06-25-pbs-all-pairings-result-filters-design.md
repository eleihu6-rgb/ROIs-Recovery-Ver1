# PBS All Pairings 结果区筛选设计

## 背景

PBS Portal 的 Pairing 页面已经支持在 `ADD PAIRING PROPERTIES` 区域通过 `ALL PAIRINGS` 进入 Search Pairings 页面，并在 `SEARCH RESULTS` 中浏览当前 bid period 可用的 pairing。实际数据量通常有数百条，例如 `562 pairing numbers, 562 total results`，用户如果只能滚动和分页查找，挑选任务环效率很低。

当前 Search Results 分页接口只返回当前页数据，不会一次性把全部 pairing 下载到前端。因此不能在前端只过滤当前页，否则会出现“真实存在但当前页没有，所以误判为没有结果”的问题。

## 目标

- 在 `SEARCH RESULTS` 区域增加结果筛选能力，帮助用户快速缩小 pairing 列表。
- 筛选必须走后端查询，并继续复用当前用户的 base、rank、bid period、本地日期范围等可见性限制。
- 筛选只影响 Search Results 列表，不保存为 bid property，也不显示在上方 `SEARCH CRITERIA` 中。
- 尽量减少不必要接口调用，保持页面操作响应快。

## 非目标

- 不改变 Pairing Number / Airport / Date 等正式 bid 条件的保存语义。
- 不新增“高级搜索页面”或独立路由。
- 不在第一版支持所有 pairing 字段筛选。
- 不做前端全量数据下载后本地过滤。

## 用户体验设计

在 `SEARCH RESULTS` 标题下方增加一行轻量筛选条：

- `Pairing Number`：文本输入，支持 `T4527`、`4527` 这类输入。
- `Date`：日期输入或日期范围，用来筛选指定本地 origin date 范围内的 pairing。
- `Airport`：机场代码输入或下拉，筛选 pairing 内出现的机场。
- `Time Window`：可选起止时间，用于筛选 pairing 本地开始/报到时间窗口。
- `Clear`：一键清空结果筛选。

交互规则：

- 用户输入筛选条件后，结果区局部刷新。
- 输入型筛选使用 debounce，建议 `300ms`。
- 修改筛选条件后回到第 1 页。
- 点击分页时保留当前筛选条件。
- 点击 `ADD PAIRING` 后仍然添加对应 Pairing Number bid，并保留当前结果页面，不跳回上一页。
- 筛选条件为空时，行为等同当前 all pairings preview。

## API 设计

扩展现有 `POST /api/pairing-search/preview` 的 `all_pairings` preview payload：

```ts
{
  periodCode: string;
  preview: {
    mode: "all_pairings";
    page?: number;
    pageSize?: number;
    filters?: {
      pairingNumber?: string;
      originDateFrom?: string;
      originDateTo?: string;
      airport?: string;
      timeFrom?: string;
      timeTo?: string;
    };
  };
}
```

后端查询要求：

- 继续限制 `p.base = actorBase`。
- 继续使用 actor/base 本地 bid period 过滤，而不是 UTC 日期过滤。
- `pairingNumber` 使用现有 display label / external label 逻辑匹配，不直接要求用户输入 live internal id。
- `airport` 命中 pairing segment 中的 departure、arrival、duty start/end 等可见机场字段，第一版至少覆盖用户卡片中可见的机场。
- `Date` 和 `Time Window` 都按用户/基地本地语义处理。
- 结果仍然分页返回，summary 的 `totalItems` 和 `pairingIdCount` 必须反映筛选后的总数。

## 前端设计

涉及区域：

- `SearchPairingsPage`
  - 保存 results filter state。
  - 将 filters 加入 React Query key。
  - 调用 `pairingService.previewAllPairings(page, pageSize, periodCode, filters)`。
  - 筛选变化时重置页码。
- `PairingSearchPanel`
  - 增加 Search Results 筛选条展示。
  - 只在 `allPairingsPreview` 模式显示。
- `pairing-service`
  - 扩展 `previewAllPairings` 参数，传递 filters。
- `packages/contracts`
  - 扩展 `PbsSearchPairingsPreviewRequest` 类型。

## 性能设计

- 前端输入 debounce，避免每个按键都请求。
- React Query key 包含筛选条件，相同条件复用缓存。
- 后端只返回当前页，不返回全量结果。
- pairing number / date / base 过滤应尽量放在 pairing 主查询阶段。
- airport 过滤可能需要 segment join，应只在用户填写 airport 时启用。
- 第一版不做复杂全文搜索，避免拖慢 all pairings 默认加载。

## 错误处理

- 筛选接口失败时，只在结果区显示错误提示，不影响已添加的 `SEARCH CRITERIA`。
- 清空筛选后应能重新加载默认 all pairings 结果。
- 无结果时显示明确 empty state，例如 `No pairings match the current filters.`

## 测试计划

后端：

- `all_pairings` preview 支持 filters payload。
- `pairingNumber` 筛选只返回匹配 pairing。
- `airport` 筛选生成 segment 过滤，并保持 actor base / period 限制。
- `date` / `time` 筛选按本地日期时间语义生成 SQL。
- 筛选后 pagination summary 反映筛选结果。

前端：

- All Pairings 页面显示 Search Results 筛选条。
- 输入 Pairing Number 后调用带 filters 的 previewAllPairings。
- 修改筛选条件重置到第一页。
- Clear 清空筛选并恢复默认 all pairings 请求。
- 添加 pairing 后仍停留在 Search Pairings 页面，并保留当前筛选视图。

## 验收标准

- 用户可以在 `SEARCH RESULTS` 下通过 pairing number、日期、机场、时间窗口缩小结果。
- 筛选结果准确覆盖全部后端匹配数据，而不是只过滤当前页。
- 接口调用不会因为每次键入而过度触发。
- 分页、总数、添加 pairing 行为与筛选状态一致。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本任务横跨 contract、后端查询、portal UI 和测试，链路短但接口契约强耦合，单人顺序实现更稳。
- Suggested split: 不建议拆分；按 contract → backend → frontend → tests 顺序实施。
- Write boundaries: 不拆分写范围。
- Conflict risk: 中等，主要集中在刚修改过的 Search Pairings 页面和 pairing-search 后端查询。
- Execution gate: 本 spec 经用户确认后再进入实现。
