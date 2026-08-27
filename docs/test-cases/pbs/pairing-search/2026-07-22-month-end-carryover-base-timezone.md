# Month-End Carryover 按 Pairing Base 时区计算回归用例

## 目标

确认 `Month-End Carryover` 使用 Pairing Base 当地结束日期计算，并保证 Portal PREVIEW、Current Rules/Counts 与生产算法导出对同一 Pairing 使用一致判定。

## 测试数据基线

- Bid month：`Jun 2026`
- Crew scope：`YYZ + IFD`
- Eligible Pairing pool：568
- 条件：`Award Month-End Carryover = 1`
- 预期命中数：7

## 用例

1. 在 Pairing 页面配置 `Award Month-End Carryover = 1` 并执行 PREVIEW。
   - 预期：总数为 7。
   - 预期：包含 `T4583`。
   - 预期：不包含 `T4582`。
2. 将相同条件切换为 `Avoid`。
   - 预期：`T4582` 位于 Avoid 结果。
   - 预期：Award 与 Avoid 结果无交集，两者并集等于 eligible pool 568。
3. 保存条件并检查 Current Rules/Counts。
   - 预期：Count 与 PREVIEW 一致。
4. 调用生产 PBS 算法导出接口，解压并检查 `PAIRING_SCORE.csv`。
   - 预期：Portal 月内候选池中的同一 Pairing，评分判定与 PREVIEW 一致。
   - 说明：Scenario solver 输入可包含月份前后 7 天扩展窗口，因此导出总行数可大于 Portal 的 7 条，不能只按总数比较。
5. 检查 Base 时区边界。
   - `T4582`：UTC 日期进入 7 月，但 YYZ 当地在 `2026-06-30` 结束，`carry_out_days = 0`。
   - `T4583`：YYZ 当地在 `2026-07-01` 结束，`carry_out_days = 1`。
6. 检查缺失映射 fallback。
   - Pairing Base 缺失、机场不存在或 `zone_id` 无效时不报错。
   - 预期：该 Pairing 使用 UTC 计算，且查询和算法导出仍能完成。

## 验收标准

- `carry_out_days = Pairing Base 当地结束日期 - bid month 最后一天`。
- PREVIEW、Current Rules/Counts、生产算法导出三条路径对同一 Pairing 使用同一口径。
- 小日历仍只高亮真实 Duty 日期，本修复不改变日历展示。
