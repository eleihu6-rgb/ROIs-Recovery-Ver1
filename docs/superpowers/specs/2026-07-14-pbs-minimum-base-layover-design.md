# PBS Minimum Base Layover 设计确认

## 背景

Jen 在 `init-docs/Bidding Options V1(2).xlsx` 第 16 行对 `Minimum Base Layover` 的定义是：

- `Category`: `Line`
- `Condition`: `Minimum Base Layover`
- `Description`: `Controls minimum spacing between pairings at home base.`
- `Inputs`: `Minimum hours between pairings`
- `Rules`: `Cannot be less than system-defined base layover minimum. Current assumption: 13 hours.`
- `Notes`: `Keep, but enforce system minimum.`

因此这个条件属于 `Line`，不是 `Pairing`。它表达的是员工希望两个 pairing 在 home base 之间至少保留多少 layover 间隔，但用户输入不能低于系统定义的 base layover 最小值。Jen 当前假设系统最小值是 `13 hours`。

当前项目已经存在旧 Line 条件：

- `propertyCode = 407`
- 旧展示名：`Min Base Layover`
- contract 默认值：`{ type: "text", value: "013:00" }`
- seed validation：`{"type":"duration","format":"HHH:MM","label":"Min Duration"}`
- 后端 validation：要求 `text` 且符合 duration 格式
- crew bid import：可解析 `Minimum Base Layover HHH:MM`
- algorithm export：使用 `407 / MIN_BASE_LAYOVER`

项目尚未上线，因此 saved bid / favorite / draft 旧 payload 不做运行时兼容。旧 `407 Min Base Layover` 只作为 property code、import/export 语义和算法规则来源；员工端最终以新的 `Minimum Base Layover` contract 为准。

## 目标

1. 复用现有 `propertyCode = 407`，不新增新的 Line property。
2. 员工端展示名从 `Min Base Layover` 改为 `Minimum Base Layover`。
3. 保留 algorithm rule code `MIN_BASE_LAYOVER`，避免扩大求解器/export 影响。
4. 将旧 generic `text` 输入升级为专用 bid payload 和专用 UI 控件。
5. UI 使用本轮新条件统一的简洁弹窗风格：`TIERS` -> 条件字段 -> footer。
6. 不显示 `PREFERENCE / Award / Avoid`，因为 Jen 表达的是 Line 约束，不是偏好方向切换。
7. 输入采用 duration 格式，员工端显示 `13:00` 这种简洁格式；后端/export 仍可接受和输出既有 `HHH:MM` 格式。
8. 最小值由系统配置控制，当前初始配置为 `13:00`；用户输入低于 `13:00` 时前后端都必须拒绝。
9. 清理旧 `407` saved bid / favorite / draft 数据，不做旧 `text` payload 兼容。
10. 保持 crew-bid import 对 legacy 文本 `Minimum Base Layover 017:00` 的解析能力，但解析结果写入新的 canonical payload。

## 非目标

- 不新增管理端配置页面；当前系统最小值先通过数据库配置 / migration 写入。
- 不改 pairing、pairing_segment、line、roster 数据模型。
- 不改变 `407 / MIN_BASE_LAYOVER` 在 algorithm export 中的规则身份。
- 不把这个条件放到 Pairing 条件组。
- 不加 Award/Avoid、operator、Between、日期范围或其他高级条件。
- 不兼容旧员工端 `{ type: "text" }` saved bid payload；开发期旧数据直接清理。
- 不在 UI 中展示长解释文案；员工自己不需要看到实现说明。

## Jen 语义解释

Jen 的核心语义是：

> Controls minimum spacing between pairings at home base.

本系统解释为：

- 员工设置一个最小 base layover duration。
- 这个 duration 表示同一条 line 上，前一个 pairing 回到 home base 到下一个 pairing 从 home base 开始之间，至少要间隔这么久。
- 用户输入不能低于系统定义的 base layover 最小值。
- 当前系统最小值假设为 `13:00`。

示例：

- `Minimum Base Layover = 14:00`：希望两个 pairing 在 home base 之间至少间隔 14 小时。
- `Minimum Base Layover = 17:00`：希望至少间隔 17 小时；legacy bid report 里已经存在类似 `Minimum Base Layover 017:00` 的数据。
- `Minimum Base Layover = 12:00`：不允许保存，因为低于系统最小值 `13:00`。

Jen 没有给具体例子，上述例子是从她的 description / inputs / rules 推导出来的业务表达。

## UI 设计

原型路径：

```text
pbs-portal/.superpowers/minimum-base-layover-v1.html
```

弹窗结构：

1. `Configure Minimum Base Layover`
2. `TIERS`
   - 使用统一 tier toggle 样式。
   - 默认不选，保存前必填。
