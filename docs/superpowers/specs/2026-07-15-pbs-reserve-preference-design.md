# PBS Reserve Preference 设计确认

## 背景

Jen 在 `init-docs/Bidding Options V1(2).xlsx` 第 21 行把该条件列为唯一的 `Reserve` 条件：

- `Category`: `Reserve`
- `Final Bid Option`: `Reserve Preference`
- `Purpose`: `Crew bids for reserve periods.`
- `Required Fields / Inputs`: `Date, date range, short-call type, half-month option`
- `Rules / Defaults`: `Must align with reserve assignment logic.`
- `Notes for Developers`: `Only reserve-specific bid listed.`

Jen 没有给出具体例子，但字段表达很明确：这是员工在 Reserve 页面里表达 reserve period 偏好的条件，不是 `Line / Reserve Avoidance`，也不是 Pairing 条件。

当前项目已有接近能力：

- `propertyCode = 301`
- 当前名称：`Short Call Type`
- 当前 bid type：`Reserve`
- 当前支持：
  - short-call type：`CRAM / CRPM / PRAM / PRMM / PRPM / RESA / RESB`
  - date scope：`Whole Month / First Half / Second Half / Date Range / Specific Dates`

这已经覆盖 Jen 写的 `Date, date range, short-call type, half-month option`，因此本版不新建 property code，而是在现有 `301 Short Call Type` 上升级为 `Reserve Preference`。

当前 DB 里还存在并可见多个 Reserve 相关条件：

- `301 Short Call Type`
- `302 Reserve Day On`
- `311 Reserve Prefer Off`
- `312 Reserve Day of Week Off`
- `313 Reserve Work Block Size`
- `314 Waive to Allow Carry over to be Days Off`

其中 `312/313/314` 当前属于 Standing Reserve 长期偏好 catalog，不应在本次 Current Reserve 页面改造中全局停用。当前前端 Reserve 页面还存在 `Legacy Reserve` / `AA Prefer Off` 模式切换，并按 mode 过滤 property。后续员工端 Current Reserve 只展示 Jen Excel 里的 Reserve 条件，因此 Current Reserve 页面应收敛成一个 `Reserve Preference` 入口。

## 目标

1. 员工端 Reserve 页面只展示 `Reserve Preference`。
2. 复用 `propertyCode = 301`，不新增新 property code。
3. 把 `301 Short Call Type` 重命名为 `Reserve Preference`。
4. `Reserve Preference` 保留并明确以下输入：
   - short-call type
   - whole month
   - first half
   - second half
   - date range
   - specific dates
5. Current Reserve 页面隐藏不在 Jen Excel 里的 Reserve 入口：
   - `302 Reserve Day On`
   - `311 Reserve Prefer Off`
6. 前端移除或隐藏 `Legacy Reserve / AA Prefer Off` 员工端模式切换。
7. Reserve 页面 calendar click 入口如果继续保留，必须打开 `Reserve Preference`，并预填当前日期到 `Specific Dates`，而不是直接创建 `Reserve Day On` 或 `Reserve Prefer Off`。
8. 旧 Reserve property 数据不做兼容；项目未上线，migration 可清理旧数据。
9. 保留现有 `reserve-call-type-date-scope` payload 结构，避免无必要重写保存/校验/summary 流程。
10. 不误伤 Standing Reserve：`312/313/314` 如仍由 Standing Bid 使用，本版不全局停用。

## 非目标

- 不新增 `propertyCode`。
- 不实现新的算法 assignment logic。
- 不在本版修改 `Line / Reserve Avoidance`。
- 不保留员工端 `Reserve Prefer Off` 作为单独入口。
- 不保留员工端 `Reserve Day On` 作为单独入口。
- 不改变 Standing Reserve 长期偏好入口；`312/313/314` 是否继续展示在 Standing Bid 中不在本版调整。
- 不新增 `Award / Avoid`，因为 Jen 的 `Reserve Preference` 是 reserve period 偏好，不是 award/avoid 条件。
- 不做旧 payload 长期兼容；旧开发期数据直接清理。
- 不改变 short-call type 的字典来源；当前仍先使用已有固定选项，后续如管理端要配置再单独设计。

