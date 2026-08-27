# PBS Search Pairings v2 设计文档

## 背景

当前 `/pairing/search` 已经从占位 UI 进化到两种真实 preview：

- 从 `/pairing` 的 `EXISTING PAIRING PROPERTIES` 顶部 `SEARCH PAIRINGS` 进入时，可以按当前 Layer 的 rules 查询真实 pairing。
- 从 `ADD PAIRING PROPERTIES` 单条 `eye` 进入时，可以按单条 property 查询真实 pairing。

但页面仍有几个 AA 语义不完整或误导用户的地方：

- `ADD MORE SEARCH CRITERIA` 当前被当成返回 `/pairing` 使用，但 AA 文档里它是继续添加 search criteria。
- `BID THESE PROPERTIES` 当前没有真实业务动作，但 AA 文档里它会把 search criteria 转成实际 bid，并弹出 Layer 选择。
- `/pairing/search` 顶部没有明确返回按钮，导致结果区业务按钮承担了导航职责。
- Search Pairings 还缺少 `Pairing ID` / Specific Bid 的第一版能力。

本轮目标是在只考虑 Pairing 页面范围内，把 `/pairing/search` 做成可闭环的 Search Pairings v2。

## AA 语义对齐

AA 文档中的 Pairing Tab 有两个核心入口：

- `Add More Properties`：开始建立 bid 的 pairing properties。
- `Search Pairings`：搜索和查看 bid package 中真实 pairings。

在 `Search Pairings` 页面中：

- `Add more search criteria` 用于继续添加搜索条件，缩小结果。
- 搜索结果会展示 pairing details 和 mini calendar。
- `Bid these properties` 会把 search criteria 转成实际 bids，并要求用户选择 Layer。
- `Pairing ID` 只在 Search Pairings 入口中可用，用于 specific bid。

本轮实现 AA 的核心闭环，但暂不实现 planned absence / day-off 冲突日期自动排除。

## 目标

1. `/pairing/search` 顶部标题右侧增加明确返回按钮，返回 `/pairing`。
2. 结果区的 `ADD MORE SEARCH CRITERIA` 不再做返回。
3. `current-rules-preview` 模式下隐藏 `BID THESE PROPERTIES` 和 `ADD MORE SEARCH CRITERIA`，该模式只用于查看当前 Layer rules 的命中 pairing。
4. 在 `/pairing/search` 中实现真正的 search criteria builder。
5. `ADD MORE SEARCH CRITERIA` 在本页打开或展开 property picker，把 property 加入 search criteria。
6. 多条 search criteria 按 Pairing rules 查询真实 pairing。
7. `BID THESE PROPERTIES` 弹出 Layer 选择，把当前 search criteria 写入 current pairing draft。
8. 增加 `Pairing ID` / Specific Bid 第一版：可搜索真实 pairing ID，并可写入指定 Layer。

## 非目标

- 不做 planned absence / day-off 冲突日期禁用。
- 不做 specific pairing occurrence 的自动排除。
- 不做 `Pairing ID on Date`。
- 不做 `Pairing ID for Entire Month` 的完整日期语义。
- 不做 Layer 页面 `View Pairing Set` 完整重建。
- 不改 Pairing 主表结构。

## 页面模式

### 1. Current Rules Preview

入口：`/pairing` 顶部 `SEARCH PAIRINGS`。

行为：

- 展示当前 rules 的 Layer tabs。
- 查询所选 Layer 的完整 rule expression。
- 不显示 `BID THESE PROPERTIES`。
- 不显示 `ADD MORE SEARCH CRITERIA`。
- 顶部返回按钮返回 `/pairing`。

原因：

这个模式已经是在查看当前 draft 的 pairing pool。如果再显示 “Bid these properties”，语义会重复且容易误导。

### 2. Single Property Preview

入口：`ADD PAIRING PROPERTIES` 单条 `eye`。

行为：

- 初始 search criteria 只有该 property。
- 用户可以继续 `ADD MORE SEARCH CRITERIA` 添加更多 criteria。
- 用户可以编辑 criteria。
- 查询真实 pairing results。
- 用户可以点击 `BID THESE PROPERTIES`，选择 Layer 后写入 current draft。

### 3. Search Builder

入口：

- 从 `/pairing/search` 空进入。
- 从 single property preview 继续添加 criteria 后进入。

行为：

- 展示 search criteria 列表。
- 支持新增、编辑、删除 criteria。
- 支持 `Pairing ID` criteria。
- 每次 criteria 变化后刷新 pairing results。
- `BID THESE PROPERTIES` 将当前 criteria 写入指定 Layer。

## UI 设计

### Header

`Search Pairings` 标题右侧增加返回按钮：

