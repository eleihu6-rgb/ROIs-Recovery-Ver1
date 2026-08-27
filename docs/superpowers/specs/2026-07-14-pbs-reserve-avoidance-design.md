# PBS Reserve Avoidance 设计确认

## 背景

Jen 在 `init-docs/Bidding Options V1(2).xlsx` 第 20 行把该条件列为 `Line` 条件：

- `Final Bid Option`: `Reserve Avoidance`
- `Purpose`: `Crew bids to avoid reserve.`
- `Required Fields / Inputs`: `Avoid reserve no matter what / avoid reserve only if possible`
- `Rules / Defaults`: `Option 1: avoid reserve regardless. Option 2: avoid reserve unless needed to complete award.`
- `Notes for Developers`: `Keep as reserve-specific line bid.`

Jen 在 `init-docs/Jenife_Bidding_Type_Clarification_20260707.docx` 中也表达了相同方向：

- `Reserve – this should be the avoid reserve only`
- `option 1 – no matter what`
- `option 2 only if I can’t get what I want`

因此本条件不是 “我要 reserve / 尽量给我 reserve”，而是只表达 “避免 reserve”，并把避免强度拆成两档。

当前项目已有最接近的旧条件：

- `propertyCode = 427`
- 当前名称：`Reserve`
- 当前语义：
  - `Award Reserve` = `Only Reserve`
  - `Avoid Reserve` = `No Reserve`
- 当前导出：`Rule_ID=427`，`Parameters_JSON={"action":"award|avoid","scope":"whole_bid_month"}`

后续员工端 Line catalog 只展示 Jen Excel 里的 Line 条件，不展示不在 Jen Excel 中的旧 Line 条件。因此本版不新增新 property code，而是在现有 `427 Reserve` 上增强/重命名为 `Reserve Avoidance`，并废弃员工端 `Award Reserve / Only Reserve` 入口。

## 目标

1. 员工端最终展示 `Reserve Avoidance`。
2. 复用现有 `propertyCode = 427`，不新增新 property code。
3. `427` 从 `Award/Avoid Reserve` 改为 `Reserve Avoidance` 两档模式。
4. 员工端不再显示 `Award Reserve` 或 `Only Reserve`。
5. UI 只显示 `TIERS`、`AVOIDANCE`、footer。
6. `AVOIDANCE` 只有两个选项：
   - `If possible`
   - `No matter what`
7. 默认选择 `If possible`。
8. `TIERS` 默认不选，保存前必填。
9. Existing row / summary 显示 avoidance 语义，而不是 Award/Avoid。
10. Standing Bid 如复用 Lineholder Line catalog，也必须使用同一语义。
11. 清理开发期旧 `427 Award Reserve / Avoid Reserve` 数据和收藏，不做旧 payload 兼容。

## 非目标

- 不新增 `Reserve Request`、`Reserve Preference` 或 “我要 reserve” 条件。
- 不保留员工端 `Award Reserve / Only Reserve`。
- 不在本版支持日期范围、半月、短备类型或 reserve/flying 混合 pattern；这些属于 `Mixed Block Pattern` / Reserve 页面条件。
- 不新增 strength、priority、number input、operator 或 company-defined 说明。
- 不在 UI 中解释算法如何判定 “needed to complete award”。
- 不改变 Reserve 页面现有 `Short Call Type`、`Reserve Day On`、`Reserve Prefer Off`。
- 不改变 `410 Reserve / Flying Date Pattern` 的技术边界；后续若按 Jen 改名为 `Mixed Block Pattern`，单独处理。

## 产品语义

`Reserve Avoidance` 是一个 line-level preference，用于表达员工不希望最终 line 包含 reserve。

两档含义：

- `If possible`
  - 对应 Jen 的 `avoid reserve only if possible`。
  - 业务含义：尽量避免 reserve；如果为了完成 award / 排班需要，可以接受 reserve。
  - 这是默认值，因为它比硬性避免更不容易造成不可排或误伤 award。