## 产品语义

`Reserve Preference` 表达员工希望获得某种 reserve period。

示例理解：

- 员工偏好整月 `PRAM` reserve。
- 员工偏好上半月 `CRAM` reserve。
- 员工偏好 `Jun 1 - Jun 15` 的 `PRPM` reserve。
- 员工偏好几个指定日期的 `RESA` reserve。

该条件默认是正向 preference，不需要 `Award / Avoid`：

- 想避免 reserve 的语义已经由 `Line / Reserve Avoidance` 表达。
- 在 Reserve 页面里选择 `Reserve Preference`，默认含义就是“我偏好这种 reserve”。

## UI 设计

### 页面层

Reserve 页面应从多模式收敛为单一 Reserve 条件页面：

- 不显示 `Legacy Reserve`
- 不显示 `AA Prefer Off`
- Add / calendar action 只围绕 `Reserve Preference`

### 弹窗层

弹窗标题：

```text
Configure Reserve Preference
```

弹窗字段：

1. `TIERS · REQUIRED`
   - 使用现有 Reserve / Lineholder tier toggle 逻辑。
   - 默认不选时保存禁用。
2. `SHORT-CALL TYPE`
   - 使用现有 short-call type select。
   - 默认值可继续使用当前 `PRAM`，除非现有产品行为要求空值。
3. `DATE SCOPE`
   - `Whole Month`
   - `First Half`
   - `Second Half`
   - `Date Range`
   - `Specific Dates`
4. Footer
   - `Cancel`
   - `Add Bid` / `Update Bid`

如果当前 Reserve 页面没有 favorite 体系，本版不新增 favorite。若现有共享组件已有 favorite，不在本版扩大功能。

### Calendar click 行为

Current Reserve calendar click 不再直接创建 `302 Reserve Day On` 或 `311 Reserve Prefer Off`。

推荐行为：

1. 用户点击某个 reserve calendar 日期。
2. 打开 `Configure Reserve Preference` 弹窗。
3. 弹窗预填：
   - `DATE SCOPE = Specific Dates`
   - `Specific Dates = [clicked date]`
   - `SHORT-CALL TYPE = 当前默认值`，例如现有 `PRAM`
   - `TIERS = 用户在 calendar popover 中选择的 tiers`，如没有则保持空并要求用户选择
4. 用户仍需点击 `Add Bid` 确认保存。

不采用“点击日期后静默保存”，因为 `Reserve Preference` 还需要 short-call type 和 tier，静默保存容易误导。

### 日期范围行为

- `Whole Month`：无需额外日期输入。
- `First Half`：无需额外日期输入。
- `Second Half`：无需额外日期输入。
- `Date Range`：必须填写 `from` 和 `to`，且 `to >= from`。
- `Specific Dates`：至少一个 ISO 日期，去重。

### Existing row / summary

推荐 summary：

- `Reserve Preference · PRAM · Whole Month`
- `Reserve Preference · CRAM · First Half`
- `Reserve Preference · PRPM · Jun 1 - Jun 15`
- `Reserve Preference · RESA · 3 dates`

具体日期格式沿用当前 Reserve / Portal 日期显示规范，不在本 spec 强行引入新格式。

## Payload / Contract 设计

本版保留现有 reserve-call-type date-scope payload，避免无必要重写：

```ts
type ReservePreferenceBid = {
  propertyCode: 301;
  name: "Reserve Preference";
  bid: {
    type: "reserve-call-type-date-scope";
    callType: string;
    options: string[];
    dateScope:
      | { mode: "whole_month" }
      | { mode: "first_half" }
      | { mode: "second_half" }
      | { mode: "date_range"; from: string; to: string }
      | { mode: "specific_dates"; dates: string[] };
  };
  tiers: string[];
};
```

规则：