- 按钮文案可以是 `BACK`，或使用左箭头图标加 `BACK`。
- 点击后 `navigate("/pairing")`。
- 这是页面导航，不属于业务 action row。

### Criteria 区

普通 search builder 模式：

- 保留 `SEARCH CRITERIA` 区。
- criteria row 继续使用现有 `PairingBidControl`。
- row actions：
  - edit
  - remove
  - favorite / unfavorite（保留已有能力）
- 新增 `ADD MORE SEARCH CRITERIA` 触发 property picker。

current-rules-preview 模式：

- `SEARCH CRITERIA` 区显示 Layer tabs 和规则表达式。
- 不允许在这里编辑 criteria。

### Property Picker

本轮优先采用轻量 drawer / inline panel，不做新页面：

- 显示 search properties 列表。
- 支持搜索 property name。
- 支持 `ALL PROPERTIES` / `FAVORITED PROPERTIES`。
- `Pairing ID` 只在 Search Pairings picker 中出现。
- 点击 `+` 后加入 search criteria 并关闭 picker，或允许继续添加。

为降低实现复杂度，可以复用 `/pairing` 已有 available property row 的展示模式，但不直接耦合 `PairingRightPanel`。

### Results Action Row

普通 search builder 模式：

- 显示结果统计。
- 显示 `BID THESE PROPERTIES`。
- 显示 `ADD MORE SEARCH CRITERIA`。

current-rules-preview 模式：

- 只显示结果统计。

## 数据模型

### Search Criteria

前端新增内部类型概念：

```ts
type PairingSearchCriteriaItem = {
  id: string;
  propertyCode: number;
  name: string;
  action: PairingBidAction | null;
  quantifier: PairingBidQuantifier | null;
  bid: PairingBidValue;
  layers: PairingLayerOption[];
  favorited: boolean;
  pairingNumber: string;
  pairingType: string;
  effectiveDateRange: {
    from: string;
    to: string;
  };
};
```

现有类型可继续扩展，不需要重建。

### Pairing ID Property

本轮建议复用 seed 中已存在的 legacy property code：

- `128`：`Pairing ID`

新增到当前 supported catalog：

- `packages/contracts/pbs-pairing-bids.js`
- `packages/contracts/pbs-pairing-bids.d.ts`

建议定义：

```ts
{
  propertyCode: 128,
  name: "Pairing ID",
  defaultBid: { type: "tag-list", values: [] },
}
```

说明：

- `Pairing ID` 是 specific bid 的第一版。
- 本轮只支持按 pairing label / pairing id 搜索。
- 本轮写入 draft 时仍保存为 pairing property row，后续可再扩展 specific bid 独立语义。

## API 设计

### Search Preview Request

当前已有：

- 单条 property preview
- current rules preview

本轮新增 search criteria preview：

```ts
type PbsSearchPairingsPreviewRequest = {
  preview:
    | {
        property: PbsPairingSearchPreviewProperty;
        page?: number;
        pageSize?: number;
      }
    | {
        mode: "current_rules";
        layer: string;
        properties: PbsPairingDraftProperty[];
        page?: number;
        pageSize?: number;
      }
    | {
        mode: "criteria";
        properties: PbsPairingDraftProperty[];
        page?: number;
        pageSize?: number;
      };
};
```

### Search Preview Response

新增 response mode：

```ts
{
  mode: "criteria_preview";
  properties: PbsPairingDraftProperty[];
}
```

结果结构继续复用现有 `summary`、`pagination`、`results`。

### Draft 写入

`BID THESE PROPERTIES` 不需要新后端接口，优先复用现有轻量接口：

- `POST /api/pairing-bids/current/properties`

但前端需要批量顺序调用：

1. 用户选择 Layer。
2. 将当前 search criteria 的 `layers` 改成所选 Layer。
3. 对每条 criteria 调用 `addCurrentDraftProperty`。
4. 成功后更新 query cache。
5. 任一失败时显示 error message，并保留页面状态。

后续如果批量写入需要事务一致性，再新增 batch endpoint。

## 后端查询逻辑

### Criteria Preview

`mode: "criteria"` 使用与 current rules preview 相同的规则构造逻辑：

- 不同 property 默认 `AND`
- 同一 multi-use property 不同值默认 `OR`
- AA forced OR 特例使用 `OR`
- duplicate / single-use 冲突直接返回 409

区别：

- `criteria` 不绑定来源 Layer。
- 后端会把传入 properties 归一成同一个临时 Layer，例如 `L1`，只用于复用规则校验和表达式组合。

### Pairing ID 查询

新增 `propertyCode: 128` 的 SQL 条件：

- bid 为 tag-list 时，匹配 `upper(coalesce(p.pairing_label, p.id::text)) = any($values)`
- 支持用户输入大小写不敏感。
- 空值返回 400。

