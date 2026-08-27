# PBS Pairing Number Entire Month 多选修复设计

日期：2026-06-02  
状态：待用户确认  
范围：PBS Portal / PBS Server 的 Pairing Number 配置弹窗、保存 payload、preview/search/calendar 回查语义。本文件只定义设计，不包含代码实现。

## 背景

Pairing Number 已经修正为“有稳定 `pairingId` 时必须优先使用 id，展示使用 `pairingLabel` / `label`”。但当前交互还有一个语义需要明确：

- 用户在 `Pairing Number` 弹窗中选择多个 pairing。
- 如果保持 `Entire Month`，这些 pairing 应该一次性作为同一条整月条件保存。
- 用户不需要再进入 `Specific Date`，也不需要为每个 pairing 额外选择 run date。

用户特别指出：文档和实现里不能把业务语义含糊地叫成 `values`。既然业务含义是 pairing stable id，就应该在 contract、前端状态、后端解析和测试里明确叫 `pairingIds`。本次不再把 `tag-list.values` 作为 Pairing Number 的长期结构继续沿用。

## 核心语义

### 业务语义

`Pairing Number + Entire Month` 的业务语义是：

```text
在当前 bid period 内，对用户选择的这些 pairing ids 整月生效。
```

因此业务字段应命名为：

```ts
pairingIds: string[]
```

例如：

```ts
pairingIds: ["496001", "414601"]
```

这里的每一项都是 live `pairing.id`，不是 Pairing Number label，也不是 route 字符串。

### 展示语义

用户界面展示必须使用可读文本：

```ts
pairingLabels: ["M4959", "V4146"]
```

或在当前 contract 中使用：

```ts
suggestions: ["M4959", "V4146"]
```

展示文本只用于 UI、摘要、tag label、日历详情说明，不能作为查询或保存主键。

### 新 contract 语义

Pairing Number 的整月多选不再使用通用 `tag-list.values` 表达。新增专用 bid 类型：

```ts
{
  type: "pairing-id-list",
  pairingIds: ["496001", "414601"],
  pairingLabels: ["M4959", "V4146"]
}
```

字段语义：

| 字段 | 语义 |
| --- | --- |
| `pairingIds` | 业务主键数组。每一项必须是 live `pairing.id`。 |
| `pairingLabels` | 展示数组。顺序与 `pairingIds` 对齐，只用于 UI 和摘要。 |
| `pairingId` | 单个 pairing 的稳定 id，主要用于 occurrence 明细。 |
| `pairingLabel` / `pairingNumber` | 用户可读展示文本。 |

`values` 不再用于 Pairing Number 业务语义。其它普通 tag-list 条件仍可继续使用 `values`，但 Pairing Number 必须从类型层面区分出来。

## 目标

1. `Entire Month` 模式下允许选择多个 Pairing Number，并一次性保存为一条条件。
2. 保存和后端查询使用 `pairingIds` 语义。
3. UI tag、弹窗按钮、已添加条件、日历详情展示使用 `pairingLabels` / `suggestions`。
4. 不要求用户为 `Entire Month` 选择 run date。
5. `Specific Date` 继续使用具体 occurrence 语义，不在本次合并多个 pairing 的 run date 列表。
6. 不兼容历史错误旧数据；如果旧数据用 label / route 字符串当主键，应删除或重建。

## 非目标

- 不新增“Specific Date 合并展示多个 pairing 的所有 run date”交互。
- 不把所有 `tag-list` 全局重构为专用 object list。
- 不改变机场、城市、航班号这类本身就是业务 code 的字段语义。
- 不做 label 到 id 的 fallback 兼容。

## 推荐设计

### 前端状态

Pairing Number 选择态应该保留两组信息：

```ts
selectedPairingIds: string[]
selectedPairingLabels: string[]
```

如果继续通过通用 `PairingBidValue` 存储，则映射关系为：

```ts
bid.type === "pairing-id-list"
bid.pairingIds
bid.pairingLabels
```

新增或调整 helper 时，命名应体现业务语义，例如：

- `extractPairingIdsFromBid(bid)`
- `extractPairingLabelsFromBid(bid)`
- `buildEntireMonthPairingNumberBid(pairingIds, pairingLabels)`

避免在 Pairing Number 业务代码里继续出现含糊的 `pairingNumbers = bid.values`。

### Entire Month 保存

当用户选择多个 pairing 并保持 `Entire Month` 时，点击 `ADD BID` 应生成：

