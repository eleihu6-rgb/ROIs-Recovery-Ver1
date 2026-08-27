# PBS Efficient Flying First 设计确认

## 背景

Jen 在 `init-docs/Bidding Options V1(2).xlsx` 第 18 行把该条件列为 `Line` 条件：

- `Final Bid Option`: `Efficient Flying First`
- `Purpose`: `Crew bids for most flying in least working days, or the opposite.`
- `Required Fields / Inputs`: `Award/avoid efficient flying`
- `Rules / Defaults`: `Award = prioritize highest average daily credit pairings first. Avoid = prioritize lowest average daily credit pairings first.`
- `Notes for Developers`: `Rename from most flying in least working days. Need preference-strength logic confirmed.`

Jen 在 `init-docs/Jenife_Bidding_Type_Clarification_20260707.docx` 中也表达了相同方向：把 `Most flying in least working days` 改名为 `Efficient Flying`，并且只给出两个方向：

- bid for it：优先最高 `average daily credit` 的 pairings
- avoid it：优先最低 `average daily credit` 的 pairings

她同时明确提到 `preference strength` 还需要更多信息。因此本版只实现 `Award / Avoid` 两个选择，不引入 strength 控件或 strength payload。

当前项目中已经存在两个旧相关条件：

- `propertyCode = 428`：`Most Flying In Least Working Days`，AA 来源，无参数 flag，当前 Portal 可见。
- `propertyCode = 409`：`Most Flying In Least Working Days (Configured)`，legacy 来源，带 `minimumTotalCredit / maximumWorkingDays / strength` 的旧配置型条件。

项目尚未上线，旧数据不做兼容。新的产品口径应收敛为 `Efficient Flying First` 一个员工端入口。

## 目标

1. 员工端最终展示 `Efficient Flying First`。
2. 复用现有 `propertyCode = 428`，不新增第三个 property code。
3. `428` 从无方向 flag 升级为 `Award / Avoid` Line 条件。
4. `Award` 表示优先更高 `average daily credit` 的 pairings。
5. `Avoid` 表示优先更低 `average daily credit` 的 pairings。
6. 默认 `Preference = Award`。
7. `TIERS` 默认不选，保存前必填。
8. 隐藏旧 `409 Most Flying In Least Working Days (Configured)`，不再给员工端展示。
9. 清理旧 `409 / 428` 相关开发期数据，不做旧 payload 兼容。
10. 保持 UI 极简：只显示 `TIERS`、`PREFERENCE Award/Avoid`、footer，不显示额外 summary 或解释文字。

## 非目标

- 不实现 `preference strength`，包括 `normal / strong / must_try` 之类控件。
- 不保留旧 `409` 参数型配置入口。
- 不把 `409` 的 `minimumTotalCredit / maximumWorkingDays / strength` 迁移到新条件。
- 不新增 date range、credit window、operator、number input 或其他字段。
- 不新增管理端配置。
- 不改变 pairing search 的 `Average Daily Credit` Pairing 条件；它仍属于 Pairing 条件，不是本 Line 条件的 UI 控件。
- 不在本版发明新的 optimizer 数学权重；本版只把员工 intent 稳定传到保存和 export。

## 产品语义

`Efficient Flying First` 是一个 line-level preference。它不是让员工输入一个 credit 数值，也不是筛选具体 pairing；它表达排 line 时的倾向：

- `Award Efficient Flying First`：希望系统优先选择单位工作日收益更高的 flying 组合。
- `Avoid Efficient Flying First`：希望系统不要优先追求这种高 daily-credit 密度，倾向更低 `average daily credit`。

其中 `average daily credit` 是算法/后端用于解释 efficiency 的指标；员工端无需看到公式或额外解释。

## UI 设计

原型路径：

```text
pbs-portal/.superpowers/efficient-flying-first-v1.html
```

弹窗结构：

1. `Configure Efficient Flying First`
2. `TIERS · REQUIRED`
   - 使用现有 Line/Preference 条件一致的 tier toggle。
   - 默认不选。
   - 至少选一个 tier 后才能保存。
3. `PREFERENCE`
   - `Award`
   - `Avoid`
   - 默认 `Award`。
4. Footer
   - `Cancel`
   - `Save Favorite`
   - `Add Bid` / `Update Bid`

明确不显示：

- `Award efficient flying first` summary pill。
- `Avoid efficient flying first` summary pill。
- strength 控件。
- average daily credit 解释文字。
- “company defined” 或其它说明性段落。

UI 行为：

- 打开新增弹窗时，`Award` 默认选中。
- 打开新增弹窗时，`TIERS` 为空。
- 未选 tier 时，`Save Favorite` 和 `Add Bid` 禁用。
- 切换 `Award / Avoid` 只更新同一个 action state、`aria-pressed` 和保存 payload。
- 编辑已有 bid 时，回显已保存的 tier 和 action。
- 收藏保存时保留 action；从 favorite 加回时也保留 action，但仍按现有 Line favorite 规则处理 tier。