示意：

```sql
upper(coalesce(p.pairing_label, p.id::text)) = any($1)
```

## 前端数据流

### 打开 Search Page

- current rules 入口：保持现有 `previewMode: "current-rules"`。
- single eye 入口：以单条 criteria 初始化。
- 直接进入：criteria 为空，展示空状态和 `ADD MORE SEARCH CRITERIA`。

### 添加 Criteria

1. 点击 `ADD MORE SEARCH CRITERIA`。
2. 打开 property picker。
3. 点击 property 的 `+`。
4. 新 criteria 加入列表。
5. 触发 `previewCriteria` 查询。

### Bid These Properties

1. 点击 `BID THESE PROPERTIES`。
2. 如果 criteria 为空，message error。
3. 打开 Layer 选择弹窗。
4. 用户选 Layer 后确认。
5. 前端逐条调用轻量 add property。
6. 成功后 message success，并可留在 search page。

## 校验与错误处理

### 前端

- criteria 为空时：
  - 禁用或阻止 `BID THESE PROPERTIES`
  - message：`Add at least one search criteria before bidding properties.`
- duplicate / single-use 冲突：
  - 前端使用现有 `findPairingPropertyRuleConflict`
  - 阻止写入 draft
- add property 失败：
  - message：`Unable to bid these properties.`
- search preview 失败：
  - 保留 criteria，结果区显示错误提示

### 后端

- invalid payload：400
- unsupported property：422
- duplicate / single-use conflict：409
- database/search failure：500

## 国际化

继续沿用当前轻量 i18n 机制，新增 key：

- `pairing.search.back`
- `pairing.search.addCriteria`
- `pairing.search.bidTheseProperties`
- `pairing.search.emptyCriteria`
- `pairing.search.bidThesePropertiesSuccess`
- `pairing.search.bidThesePropertiesError`
- `pairing.search.selectLayerTitle`
- `pairing.search.pairingId`

## 测试计划

### 前端

更新 `pbs-portal` tests：

- `/pairing/search` header 返回按钮可回 `/pairing`。
- current rules preview 模式隐藏两个业务按钮。
- `ADD MORE SEARCH CRITERIA` 打开 property picker。
- 添加多条 criteria 后调用 criteria preview API。
- `BID THESE PROPERTIES` 弹 Layer 选择。
- 确认后逐条调用 `addCurrentDraftProperty`。
- `Pairing ID` 可作为 criteria 加入并查询。
- single property preview 旧流程不破坏。

### 后端

更新 `pbs-server` tests：

- route 接受 `mode: "criteria"` payload。
- service 用多条 criteria 构造真实查询。
- service 支持 property code `128` Pairing ID 查询。
- duplicate / single-use conflict 返回 409。
- invalid Pairing ID bid 返回 400。

### 验证命令

```bash
cd pbs-portal
pnpm test -- src/features/pairing/pages/pairing-page.test.tsx src/features/pairing/pages/search-pairings-page.test.tsx
pnpm lint
pnpm build

cd ../pbs-server
npm test -- src/routes/pairing-search.test.ts src/routes/pairing-bids.test.ts src/services/pairing/pairing-rule-validation.test.ts
npm run build

cd ..
git diff --check
```

## 风险与取舍

### 风险 1：`Pairing ID` 写入 generic property row 不是最终 AA 完整模型

本轮接受这个折中，因为 current draft 现有存储是 property row。后续如果需要区分 specific bid，可以在 draft property 上增加 `bidKind` 或拆独立 specific bid 数据结构。

### 风险 2：批量写入不是后端事务

本轮优先复用轻量 add endpoint，降低改动面。如果用户一次 bid 多条 criteria，其中某条失败，前端会提示失败并保留页面状态。后续可做 batch endpoint 保证原子性。

### 风险 3：Search Criteria Builder 与 Pairing Right Panel 有重复 UI

本轮允许有限重复，但应抽出小型可复用组件，避免直接把 `PairingRightPanel` 搬进 search page。后续可以收敛为共享 property picker。

## 验收标准

1. `ADD MORE SEARCH CRITERIA` 不再返回 `/pairing`。
2. `/pairing/search` 顶部有明确返回按钮。
3. current rules preview 模式只展示规则和结果，不展示未实现业务按钮。
4. search builder 模式可以新增多个 criteria 并刷新真实 pairing results。
5. `BID THESE PROPERTIES` 可以选择 Layer 并写入 current draft。
6. `Pairing ID` 可以作为 search criteria 查询真实 results。
7. `Pairing ID` 可以通过 `BID THESE PROPERTIES` 写入指定 Layer。
8. 既有 `/pairing` add/delete/favorite/message 行为不回退。
