# PBS Pairing 127「Pairing Total Block Time」补齐设计确认

## 背景

用户继续核对 Pairing 条件 `Pairing Total Block Time(propertyCode=127)`。当前页面显示为：

- `MODE`: 只有 `Award`
- `BID`: 一个普通空文本输入框

初步检查后确认：当前页面和旧库不一致。旧库中 `127` 是 `credit` 类型，格式为 `HH:MM`，不是自由文本。

## 旧库对照

旧库参考：

- `init-docs/crew_bids_reference-2026-03-16-072929.xlsx`
- `init-docs/crew_bids_reference-2026-03-16-072929.md`
- `sql/seed/10-pbs-bid-property.sql`

旧库 `127` 定义：

- 名称：`Pairing Total Block Time`
- 分类：`Pairing`
- input type：`credit`
- 格式：`HH:MM`
- action：`award`
- quantifier：无
- operator：`>` / `Between`
- tooltip：`Award pairings by total block time.`

结论：

- `127` 只支持 `Award`
- `127` 不支持 `Avoid`
- `127` 是总 block time，不是 average daily block time
- `127` 应使用 `duration` / `duration-range` bid 表达

## 当前实现问题

### 前端 contract

当前 `packages/contracts/pbs-pairing-bids.js` 中 `127` 是：

```ts
{
  propertyCode: 127,
  name: "Pairing Total Block Time",
  defaultBid: { type: "text", value: "06:00" },
  supportedActions: ["award"],
  supportedOperators: [">", "Between"],
}
```

问题：

- `defaultBid` 是 `text`，导致页面显示普通文本输入框
- 用户无法获得明确的 `HH:MM` 输入体验
- `Between` 虽然在 supportedOperators 里，但 bid 类型不对，无法稳定切换成区间输入

### 后端

当前没有看到 `propertyCode=127` 的专属保存校验与 SQL。

已有 `121 Average Daily Block Time` 的 SQL 使用：

```text
sum(f.blk_min) / pairing.duration_days
```

而 `127 Pairing Total Block Time` 应为：

```text
sum(f.blk_min)
```

即不除以 pairing 天数。

## 语义定义

`Pairing Total Block Time` 表达：

> pairing 内所有飞行段的总 block time。

数据来源：

- `pairing_segment.flt_id`
- `flight.blk_min`

推荐公式：

```text
total_block_minutes = sum(coalesce(f.blk_min, 0))
```

过滤条件：

- `s.pairing_id = p.id`
- `s.is_deleted = 0`
- `s.flt_id is not null`

比较方式：

- `>`：`total_block_minutes > threshold_minutes`
- `Between`：`total_block_minutes between from_minutes and to_minutes`

## 推荐方案

采用现有 `duration` / `duration-range` bid 类型，不新增新类型。

### Contract

将 `127` 默认 bid 改为：

```ts
{
  type: "duration",
  value: "006:00",
  operator: ">"
}
```

保留：

```ts
supportedActions: ["award"]
supportedOperators: [">", "Between"]
```

### 前端

- 默认显示 operator 下拉 + `HH:MM` 输入
- operator 为 `>` 时，使用单个 duration 输入
- operator 为 `Between` 时，切换为 duration range 输入
- summary 显示：
  - `> 006:00`
  - `Between 004:00 - 006:00`

### 后端校验

新增 `127` 专属校验：

- bid 必须是 `duration` 或 `duration-range`
- 如果 bid 是 `duration`，operator 必须是 `>`
- 如果 bid 是 `duration-range`，表示 `Between`
- action 必须是 `award`
- quantifier 必须为空

### 后端 SQL

新增 `case 127`：

```sql
(
  select coalesce(sum(coalesce(f.blk_min, 0))::numeric, 0)
  from <live_schema>.pairing_segment s
  join <live_schema>.flight f
    on f.id = s.flt_id
  where s.pairing_id = p.id
    and s.is_deleted = 0
    and s.flt_id is not null
) > :threshold
```

`Between` 时使用同一个表达式套 `between :from and :to`。

## 不做事项

- 不修改 `121 Average Daily Block Time`
- 不修改 Line 模块的 `Total Block Time`
- 不新增数据库字段
- 不做历史数据迁移

## 测试范围

- 前端：
  - catalog 定义测试
  - operator 切换测试
  - summary / 完整性沿用现有 duration 测试能力
- 后端：
  - 保存校验接受 duration / duration-range
  - 保存校验拒绝 text bid
  - 保存校验拒绝 unsupported operator
  - SQL builder 生成总 block minutes 比较
  - SQL builder 生成 Between
- 回归：
  - `pbs-server` 定向测试
  - `pbs-portal` 定向测试
  - build / lint / diff check

## 验收标准

1. 页面不再显示普通文本框
2. 默认显示 `> 006:00`
3. 可切换 `Between` 并显示两个 `HH:MM` 输入
4. 后端能保存 `duration` 和 `duration-range`
5. preview SQL 使用 `sum(f.blk_min)`，不除以 `duration_days`
6. `127` 仍然只支持 `Award`

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 前端 contract/UI、后端校验/SQL、测试可以拆分处理
- Suggested split: 前端负责 catalog 和控件测试；后端负责 route 校验与 SQL；测试负责回归覆盖
- Write boundaries: 前端不改 SQL，后端不改 UI，测试只覆盖 127
- Conflict risk: 中等，主要集中在 shared contract 和 pairing 测试文件
- Execution gate: 等用户确认本设计后再实施

Above is my understanding of the requirement/spec. Please confirm, and I will implement after your approval.
