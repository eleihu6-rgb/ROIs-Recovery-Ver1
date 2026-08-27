# NPBS Pairing Preference 全月同名匹配一致性修复设计

## 1. 背景

crew `264` 的 July 2026 NPBS T3 条件为：

```text
Award Pairings — C4107、C4130、C4155
```

真实 Pairing 数据证明，同一个 Pairing Number 在同一月份可以对应多个稳定 Pairing ID。例如 T3 实际匹配到：

| Pairing ID | Pairing Number | Origin Date |
|---:|---|---|
| `98991` | C4107 | 2026-07-03 |
| `99126` | C4107 | 2026-07-05 |
| `99196` | C4107 | 2026-07-06 |
| `99661` | C4130 | 2026-07-13 |
| `99923` | C4130 | 2026-07-17 |
| `100129` | C4130 | 2026-07-20 |
| `100602` | C4155 | 2026-07-27 |

NPBS 未限定具体日期时，`Award Pairings — C4107` 的业务含义是 Award 目标月份内所有符合 crew period、base、rank 范围的 `C4107` Pairing，而不是只选择搜索结果中的第一条。

当前两条录入路径存在不同问题：

- 批量导入接口正确解析出了全部 7 个 Pairing ID，但对 `pairingLabels` 单独去重，保存成 `7 IDs / 3 Labels`，破坏一一对应的数据契约。
- Playwright 使用 `.first()`，每个 Pairing Number 只勾选第一条搜索结果，实际少录同月其他同名 Pairing。

这使接口导入、Playwright 模拟和页面手动全选同名结果产生不同数据。

## 2. 对既有设计的修正

本设计补充并修正：

```text
docs/superpowers/specs/2026-07-23-npbs-pairing-preference-import-readback-fix-design.md
```

既有设计中“Pairing ID 去重、label 仅用于摘要”的方向保留，但其中 `2 IDs / 1 Label` 的示例不是合法 canonical payload。当前标准数据契约必须满足：

```text
pairingIds.length === pairingLabels.length
```

每一个稳定 Pairing ID 必须在相同数组位置拥有自己的 Pairing Number label；多个 ID 对应同一个 Pairing Number 时，label 可以并且必须重复。

## 3. 目标

- NPBS 未指定日期的 Pairing Number 匹配目标月份内所有符合范围的同名 Pairing。
- 批量接口与页面手动勾选全部匹配结果生成完全相同的 canonical payload。
- Playwright 模拟勾选全部同名搜索结果，不再只选择第一条。
- Tier 摘要在不丢失数量信息的前提下按 Pairing Number 汇总，例如 `C4107 ×3、C4130 ×3、C4155 ×1`。
- 修正 crew `264` 已导入的 T3、T4 payload。
- Pairing Search counts、编辑回读和 Tier Detail 均接受修复后的数据，不再显示 `Review-only`。
- 通过规范化后的完整 `(pairingId, pairingLabel)` tuple 集合比较，证明批量接口与 Playwright UI 录入同构，而不只比较数量或摘要。

## 4. 非目标

- 不把 Pairing Preference 改成仅保存 Pairing Number 的模糊条件。
- 不删除稳定 Pairing ID，也不放宽 Pairing Search 的 ID 校验。
- 不恢复已废弃的 `pairing-occurrence-list` 或 occurrence 子表作为事实来源。
- 不改变有明确日期的 NPBS Pairing 条件；这类条件仍只匹配指定日期。
- 不自动重新导入其他 crew，不执行全量 July 导入。
- 不新增数据库表、字段或 migration。

## 5. 方案比较

### 方案 A：全月完整匹配，ID/label 一一对应（采用）

- 保留导入器当前“未指定日期则返回全部同名 Pairing”的解析行为。
- 按稳定 Pairing ID 去重时，同时保留该 ID 对应的 label，不再对 labels 独立去重。
- Playwright 勾选搜索结果中全部同名 Pairing。
- 摘要对重复 label 计数显示。

优点：符合 NPBS 语义、页面手动全选行为和现有精确 ID 搜索模型；不会漏录同月同名 Pairing。

### 方案 B：每个 Pairing Number 只取第一条（不采用）