- `propertyCode = 301`。
- `name` 由后端 catalog 返回 `Reserve Preference`。
- `bid.type = "reserve-call-type-date-scope"`。
- Reserve contract 不携带 `action` 字段；数据库 `pbs_bid_group.action_id` 保持 `null`。
- `tiers` 至少一个。
- `callType` 必须在现有 `pbsReserveShortCallTypes` 内。
- `dateScope` 必须完整且合法。

### Draft mode 契约

当前 `PbsReserveDraftDocument` 仍有 `mode: "legacy" | "aa-prefer-off"`，route schema 也校验该字段。本版推荐最小改造：

- UI 不再显示 mode toggle。
- 前端保存时继续发送 `mode = "legacy"` 作为 deprecated internal field。
- 后端继续接受 `mode = "legacy"`，但不再用它决定员工端可见入口。
- 不在本版移除 API mode 字段，避免扩大 route / mapper / persisted draft 兼容范围。

后续如果要彻底删除 mode 字段，应单独设计 API contract migration。

## 数据库 / Catalog

### `301` 更新

复用并更新 `property_code = 301`：

- `bid_type`: `Reserve`
- `property_name`: `Reserve Preference`
- `award_or_avoid`: `null`
- `any_or_every`: `null`
- `operator_options`: `null`
- `validation_json`: 建议更新为 `{"type":"reserve_preference","label":"Reserve Preference","dateScope":["whole_month","first_half","second_half","date_range","specific_dates"],"shortCallType":true}`
- `tooltip`: `Crew bids for reserve periods by short-call type and date scope.`
- `source_type`: 可继续保留当前值，不为改名强行迁移来源语义。
- `is_visible_in_portal`: `1`
- `is_active`: `1`

### Current Reserve 需要隐藏的条件

设置为隐藏并停用：

- `302 Reserve Day On`
- `311 Reserve Prefer Off`

建议：

- `is_visible_in_portal = 0`
- `is_active = 0`
- `recommended_order = null`
- `recommended_usage_count = 0`

`312/313/314` 不在 Current Reserve contract 中作为员工端入口展示，但它们目前属于 Standing Reserve catalog，本版不全局停用、不清理对应 Standing 数据。

### 旧数据清理

项目未上线，不做旧数据兼容。migration 应清理这些被隐藏 Reserve property 产生的开发期数据：

- `pbs_bid_group`
- `pbs_bid_condition`
- generic property favorite
- Reserve-specific favorite，如果存在
- 空 bid container，如现有清理脚本已有相同模式则复用

清理范围必须限定：

- `bid_type = 'Reserve'`
- property code in `(302, 311)`

清理算法必须同时考虑 legacy code 和稳定 definition id：

1. 从 `pbs_bid_property` 找出 `bid_type='Reserve'` 且 `property_code in (302, 311)` 的 obsolete property rows。
2. 通过 `pbs_bid_group.property_id = obsolete.property_code` 或 `pbs_bid_group.property_definition_id = obsolete.id` 找到目标 group。
3. 通过 `pbs_bid_condition.property_id = obsolete.property_code` 或 `pbs_bid_condition.property_definition_id = obsolete.id` 补充定位目标 `bid_id + bid_type + property_group_key`。
4. 删除这些 target groups 下的 condition / occurrence / group / favorite。
5. 仅当 bid container 已无其它子记录时，删除空 `pbs_bid`。

不删除 `301` 已有数据；`301` 只改名，既有 `reserve-call-type-date-scope` 数据可以继续被当前逻辑读取。

## Frontend 实现影响

预计涉及：

- `packages/contracts/pbs-reserve-bids.js`
- `packages/contracts/pbs-reserve-bids.d.ts`
- `pbs-portal/src/features/reserve/pages/reserve-page.tsx`
- `pbs-portal/src/features/reserve/components/reserve-bid-dialog.tsx`
- `pbs-portal/src/features/reserve/components/reserve-short-call-type-dialog.tsx`
- `pbs-portal/src/features/reserve/components/reserve-date-scope-control.tsx`
- `pbs-portal/src/shared/services/reserve-service.ts`
- Reserve page / dialog tests
- Help topics，如存在 Reserve 帮助文档

实现原则：

