# PBS Award 航段 CRD 展示修复设计

> 日期：2026-07-30
> 状态：已确认并实施
> 范围：Award Selected Duty 航段表 CRD 展示

## 1. 问题

Award 页面将同一个 `duty_seq` 下的多条航段 CRD 全部显示为 `Duty`。发布数据和
Duty 总 Credit 实际存在，但该文案让用户误以为航段 Credit 缺失，属于前端 UI Bug。

## 2. 修复规则

1. 同一个 `duty_seq` 只有一条航段时，继续显示该航段携带的 Credit 数字。
2. 同一个 `duty_seq` 有多条航段时：
   - 按 Selected Duty 当前稳定渲染顺序，首次出现该 `duty_seq` 的航段显示该 Duty Credit 数字；
   - 后续航段显示 `--`，避免重复展示同一份 Duty Credit。
3. 一个 Pairing 包含多个 Duty 时，每个 `duty_seq` 独立应用上述规则。
4. `creditMissingReason` 存在时优先于去重展示：所有航段继续显示既有 `Missing data`
   状态，不将后续航段改为 `--`。
5. Pairing 底部总 `CREDIT`、Roster Details Credit 和汇总计算保持不变。

## 3. 实现边界

- 只调整 `pbs-portal` Award 映射层的 CRD 展示标签。
- 不修改数据库、API Contract、pbs-server Credit 去重逻辑或发布链路。
- 不把 Duty Credit 误拆成航段级 Credit。
- 不改变后端已经提供的航段排序；“首次出现”以 `item.legs` 的既有稳定顺序为准。
- 不进行无关重构。

## 4. 验收标准

1. V4133 一类单 Duty 多航段 Pairing：第一行显示 `6:30`，其余行显示 `--`。
2. V4126 一类每个 Duty 只有一个航段的 Pairing：各行继续显示各自的 CRD 数字。
3. 多 Duty、每个 Duty 含多航段的 Pairing：每个 `duty_seq` 仅首次出现的航段显示
   Credit，随后航段显示 `--`。
4. 缺失 Credit 或缺失 `dutySeq` 导致 `creditMissingReason` 的 Pairing：所有航段继续显示
   `Missing data`，不伪造数值。
5. CRD 列不再出现 `Duty` 文案。
6. 底部总 `CREDIT` 数值不变。
7. 更新与新规则冲突的陈旧 QA 用例
   `docs/test-cases/pbs/award/2026-07-28-award-published-credit-fleet-completeness.md`，
   并补充对应前端单测与 Playwright 回归断言。
8. 运行 Award 聚焦测试、Portal 构建、UI 标准检查和相关 Playwright。

## 5. Multi-Agent Parallelism Assessment

- Recommendation：No
- Rationale：改动集中在单个映射函数及其紧邻测试，拆分会增加同文件冲突。
- Suggested split：不拆分。
- Write boundaries：Award 映射层、Award 页面测试和对应 E2E。
- Conflict risk：Low。
- Execution gate：本 Spec 经用户确认并审查通过后实施。