3. `MINIMUM BASE LAYOVER`
   - 单个 duration 输入框。
   - 默认显示系统最小值 `13:00`。
   - suffix 显示 `HH:MM`。
   - helper 仅显示 `Minimum 13:00`。
4. Footer
   - `Cancel`
   - `Save Favorite`
   - `Add Bid` / `Update Bid`

字段交互：

- 不显示 `PREFERENCE`。
- 不显示 `Award / Avoid`。
- 不显示 operator 下拉。
- 输入框支持用户输入 `13:00`、`17:00`、`017:00` 这类 duration。
- UI 展示优先使用简洁格式，例如 `13:00`；如果后端返回 `013:00`，前端回显时可显示为 `13:00`。
- 输入为空、格式错误、分钟不在 `00-59`、或 duration 低于系统最小值时，保存按钮不可用。
- 失焦时可规范化显示格式；例如 `017:00` 显示为 `17:00`。
- 保存前必须至少选择一个 tier。

UI 简洁原则：

- 员工端不展示“系统定义”“current assumption”等解释段落。
- 只保留 `Minimum 13:00` 这种必要边界提示。
- 不使用普通 text input 的视觉语义误导用户这是任意文本；应使用 duration-specific control。

## Payload 设计

推荐将 `propertyCode = 407` 的 bid payload 升级为专用结构：

```ts
type MinimumBaseLayoverBid = {
  type: "minimum-base-layover";
  minimumDuration: string;
};
```

规则：

- `minimumDuration` 表示员工选择的最小 base layover duration。
- 新建/编辑时 canonical payload 使用 `type: "minimum-base-layover"`。
- 前端可用 `13:00` 作为展示值。
- 后端保存/序列化/export 可规范化为既有 `HHH:MM`，例如 `013:00`，以保持 `MIN_BASE_LAYOVER` 下游规则稳定。
- duration parser 应接受 `H:MM`、`HH:MM`、`HHH:MM` 中合理形式；当前业务可保存值必须大于等于系统最小值，因此实际小于 `13:00` 的输入会被拒绝。
- minutes 必须是 `00-59`。
- `minimumDuration` 不允许为空。
- `propertyCode = 407` 只接受 `type: "minimum-base-layover"` 作为员工端 draft / saved bid 的有效 payload。
- 旧 `{ type: "text", value: "013:00" }` 不再作为 `407` 的员工端保存 payload。

## 系统最小值配置

系统最小值不能散落硬编码到前端。初始版本通过 `pbs_bid_property.validation_json` 或同等后端配置写入：

```json
{
  "type": "minimum_base_layover",
  "label": "Minimum Base Layover",
  "format": "HHH:MM",
  "minDuration": "013:00"
}
```

要求：

- migration / seed 同步更新 `propertyCode = 407`。
- 前端通过 catalog / validation config 获取 `minDuration`，显示为 `13:00`。
- 后端 validation 以配置值为准。
- 如果配置缺失，后端可以 defensive fallback 到 `013:00`，但测试和 migration 仍应保证 F8 默认配置存在。
- 后续管理端上线后，可以把 `minDuration` 改为管理端维护的公司参数；本次不实现管理端。

## 数据库 / Catalog

复用并更新 `property_code = 407`：

- `bid_type`: `Line`
- `property_name`: `Minimum Base Layover`
- `award_or_avoid`: `null`
- `any_or_every`: `null`
- `operator_options`: `null`
- `validation_json`: 使用 `minimum_base_layover` 专用配置
- `description`: 更新为 `Set minimum base layover between pairings at home base.`
- `source_type`: 可继续沿用 `legacy`，因为 property code / algorithm rule 来源仍是旧库
- `is_visible_in_portal`: `1`

需要 migration 清理：

- 旧 `407` draft properties
- 旧 `407` saved/current properties
- 旧 `407` favorite entries
- 与 `407` 旧 `{ type: "text" }` payload 相关的 line bid snapshot/config 数据

清理范围必须按现有表结构实际确认，不能盲删无关 Line 条件。

## 前端实现影响

预计涉及：

- `packages/contracts/pbs-line-bids.js`
- `packages/contracts/pbs-line-bids.d.ts`
- `pbs-portal/src/features/line/components/line-bid-dialog.tsx`
- `pbs-portal/src/features/line/pages/line-page.tsx`
- `pbs-portal/src/features/line/line-draft-mappers.ts`
- `pbs-portal/src/shared/services/line-service.ts`
- 对应 line 页面 / service 测试

实现原则：

- 在 Line dialog 中为 `propertyCode = 407` 增加专用 control，不再走 generic `text` input。
- 如果当前 Line Credit Window 已经引入 duration parser / config service，优先复用可抽取的 parse/format 工具，但不要把 credit window 业务语义和 base layover 业务语义耦合在一起。
- `TIERS` 选择、footer、disabled 状态复用现有 Line dialog 行为。
- `startWithNoActiveTiers` 语义保持：从 Add 入口打开时默认不选 tier。
- summary 建议：
  - draft/right panel: `At least 13:00 base layover`
  - lineholder summary/export-facing text: `Award at least 013:00 base layover` 或规范化后的等价文本
