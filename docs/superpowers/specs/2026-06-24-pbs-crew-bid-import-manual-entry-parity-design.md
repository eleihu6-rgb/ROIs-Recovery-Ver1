# PBS Crew Bid Import 与手动录入一致性设计

## 背景

用户在 `Crew Bid Import` 导入 `CLASS-BidsReport_June2026.txt` 后，进入 Portal 查看 crew 19 的条件时发现：

- `Prefer Off` 行有原始 JSON，但打开 `Configure Days Off Bid` 后日期没有还原。
- `Pairing Number` 条件显示内部 `pairing_id`，例如 `10924 / 11126`，而不是用户可理解的 `T4528`。
- `Specific Date` 区域提示没有 pairing runs，但 `Confirmed Runs` 又显示了 `T4528 + 日期`。

这些现象说明导入写入的数据与用户手动在 Portal 录入并保存的数据格式没有完全一致。

## 目标

唯一目标：导入接口写入系统后的 bid 数据，必须与用户在 Portal 页面手动录入同一条件并保存后的数据等价。

等价包含：

- Portal 列表展示一致。
- 编辑弹窗回显一致。
- 再次保存后数据不丢失、不变形。
- Pairing / Days Off / Tier / Calendar 等页面读取同一份语义。
- 算法导出和后续查询不需要区分“导入来源”和“手动来源”。

## 范围

本次处理所有通过 Crew Bid Import 导入的 crew。crew 19 只是当前最明显的回归样例，不能作为唯一处理范围。

已发现的典型差异包括：

- `DaysOff / Prefer Off` 导入格式与手动保存格式不一致。
- `Pairing / Pairing Number` 导入后的 occurrence 数据与 Portal 弹窗显示、搜索使用值不一致。

实现和验证时需要覆盖整份导入文件中所有可导入 crew，确保同类条件不会只在 crew 19 上修复。

不在本次范围：

- 新增 PBS 条件。
- 改变 CLASS 文本解析的业务语义。
- 改变 T1-T7 容量规则。
- 处理机场或 pairing 本身不存在导致的失败。

## 当前差异

### Prefer Off

当前导入在 `live-server` 中把 `Prefer Off Jun 1, 2026...` 写成类似：

```json
{"dates":["2026-06-01"],"daysOfWeek":[]}
```

但 Days Off 模块当前手动保存 `Prefer Off` 使用 `tag-list` 语义，序列化后应是：

```text
2026-06-01,2026-06-03
```

或：

```text
Friday,Saturday,Sunday
```

Portal 的 Days Off 弹窗和日历工具链也主要按 `tag-list` 读取 `Prefer Off`，因此导入 JSON 会导致列表显示和弹窗回显异常。

### Pairing Number

导入已经写入 `pbs_bid_pairing_occurrence`，其中包含：

- `pairing_number`，例如 `T4528`
- `origin_date`，例如 `2026-06-04`
- `pairing_id`，例如 `10924`
- `occurrence_id`

但 Portal 配置弹窗把 `pairing-occurrence-list` 的 `pairingId` 当作 `pairingNumber` 候选值使用，导致：

- BID 区显示内部 ID。
- BID MODE 按钮显示内部 ID。
- 查询 runs 时可能用内部 ID 查询，而不是用 `T4528` 查询。

## 推荐方案

### 方案 A：源头写入和 Portal 回显一起对齐（推荐）

1. `live-server` 导入 `Prefer Off` 时，按 Days Off 手动保存格式写入 `param_a`。
2. `pbs-portal` 的 Pairing Number 弹窗对 `pairing-occurrence-list` 使用 `occurrence.pairingNumber` 作为显示和搜索值，使用 `pairingId` 仅作为持久化身份。
3. 保留 `pbs_bid_pairing_occurrence` 作为 Specific Date 的来源。
4. 增加自动化测试和 QA 测试用例，覆盖 crew 19 这种导入后再编辑的场景。

优点：

- 最符合“导入等同手动录入”的目标。
- 不需要在 UI 中长期兼容导入专用异常格式。
- 后续算法导出、页面读取、二次保存都更稳定。

风险：

- 需要同时覆盖 `live-server` 导入 mapper 和 `pbs-portal` 回显逻辑。
- 已存在的旧格式导入数据不做兼容；如需修复，应通过重新导入或单独数据清理处理。

### 方案 B：只在 Portal 兼容导入格式

Portal 继续兼容 `Prefer Off` JSON 和 Pairing ID 显示问题，不改导入写入。

