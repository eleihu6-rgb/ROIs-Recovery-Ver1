# PBS Search Pairings 结果卡片 Preview 字段扩展

## 背景

当前 Search Pairings 结果卡片已经从完整 Gantt 宽表改成紧凑 leg preview，并解决了左侧 detail 与右侧 mini calendar 顶部不对齐的问题。

新的问题是：卡片左侧可用空间较充足，但 leg preview 只展示 `Flight / Route / DEP / ARR / BH / Duty` 六列，导致中间空白明显，信息密度偏低。

## 目标

- 提高 Search Pairings 结果卡片的可读信息密度。
- 不回退到完整 20 列 Gantt 宽表。
- 不引入横向滚动条。
- 不影响右侧 mini calendar、`ADD PAIRING`、搜索 API、弹窗完整 Gantt 明细。

## 设计

将 Search 结果卡片的 leg preview 从 6 列扩展到 10 列：

```text
Flight | ALN | Fleet | Route | PCK | RPT | STD | STA | BH | Duty
```

字段含义：

- `Flight`：`QUAL + Flight`，例如 `FLY 626`、`DH ST`。
- `ALN`：航空公司/airline。
- `Fleet`：机型。
- `Route`：`DEP → ARR`。
- `PCK`：pickup。
- `RPT`：report。
- `STD`：scheduled departure。
- `STA`：scheduled arrival。
- `BH`：block hour。
- `Duty`：Gantt duty 文本。

不加入以下字段：

- `ACC / Ref / ATD / ATA / DRP / GT / FT / MRT`

原因：这些字段更适合完整弹窗明细；如果全部加入，Search 卡片会重新变成宽表。

## 验收标准

- Search 结果卡片展示 10 列 preview。
- Search 结果卡片仍然无横向滚动条。
- 左侧 detail 和右侧 mini calendar 仍然顶部对齐。
- 弹窗完整 Gantt 表不变。
- 自动化测试覆盖新增列和无溢出。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在字段映射、单个 UI 组件和测试。
- Suggested split: 不拆。
- Write boundaries: `pairing-detail-display.ts`、`pairing-result-card-detail.tsx`、Pairing Search 测试、版本号、QA 文档。
- Conflict risk: 低。
- Execution gate: 用户已确认“好”。