- `No matter what`
  - 对应 Jen 的 `avoid reserve regardless` / `no matter what`。
  - 业务含义：无论如何都避免 reserve。
  - 这是更强的员工意图，需要员工主动切换。

这两个选项都属于 avoidance，不应再用 `Award/Avoid` 表达，否则 `Award Reserve` 会让员工误解成“我想要 reserve”。

## UI 设计

原型路径：

```text
pbs-portal/.superpowers/reserve-avoidance-v1.html
```

弹窗结构：

1. `Configure Reserve Avoidance`
2. `TIERS · REQUIRED`
   - 使用现有 Line 条件一致的 tier toggle。
   - 默认不选。
   - 至少选一个 tier 后才能保存。
3. `AVOIDANCE`
   - `If possible`
   - `No matter what`
   - 默认 `If possible`。
4. Footer
   - `Cancel`
   - `Save Favorite`
   - `Add Bid` / `Update Bid`

明确不显示：

- `Award`
- `Avoid`
- `Award Reserve`
- `Avoid Reserve`
- `Only Reserve`
- `No Reserve`
- 输入框
- date range
- “company defined”
- 解释性长文本或 summary pill

UI 行为：

- 打开新增弹窗时，`If possible` 默认选中。
- 打开新增弹窗时，`TIERS` 为空。
- 未选 tier 时，`Save Favorite` 和 `Add Bid` 禁用。
- 切换 `If possible / No matter what` 只更新 avoidance mode、`aria-pressed` 和保存 payload。
- 编辑已有 bid 时，回显已保存的 tier 和 avoidance mode。
- 收藏保存时保留 avoidance mode；从 favorite 加回时也保留 avoidance mode，并按现有 Line favorite 规则处理 tier。

推荐 summary 文案：

- `Avoid reserve if possible`
- `Avoid reserve no matter what`

## Payload / Contract 设计

推荐使用专用 bid type，而不是继续复用 `action: award | avoid`。

```ts
type ReserveAvoidanceBid = {
  propertyCode: 427;
  action: null;
  bid: {
    type: "reserve-avoidance";
    mode: "if_possible" | "no_matter_what";
  };
};
```

规则：

- `propertyCode = 427`。
- `bid.type = "reserve-avoidance"`。
- `bid.mode` 是唯一表达强度的字段。
- `action` 不再用于该条件，保存时应为 `null`。
- 新增默认 bid：

```json
{
  "type": "reserve-avoidance",
  "mode": "if_possible"
}
```

为什么不继续用 `action`：

- `action=award` 在旧实现里表示 `Only Reserve`，与 Jen 的新语义冲突。
- `action=avoid` 只能表达硬避免，无法表达 `if possible`。
- 用 `mode` 可以避免后续算法和 UI 继续携带 “Award Reserve” 误解。

## 数据库 / Catalog

### `427` 更新

复用并更新 `property_code = 427`：

- `bid_type`: `Line`
- `property_name`: `Reserve Avoidance`
- `award_or_avoid`: `null`
- `any_or_every`: `null`
- `operator_options`: `null`
- `validation_json`: `{"type":"reserve_avoidance","label":"Reserve Avoidance","mode":["if_possible","no_matter_what"]}`
- `tooltip`: `Avoid reserve if possible, or avoid reserve no matter what.`
- `source_type`: 可继续为 `aa`
- `is_visible_in_portal`: `1`
- `display_order`: 位于 Jen Line catalog 中 `Mixed Block Pattern` 附近，建议跟随现有 `427`

### 旧数据清理

项目尚未上线，旧数据不做兼容。新增 migration 时需要清理开发期旧 `427` 数据：

- `Award Reserve`
- `Avoid Reserve`
- `427` 相关 Line saved/current draft rows
- `427` 相关 favorite rows

清理后员工重新添加 `Reserve Avoidance`，保存新 payload。

实际 SQL 必须基于现有表结构和 FK 确认，删除范围只限 Line `propertyCode=427`。

## Frontend 实现影响

预计涉及：

