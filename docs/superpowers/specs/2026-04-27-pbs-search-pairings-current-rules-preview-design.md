# PBS Search Pairings 当前规则预览设计

## 背景

当前 `/pairing` 右侧 `EXISTING PAIRING PROPERTIES` 顶部的 `SEARCH PAIRINGS` 只是跳转到 `/pairing/search`，没有携带 existing rules。

之前的 `Search Pairings` V1 设计只支持从 `ADD PAIRING PROPERTIES` 的单条 `eye` 进入搜索页。这是合理的第一步，但现在项目已经补上：

- 同 Layer 规则表达器
- 同 Layer duplicate / single-use 校验
- AA forced OR 特例解析

因此顶部 `SEARCH PAIRINGS` 可以升级为“查看当前 draft rules 命中的 pairings”。

## AA / N-PBS 语义

AA 语义里，同一个 Layer 内的 pairing properties 共同定义该 Layer 的 pairing pool：

- 不同 property 默认是 `AND`
- 同一 multi-use property 的不同值默认是 `OR`
- AA 5 个 forced OR 特例优先于默认 `AND`

不同 Layer 之间不是互相 `AND`；它们是不同优先层级。因此顶部搜索不能把所有 existing rules 扁平化成一个大查询。

N-PBS 的 `Any` / `Every` 是 property 自身量词，不是跨 property 的 AND/OR 特例。

## 目标

1. 点击 `EXISTING PAIRING PROPERTIES` 顶部 `SEARCH PAIRINGS` 时，携带当前 existing rules 进入 `/pairing/search`。
2. 搜索页按 Layer 展示和查询当前规则。
3. 默认选择当前 active layer；如果没有 active layer，则选择第一个有 existing rules 的 Layer。
4. 搜索页允许切换 Layer，查看不同 Layer 规则命中的 pairings。
5. 保留单条 `eye` preview 行为，不改变已有入口。

## 非目标

- 本轮不实现跨 Layer 合并查询。
- 本轮不把 Search Pairings 做成完整可编辑规则构造器。
- 本轮不实现 `Specific Bid / Pairing ID` 写回。
- 本轮不改 Pairing 数据库表结构。

## 用户体验

### Pairing 页面入口

`EXISTING PAIRING PROPERTIES` 顶部：

- `VIEW RULES / VIEW PROPERTIES` 仍负责本页视图切换。
- `SEARCH PAIRINGS` 改为携带 current draft existing rules 跳转。

如果当前没有任何 active existing rules：

- 阻止跳转。
- 使用 `message.error` 提示：`Add at least one pairing property before searching pairings.`

### Search Pairings 页面

从顶部 `SEARCH PAIRINGS` 进入时，搜索页进入 `current-rules-preview` 模式：

- `SEARCH CRITERIA` 区域显示当前选中 Layer 的规则表达式。
- 顶部或 criteria 区域显示 Layer tabs / segmented controls：`L1`、`L2`、...
- 只显示有条件的 Layer。
- 默认选中来源页面 active layer；如果该 Layer 没有条件，选中第一个有条件 Layer。
- 切换 Layer 后重新请求该 Layer 的 preview。

单条 `eye` 进入时仍保持 `single-property-preview` 模式：

- criteria 区只显示那一条 property。
- 不显示 current rules 的 Layer tabs。

## 数据流

### 前端 location state

扩展 `PairingSearchLocationState`：

```ts
type PairingSearchLocationState =
  | { previewProperty: PairingSearchPreviewProperty }
  | {
      previewMode: "current-rules";
      initialLayer?: string;
      existingProperties: PairingExistingProperty[];
      draftMeta: PairingRightPanelData["draftMeta"];
    }
```

### 搜索请求

新增 current rules preview 请求形态：

```ts
{
  preview: {
    mode: "current_rules";
    layer: "L4";
    properties: PbsPairingDraftProperty[];
    page: number;
    pageSize: number;
  }
}
```

后端必须按同一套 pairing rule logic 解析该 Layer：

- 同 property multi-use OR
- 不同 property AND
- AA forced OR
- duplicate / single-use 理论上已被保存校验阻止；如果绕过仍出现，返回 409。

## 后端设计

`pbs-search-pairings` 增加 current rules preview 支持：

- Zod schema 增加 `mode: "current_rules"` payload。
- 复用 contracts 的 pairing rule helpers。
- 查询前只取 payload 指定 Layer 的 active properties。
- 当前具体 pairing 数据源仍沿用现有 search preview 服务能力；若后端真实多条件查询能力不足，本轮先完成 contract / request / UI 状态与 mockable service seam，避免再做空跳转。

错误处理：

- 无有效 Layer 条件：400。
- 规则冲突：409。
- 查询失败：保持现有 Search Pairings 错误态。

## 前端设计

### PairingRightPanel

新增 `handleSearchCurrentRules`：

1. 从 `existingProperties` 找 active Layer。
2. 取当前 bidding calendar active layer 作为优先 layer。
3. 如果没有条件，显示 message 并 return。
4. `navigate("/pairing/search", { state })`。

### SearchPairingsPage

识别两种模式：

- `single-property-preview`
- `current-rules-preview`

current rules 模式下：

- 从 `existingProperties` 生成可选 Layer 列表。
- 根据选中 Layer 生成请求 payload。
- criteria 区复用只读规则表达器样式，避免展示成单条 property。
- `ADD` / favorite 类单条操作在 current rules 模式下不展示；因为这不是一个单条候选 property。

## 测试策略

### 前端测试

覆盖：

- 顶部 `SEARCH PAIRINGS` 携带 existing rules 跳转。
- 没有 active rules 时 message 拦截。
- Search 页面 current rules 模式显示 Layer tabs。
- 默认选中 active layer / 第一个有条件 layer。
- 切换 Layer 触发新的 preview 请求。
- 单条 `eye` preview 行为保持不变。

### 后端测试

覆盖：

- current rules preview payload schema 通过。
- 空 properties / 空 layer 返回 400。
- duplicate / single-use 冲突返回 409。
- 合法 current rules payload 调用 pairing search service 并返回 summary/results。

## 验收标准

1. `EXISTING PAIRING PROPERTIES` 顶部 `SEARCH PAIRINGS` 不再空跳转。
2. Search 页面能看到当前 Layer 的规则表达式和匹配结果。
3. 用户能在有条件的 Layer 间切换搜索结果。
4. 不同 Layer 不会被错误合并为一个 AND 查询。
5. 单条 `eye` preview 不受影响。
