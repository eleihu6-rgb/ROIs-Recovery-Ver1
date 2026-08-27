# PBS Pairing Preference Jen 对齐设计

## 背景

Jen 的 `Bidding Options V1(2).xlsx` 将 Pairing 类的 `Pairing Preference` 定义为：

- Purpose：Crew bids for or avoids specific pairing numbers.
- Required Fields：Pairing number, date, date range, minimum required, maximum required, award/avoid.
- Example / Rule：`I want PR141 between the 15th–21st, maximum 2.`
- Developer Note：Rename from pairing number bid.

因此本次不是新增 property，而是在现有 `propertyCode=102` 的 `Pairing Number` 基础上改名并增强为 `Pairing Preference`。UI 和交互以当前 HTML 原型为准：

`/Users/lei/Codehub/rois-ai/.superpowers/brainstorm/23895-1783755069/pairing-preference-v1-jen-aligned.html`

## 目标

1. `propertyCode=102` 在产品 UI 中显示为 `Pairing Preference`。
2. 配置弹窗视觉和行为参考已确认的 Prefer Off、Long Stretch Off / Compressed Flying、Commuter Pattern 原型。
3. 用户可以选择一个或多个 Pairing Number，并选择 Award / Avoid。
4. 日期限制不是必填；关闭时表示整个月内匹配这些 pairing。
5. 用户打开日期限制后，可选择 Specific Date 或 Date Range。
6. 如果填写日期，必须校验所选 pairing 在该日期或日期范围内实际存在 run。
7. Fulfilment 支持 `Minimum Required`、`Maximum Required` 至少填一个；二者同时填写时必须满足 `min <= max`。
8. 当日期范围或 selected pairings 产生的可匹配 run 数量不足时，禁用 `SAVE FAVORITE` 和 `ADD BID`。

## 非目标

- 不改变 `propertyCode=102` 的稳定身份原则：保存语义仍使用 live `pairing.id`，展示使用用户可读 pairing number。
- 不新增新的 Pairing property code。
- 不做算法最终格式定稿；但 payload 需保留足够语义供算法后续改造。
- 不把日期限制做成必填项。
- 不允许自由输入未从 pairing 搜索结果中选中的 pairing number。

## 用户界面

弹窗标题：

- 主标题：`Configure Pairing Preference`

字段顺序：

1. `TIERS`
   - 默认 `T1`。
   - 允许取消最后一个 Tier。
   - 空选时显示 `Required`，禁用 `SAVE FAVORITE` / `ADD BID`。

2. `PREFERENCE`
   - 分段按钮：`Award` / `Avoid`。
   - 默认 `Award`。
   - 按钮必须有 pointer cursor。

3. `PAIRING NUMBER`
   - 多选 autocomplete。
   - chip 展示 pairing number，例如 `PR141`。
   - 内部保存 pairing id。

4. `LIMIT TO RUN DATE`
   - switch 默认关闭。
   - 关闭时不显示日期控件，payload 不带 date scope。
   - 打开后显示：
     - `Specific Date`
     - `Date Range`
   - 日期控件复用 Prefer Off 已确认的真实日历控件，支持打开、选择、清空。

5. `FULFILMENT`
   - `Minimum Required`
   - `Maximum Required`
   - 数字输入框沿用 Prefer Off 的 Ant Design InputNumber 风格，右侧上下箭头。
   - 至少填写一个。

底部按钮：

- `CANCEL`
- `SAVE FAVORITE`
- `ADD BID`

## 语义

### 日期关闭

用户选择：

- Pairing Number：`PR141`
- Date switch：关闭
- Maximum Required：`2`

含义：

> Award PR141 during the bid month, maximum 2.

payload 不应包含任何旧的 date/date range 缓存值。

### Specific Date

用户选择：

- Pairing Number：`PR141`
- Specific Date：`2026-06-15`
- Maximum Required：`1`

含义：

> Award PR141 on run date 2026-06-15, maximum 1.

如果 `PR141` 在 `2026-06-15` 没有 run，则显示错误并禁用提交。

### Date Range

用户选择：

- Pairing Number：`PR141`
- Date Range：`2026-06-15` 至 `2026-06-21`
- Maximum Required：`2`

含义：

> Award PR141 between 2026-06-15 and 2026-06-21, maximum 2.

如果范围内没有任何 selected pairing run，则显示错误并禁用提交。

### 多 pairing

多个 pairing number 共同组成候选池。`Maximum Required` 不能超过候选池内 matching runs 数量。

例如：

- selected pairing：`PR141`, `PR142`
- range：`2026-06-15` 至 `2026-06-21`
- matching runs：3 个
- maximum required 最大允许 3。

## Payload 设计

新增 `PairingBidValue` 类型：

```ts
type PairingPreferenceBid = {
  type: "pairing-preference";
  pairingIds: string[];
  pairingLabels?: string[];
  dateScope?:
    | { mode: "specific_date"; date: string }
    | { mode: "date_range"; from: string; to: string }
    | null;
  minimumRequired?: number | null;
  maximumRequired?: number | null;
};
```

约束：

