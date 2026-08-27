# PBS Deadhead Flying 设计确认

## 背景

Jen 在 `init-docs/Bidding Options V1(2).xlsx` 中把 Deadhead 相关能力收敛为新的 Pairing 条件：

- `Final Bid Option`: `Deadhead Flying`
- `Purpose`: Crew bids for or avoids deadhead flying.
- `Required Fields / Inputs`: Award/avoid deadhead, deadhead leg, deadhead-only duty
- `Rules / Defaults`: Needs clear distinction between any deadhead and deadhead-only duty.
- `Notes for Developers`: Combines DH leg and DH-only duty options.

Jen 没有给具体例子。结合文档描述，本条件不是单纯重命名旧 `Deadhead Legs`，而是把旧系统中分散的 deadhead 条件合并成一个员工端入口，并补上 `deadhead-only duty` 的明确语义。

当前系统已有相关旧条件：

- `122 Deadhead Legs`: `Award / Avoid` + `< / = / > / Between` + 数字；后端统计 `pairing_segment.seg_assignment = 'DHD'` 的 segment 数量。
- `128 Deadhead Day`: flag 条件；现有后端实现实际是判断 pairing 是否存在任意 `DHD` segment，并不精确等价于 `deadhead-only duty`。
- `147 Prefer Deadheads` / `148 Avoid Deadheads`: AA 旧条件，默认隐藏；后端同样判断是否存在任意 `DHD` segment。

项目尚未上线，因此本次不做旧 saved bid / 旧 payload 兼容。旧条件只作为实现来源和语义来源；运行时以新的 `Deadhead Flying` contract 为准。

本 spec 取代旧文档 `docs/superpowers/specs/2026-05-27-pbs-pairing-deadhead-legs-design.md` 中“只做 Deadhead Legs”的设计范围。

## 目标

1. 将 `propertyCode = 122` 从 `Deadhead Legs` 升级为员工端 `Deadhead Flying`。
2. 在一个统一弹窗中支持三种 deadhead 语义：
   - `Any deadhead`
   - `Deadhead-only duty`
   - `Deadhead legs`
3. 从员工端隐藏 / 下线旧 deadhead 条件 `128 Deadhead Day`、`147 Prefer Deadheads`、`148 Avoid Deadheads`。
4. 清理 `122 / 128 / 147 / 148` 相关旧 saved bid / favorite / default 数据，不做迁移兼容。
5. 复用已定下来的 Pairing 条件统一 UI 标准：`TIERS` -> `PREFERENCE` -> 条件字段 -> footer。
6. `PREFERENCE` 默认 `Award`，`TIERS` 默认不选。
7. UI 保持简洁，不展示解释段落；员工端只显示必要选择和必要输入。

## 非目标

- 不新增新的 bid property code。
- 不保留旧 `Deadhead Legs` 的 `stepper` / `stepper-range` payload 兼容。
- 不把 `128 Deadhead Day` 直接当成 `deadhead-only duty` 使用；旧实现语义不够精确。
- 不改变 pairing / pairing_segment 数据模型。
- 不改变 `seg_assignment = 'DHD'` 作为 deadhead segment 的既有搜索口径。
- 不处理其他条件里的 `Counting Deadhead Legs` 扩展语义。
- 不新增管理端配置页面。

## Jen 语义解释

Jen 的关键要求是：

> Needs clear distinction between any deadhead and deadhead-only duty.

因此本系统定义为：

### Any deadhead

pairing 中存在至少一个 active deadhead segment。

示例：

- 一个 pairing 有 4 个 operating legs 和 1 个 deadhead leg。
- `Award · Any deadhead`：偏好这个 pairing。
- `Avoid · Any deadhead`：排除这个 pairing。

### Deadhead legs

pairing 中 active deadhead segment 的数量满足数字比较条件。

示例：