1. `pbsSupportedReservePropertyCatalog` 只对员工端暴露 `301 Reserve Preference`。
2. 前端不再通过 `legacyReservePropertyCodes` / `aaReservePropertyCodes` 切换两个模式。
3. 删除或隐藏 `ReserveModeToggle`。
4. Calendar action 的 template 使用 `301 Reserve Preference`。
5. Dialog 继续复用现有 short-call type + date scope 控件。
6. 所有 UI display name 使用后端 catalog name。
7. Existing property summary 不再显示 `Short Call Type`。
8. `302/311` 如在历史数据中出现，后端 migration 清掉；前端不再为这些 code 提供新增入口。
9. `312/313/314` 属于 Standing Reserve 范围时，不在 Current Reserve 页面展示，也不在本版前端删除 Standing 入口。

## Backend 实现影响

预计涉及：

- `pbs-server/src/services/reserve/reserve-validation.ts`
- `pbs-server/src/services/reserve/reserve-bid-service.ts`
- `pbs-server/src/services/reserve/reserve-property-catalog.ts`
- reserve route tests
- reserve validation tests
- lineholder summary / serialization，如果 Reserve 共用 lineholder helpers
- `sql/seed/10-pbs-bid-property.sql`
- 新增 migration

实现原则：

1. catalog 只返回 `is_visible_in_portal=1` 且 contract 支持的 `301`。
2. `catalogByCode` 是否保留隐藏 property 仅用于历史读取；本版清理旧数据后，前端不依赖隐藏 property。
3. validation 对 `301` 保持现有 `reserve-call-type-date-scope` 校验。
4. Current Reserve validation 不再接受 `302/311` 的新写入。
5. route schema 不新增临时兼容字段。
6. reserve draft `mode` 字段暂时保留，前端隐藏，后端不再依赖它切换员工端 catalog。

## Algorithm / Export 边界

Jen 只要求员工端 Reserve 条件表达；本版不实现新的 optimizer assignment 语义。

如果当前系统已经有 Reserve bid export：

- 保持不崩溃。
- `301` 的导出描述应使用 `Reserve Preference` 命名。
- 隐藏 property 不应再导出。

如果当前系统尚未真正消费 Reserve Preference：

- 本版只保证保存、读取、summary、页面展示一致。
- 后续算法如何利用 `short-call type + date scope` 单独设计。

## 测试要求

### 自动化测试

至少覆盖：

1. Reserve catalog 只返回 `301 Reserve Preference`。
2. `301` 新建 / 编辑保存 `reserve-call-type-date-scope` 成功。
3. `301` 支持 `Whole Month / First Half / Second Half / Date Range / Specific Dates`。
4. 无 tier 时保存失败。
5. invalid call type 保存失败。
6. invalid date range 保存失败。
7. `302/311` 不出现在 Current Reserve 新增入口。
8. `312/313/314` 不出现在 Current Reserve 新增入口，但 Standing Reserve 入口不被本次改动破坏。
9. 前端 Reserve 页面不显示 mode toggle。
10. 前端弹窗标题显示 `Configure Reserve Preference`。
11. Existing row summary 使用 `Reserve Preference`。

### E2E / UI

需要 Playwright 覆盖真实 UI：

1. 打开 Reserve 页面。
2. 确认只看到 `Reserve Preference` 入口。
3. 添加一个 `Reserve Preference`：
   - 选择 tier
   - 选择 short-call type
   - 选择 `First Half`
   - 保存
4. Existing row 正确显示。
5. 再编辑为 `Date Range` 并保存。
6. 点击 reserve calendar 某个日期时，打开 `Configure Reserve Preference`，并预填 `Specific Dates=[clicked date]`，不会静默创建旧 `302/311` bid。

### UI 标准

Reserve 页面 / 弹窗样式改动后运行：

```bash
npm run check:ui
```

### 构建 / 测试

最小验证：

```bash
npm --prefix pbs-server test -- reserve
npm --prefix pbs-server run build
npm --prefix pbs-portal test -- reserve
npm --prefix pbs-portal run build
```