## Payload / Contract 设计

推荐继续使用 Line 现有结构：

```ts
type EfficientFlyingFirstBid = {
  propertyCode: 428;
  action: "award" | "avoid";
  bid: { type: "flag" };
};
```

规则：

- `propertyCode = 428`。
- `bid` 仍为 `{ type: "flag" }`，因为 Jen 没有要求额外输入。
- `action` 是唯一表达方向的字段。
- `defaultAction = "award"`。
- `award_or_avoid = ["award", "avoid"]`。
- 不新增 `efficient-flying-first` 专用 bid type，除非实现时发现现有 Line action/bid 结构无法稳定支持。

这样可以复用现有 `Reserve` 等 Line Award/Avoid flag 的行为模型，同时避免为了一个二选一条件扩展不必要 payload。

## 数据库 / Catalog

### `428` 更新

复用并更新 `property_code = 428`：

- `bid_type`: `Line`
- `property_name`: `Efficient Flying First`
- `award_or_avoid`: `["award","avoid"]`
- `any_or_every`: `null`
- `operator_options`: `null`
- `validation_json`: `{"type":"flag","label":"Efficient Flying First"}`
- `description`: 表达 high/low average daily credit first 的业务含义
- `source_type`: 可继续为 `aa`
- `is_visible_in_portal`: `1`
- `display_order`: 延续 Line 新列表顺序，位于 `Commuter Pattern` 后、`Mixed Block Pattern` 前

### `409` 隐藏

更新 `property_code = 409`：

- `is_visible_in_portal = 0`
- 保留数据库定义和代码识别能力只用于历史/导入/测试参考；员工端不展示。
- 因项目未上线，不需要做旧数据兼容。

### 数据清理

新增 migration 时需要清理开发期旧数据：

- `409` saved/current Line bid properties
- `409` favorite properties
- `428` 旧无 action flag 数据
- 与 `409 / 428` 旧 property group 相关的 draft/current/favorite 数据

实际清理 SQL 必须基于现有表结构确认表名和 FK，不允许盲删无关 Line 条件。

## 前端实现影响

预计涉及：

- `packages/contracts/pbs-line-bids.js`
- `packages/contracts/pbs-line-bids.d.ts`
- `pbs-portal/src/features/line/components/line-bid-dialog.tsx`
- `pbs-portal/src/features/line/pages/line-page.tsx`
- `pbs-portal/src/features/line/line-draft-mappers.ts`
- `pbs-portal/src/features/standing-bid/*` 中复用 Line property catalog 的路径
- 对应 Line / Standing Bid 测试

实现原则：

1. `428` 不再直接点击添加，而是打开配置弹窗，因为必须选择 tier，且 action 要可确认。
2. 弹窗复用现有 Line dialog shell、TierToggleGroup、Award/Avoid segmented 样式。
3. `Efficient Flying First` 不需要专属复杂 editor，只需要最小 Award/Avoid control。
4. 不显示 summary pill。
5. Add / Edit / Favorite / Standing Bid 路径都要能正确回显 `action`。
6. Existing row / summary 文案建议：
   - `Award Efficient Flying First`
   - `Avoid Efficient Flying First`
7. Available property 展示名只显示 `Efficient Flying First`。
8. 搜索旧名称 `Most Flying` 是否还能搜到不强制；如保留 alias 仅作为 import/search 辅助，不在 UI 展示旧名。

## 后端实现影响

预计涉及：

- `pbs-server/src/services/line/line-validation.ts`
- `pbs-server/src/services/line/line-bid-service.ts`
- `pbs-server/src/services/line/types.ts`
- `pbs-server/src/services/lineholder/rule-bid-value.ts`
- `pbs-server/src/services/lineholder/rule-bid-format.ts`
- `pbs-server/src/services/lineholder/rule-bid-serialize.ts`
- `pbs-server/src/services/lineholder/rule-bid-clone.ts`
- `pbs-server/src/services/lineholder/lineholder-summary-formatters.ts`
- `pbs-server/src/services/crew-bid-import/crew-bid-property-mapper.ts`
- `pbs-server/src/services/algorithm-export/line-rules-metadata.ts`
- `pbs-server/src/services/algorithm-export/line-rules-parameters.ts`
- 对应 route / validation / import / export 测试

验证规则：

- `428` 必须接受 `{ type: "flag" }`。
- `428` 必须接受 `action = award | avoid`。
- `428` 缺少 action 时，后端可按 `award` 默认补齐，或按现有 defaultAction 机制生成；保存后的 canonical 数据必须有明确 action。
- `428` 不接受非 flag payload。
- `409` 不作为员工端可见 property 返回。
- 如果旧导入文本仍出现 `Most Flying In Least Working Days`，导入应映射为 `428 Efficient Flying First`，默认 action 建议为 `award`，因为 legacy 文本表达的是正向“most flying in least working days”。

## Algorithm Export