该方案可以得到等长数组，但会漏掉同月其他日期的同名 Pairing，不符合用户确认的 NPBS 全月含义。

### 方案 C：只保存 Pairing Number，由搜索时动态展开（不采用）

该方案需要改变当前 Pairing Preference、counts、日历、编辑器和搜索的数据契约，影响范围大，并使保存后的选择随数据库变化而漂移。

## 6. Canonical 数据结构

### 6.1 基本契约

Property `102 Pairing Preference` 保存：

```json
{
  "type": "pairing-preference",
  "pairingIds": ["98991", "99126", "99196"],
  "pairingLabels": ["C4107", "C4107", "C4107"]
}
```

约束如下：

1. `pairingIds` 保存目标 period 内真实、稳定的 Pairing ID。
2. `pairingLabels[index]` 是 `pairingIds[index]` 对应的 Pairing Number。
3. 两个数组长度必须相等，顺序必须一致。
4. Pairing ID 去重；相同 ID 只保存一次。
5. label 不独立去重；不同 ID 可以拥有相同 label。
6. JSON 中 ID 继续使用字符串，保持现有前后端契约。

### 6.2 crew 264 T3 修复结果

```json
{
  "type": "pairing-preference",
  "pairingIds": [
    "98991",
    "99126",
    "99196",
    "99661",
    "99923",
    "100129",
    "100602"
  ],
  "pairingLabels": [
    "C4107",
    "C4107",
    "C4107",
    "C4130",
    "C4130",
    "C4130",
    "C4155"
  ]
}
```

T4 使用相同规则，把现有 11 个 Pairing ID 与各自真实 Pairing Number 一一对应。

## 7. 详细设计

### 7.1 批量导入接口

Pairing resolver 继续执行：

1. 按 target period、crew base、rank 和 Pairing Number 查询真实 Pairing。
2. 源条件包含明确 origin date 时，只接受该日期的匹配结果。
3. 源条件没有 origin date 时，保留目标月份全部同名匹配结果。
4. 以 Pairing ID 为键建立有序映射 `pairingId -> pairingNumber`。
5. 从同一个映射同时生成 `pairingIds` 与 `pairingLabels`，从结构上防止数量错位。
6. unmatched pairing 的严格 blocker 行为保持不变。

`live-server` 是当前正式批量导入入口，必须修复。仓库中的 `pbs-server` 同名导入实现也必须使用相同映射规则，避免备用入口继续产生错误数据；测试应证明两者在规范化回读后生成相同 canonical payload。

两个实现只统一 `pairingId -> pairingNumber` 有序映射契约，不要求本次重构其底层持久化布局：

- `live-server` 继续按当前设计把 canonical JSON 写入 `param_a`。
- `pbs-server` 可以继续使用其现有 `param_a/param_c` 序列化布局，但回读并规范化后必须得到与 `live-server` 相同的 canonical payload。

### 7.2 Playwright 模拟

当前 page object 对每个 Pairing Number 使用：

```text
Select pairing <number> -> .first()
```

修复后：

1. 输入 Pairing Number，等待搜索结果稳定。
2. 找到当前结果中 Pairing Number 完全相等的全部可见 checkbox。
3. 逐条勾选尚未选中的结果。
4. 若同名结果存在分页，继续翻页并选择全部同名结果，直至没有下一页。
5. 至少选择一条才算该源 Pairing Number 成功；零条继续记录 blocker。
6. 防止重复访问分页时重复勾选已选 ID。

Playwright 的目标是模拟用户在页面中选择本月全部同名 Pairing，不通过直接调用保存 API 绕过 UI。

### 7.3 页面摘要

摘要解析仍先验证：

- payload type 为 `pairing-preference`；
- IDs 和 labels 均为非空字符串数组；
- 数组长度相等。

验证通过后，按 label 首次出现顺序计数，显示：

```text
Award 7 pairings C4107 ×3, C4130 ×3, C4155 ×1
```

只要存在同名多条，摘要进入计数模式，所有 label（包括数量为 1 的 label）都保留 `×N`，明确告诉用户每个编号实际选择了几条；全部 label 均唯一时保持现有自然语言摘要，不额外显示 `×1`。Tier Detail 使用同一摘要规则，不展示内部 Pairing ID。