如果实现触及 algorithm export / lineholder summary：

```bash
npm --prefix pbs-server test -- algorithm-export
```

跨模块有 contract 改动时，建议再运行：

```bash
npm run verify:pbs
```

如 `verify:pbs` 因已知 unrelated algorithm export 测试失败，需要在交付说明中明确列出。

### QA 人工测试文档

实现时新增：

```text
docs/test-cases/pbs/reserve/2026-07-15-reserve-preference.md
```

内容至少覆盖新增、编辑、calendar click、隐藏旧入口、异常日期、无 tier 禁用、Standing Reserve 不回归。

## Migration 执行要求

新增 migration 后需要执行到当前使用的 PBS schemas：

- `f8_pbs`
- `f8_sit_pbs`
- `f8_uat_pbs`

执行后验证：

```sql
select property_code, property_name, is_visible_in_portal, is_active
from pbs_bid_property
where bid_type = 'Reserve'
order by property_code;
```

预期：

- `301 Reserve Preference` visible + active。
- `302/311` hidden + inactive。
- `312/313/314` 不因本 migration 被全局停用；如 Standing Reserve 仍使用它们，应保持 active/visible。

如果服务已运行，需要清理或等待 Reserve property catalog cache，必要时重启 `pbs-server`。

## 风险与注意事项

1. 当前 Reserve 页面 mode 逻辑是前端本地过滤，不只是 DB 可见性；实现时必须移除或绕开 mode toggle。
2. `302 Reserve Day On` 当前 calendar click 可能在用；改造后 calendar click 必须转向 `301 Reserve Preference`，否则页面行为会和 catalog 不一致。
3. `301` 改名后，测试和 Help 文案不能再断言 `Short Call Type` 是用户可见 property 名。
4. `311 Reserve Prefer Off` 与 Days Off 的 Prefer Off 容易混淆；隐藏后应确认不会在 Reserve 页面残留。
5. 后端 `catalogByCode` 如果保留隐藏 property 给历史数据读取，不能让它们回到员工端新增入口。
6. migration 清理旧数据前要确认 FK 删除顺序，避免半清理。
7. 如果用户期望“不要 reserve”，必须引导到 `Line / Reserve Avoidance`，不要在 `Reserve Preference` 中加 Avoid。
8. 不要把 Current Reserve cleanup 扩大成 Standing Reserve cleanup；`312/313/314` 当前仍可能由 Standing Bid 使用。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是一个小范围但契约强耦合的 Reserve 条件改造，涉及 DB catalog、contract、Reserve 页面 mode、dialog、validation 和测试；拆分会增加 payload / visible catalog 不一致风险。
- Suggested split: 不建议并行。由一个实现流顺序完成 migration/contract → backend validation/catalog → frontend UI → tests → verification。
- Write boundaries: 如必须拆，只能拆文档/测试与实现；收益不高。
- Conflict risk: Medium，主要风险是旧 Reserve mode、旧 property code 和 calendar action 残留。
- Execution gate: 用户确认本 spec 后再开始实现。

## 验收标准

1. Reserve 页面只展示 `Reserve Preference`。
2. 员工端不再显示 `Legacy Reserve / AA Prefer Off` mode toggle。
3. Current Reserve 页面不再显示 `Reserve Prefer Off`、`Reserve Day On` 入口。
4. Standing Reserve 的 `Reserve Day of Week Off`、`Reserve Work Block Size`、`Waive...` 不被本版误删或停用。
5. `Reserve Preference` 弹窗支持 short-call type + whole month / first half / second half / date range / specific dates。
6. 保存 payload 使用 `propertyCode=301` 和 `reserve-call-type-date-scope`，Reserve contract 不携带 `action`。
7. Existing row / summary 显示 `Reserve Preference`。
8. DB 中 `301` visible + active，`302/311` hidden + inactive。
9. 旧隐藏 Current Reserve property 的开发期数据已清理。
10. 相关 Vitest、build、`npm run check:ui`、PBS Portal Playwright、QA 人工测试文档覆盖通过。
