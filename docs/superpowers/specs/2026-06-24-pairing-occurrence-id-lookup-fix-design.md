# Pairing Number occurrence lookup 修复设计

## 背景

在 PBS Portal 的 Pairing Number 条件配置中，同一个 crew、同一个 period 下，左侧日历可以按日期看到 `T4520` 等 pairing，但右侧 Configure Pairing Bid 选择 `T4520` 后，Specific Date 区域显示没有 run dates，左侧日历也没有对应蓝色 pairing 色块。

## 根因

系统当前同时存在两套语义：

- 正确语义：界面显示用户可读的 Pairing Number，例如 `T4520`；内部查询、保存、日历事件生成使用稳定的内部 `pairing_id`。
- 残留语义：`loadPairingOccurrences()` 仍按展示 label 匹配 pairing，即用 `pairingDisplayLabelExpression = any(...)` 查数据。

前端现在已经倾向于保存内部 `pairingId`、显示 `pairingLabel`，但后端 occurrence 查询仍把传入值当展示 label 匹配，导致右侧日期列表为空；calendar event loader 也复用同一查询，所以蓝色 pairing 色块无法生成。

## 修复目标

统一 Pairing Number 条件链路：

- `T4520` 只作为展示 label。
- 查询、保存、specific date occurrence、calendar event 都使用内部稳定 `pairing_id`。
- 左侧日历按日期查询和右侧按 Pairing Number 查询在同一 crew / period / base 过滤下结果一致。

## 范围

本次只修复 Pairing Number occurrence lookup 与日历 event 生成语义，不做旧数据兼容，不引入 label fallback。

## 设计

1. 后端 `loadPairingOccurrences()` 改回只接受稳定 numeric `pairing_id`。
2. SQL 过滤从展示 label 匹配改回 `p.id = any($1::bigint[])`。
3. occurrence 结果按 `row.pairing_id` 回填到请求 map。
4. 前端继续保存 `pairingId`、显示 `pairingLabel`，不回退到保存 `T4520`。
5. 回归测试覆盖：
   - Configure Pairing Bid 选择 Pairing Number 后，Specific Date 使用内部 id 加载 run dates。
   - 保存 specific-date Pairing Number 后，bidding calendar 能生成/渲染蓝色 pairing event。

## 验收标准

- 右侧选择 `T4520` 时，Specific Date 能看到 June 2026 中可用 run dates。
- 保存 `T4520 + 具体日期` 后，左侧对应 tier 的 calendar 显示蓝色 pairing 色块。
- Pairing Number chip 仍显示 `T4520`，不显示内部 numeric id。
- 相关自动化测试通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个后端查询语义和对应测试，拆分会增加前后端语义不一致风险。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server` pairing occurrence 查询、calendar/pairing 相关测试；必要时补充 `pbs-portal` Pairing Number dialog 测试。
- Conflict risk: 中等，主要风险是误把前端重新改回保存 label。
- Execution gate: 用户确认本 spec 后实施。