```ts
{
  type: "pairing-id-list",
  pairingIds: ["496001", "414601"],
  pairingLabels: ["M4959", "V4146"]
}
```

后端保存、preview、calendar 回查都只能使用 `pairingIds` 查询 `pairing.id`。

### Specific Date 保存

`Specific Date` 使用 occurrence 明细：

```ts
{
  type: "pairing-occurrence-list",
  occurrences: [
    {
      pairingId: "496001",
      pairingNumber: "M4959",
      originDate: "2026-04-03",
      occurrenceId: "496001:2026-04-03"
    }
  ]
}
```

这里 `pairingNumber` 是展示 label；`pairingId` 才是主键。

### 后端 contract

后端不再把 Pairing Number 的 `tag-list.values` 当作有效新 payload。Pairing Number 整月 bid 必须使用：

```ts
const pairingIds = parsePairingIdsFromPairingIdList(bid);
```

校验规则：

1. `pairingIds` 必须是非空数组。
2. 每个 `pairingId` 必须是合法数字 id 字符串。
3. `pairingLabels` 如果存在，长度必须与 `pairingIds` 对齐；如果缺失，后端可通过 `pairingIds` 回查展示 label。
4. 不接受 `M4959`、`TB7930`、route label 作为 `pairingId`。
5. preview/search/calendar 查询必须使用 `p.id`，不能使用 `p.pairing_label` 当主定位。
6. 对项目未上线前的错误旧数据，不做 label fallback；错误旧数据直接清理或重建。

## 交互验收标准

1. 用户在 Pairing Number 下拉中选择 `M4959` 和 `V4146` 后，输入框里同时显示两个 tag。
2. 保持 `Entire Month` 时，`ADD BID` 可直接点击。
3. 点击 `ADD BID` 后只新增一条条件，这条条件的 bid 类型是 `pairing-id-list`，并包含两个 `pairingIds`。
4. 页面展示显示 `M4959`、`V4146`，不显示 `496001`、`414601`。
5. preview/search/calendar 使用 `496001`、`414601` 查询。
6. 下拉候选项仍然只显示当前 bid period 内的 pairing。
7. 手动输入非候选 pairing 后按 Enter / blur 不能加入条件。

## 测试设计

### 前端测试

- Pairing Number `Entire Month` 多选：
  - mock 两个 autocomplete options。
  - 选择 `M4959` 和 `V4146`。
  - 断言 UI 显示两个 label。
  - 点击 `ADD BID`。
  - 断言 payload 为：

```ts
bid: {
  type: "pairing-id-list",
  pairingIds: ["496001", "414601"],
  pairingLabels: ["M4959", "V4146"]
}
```

- Pairing Number 禁止自由输入：
  - 输入不存在的文本。
  - 按 Enter。
  - 断言没有新增 tag，`ADD BID` 仍不可用。

### 后端测试

- Pairing Number preview 收到 `pairing-id-list.pairingIds = ["496001", "414601"]` 时：
  - SQL 使用 `p.id = any(...)` 或等价 id 查询。
  - 不使用 `p.pairing_label` 当主定位。

- Pairing Number preview 收到 label 型 Pairing Number payload，例如旧 `tag-list.values = ["M4959"]` 或 `pairing-id-list.pairingIds = ["M4959"]` 时：
  - 返回 400 或 service error。
  - 不做 label fallback。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次修复集中在 Pairing Number 语义和弹窗保存链路，拆分多 agent 容易造成 contract 解释不一致。
- Suggested split: 不拆分。
- Write boundaries: 主要触及 Pairing Number 前端弹窗 / bid helper / tests，必要时补后端解析测试。
- Conflict risk: Medium。当前 stable id 修复已有大量未提交改动，需要连续理解同一条链路。
- Execution gate: 用户确认本设计文档后再进入实现。

## 待确认点

已确认方向：即使改动范围更大，也要把 Pairing Number 整月多选改成专用结构 `pairing-id-list`，不要继续用 `values` 承载 `pairingIds` 的业务语义。

实施时需要同步调整：

1. `packages/contracts` / `pbs-portal` 的 `PairingBidValue` 类型。
2. 前端 Pairing Number autocomplete 选择态、tag 展示、保存 payload。
3. 后端 bid normalization、保存、读取、preview、calendar 回查。
4. 数据库中错误旧数据清理或 migration。
5. 所有相关单元测试和页面测试。