- `packages/contracts/pbs-line-bids.js`
- `packages/contracts/pbs-line-bids.d.ts`
- `pbs-portal/src/features/line/components/line-bid-dialog.tsx`
- `pbs-portal/src/features/line/pages/line-page.tsx`
- `pbs-portal/src/features/line/line-draft-mappers.ts`
- `pbs-portal/src/features/standing-bid/*`
- Help topics
- 对应 Line / Standing Bid / E2E 测试

实现原则：

1. `427` 仍然是 configurable Line property。
2. 打开弹窗标题为 `Configure Reserve Avoidance`。
3. 弹窗复用现有 Line dialog shell 和 `TierToggleGroup`。
4. 新增最小 `Avoidance` segmented control。
5. 不复用 `AwardAvoidActionControl`，因为该控件语义不对。
6. Existing row summary 不再显示 `Award Reserve` / `Avoid Reserve`。
7. Available property 展示名只显示 `Reserve Avoidance`。
8. Search old name `Reserve` 不强制保留；如保留 alias，只可用于后台/导入辅助，不在 UI 展示旧名。

## Backend 实现影响

预计涉及：

- `pbs-server/src/services/line/line-validation.ts`
- `pbs-server/src/services/line/line-draft-property-helpers.ts`
- `pbs-server/src/services/lineholder/rule-bid-value.ts`
- `pbs-server/src/services/lineholder/rule-bid-format.ts`
- `pbs-server/src/services/lineholder/rule-bid-serialize.ts`
- `pbs-server/src/services/lineholder/rule-bid-clone.ts`
- `pbs-server/src/services/lineholder/lineholder-summary-formatters.ts`
- `pbs-server/src/services/crew-bid-import/crew-bid-property-mapper.ts`
- `pbs-server/src/services/algorithm-export/line-rules-entry.ts`
- `pbs-server/src/services/algorithm-export/line-rules-metadata.ts`
- 对应 route / validation / import / export 测试

验证规则：

- `427` 必须接受 `{ type: "reserve-avoidance", mode: "if_possible" }`。
- `427` 必须接受 `{ type: "reserve-avoidance", mode: "no_matter_what" }`。
- `427` 不接受 `{ type: "flag" }` 的旧 payload。
- `427` 不接受 `action = award | avoid` 作为新保存语义。
- 缺少 `mode` 时可按 `if_possible` 默认补齐，或直接拒绝；推荐前端总是提交明确 mode，后端校验必须保证 canonical 数据有明确 mode。

## Algorithm Export

继续使用 `Rule_ID=427`，但参数改为 avoidance mode：

| Property | Rule_ID | Rule_Type | Parameters_JSON |
| --- | ---: | --- | --- |
| `Reserve Avoidance` | 427 | `RESERVE_AVOIDANCE` | `{"avoidance":"if_possible","scope":"whole_bid_month"}` |
| `Reserve Avoidance` | 427 | `RESERVE_AVOIDANCE` | `{"avoidance":"no_matter_what","scope":"whole_bid_month"}` |

推荐导出 description：

- `Avoid reserve if possible.`
- `Avoid reserve no matter what.`

如果 solver 当前仍只识别旧 `action=avoid`，本次也应先把员工 intent 稳定导出为新参数，避免继续输出 `Award Reserve`。

## Crew Bid Import

如果旧 legacy 文本中出现：

```text
Avoid Reserve
No Reserve
```

导入结果建议映射为：

```json
{
  "bidType": "Line",
  "propertyCode": 427,
  "action": null,
  "bid": {
    "type": "reserve-avoidance",
    "mode": "no_matter_what"
  }
}
```

如果旧 legacy 文本中出现：

```text
Award Reserve
Only Reserve
```

本版不自动映射为 `Reserve Avoidance`，因为它表达的是 “我要 reserve”，与 Jen 口径冲突。处理方式：

- 导入时标记 unsupported / warning，或
- 暂时跳过该条件并记录 diagnostic。

不应静默把 `Award Reserve` 转成 `If possible`。