### 7.4 crew 264 数据修复

前一份 occurrence readback 修复已完成数据清理，当前 bidId `4300` 的有效 occurrence 行数为 `0`。本次执行前必须再次验证该前置状态；若不为 `0`，停止本次 T3/T4 更新，并先按前一份已批准设计处理旧 occurrence，不能让旧 read model 再次覆盖 canonical payload。

统一执行顺序为：

```text
两个导入实现停止旧 occurrence 写入并通过测试
  -> 确认 bidId 4300 有效 occurrence 为 0
  -> 更新 T3/T4 canonical payload
  -> draft、Tier Detail、counts 和 Playwright 回归
```

只修正 bidId `4300` 下 property `102` 的 T3、T4 `param_a`：

1. 再次校验 crew `264`、period `Jul 2026`、bidId `4300`、property `102` 和有效 occurrence 行数 `0`。
2. pre-check 必须恰好命中两条目标 group：T3 group ID `33646` / propertyGroupKey `313537be-bcdb-4150-b1ea-1ca5ced9f86c`，T4 group ID `33647` / propertyGroupKey `653e3f63-c9f4-4ae5-ad96-76528dd4b698`；不得使用只按 crew 或 property code 的模糊更新。
3. 验证更新前 T3 的 `pairingIds` 恰好为 `98991, 99126, 99196, 99661, 99923, 100129, 100602`，T4 恰好为 `98916, 99046, 99183, 99513, 99583, 99841, 99977, 100305, 100445, 100585, 149788`；集合与顺序均不得漂移。任一身份、数量或原值不一致均停止事务。
4. label 必须通过导入 resolver 使用的权威 Pairing 数据按稳定 ID 回查生成，不能从已删除的 occurrence 行、旧错误 labels 或临时备份反向猜测。
5. 在单个事务中只更新两个固定 group 的 `param_a`；不得改动 T1、T2、T5。
6. post-check 验证 T3 为 `7/7`、T4 为 `11/11`，且每个 ID 对应的 label 与权威 Pairing Number 一致。
7. 读取 Pairing draft、Tier Detail 和 counts，确认不再进入 review-only fallback。

执行前保存本地临时 receipt，但不得提交包含 crew bid 数据的 receipt、截图或数据库导出。

## 8. 错误处理与边界

- 同一个 Pairing ID 若返回冲突的 Pairing Number，停止该 preference 导入并记录 blocker，不静默选择其一。
- 未指定日期时零匹配：保持 `unmatched_pairing_number` blocker。
- 指定日期时其他日期存在同名 Pairing，但指定日期不存在：仍视为 unmatched，不回退到全月。
- Playwright 搜索超时、分页失败或部分勾选失败：该 preference 记录失败，不声称录入成功。
- 现有非法 `IDs/labels` 数量不一致的数据继续显示 review-only；本次只定向修复已确认的 crew `264` 数据，不做模糊全库修复。

## 9. 测试与验证

### 9.1 后端测试

focused tests 至少覆盖：

- 一个 Pairing Number 匹配多个 ID，保存重复 labels 且与 IDs 等长。
- 多个 Pairing Number 混合匹配时保持 ID/label 索引对应。
- 重复 Pairing ID 只保留一次，同时保留其正确 label。
- 指定日期只保留指定日期结果。
- 冲突 ID/label、零匹配和 strict unmatched blocker。
- `live-server` 与 `pbs-server` 两个导入实现生成一致的 canonical payload。
- 摘要输出 `C4107 ×3、C4130 ×3、C4155 ×1`，非法长度仍进入 review-only。
- 两个实现即使保留不同底层 `param_a/param_c` 布局，规范化回读后的完整 tuple 集合仍完全一致。

### 9.2 Playwright

使用真实 Portal UI 和 crew `264` 的可控测试数据验证：

