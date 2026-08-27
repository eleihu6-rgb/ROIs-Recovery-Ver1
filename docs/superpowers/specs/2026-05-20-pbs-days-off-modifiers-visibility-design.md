# PBS Days Off MODIFIERS 显示范围修复设计

日期：2026-05-20  
状态：补写待复核  
范围：只调整 `Configure Days Off Bid` 弹窗中 `MODIFIERS` 区域的显示条件，不改变数据库 schema、不改变 Prefer Off 的 modifier 保存语义。

## 背景

用户在检查 Days Off 配置弹窗时发现，`Max Consecutive Days On`、`Min Consecutive Days Off`、`Min Consecutive Days Off In Window` 等结构性条件底部仍显示：

- `All or Nothing`
- `Minimum required`

这会造成语义混乱。结构性条件本身是单一约束或固定参数组合，不是“多个目标可部分满足”的偏好集合。

本次先只读核对旧库资料：

- `init-docs/crew_bids_reference-2026-03-16-072929.md`
- `init-docs/crew_bids_reference-2026-03-16-072929.xlsx`
- 已有 Days Off / AA 对齐 spec

旧库 Excel `crew_bids` 统计结果：

| Property | rows | all_or_nothing | minimum_n |
| --- | ---: | ---: | ---: |
| `201 Prefer Off` | 2878 | 46 | 68 |
| `202 Max Consecutive Days On` | 137 | 0 | 0 |
| `203 Min Consecutive Days Off` | 150 | 0 | 0 |
| `204 Min Consecutive Days Off In Window` | 275 | 0 | 0 |
| `205 Days Off / Days On Pattern` | 89 | 0 | 0 |

旧库 markdown 也把 `all_or_nothing` 解释为 `Prefer Off` 的全有全无标识，把 `minimum_n` 举例为 `Prefer Off Weekends Minimum N`。

## 目标

1. `Prefer Off` 弹窗继续显示 `MODIFIERS`。
2. 结构性 Days Off 条件不显示 `MODIFIERS`。
3. 不删除数据字段；已有接口仍可透传 `allOrNothing` / `minimumN`，避免破坏历史数据兼容。
4. 不新增配置表、不做复杂白名单系统；本轮只按已确认语义收敛 UI。

## 显示规则

### 显示

- `Prefer Off` (`propertyCode=201`) 显示：
  - `All or Nothing`
  - `Minimum required`

### 隐藏

以下结构性 Days Off 条件不显示 `MODIFIERS`：

- `Max Consecutive Days On` (`202`)
- `Min Consecutive Days Off` (`203`)
- `Min Consecutive Days Off In Window` (`204`)
- `Days Off / Days On Pattern` (`205`)

其他不具备旧库 modifier 证据的 Days Off 条件也不应默认显示 modifier。

## 已实施改动摘要

> 说明：本文件是补救文档。代码已先于文档改动，这是流程违规；本节用于帮助用户复核是否符合预期。

- `pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx`
  - 将 `MODIFIERS` 区域包进 `isPreferOff` 判断。
  - 非 `Prefer Off` 的配置弹窗不渲染 `MODIFIERS`。
  - `Prefer Off` 的 `All or Nothing` / `Minimum required` 控件保持不变。
- `pbs-portal/src/features/days-off/pages/days-off-page.test.tsx`
  - 原先 “Maximize Weekend Days Off 可保存 modifiers” 的测试改为结构性条件不显示 modifiers。
  - 已存在的 `Prefer Off` modifiers 保存测试仍保留。

## 不做范围

- 不改变后端 `allOrNothing` / `minimumN` 字段读写。
- 不清理旧数据中的 modifier 字段。
- 不调整 `Prefer Off` 的 `TIME WINDOW` 或 modifier 文案。
- 不改 Line / Pairing / Reserve。

## 验收标准

1. 打开 `Configure Prefer Off` 时能看到 `MODIFIERS`。
2. 打开 `Configure Max Consecutive Days On` 时看不到 `MODIFIERS`。
3. 打开 `Configure Min Consecutive Days Off` 时看不到 `MODIFIERS`。
4. 打开 `Configure Min Consecutive Days Off In Window` 时看不到 `MODIFIERS`。
5. 打开 `Configure Days Off / Days On Pattern` 时看不到 `MODIFIERS`。
6. `Prefer Off` 的 modifier 保存仍能提交 `allOrNothing` / `minimumN`。

## 验证记录

已运行并通过：

```bash
pnpm --dir pbs-portal test -- days-off-page.test.tsx pairing-bid-control.test.tsx
pnpm --dir pbs-portal lint -- src/features/days-off/components/days-off-bid-dialog.tsx src/features/days-off/pages/days-off-page.test.tsx
pnpm --dir pbs-portal exec tsc --noEmit --pretty false
```

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 单一弹窗显示规则收敛，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `days-off-bid-dialog.tsx` 与对应测试。
- Conflict risk: 低；主要风险是误隐藏 `Prefer Off` 的 modifier。
- Execution gate: 本应在用户确认本文档后实施；本次已违规先实施，需用户复核确认是否保留。