- `pairingIds` 必须是稳定 `pairing.id` 字符串。
- `pairingLabels` 仅用于展示。
- `dateScope` 为空或缺失时表示整个月。
- `minimumRequired` / `maximumRequired` 至少一个存在。
- 如果二者同时存在，必须满足 `minimumRequired <= maximumRequired`。

序列化：

- `pbs_bid_group.operator = "Json"`
- `pbs_bid_group.param_a = JSON.stringify(pairing-preference payload)`
- `param_b` / `param_c` 不承载业务语义。

Favorite：

- `pbs_bid_pairing_configured_favorite.bid_payload` 直接保存同一 payload。
- 不需要新增 favorite 表字段。

## 后端校验

服务端必须做与前端一致的防呆校验：

1. `propertyCode=102` 接受新的 `pairing-preference` payload。
2. `pairingIds` 必须非空且全部为稳定 pairing id。
3. `pairingLabels` 如存在，数量必须与 `pairingIds` 一致。
4. `dateScope` 如存在：
   - `specific_date.date` 必须是 ISO date。
   - `date_range.from/to` 必须是 ISO date。
   - `to >= from`。
5. `minimumRequired` / `maximumRequired` 至少一个有效。
6. 同时填写时 `minimumRequired <= maximumRequired`。
7. 如有 live connection，校验 selected pairing 在 dateScope 内存在 run。
8. `maximumRequired` 不能超过 matching run 数量。

## 兼容策略

现有旧数据可能仍有：

- `pairing-id-list`
- `pairing-occurrence-list`

读取时继续展示，不做破坏性迁移；新增和编辑走新的 `pairing-preference`。后续如需清理旧数据，可单独规划数据迁移。

## UI 实现范围

主要修改：

- `pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx`
- 新增或拆分 `PairingPreferenceEditor` 组件。
- `pbs-portal/src/features/pairing/pairing-number-occurrences.ts`
- `pbs-portal/src/features/pairing/pairing-bid-summary.ts`
- `pbs-portal/src/features/pairing/pairing-existing-bid-summary.ts`
- 相关测试。

UI 要求：

- 弹窗尺寸、自适应、底部按钮沿用现有 `PbsDialogFrame` / Prefer Off 行为。
- 不出现卡片套卡片。
- 不使用多余说明小字。
- Date picker 使用 Prefer Off 同源日历控件。
- input number 隐藏浏览器原生 spinner，仅显示我们自己的上下箭头。

## 后端实现范围

主要修改：

- `packages/contracts/pbs-pairing-bids.js`
- `packages/contracts/pbs-pairing-bids.d.ts`
- `pbs-server/src/routes/pairing-bid-route-schemas.ts`
- `pbs-server/src/services/lineholder/rule-bid-types.ts`
- `pbs-server/src/services/lineholder/rule-bid-serialize.ts`
- `pbs-server/src/services/lineholder/rule-bid-value.ts`
- `pbs-server/src/services/pairing/pairing-bid-normalization.ts`
- 必要的 pairing occurrence/date validation helper。

不需要新增数据库表字段。

## 验收标准

1. Pairing add list 中 102 显示 `Pairing Preference`。
2. 点击添加后打开 `Configure Pairing Preference`。
3. 默认 T1 + Award，未选 pairing 时禁用提交。
4. 选择 pairing 后，不打开日期限制，只填 `Maximum Required=2` 可以提交。
5. 打开日期限制后，Specific Date 没有 matching run 时显示错误，提交按钮禁用。
6. Date Range 没有 matching run 时显示错误，提交按钮禁用。
7. Maximum Required 大于 matching runs 数量时显示错误，提交按钮禁用。
8. 关闭日期限制后，原日期值不参与 payload，不触发日期校验。
9. 保存 favorite 后再次打开，能恢复 pairing、日期限制和 min/max。
10. Existing row summary 不再只显示 `N selected`，要展示 preference + pairing + date scope + fulfilment。

## 测试计划

- `pbs-portal`：
  - Pairing dialog 单元 / RTL 测试覆盖新增 editor。
  - Pairing page 测试覆盖添加 Pairing Preference、日期校验、按钮禁用。
  - Summary 测试覆盖 `pairing-preference`。

- `pbs-server`：
  - route schema 测试或 service normalization 测试覆盖 payload 结构。
  - 保存 current draft / favorite 的测试覆盖 `pairing-preference`。
  - 日期范围、min/max、invalid pairing id 的拒绝测试。

- UI 标准：
  - 前端样式改动后运行 `npm run check:ui`。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这次改动跨 contract、前端编辑器、后端 normalization、summary 和测试，核心语义必须一致，拆分多 agent 容易产生 payload 解释不一致。
- Suggested split: 不拆分；主 agent 串行实现并验证。
- Write boundaries: `packages/contracts`、`pbs-portal/src/features/pairing`、`pbs-server/src/services/pairing`、`pbs-server/src/routes`、相关测试。
- Conflict risk: Medium。当前工作树已有 Days Off seed/migration 未提交改动，本次避免触碰这些文件。
- Execution gate: 用户已明确要求“写一个 spec，然后按原型做这个条件”，本 spec 写完后进入实现。