不推荐原因：

- 数据库仍然存在“导入格式”和“手动格式”两套形态。
- 后续页面、导出、脚本仍可能遇到同样问题。
- 不满足用户提出的核心目标。

## 详细设计

### Prefer Off 导入规则

导入 `Prefer Off` 时根据解析结果写成 Days Off `tag-list` 格式：

- 具体日期：写 ISO 日期列表，逗号分隔。
- 星期：写 Portal 识别的英文 weekday label。
- Weekends：写 `Weekends`。
- Date Range：如果来源是范围，保持 Portal 当前支持的 `Between YYYY-MM-DD - YYYY-MM-DD` 表达。
- 时间窗口：维持现状，若模型暂不支持，继续记录 warning，不写入隐藏格式。

这样 `pbs-server` 通过 Days Off catalog 反序列化时会得到手动保存同构的 `tag-list` bid。

### Pairing Number 回显规则

`pairing-occurrence-list` 的职责划分：

- `pairingNumber`：用户可见值，例如 `T4528`。
- `pairingId`：稳定内部身份，用于保存、去重、算法引用。
- `originDate`：Specific Date 选择的日期。
- `occurrenceId`：具体 run 的身份。

Portal 弹窗应：

- BID chips 显示 `pairingNumber`。
- BID MODE 按钮显示 `pairingNumber`。
- `Specific Date` 搜索使用 `pairingNumber`。
- `Confirmed Runs` 使用现有 occurrence 数据回显。
- 保存时仍保留完整 occurrence 列表，不能降级成纯 ID 列表。

### 旧数据处理原则

不做旧数据兼容。

- 导入路径和 Portal 手动保存路径必须统一到同一套当前数据格式。
- Portal 不新增旧导入 JSON 的兼容解析。
- Pairing Number 不为旧的错误 ID 展示形态增加特殊兼容。
- 旧导入数据如果已经写坏，应通过重新导入、回滚后重导或后续单独数据清理解决，不在运行时代码里长期保留分支。

## 测试计划

自动化测试：

- `live-server`：`Prefer Off` 导入 mapper 输出应匹配 Days Off 手动保存的 `tag-list` 序列化格式。
- `pbs-portal`：Pairing Number 弹窗打开 `pairing-occurrence-list` 时显示 `T4528`，不显示 `10924`。
- `pbs-portal`：Days Off 弹窗打开导入后的 `Prefer Off` 时，能看到导入日期并可再次保存。
- 如已有 Playwright 流程可复用，增加导入后页面回归检查：crew 19 作为必测样本，同时抽查整份文件中其他包含 `Prefer Off`、`Pairing Number + Specific Date`、组合条件的 crew。

QA 测试文档：

- 路径：`docs/test-cases/pbs/crew-bid-import/2026-06-24-import-manual-entry-parity.md`
- 覆盖：
  - 导入 crew 19。
  - 抽查整份导入文件中其他有同类条件的 crew。
  - 打开 Days Off `Prefer Off`。
  - 打开 Pairing `Pairing Number T4528`。
  - 保存后重新打开验证数据不变。

## 验收标准

- crew 19 的 `Prefer Off` 不再显示原始 JSON。
- crew 19 的 `Prefer Off` 弹窗完整回显 18 个 June 日期。
- crew 19 的 `Pairing Number` 显示 `T4528 / T4520 / T4542` 这类 pairing number，而不是内部 ID。
- 所有导入 crew 的同类 `Prefer Off` 和 `Pairing Number` 条件都使用与手动录入一致的数据格式。
- 导入报告中的成功 crew，进入 Portal 后不应因为导入来源不同而出现空值、内部 ID、原始 JSON 或无法二次保存的问题。
- Specific Date 的 runs 可以按 pairing number 正常加载。
- 保存后再次打开，仍与导入内容一致。
- 导入和手动录入的持久化数据在同一 property 下语义等价。
- 不引入旧导入格式兼容分支。
- 回归测试通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这次问题集中在 bid value 数据契约，`live-server` 导入、`pbs-server` 读取和 `pbs-portal` 编辑回显互相影响，拆分并行容易出现一边修显示、一边仍写旧格式。
- Suggested split: 不拆分。
- Write boundaries: 单一实现者依次修改导入 mapper、Portal 回显、测试和 QA 文档。
- Conflict risk: 中等，主要风险是触碰共享 `PairingBidValue` / `RuleBidValue` 语义。
- Execution gate: 用户确认本 spec 后开始实现。
