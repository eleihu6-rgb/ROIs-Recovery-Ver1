# PBS Search Pairings 单条条件预览设计文档

日期：2026-04-24  
作者：Codex  
状态：待评审

## 1. 背景

当前 `Pairing` 功能已经拆成了两个不同区域：

- `EXISTING PAIRING PROPERTIES`
- `ADD PAIRING PROPERTIES`

其中，`ADD PAIRING PROPERTIES` 已经被明确成：

- generic pairing 条件目录
- generic pairing 规则编辑区

每一行当前都有这些操作：

- add
- favorite
- edit
- eye

但 `eye` 目前还没有一个清晰、已经落地的业务语义。

与此同时，`/pairing/search` 这个页面已经有了 UI 壳，但它现在还是：

- UI-only
- 还没有接真实查询

## 2. 目标

把第一阶段真实的 `Search Pairings` 交互定义成：

- 在 `ADD PAIRING PROPERTIES` 中点击某一条规则的 `eye`
- 跳转到 `/pairing/search`
- 只带着这一条规则作为查询条件
- 查询真实命中的 pairing

这一阶段**不是**“按当前所有 existing rules 一起搜索”。

## 3. 产品语义

### 3.1 `eye` 的含义

`eye` 应该表示：

- **预览这一条 generic 规则会命中哪些真实 pairing**

它的本质是：

- 单条 property 的 preview

它不是：

- 整个 layer 的搜索
- 所有 existing pairing rules 的组合搜索
- `Pairing ID` 精准检索

### 3.2 为什么这是正确的第一步

这和当前产品成熟度最匹配：

- 用户现在仍然是在条件目录里挑规则
- 在把某条规则加进 layer 前，用户很可能想先看看它会筛出什么
- 单条规则预览的心智最清晰
- 也能避免把一个命中极少的规则贸然放进 layer，浪费 layer

## 4. 与 AA / PRD 的关系

这个交互方向和当前 AA 对齐方式是一致的。

原因是：

- `ADD PAIRING PROPERTIES` 本来就是 generic rule 的配置区
- `Search Pairings` 本来就是 pairing 检索/查看区
- 用 `eye` 去预览单条 generic 条件对应的真实 pairing，是一个很自然的 portal 交互

这里要强调：

- 这不是说 AA 文档明确规定了“眼睛按钮”
- 而是说这个交互**不违背** AA 的业务分层
- 它仍然遵守了：
  - generic rule 定义
  - pairing search / inspection

这两块分开的原则

## 5. 范围

### 本期范围

- 给 `ADD PAIRING PROPERTIES` 里的 `eye` 一个真实业务语义
- 点击 `eye` 后跳转到 `/pairing/search`
- 只携带这一条 property 规则
- `Search Pairings` 页面按这一条规则执行真实查询
- 返回真实 matching pairings

### 不在本期范围

- 把 `EXISTING PAIRING PROPERTIES` 全部条件都带去搜索
- 多条件 AND / OR 组合查询
- layer 级别搜索
- `Specific Bid`（`Pairing ID`、`Pairing ID on Date`）
- `BID THESE PROPERTIES` 的真实回写

## 6. 核心决策

### 6.1 V1 的搜索输入来源

第一版真实搜索的输入来源是：

- **`ADD PAIRING PROPERTIES` 中的一条 property**

第一版不会用：

- `EXISTING PAIRING PROPERTIES` 的整组规则

### 6.2 原因

如果第一步就按所有 existing rules 去搜，会立刻引入很多更大的问题：

- 同类属性之间 OR 语义
- 异类属性之间 AND 语义
- 特殊分组逻辑
- layer 作用范围

这属于更大一阶段，不适合在这一版一起做。

## 7. 从 Pairing 页面带到 Search 页面什么数据

从 `eye` 跳转到 `/pairing/search` 时，只应该带这一条规则真正需要的搜索参数。

### 需要带

- `propertyCode`
- `bid`
- `operator`（如果该条件支持）
- `award / avoid`（如果该条件支持）
- `any / every`（如果该条件支持）

### 不需要带

- `layers`

原因：

- `layers` 表示这条规则在 draft 里将来作用于哪些 layer
- 它不是单条条件搜索 preview 的过滤条件

## 8. Search Pairings 页面行为

当 `/pairing/search` 是通过单条条件 preview 打开时：

1. 页面收到这一条规则
2. criteria 区只展示这一条规则
3. 页面向 `pbs-server` 发真实查询请求
4. 结果区展示真实命中的 pairing

如果 `/pairing/search` 不是通过 preview 打开：

- 现阶段仍然可以保留现有 mock fallback
- 但真正主路径应以 preview-driven search 为主

## 9. 后端方向

接口实现归属在 `pbs-server`。

### 数据源

查询 live `f8` schema 的 pairing 数据：

- `pairing`
- `pairing_segment`
- 必要时 `pairing_composition`

### 搜索底层

- 第一版使用 PostgreSQL
- 本期不引入 Elasticsearch

## 10. UI / 交互细节

### Pairing 页面

- `eye` 继续留在 `ADD PAIRING PROPERTIES`
- 点击后直接跳转到 `/pairing/search`
- 不需要额外确认弹窗

### Search 页面

- criteria 区要明确显示：当前只按一条规则在查
- 结果统计要显示真实命中数量
- 页面不能误导用户以为“所有 existing rules 都参与了搜索”

## 11. 推荐 contract 形状

这一版查询 request 应该围绕“单条 generic rule preview”设计。

概念上可以类似：

```json
{
  "mode": "single_property_preview",
  "property": {
    "propertyCode": 131,
    "operator": "between",
    "bid": {
      "from": "09:00",
      "to": "18:30"
    }
  }
}
```

具体字段命名可以在实现时再最终敲定，但核心原则是：

- request 以**一条 property rule** 为中心
- 不是整个 existing draft

## 12. 验收标准

- 点击 `ADD PAIRING PROPERTIES` 某一行的 `eye` 后，进入 `/pairing/search`
- 只带这一条条件过去
- `layers` 不参与 search payload
- `Search Pairings` 页面 criteria 区只显示这一条条件
- 页面用真实后端结果替代 mock
- 本期不引入“整组 existing rules 搜索”

## 13. 后续阶段

后续可以再扩展：

- 按 `EXISTING PAIRING PROPERTIES` 全组条件搜索
- AND / OR 分组语义
- `Specific Bid / Pairing ID`
- 从结果页反向写回 layer bid

这些都明确延后，不在本期实现。