- 一个 pairing 有 2 个 deadhead legs。
- `Award · Deadhead legs > 1`：命中。
- `Avoid · Deadhead legs > 1`：排除。
- `Avoid · Deadhead legs > 2`：不排除，因为 2 不大于 2。
- `Award · Deadhead legs Between 1 and 2`：命中。

### Deadhead-only duty

pairing 中存在至少一个 duty，这个 duty 的 active segments 全部都是 deadhead segment，没有 operating leg。

示例：

- Day 1 duty: `FLT + FLT`
- Day 2 duty: `DHD + DHD`
- 这个 pairing 命中 `Deadhead-only duty`，因为 Day 2 是纯 deadhead duty。

对比：

- Day 1 duty: `FLT + DHD`
- 这个 pairing 命中 `Any deadhead`，但不命中 `Deadhead-only duty`，因为该 duty 里还有 operating leg。

`Award / Avoid` 统一解释：

- `Award`: 员工偏好匹配该 deadhead 条件的 pairing。
- `Avoid`: 员工希望排除匹配该 deadhead 条件的 pairing。

## UI 设计

原型路径：

```text
pbs-portal/.superpowers/deadhead-flying-v1.html
```

弹窗结构：

1. `Configure Deadhead Flying`
2. `TIERS`
   - 使用统一 tier toggle 样式。
   - 默认不选，保存前必填。
3. `PREFERENCE`
   - `Award`
   - `Avoid`
   - 默认 `Award`。
4. `DEADHEAD FLYING`
   - 使用单个 dropdown / select。
   - 默认值：`Any deadhead`。
   - 可选项：
     - `Any deadhead`
     - `Deadhead-only duty`
     - `Deadhead legs`
5. `DEADHEAD LEGS`
   - 只有选择 `Deadhead legs` 时显示。
   - 左侧为统一比较下拉框：`<` / `=` / `>` / `Between`。
   - 右侧为数字输入。
   - 非 `Between` placeholder 使用 `Enter`。
   - `Between` 时显示 `From` / `To` 两个数字输入。
   - suffix 显示 `legs`。
6. Footer
   - `Cancel`
   - `Save Favorite`
   - `Add Bid` / `Update Bid`

字段交互：

- 选择 `Any deadhead` 时，不显示 `DEADHEAD LEGS`。
- 选择 `Deadhead-only duty` 时，不显示 `DEADHEAD LEGS`。
- 只有选择 `Deadhead legs` 时，才显示 operator 和数字输入。
- `Award / Avoid` 切换不清空 deadhead flying 类型。
- 从 `Deadhead legs` 切到其他类型时，前端可清理 legs 输入，避免隐藏字段继续影响 payload。
- 从非 `Between` 切到 `Between` 时，显示 `From` / `To`。
- 从 `Between` 切到 `< / = / >` 时，清理 `from/to`，只保留单值输入。
- 保存按钮要求：
  - 至少选择一个 tier。
  - `Any deadhead` / `Deadhead-only duty`：不需要额外输入。
  - `Deadhead legs`：operator 和数字条件完整有效。

UI 简洁原则：

- 不显示业务解释段落。
- 不显示 `BID` summary 区块。
- 不把 `Deadhead-only duty` 解释成输入框或只读框。
- 不在员工端展示“旧条件合并”等实现细节。

## Payload 设计

推荐将 `propertyCode = 122` 的 bid payload 升级为专用结构：

```ts
type DeadheadFlyingBid =
  | {
      type: "deadhead-flying";
      mode: "any-deadhead";
    }
  | {
      type: "deadhead-flying";
      mode: "deadhead-only-duty";
    }
  | {
      type: "deadhead-flying";
      mode: "deadhead-legs";
      operator: "<" | "=" | ">";
      legs: number | null;
    }
  | {
      type: "deadhead-flying";
      mode: "deadhead-legs";
      operator: "Between";
      from: number | null;
      to: number | null;
    };
```

规则：

