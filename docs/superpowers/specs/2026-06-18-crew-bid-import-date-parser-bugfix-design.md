# Crew Bid Import 日期解析 bug 修复设计

## 背景

用户上传 `CLASS-BidsReport_March2026.txt` 并选择 `Mar 2026` 后，Dry Run 中出现：

- `invalid_mapped_date`
- `Unsupported date format: Mar`

对应原始 bid 行包括：

```text
Prefer Off Mar 16, 2026, Mar 31, 2026
Prefer Off Mar 7, 2026 - Mar 9, 2026
```

这类行应被解析为目标 period 内的日期或日期范围，不应产生 `Mar` 格式错误。

## 根因

`crew-bid-property-mapper.ts` 中 `DATE_PATTERN` 使用了内部月份捕获组：

```text
(Jan|Feb|Mar|...)
```

当它被嵌入范围正则时，捕获序号被内部月份组打乱。`Prefer Off Mar 7, 2026 - Mar 9, 2026` 的结束日期会被错误读取为 `Mar`，最终产生 `Unsupported date format: Mar`。

## 目标

1. 修复 legacy date 范围解析，使 `Mar 7, 2026 - Mar 9, 2026` 正确映射。
2. 不扩展 `Prefer Off ... Between 02:00 And 23:59` 的时间窗口模型。
3. 不处理 `unmatched_pairing_number`，该问题需要单独查 pairing 数据或匹配规则。
4. 添加单元测试覆盖 `Prefer Off Mar 7, 2026 - Mar 9, 2026` 和 `Prefer Off Mar 16, 2026, Mar 31, 2026`。

## 设计

- 调整 `DATE_PATTERN`，把内部月份捕获组改为非捕获组 `(?:Jan|Feb|...)`，避免嵌套正则捕获序号错位。
- 保持现有 `mapLegacyDateToTarget`、`parseDateClause` 数据结构不变。
- 新增 Vitest 单元测试，直接调用已导出的 `mapCrewBidPreference`，断言：
  - 返回 `importable`。
  - 不产生 `invalid_mapped_date`。
  - `paramA` 中包含 `2026-03-07`、`2026-03-09`、`2026-03-16` 和 `2026-03-31`。

## 验收标准

1. 单测覆盖并通过。
2. `Prefer Off Mar 7, 2026 - Mar 9, 2026` 不再产生 `Unsupported date format: Mar`。
3. 不改变 unmatched pairing 处理逻辑。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 单文件 parser bug + focused test，拆分成本高于收益。
- Suggested split: 不拆。
- Write boundaries: `live-server/src/services/crew-bid-import/crew-bid-property-mapper.ts`，新增对应测试文件。
- Conflict risk: 低。
- Execution gate: 用户已确认先修复该 bug。