本次不确认新的 `preference strength` 算法。导出需要先稳定表达 action：

| Property | Rule_ID | Rule_Type | Parameters_JSON |
| --- | ---: | --- | --- |
| `Efficient Flying First` | 428 | `EFFICIENT_FLYING_FIRST` | `{"action":"award"}` / `{"action":"avoid"}` |

推荐实现策略：

1. `Rule_ID` 继续使用 `428`。
2. Portal / DB / documentation 使用新名称 `Efficient Flying First`。
3. `Rule_Type` 使用 `EFFICIENT_FLYING_FIRST`，不再导出旧 `MOST_FLYING_IN_LEAST_WORKING_DAYS`。
4. Export description 示例：
   - `Award Efficient Flying First: prioritize highest average daily credit first.`
   - `Avoid Efficient Flying First: prioritize lowest average daily credit first.`

如果 solver 当前完全不消费该 rule，仍应保证 CSV export 不丢失 action，供后续算法接入。

## Crew Bid Import

旧 legacy 文本继续兼容，但映射到新条件：

```text
Set Condition Most Flying In Least Days
Set Condition Most Flying In Least Working Days
Set Condition Most Flying Hours In Least Flying Day
```

导入结果：

```json
{
  "bidType": "Line",
  "propertyCode": 428,
  "action": "award",
  "bid": { "type": "flag" }
}
```

如果未来出现明确的 avoid 文本，再新增解析；本次不猜测。

## 测试范围

### 后端

1. `line-validation` 接受 `428 + action award + flag`。
2. `line-validation` 接受 `428 + action avoid + flag`。
3. `line-validation` 拒绝 `428` 的非 flag payload。
4. Line catalog 不再返回可见 `409`。
5. Crew bid import 将旧 `Most Flying...` 文本映射为 `428 / award / flag`。
6. Rule bid serialize / deserialize 保留 `428` action。
7. Lineholder summary 输出 `Award Efficient Flying First` / `Avoid Efficient Flying First`。
8. Algorithm export 输出 `428` 并包含 action 参数。

### 前端

1. Line available list 显示 `Efficient Flying First`。
2. Line available list 不显示 `Most Flying In Least Working Days (Configured)`。
3. 点击 `Efficient Flying First` 打开配置弹窗。
4. 弹窗默认 `Award`，tier 为空。
5. 未选 tier 时 `Save Favorite / Add Bid` 禁用。
6. 选择 tier 后可保存。
7. 切到 `Avoid` 后保存 payload action 为 `avoid`。
8. 编辑已有 `Avoid` bid 时正确回显。
9. Favorite 保存和重加保留 action。
10. Standing Bid 中复用该 property 时同样显示新名称和 Award/Avoid。

### Playwright / Manual QA

需要补充 QA 文档：

```text
docs/test-cases/pbs/line/2026-07-14-efficient-flying-first.md
```

建议手工用例：

1. 打开 Line 页面。
2. 找到 `Efficient Flying First`。
3. 点击 Add。
4. 验证弹窗只有 `TIERS` 和 `PREFERENCE Award/Avoid`。
5. 验证默认 Award，未选 tier 时 Add 禁用。
6. 选择 T1，切换 Avoid，Add Bid。
7. 验证 existing row 显示 `Avoid Efficient Flying First`。
8. 编辑该 bid，验证 T1 和 Avoid 回显。
9. 验证旧 `Most Flying In Least Working Days (Configured)` 不在员工端可见列表。

## 验收标准

1. 员工端只看到 `Efficient Flying First`，不再看到旧 `Most Flying In Least Working Days` 两个入口。
2. `Efficient Flying First` 只有 `Award / Avoid` 两个选择。
3. 默认是 `Award`。
4. 不显示 summary pill 或 strength 控件。
5. 保存时必须选择 tier。
6. `Award / Avoid` 能完整保存、回显、编辑、收藏、导入和导出。
7. 旧 `409` 隐藏，旧数据已清理，不做兼容。
8. 所有相关自动化测试和 UI gate 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 该需求跨 contracts、seed/migration、server、portal、import/export 和测试，但核心是同一个 property code `428` 的命名和 action 语义收敛；拆分开发容易造成 property contract 不一致。
- Suggested split: 不拆。实现时按顺序处理：contract/seed/migration -> server validation/format/export/import -> portal UI -> tests/QA。
- Write boundaries: 单 agent 负责 `packages/contracts/pbs-line-bids.*`、`sql/seed/10-pbs-bid-property.sql`、新增 migration、`pbs-server` Line/lineholder/import/export、`pbs-portal` Line/Standing Bid、测试和 QA 文档。
- Conflict risk: Medium。当前还有 `pbs-portal/src/features/line/components/line-bid-dialog.tsx` 的 Minimum Base Layover 输入框小修未提交；进入实现前必须决定是否先提交或一起纳入明确范围，避免混淆。
- Execution gate: 用户 review 本 spec 并确认后，再开始实现。