- action 仍沿用 property 外层的 `award` / `avoid`。
- `mode = "any-deadhead"` 不带数字。
- `mode = "deadhead-only-duty"` 不带数字。
- `mode = "deadhead-legs"` 必须带 operator。
- 非 `Between` operator 使用 `legs`。
- `Between` operator 使用 `from` / `to`。
- `legs` / `from` / `to` 必须是非负整数。
- `Between` 必须满足 `from <= to`。
- `propertyCode = 122` 只接受 `type: "deadhead-flying"`。
- 旧 `{ type: "stepper" }` / `{ type: "stepper-range" }` / `{ type: "flag" }` / `{ type: "select" }` 不再作为 `122` 的有效 payload。

关于 `0`：

- 旧 `Deadhead Legs` 允许 `min = 0`。
- 本次保持 `0` 可输入，因为 `Award · Deadhead legs = 0` 可以表达偏好没有 deadhead legs 的 pairing。
- 如后续产品确认不允许 0，可在管理配置或 validation 中把最小值改为 1；本轮不硬编码更窄规则。

## Search / 后端语义

### Any deadhead

正向条件：

```sql
exists (
  select 1
  from <schema>.pairing_segment s
  where s.pairing_id = p.id
    and s.is_deleted = 0
    and s.seg_assignment = 'DHD'
)
```

### Deadhead legs

正向表达式：

```sql
(
  select count(*)::numeric
  from <schema>.pairing_segment s
  where s.pairing_id = p.id
    and s.is_deleted = 0
    and s.seg_assignment = 'DHD'
)
```

再按用户选择生成比较：

- `< N`
- `= N`
- `> N`
- `between A and B`

### Deadhead-only duty

正向条件：

```sql
exists (
  select 1
  from <schema>.pairing_segment s
  where s.pairing_id = p.id
    and s.is_deleted = 0
  group by s.duty_seq
  having count(*) > 0
     and count(*) filter (where s.seg_assignment = 'DHD') = count(*)
)
```

解释：

- `duty_seq` 是同一个 pairing 内的 duty 分组。
- 一个 duty 内所有 active segment 都是 `DHD` 时，视为 `deadhead-only duty`。
- pairing 可以同时包含 operating duty 和 deadhead-only duty；只要存在一个 deadhead-only duty，就命中。

### Award / Avoid 包裹

- `Award`: 使用正向条件。
- `Avoid`: 对正向条件包 `not (...)`。

示例：

- `Avoid · Any deadhead`: `not exists(any DHD segment)`。
- `Avoid · Deadhead-only duty`: `not exists(any duty where all active segments are DHD)`。
- `Avoid · Deadhead legs > 1`: `not (deadhead_leg_count > 1)`。

## 数据库 / Catalog

复用并更新 `property_code = 122`：

- `property_name`: `Deadhead Flying`
- `category`: `Pairing`
- `award_or_avoid`: `["award","avoid"]`
- `any_or_every`: `null`
- `operator_options`: 可以保留 `["<","=",">","Between"]`，但只在 `mode = deadhead-legs` 时使用。
- `validation_json`: 建议改为专用配置。

建议 `validation_json`：

```json
{
  "validationType": "deadhead_flying",
  "label": "Deadhead Flying",
  "modes": ["any-deadhead", "deadhead-only-duty", "deadhead-legs"],
  "deadheadLegs": {
    "operators": ["<", "=", ">", "Between"],
    "min": 0
  }
}
```

需要从员工端隐藏 / 下线：

- `property_code = 128`
- `property_code = 147`
- `property_code = 148`

隐藏 / 下线规则：

- migration 和 seed 都必须把 `128 / 147 / 148` 设置为 `is_visible_in_portal = 0`。
- migration 和 seed 都必须把 `128 / 147 / 148` 设置为 `is_active = 0`，表示这些旧入口不再作为可用员工端条件；记录仍可保留在定义表中，作为历史 code 归属。
- seed 文件中任何 legacy / AA alignment 更新都不能把 `128 / 147 / 148` 重新打开。

数据清理：

