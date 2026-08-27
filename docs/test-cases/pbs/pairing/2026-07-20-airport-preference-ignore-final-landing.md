# Airport Preference 忽略最终 Landing QA

## 目的

验证 `Airport Preference` 的 `Landing` 事件不再包含每个 pairing 的最后一段 landing，避免 crew 选择 `Avoid + Landing + 本基地机场` 时把所有正常回基地的 pairing 都过滤掉。

## 范围

- Pairing 页面 `Airport Preference`
- Search Pairings 预览 / pool 过滤
- Algorithm export `PAIRING_SCORE.csv` 前置 pairing 过滤
- `Airport Preference` 专用 airport/city options

不覆盖旧 `101 Any Landing In Airport`，该条件的通用 `landingAirports` 选项保持旧语义。

## 前置数据

准备至少两类 pairing：

1. Pairing A：只有最后一段 landing 到 crew base，例如最后返回 `YVR`。
2. Pairing B：中间段 landing 到 crew base，之后还有后续 segment。
3. 可选 Pairing C：在同一机场有 layover，用于验证 layover 不受影响。

## 用例

### AP-01 Avoid base landing 不过滤正常回基地 pairing

1. 使用 base 为 `YVR` 的 crew 登录 PBS Portal。
2. 打开 Pairing 页面，新增 `Airport Preference`。
3. 选择 `Avoid`、`Landing`、机场 `YVR`。
4. 选择至少一个 Tier。
5. 保存并刷新 Search Pairings / pool。

预期：

- 只有最后一段 landing 到 `YVR` 的 Pairing A 不应因为该 bid 被过滤。
- 中间段 landing 到 `YVR` 的 Pairing B 应被 Avoid 过滤。

### AP-02 Award base landing 也忽略最终 landing

1. 新增 `Airport Preference`。
2. 选择 `Award`、`Landing`、机场 `YVR`。
3. 保存并查看匹配结果。

预期：

- Pairing A 不因最终回基地而命中。
- Pairing B 因中间 landing 到 `YVR` 命中。

### AP-03 Both + Preferred layover hours

1. 新增 `Airport Preference`。
2. 选择 `Both`、机场 `YVR`。
3. 打开 `Preferred layover hours`，设置合法小时数。
4. 保存并查看匹配结果。

预期：

- 非最终 landing 到 `YVR` 可命中，不需要满足 layover hours。
- 最终 landing 到 `YVR` 不命中。
- layover 到 `YVR` 仍可命中，且必须满足 preferred layover hours。

### AP-04 Limit to event date

1. 新增 `Airport Preference`。
2. 选择 `Landing`、机场 `YVR`。
3. 打开 `LIMIT TO EVENT DATE`，选择中间 landing 的本地日期。
4. 保存。

预期：

- 日期只对非最终 landing 生效。
- 最终 landing 的本地日期不会让 pairing 命中。

### AP-05 Airport Preference options

1. 打开 `Airport Preference`，选择 `Landing`。
2. 查看 airport/city 下拉选项。

预期：

- 只因为最终回基地出现的 airport/city 不应作为 `Airport Preference` 的 landing event 出现。
- 如果同一 airport/city 有中间 landing，仍可作为 landing 选项出现。
- 如果同一 airport/city 有 layover，layover event 仍可出现。

### AP-06 Export 一致性

1. 保存上述 `Airport Preference` bid。
2. 执行 algorithm export。
3. 检查 `PAIRING_SCORE.csv` 中该 crew 的 pairing counter。

预期：

- `PAIRING_SCORE.csv` 中的 pairing 命中集合与 Search Pairings 的 filtering 语义一致。
- 只有最终 landing 到 base 的 pairing 不应被 Airport Preference landing 命中。

## 回归范围

- `Airport Preference` 保存 / 编辑 / Favorite 回显不应变化。
- `Layover` 和 `Both` 中的 layover 分支不应回归。
- `Preferred layover hours` slider 不应回归。
- 旧 `101 Any Landing In Airport` 的通用 landing airport 行为不应被本次改动改变。