- 搜索 `C4107` 后勾选全部 3 条同名结果。
- 搜索 `C4130` 后勾选全部 3 条同名结果。
- 搜索 `C4155` 后勾选唯一结果。
- 保存后 Existing/Tier Detail 显示 T3、Award 和正确的 `×N` 摘要。
- 编辑该条件时 7 条实际 Pairing 均保持选中。
- `SEARCH PAIRINGS` 和 `/api/pairing-search/current-rules/counts` 返回成功。
- 保存后通过只读 draft 回读或保存请求观测取得完整 payload，使用项目 canonical normalizer 生成确定顺序的 `(pairingId, pairingLabel)` tuple，并与批量导入预期 tuple 逐项比较；只比较 `7/7` 数量不算通过。

crew `264` 的真实数据不足以覆盖分页分支，因此另加一个只用于分页交互的可控 Playwright 用例：

- 仍驱动真实 Pairing Preference picker UI，但对 pairing preview 响应提供至少两页、同一精确 Pairing Number 分布在两页的可控数据。
- 断言翻页、全部勾选、返回前页后仍保持选中，以及最终保存 payload 包含跨页全部 tuple。
- 该可控分页用例只验证 UI 分页算法，不能替代 crew `264` 连接真实后端的业务链路回归。

按照 108 skill，Playwright 模拟运行后必须生成 Word 报告；截图、issue receipt 和 source-derived 报告默认不提交 Git。

### 9.3 验证命令范围

- `live-server` crew-bid-import focused Vitest。
- `pbs-server` crew-bid-import、lineholder summary 和 pairing-search focused tests。
- NPBS parser/mapper Node tests。
- focused PBS Portal Playwright（crew `264`）。
- `live-server npm run build`、`pbs-server npm run build`。
- 前端样式若未变化，可不运行 `check:ui`；若实现中修改样式则必须运行。
- `git diff --check`。
- GitNexus `detect_changes --scope compare --base-ref main`。

## 10. 验收标准

- crew `264` T3 保存 `7 pairingIds / 7 pairingLabels`，T4 保存 `11/11`。
- 每个 Pairing ID 与相同索引的 Pairing Number 对应，重复 label 得到保留。
- Playwright 对每个无日期 Pairing Number 选择目标月份全部同名结果。
- 可控 Playwright 用例证明同名结果跨页时仍全部选中；crew `264` 真实回归证明实际后端链路。
- Tier 摘要明确显示各 Pairing Number 的实际数量，不显示内部 ID，不进入 `Review-only`。
- counts 接口返回 HTTP 200，Pairing Search 可正常执行。
- 新的批量导入和 Playwright UI 录入经 canonical normalizer 处理后产生完全相同的 `(pairingId, pairingLabel)` tuple 序列。
- focused tests、build 和真实 Playwright 回归全部 PASS。
- 不重新导入其他 crew，不提交截图、receipt 或敏感数据文件。

## 11. 风险与回滚

- 风险：Playwright 同名结果跨分页时漏选。通过分页遍历测试和保存后选中数量断言防止。
- 风险：摘要计数掩盖错误映射。摘要只在严格等长校验通过后生成；后端测试同时验证索引对应。
- 风险：同名 Pairing 数量较多使 Playwright 变慢。只处理精确同名搜索结果，串行选择并复用现有等待策略，不引入固定长等待。
- 代码回滚：恢复旧映射和 `.first()` 行为，但会重新产生已知不一致，不作为长期方案。
- 数据回滚：更新 crew `264` 前保存 T3、T4 原始 `param_a` 临时备份；仅在验证失败时事务恢复，不提交备份。

## 12. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 导入器、Playwright 与摘要共同约束同一个 `pairingIds/pairingLabels` 契约，数据修复又依赖代码先验证，顺序紧密。
- Suggested split: 单 agent 依次完成影响分析、代码修改、focused tests、264 数据修复和真实 UI 回归。
- Write boundaries: `live-server` / `pbs-server` 导入服务及测试、PBS Portal summary、NPBS Playwright page object、focused E2E 与本 spec。
- Conflict risk: 中；若并行编辑同一契约，容易再次产生入口差异。
- Execution gate: 用户审阅并批准本 spec 后才允许修改产品代码或业务数据。

## 13. Git 约束

本次用户明确要求“不允许主动提交 Git”。因此 spec、后续代码与测试修改均不得自动执行 `git add`、`git commit` 或 `git push`；只有用户后续明确要求时才允许提交。