- 清理所有 `property_code in (122, 128, 147, 148)` 相关 saved bid / favorite / default 数据。
- 不迁移旧 payload。
- 不把旧 `128 / 147 / 148` 自动映射成新 `122` payload。
- migration 写入前先按当前实际表结构检查 bid storage 表，避免漏清理或误删其他 property。

Seed / migration：

- 更新 `sql/seed/10-pbs-bid-property.sql`。
- 新增 migration，例如：

```text
sql/migration/2026-07-14-pbs-deadhead-flying.sql
```

迁移执行：

- spec 阶段不执行 migration。
- 进入实现并经用户确认后，再按用户指令执行远端 migration。

## 前端实现影响

预计涉及：

- `packages/contracts/pbs-pairing-bids.js`
- `packages/contracts/pbs-pairing-bids.d.ts`
- `pbs-portal/src/features/pairing/types.ts`
- `pbs-portal/src/features/pairing/components/deadhead-flying-editor.tsx`
- `pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx`
- `pbs-portal/src/features/pairing/pairing-bid-summary.ts`
- `pbs-portal/src/features/pairing/pairing-draft-mappers.ts`
- `pbs-portal/src/features/pairing/pairing-property-catalog.ts`
- `pbs-portal/src/features/pairing/mock.ts`
- 相关 pairing page / catalog / default favorite 测试

实现原则：

- 使用已统一的 Pairing preference 条件骨架。
- 数字比较行复用 Month-End Carryover / Flight Legs per Duty 已定下来的比较符号 UI 模式。
- 不新增解释性 help block。
- 不把 `Deadhead-only duty` 做成输入框或只读输入框。
- old properties 不再出现在员工端可选条件列表。

## 后端实现影响

预计涉及：

- `pbs-server/src/services/pairing/pairing-property-validation.ts`
- `pbs-server/src/services/pairing/pairing-property-validation.test.ts`
- `pbs-server/src/services/pairing-search/pairing-search-detail-conditions.ts`
- `pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts`
- `pbs-server/src/services/lineholder/lineholder-summary-formatters.ts`
- `pbs-server/src/services/crew-bid-import/crew-bid-property-mapper.ts`
- `pbs-server/src/routes/pairing-bids.test.ts`

后端规则：

- `122` 只接受新 `deadhead-flying` payload。
- `any-deadhead` / `deadhead-only-duty` 不允许携带无关数字字段影响搜索。
- `deadhead-legs` 必须做 operator 和数字完整校验。
- `avoid` 由现有 intent wrapper 统一处理。
- `crew-bid-import` 中旧文本 `Deadhead Legs ...` 如果继续支持导入，必须直接转换成新的 `{ type: "deadhead-flying", mode: "deadhead-legs", ... }` payload。
- 如果本轮不维护 crew bid import 的 deadhead 导入能力，则必须显式移除 / 拒绝旧 `Deadhead Legs` 映射，不能继续生成旧 `stepper` payload。
- 旧 `Deadhead Day`、`Prefer Deadheads`、`Avoid Deadheads` 不自动映射成新 `122`，避免把旧的任意 DHD 语义误导为 `Deadhead-only duty` 或新合并条件。
- summary / formatter 必须能输出可读表达，例如：
  - `Award pairings with any deadhead`
  - `Avoid pairings with a deadhead-only duty`
  - `Award pairings with deadhead legs > 1`

## 测试计划

前端测试：

- catalog 中显示 `Deadhead Flying`。
- catalog 中不显示 `Deadhead Legs` / `Deadhead Day` / `Prefer Deadheads` / `Avoid Deadheads`。
- 打开弹窗默认 `Award`，tier 默认不选。
- `Any deadhead` 默认选中，且不显示 `DEADHEAD LEGS`。
- 选择 `Deadhead-only duty` 时不显示 `DEADHEAD LEGS`。
- 选择 `Deadhead legs` 时显示 operator 和数字输入。
- `Between` 显示 `From` / `To`。
- 未选 tier 时不能 Add Bid。
- `Deadhead legs` 数字不完整时不能 Add Bid。
- 保存后的 summary 与 payload 正确。

