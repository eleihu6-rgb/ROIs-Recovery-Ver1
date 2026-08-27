# 开发上下文（2026-06-02）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-02 14:22:46 CST
- Wing：`pbs`
- Topic：`pairing-number-stable-id-list`
- Title：PBS Pairing Number 使用 pairingIds 保存与查询
- Git branch：`main`

## 本轮对话上下文

本轮围绕 PBS Pairing Number 的稳定身份语义完成了设计与实现收尾。

## 用户核心要求

- Pairing Number 页面 / Search Pairings 页面中，有稳定 id 的地方必须优先使用 id，不能继续用 pairing number、route 字符串、label 等展示字段作为保存和查询语义。
- 展示给用户仍然显示 pairing number / label，例如 `M4959`、`V4146`。
- 保存、preview、calendar、后端 SQL 查询必须使用稳定的 `pairingId`。
- 项目尚未上线，不兼容历史错误数据；如果旧数据结构是错的，应直接清理或拒绝，而不是做兼容。
- Pairing Number 下拉选择不能允许用户手动输入非列表项后按回车加入，只能选择搜索结果中的 pairing。
- Entire Month 多选要支持一次选择多个 pairing，并且不需要额外选择 specific date。
- 原先模糊的 `values: ["496001", "414601"]` 语义不清晰，必须改为清楚的字段名。

## 已产出设计文档

- `docs/superpowers/specs/2026-06-02-pbs-pairing-number-entire-month-multi-select-design.md`

关键设计结论：新增专用 bid 类型：

```ts
{
  type: "pairing-id-list",
  pairingIds: ["496001", "414601"],
  pairingLabels: ["M4959", "V4146"]
}
```

语义边界：

- `pairingIds`：业务保存、后端查询、preview、calendar 匹配使用。
- `pairingLabels`：仅前端展示、summary、chip label 使用。
- `pairing-occurrence-list`：仍用于 Specific Date，保存具体 run / originDate。
- `tag-list.values` 不再用于 Pairing Number 的 Entire Month 语义。

## 已实现的主要改动

Contracts / 类型：

- `packages/contracts/pbs-pairing-bids.d.ts`
- `packages/contracts/pbs-pairing-bids.js`
- `pbs-portal/src/features/pairing/types.ts`
- `pbs-server/src/services/lineholder/rule-bid-value.ts`

前端 Pairing：

- `pbs-portal/src/features/pairing/pairing-property-catalog.ts`
- `pbs-portal/src/features/pairing/pairing-bid-summary.ts`
- `pbs-portal/src/features/pairing/pairing-bid-control-logic.ts`
- `pbs-portal/src/features/pairing/components/pairing-bid-control.tsx`
- `pbs-portal/src/features/pairing/pairing-number-occurrences.ts`
- `pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx`
- `pbs-portal/src/features/pairing/search-pairings-page-logic.ts`
- `pbs-portal/src/features/pairing/pages/search-pairings-page.tsx`
- `pbs-portal/src/features/pairing/mock.ts`

关键前端行为：

- Pairing Number Autocomplete 的 option `value` 使用稳定 `pairingId`。
- option 展示继续用 `pairingLabel` / label。
- PairingBidControl 对 `pairing-id-list` 支持 chip 展示 label、内部保存 id。
- `allowCustomTokens === false` 时，用户手动输入并回车不会加入自定义值。
- Config Dialog 中：
  - Entire Month 构建 `pairing-id-list`。
  - Specific Date 构建 `pairing-occurrence-list`。
  - 多选 pairing 时显示 labels，保存 ids。
- Search Pairings 中：
  - Entire Month 使用 `pairing-id-list`。
  - Specific Date 使用 `pairing-occurrence-list`。

后端：

- `pbs-server/src/routes/pairing-bid-route-schemas.ts`
- `pbs-server/src/services/pairing/pairing-bid-normalization.ts`
- `pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts`
- `pbs-server/src/services/calendar/bidding-calendar-pairing-events.ts`
- `pbs-server/src/services/lineholder/rule-bid-value.ts`

关键后端行为：

- API schema 接受 `pairing-id-list`。
- Pairing Number preview / current rules SQL 用 `pairingId` 参数化查询。
- 明确拒绝把 pairing label 当作 pairing id 的错误 payload。
- rule bid value 序列化中 `paramA` 保存 comma-separated pairingIds，`paramC` 保存 JSON pairingLabels。
- Calendar pairing events 按 stable pairing id 匹配。

非 Pairing 模块边界：

- `pbs-portal/src/shared/services/days-off-service.ts`
- `pbs-portal/src/shared/services/line-service.ts`
- `pbs-portal/src/features/line/line-draft-mappers.ts`
- `pbs-portal/src/features/days-off/pages/days-off-page.test.tsx`

这些地方显式拒绝 `pairing-id-list`，防止 Pairing 专用 bid 类型误入 Days Off / Line。

## 最后修复的关键问题

Pairing 页面测试最初失败，原因不是业务逻辑大问题，而是 `pbs-portal/src/features/pairing/mock.ts` 中 available Pairing Number 仍然强行初始化为旧结构：

```ts
{ type: "tag-list", values: [] }
```

已修为：

```ts
{ type: "pairing-id-list", pairingIds: [] }
```

这符合“不兼容旧错误数据”的结论，也让 Pairing Number 专属 Entire Month / Specific Date 区块正确显示。

## 已通过验证

前端类型检查：

```bash
pnpm --filter pbs-portal exec tsc --noEmit
```

后端类型检查：

```bash
pnpm --filter pbs-server exec tsc --noEmit
```

前端相关回归：

```bash
pnpm --filter pbs-portal exec vitest run src/features/pairing/components/pairing-bid-control.test.tsx src/features/pairing/search-pairings-page-logic.test.ts src/features/pairing/pages/search-pairings-page.test.tsx src/features/pairing/pages/pairing-page.test.tsx
```

结果：4 个测试文件、87 个测试通过。

后端 pairing-search 回归：

```bash
DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/services/pairing-search/pairing-search-condition-builder.test.ts src/services/pairing-search/pairing-search-service.test.ts src/routes/pairing-search.test.ts
```

结果：93 个测试通过。

## 当前工作树状态提醒

本轮存在较多未提交改动，主要集中在：

- Pairing contracts
- pbs-portal Pairing UI / Search Pairings / tests
- pbs-server pairing bid schema / normalization / search / calendar / tests
- 新增 spec 文档

新窗口恢复后先运行 `git status --short` 查看实际工作树，不要 revert 未确认改动。

## 新窗口继续建议

1. 先阅读 `NEXT_CONTEXT.md`。
2. 再阅读 `docs/dev-context/LATEST.md`。
3. 查看本轮 spec：`docs/superpowers/specs/2026-06-02-pbs-pairing-number-entire-month-multi-select-design.md`。
4. 如用户要继续验证页面，重点检查：
   - Pairing Number 下拉展示 label、保存 id。
   - Entire Month 多选两个 pairing 后 payload 是否为 `pairing-id-list`。
   - Specific Date 是否仍为 `pairing-occurrence-list`。
   - `http://localhost:3030/api/pairing-search/preview` 不再因为 Pairing Number payload 语义错误返回 400。
5. 如需要数据库清理旧错误数据，应先确认当前表结构和保存字段，再按“不兼容旧错数据”的原则处理，不要添加旧格式兼容逻辑。

## 当前工作树快照

### git status --short

```text
(clean)
```

### unstaged changed files

```text
(none)
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-06-02-pbs-pairing-number-stable-id-list.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
