# PBS Crew Bid Import 空条件 Crew 跳过规则设计

## 背景

June 2026 CLASS bid 文件 dry-run 中，crew `2496` 被标记为 failed，但原始文件里该 crew 只有：

- `Reserve Bid Group`
- 分组标题 `Pairing Bid Group`
- 分组标题 `Award Pairings`
- 分组标题 `Reserve Bid Group`

这些内容没有实际可落库的 bid preference。当前导入服务把它归为 `failed`，并提示 `No importable preferences remain after target-period airport matching.`，这会误导用户以为是机场或条件匹配失败。

## 目标

当 crew 没有任何实际可导入条件时，导入报告应将该 crew 视为 skipped/ignored，而不是 failed。

## 范围

本次只调整 crew bid import 的状态判定和报告口径：

- dry-run 中无实际可导入条件的 crew 显示为 `skipped`
- import 中同样跳过该 crew，不写入 bid
- summary 中 `skippedCrew` 增加，`failedCrew` 不增加
- message 使用清晰文案说明该 crew 没有可导入 bid preference
- 保留 `skippedPreferenceCount`，用于说明原始 preference 被跳过

不改变以下行为：

- `Unsupported` 条件仍然作为失败/错误问题展示
- `Missing Pairing`、`Missing Airport` 等目标期数据匹配问题仍保留在 Failures 中
- 超过 T7 的 preference 仍按现有规则 ignored/warning
- 有实际条件但经过 Pairing Number 或 Airport 匹配后全部不可导入的 crew，仍按现有数据问题口径处理，不在本次改成 skipped

## 判定规则

推荐新增一个明确判定：

```text
如果 mappedPreferences.length === 0
并且 failedPreferenceCount === 0
并且所有解析到的 preferences 都是 skipped
则 item.status = "skipped"
message = "No importable bid preferences were found; crew skipped."
```

对于像 `2496` 这样只有 `Reserve Bid Group` 的 crew：

- `parsedPreferenceCount = 1`
- `importablePreferenceCount = 0`
- `skippedPreferenceCount = 1`
- `failedPreferenceCount = 0`
- `status = skipped`

## 验收标准

- June 2026 dry-run 中 crew `2496` 不再计入 `Failed Crew`
- `Skipped Crew` 增加 1
- `Unsupported` 仍为 0
- 有条件但因为目标期数据不存在而失败的 crew 不被隐藏
- 单元测试覆盖空条件 crew skipped 场景

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在导入服务状态判定和测试，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `live-server/src/services/crew-bid-import/*`，必要时同步 legacy `pbs-server` import service。
- Conflict risk: 低。
- Execution gate: 用户确认本设计后实施。