后端 validation 测试：

- 接受 `any-deadhead`。
- 接受 `deadhead-only-duty`。
- 接受 `deadhead-legs` + `< / = / >` + `legs`。
- 接受 `deadhead-legs` + `Between` + `from/to`。
- 拒绝未知 `mode`。
- 拒绝 `deadhead-legs` 缺少 operator。
- 拒绝 `deadhead-legs` 缺少数字。
- 拒绝 `Between` 中 `from > to`。
- 拒绝 `any-deadhead` 携带 `operator` / `legs` / `from` / `to`。
- 拒绝 `deadhead-only-duty` 携带 `operator` / `legs` / `from` / `to`。
- 拒绝负数、小数、非数字字符串。
- 拒绝旧 `122 stepper` / `stepper-range` / `flag` / `select` payload。

后端 SQL 测试：

- `any-deadhead` 生成 `exists` + `seg_assignment = 'DHD'`。
- `deadhead-legs` 生成 `count(*)` 数量比较。
- `deadhead-legs Between` 生成 range 比较。
- `deadhead-only-duty` 按 `duty_seq` 聚合，要求该 duty 全部 active segments 都是 `DHD`。
- `Avoid` 正确包裹 `not (...)`。

Playwright / 真实 UI 覆盖：

- 新增或更新真实 Portal E2E，例如：

```text
e2e/tests/pbs-portal/deadhead-flying.spec.ts
```

- 覆盖 Pairing 页面真实弹窗：
  - 打开 `Deadhead Flying`。
  - 默认 `Award`，tier 为空。
  - `Any deadhead` 默认选中，且不显示 `DEADHEAD LEGS`。
  - 切到 `Deadhead-only duty`，仍不显示 `DEADHEAD LEGS`。
  - 切到 `Deadhead legs`，显示 operator 和数字输入。
  - 切到 `Between`，显示 `From` / `To`。
  - Add Bid 后 summary / payload 正确。
- 覆盖 Search Pairings 中复用 editor 的编辑 / 回显路径，避免主 Pairing 页面和 Search Pairings 行为分叉。

建议验证命令：

```bash
npm --prefix pbs-server test -- pairing-property-validation pairing-search-condition-builder pairing-bids
npm --prefix pbs-server run build
npm --prefix pbs-portal test -- pairing-page pairing-bid-control pairing-bid-control-logic pairing-property-catalog
npm --prefix pbs-portal run build
npx playwright test e2e/tests/pbs-portal/deadhead-flying.spec.ts --reporter=list
npm run check:ui
git diff --check
```

## 验收标准

- 员工端只看到 `Deadhead Flying` 一个 deadhead 合并条件入口。
- `128 / 147 / 148` 不再出现在员工端 property catalog。
- `Deadhead Flying` 弹窗符合原型：简洁、默认 Award、按 mode 条件显示数字比较行。
- `Any deadhead`、`Deadhead-only duty`、`Deadhead legs` 三种语义可分别保存、展示、搜索。
- 旧 `122` 数字 payload 和旧 deadhead property 数据不再被兼容。
- 数据库 seed、migration、contracts、portal、server validation、search SQL、summary 和测试同步。
- migration 只在用户明确要求后执行。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这个改动虽然跨 contracts / portal / server / SQL，但核心是一个 property 的 contract 收敛。payload、UI、validation、search SQL 必须保持强一致；并行拆分容易造成命名和边界漂移。
- Suggested split: 不拆分，由一个 agent 顺序完成。
- Write boundaries: 单 agent 依次修改 contract -> portal editor -> server validation/search -> seed/migration -> tests。
- Conflict risk: 中。会触碰共享 pairing dialog、contract、server search 和 seed；需要避免和当前工作区内其他未提交改动互相覆盖。
- Execution gate: 本 spec 经用户确认后再进入实现；实现前先检查当前 dirty worktree，并只改 Deadhead Flying 相关文件。