- UI 文案保持英文，因为产品 UI 默认英文。

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
- 对应 line validation / route / import / rule bid value 测试

验证规则：

- `propertyCode = 407` 必须使用 `minimum-base-layover` payload。
- `minimumDuration` 必须是有效 duration。
- `minimumDuration >= configured minDuration`。
- 错误信息建议：`Minimum Base Layover must be at least 13:00.`
- legacy import 文本 `Minimum Base Layover 017:00` 应映射为：

```json
{
  "type": "minimum-base-layover",
  "minimumDuration": "017:00"
}
```

序列化 / export：

- 对 algorithm / rule bid serialization 继续输出 `propertyCode = 407`。
- `paramA` / `Parameters_JSON.value` 继续使用规范化 duration，建议为 `HHH:MM`。
- `rule_name` 仍为 `MIN_BASE_LAYOVER`。
- metadata 展示名更新为 `Minimum Base Layover`。

## 测试要求

自动化测试：

1. Contract / mapper
   - `407` catalog name 更新为 `Minimum Base Layover`。
   - default bid 为 `minimum-base-layover`。
   - existing saved `minimum-base-layover` 可正确映射回页面。
2. Frontend
   - 点击 `Minimum Base Layover` 打开配置弹窗。
   - 默认显示 `13:00` 和 `Minimum 13:00`。
   - 不显示 `PREFERENCE`。
   - 未选择 tier 时不可保存。
   - 输入 `12:00` 不可保存并提示最小值。
   - 输入 `13:00` 或 `17:00` 且选择 tier 后可保存。
3. Backend validation
   - 拒绝旧 `text` payload。
   - 拒绝格式错误 duration。
   - 拒绝低于配置最小值的 duration。
   - 接受 `013:00`、`13:00`、`017:00` 中符合规则的值。
4. Import
   - `Minimum Base Layover 013:00` 和 `Minimum Base Layover 017:00` 解析到新 payload。
5. Serialization / summary
   - 保存后 rule bid value / summary / export 仍能输出 `407 / MIN_BASE_LAYOVER`。
6. Migration
   - `property_code = 407` catalog 更新成功。
   - 旧 `407` bid/favorite/draft 数据被清理。

人工 QA 测试用例需要新增到：

```text
docs/test-cases/pbs/line/2026-07-14-minimum-base-layover.md
```

至少覆盖：

- 添加有效 `13:00`
- 添加有效 `17:00`
- 低于最小值被拒绝
- favorite 保存/回显
- 保存草稿后刷新回显
- legacy import 回显

## 验收标准

- Line 可见 catalog 中显示 `Minimum Base Layover`。
- 点击该条件打开专用弹窗，结构符合原型。
- 弹窗没有 Award/Avoid。
- 默认值 / helper 使用系统最小值 `13:00`。
- 低于系统最小值不能保存，前后端一致拒绝。
- 有效值保存后刷新仍能正确回显。
- crew bid import 仍能解析 legacy 文本。
- algorithm export 仍输出 `407 / MIN_BASE_LAYOVER`。
- 旧 `407` text payload 数据已清理，不保留运行时兼容分支。
- 新增/更新的自动化测试和 QA 用例通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 该功能跨 contracts、Line dialog、line service、validation、rule bid serialization、migration 和测试，但核心文件与当前正在进行的 Line Credit Window 改动高度重叠。并行开发容易互相覆盖同一批文件。
- Suggested split: 暂不拆分。等 Line Credit Window 改动合并或工作区清理后，由一个 agent 顺序完成；必要时只把只读 review / 测试用例补充交给子 agent。
- Write boundaries: 单 agent 写入 `packages/contracts`、`pbs-portal/src/features/line`、`pbs-server/src/services/line*`、`sql/migration`、`docs/test-cases/pbs/line`。
- Conflict risk: High，尤其是 `pbs-line-bids.js`、`line-bid-dialog.tsx`、`line-validation.ts`、`line-bid-service.ts`、Line 页面测试。
- Execution gate: 用户确认 spec 后再实施；实施前先确认当前 Line Credit Window 工作区状态，避免覆盖同事未提交改动。

## 待确认点

当前没有阻塞实施的问题。默认按以下结论推进：

- 复用 `propertyCode = 407`。
- 不新增 Award/Avoid。
- 系统最小值初始为 `13:00`。
- 员工端显示 `13:00`，后端/export 可继续规范化为 `013:00`。
- 旧 saved bid / favorite / draft 数据清理，不做兼容。