## 测试范围

### 后端

1. `line-validation` 接受 `427 + reserve-avoidance + if_possible`。
2. `line-validation` 接受 `427 + reserve-avoidance + no_matter_what`。
3. `line-validation` 拒绝旧 `427 + flag + action award`。
4. `line-validation` 拒绝旧 `427 + flag + action avoid`。
5. Line catalog 返回 `Reserve Avoidance`，不返回旧展示名 `Reserve`。
6. Algorithm export 输出 `RESERVE_AVOIDANCE` 和 `avoidance` 参数。
7. Crew bid import 对 `Avoid Reserve / No Reserve` 给出新 payload。
8. Crew bid import 对 `Award Reserve / Only Reserve` 不静默映射。

### 前端

1. Line add properties 中显示 `Reserve Avoidance`。
2. 点击后打开 `Configure Reserve Avoidance`。
3. 弹窗只显示 `TIERS` 和 `AVOIDANCE`。
4. 默认选中 `If possible`。
5. 未选 tier 时 `ADD BID` / `SAVE FAVORITE` 禁用。
6. 选 tier 后可保存。
7. Existing row 显示 `Avoid reserve if possible` 或 `Avoid reserve no matter what`。
8. 编辑已有 bid 时正确回显 tier 和 mode。
9. Standing Bid 复用 Lineholder catalog 时不显示旧 `Award/Avoid Reserve`。

### E2E

新增或更新 PBS Portal Playwright：

- mock Line catalog 包含 `427 Reserve Avoidance`。
- 打开 Line 页面，添加 `Reserve Avoidance`。
- 验证弹窗没有 `Award` / `Avoid` / `BID`。
- 验证默认 `If possible`。
- 切换 `No matter what`，选择 `T1`，提交。
- 断言 POST payload 为：

```json
{
  "propertyCode": 427,
  "name": "Reserve Avoidance",
  "action": null,
  "bid": {
    "type": "reserve-avoidance",
    "mode": "no_matter_what"
  },
  "tiers": ["T1"]
}
```

## Migration

新增 migration：

```text
sql/migration/2026-07-14-pbs-reserve-avoidance.sql
```

职责：

1. 更新 `pbs_bid_property.property_code=427`：
   - 名称改为 `Reserve Avoidance`
   - `award_or_avoid = null`
   - `validation_json` 改为 reserve avoidance mode
   - `is_visible_in_portal = 1`
2. 清理旧 `427` Line draft/current/favorite 数据。
3. 不处理其他 Line 条件。
4. 不清理 Reserve 页面数据。

执行前后需要查询确认：

- `427` catalog 状态正确。
- 旧 `427` Line groups / conditions / favorites 为 0。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是单一 Line property 的 contract / UI / validation / export / migration 改造，虽然跨前后端，但文件之间契约强耦合；拆多 agent 容易产生 payload 不一致。
- Suggested split: 不建议并行。由一个实现流顺序完成 contract → backend validation/export → frontend UI/mappers → tests → migration。
- Write boundaries: 如必须拆，只能拆文档/测试与实现，但收益不高。
- Conflict risk: Medium，主要风险是 `427` 旧 `Award/Avoid` 语义在多个位置残留。
- Execution gate: 用户确认 spec 后再实施。

## 验收标准

1. 员工端 Line catalog 中显示 `Reserve Avoidance`。
2. 员工端不再出现 `Award Reserve` / `Only Reserve` 入口。
3. 弹窗与原型一致，只显示 `TIERS` 和 `AVOIDANCE`。
4. 保存 payload 使用 `reserve-avoidance` bid type 和明确 mode。
5. Existing row / summary / Help / Standing Bid 文案不再使用旧 Award Reserve 语义。
6. Algorithm export 使用 `Rule_ID=427` 和新 `avoidance` 参数。
7. migration 可执行，并清理旧 `427` 开发期数据。
8. 相关 Vitest、build、`npm run check:ui`、PBS Portal Playwright 覆盖通过。
