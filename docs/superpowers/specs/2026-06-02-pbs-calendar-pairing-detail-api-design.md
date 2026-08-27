# PBS 日历 Pairing Detail 专门接口设计

## 背景

左侧日历点击 pairing 详情时，当前前端会把已知的 `pairingId + originDate` 包装成 Pairing Number preview criteria，再调用 `/api/pairing-search/preview`。

这会带来两个问题：

- 日历详情本质是 detail lookup，不是 PBS 条件搜索，不应该传 `propertyCode/name/action/quantifier/bid/tiers`。
- 旧代码仍构造 `tag-list-date`，在 Pairing Number 旧兼容移除后会被后端 schema 拒绝。

## 目标

新增一个专门接口用于日历 pairing 详情：

`POST /api/pairing-search/pairing-details`

请求只传必要字段：

```json
{
  "periodCode": "Jun 2026",
  "targets": [
    {
      "pairingId": "11962",
      "originDate": "2026-06-21"
    }
  ]
}
```

## 设计

### 后端

- 新增 contract route：`pairingDetails`。
- 新增 request 类型：`periodCode?: string; targets: { pairingId: string; originDate?: string }[]`。
- 新增 response 类型：返回 `results: PbsSearchPairingsResult[]`。
- 后端 schema 校验：
  - `pairingId` 必须是数字字符串。
  - `originDate` 可选；如果存在必须是 `YYYY-MM-DD`。
  - `targets` 至少 1 个，最多 50 个。
- 查询逻辑：
  - 按 `pairing.id` 查询。
  - 如果 target 有 `originDate`，只返回该 `pairingId + originDate` 对应 run。
  - 如果传 `periodCode`，限制 pairing 起始时间在该 bid period 内。
  - 复用现有 search result 映射结构，避免前端新增展示模型。

### 前端

- `pairing-calendar-detail.ts` 删除旧 `buildPairingDetailCriteria`。
- `loadPairingDetailResults` 改为调用 `pairingService.getPairingDetails(periodCode, targets)`。
- 日历详情请求不再出现 `tag-list` / `tag-list-date`。

## 不做

- 不改 Pairing Search Preview 语义。
- 不恢复 Pairing Number 旧 `tag-list` 兼容。
- 不改日历详情 UI 展示结构。

## 验收标准

- 左侧日历点击 pairing detail 调用 `/api/pairing-search/pairing-details`。
- 请求 payload 只包含 `periodCode + targets`。
- payload 不包含 `propertyCode/name/action/bid/tiers`。
- payload 不包含 `tag-list` / `tag-list-date`。
- `pairingId + originDate` 可以返回对应 pairing detail。
- 多个 targets 可以一次返回多个结果并去重。
- 原 Pairing Search preview 测试仍通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: contract、后端 route/service/query、前端 service/detail 调用强耦合，单人串行更稳。
- Suggested split: 不拆。
- Write boundaries: `packages/contracts/pbs-search-pairings.*`、`pbs-server/src/services/pairing-search/*`、`pbs-server/src/routes/pairing-search.ts`、`pbs-portal/src/shared/services/pairing-service.ts`、`pbs-portal/src/features/dashboard/pairing-calendar-detail.ts` 与相关测试。
- Conflict risk: 中等，当前工作区已有 Pairing Number 相关未提交改动。
- Execution gate: 用户已确认实现。
