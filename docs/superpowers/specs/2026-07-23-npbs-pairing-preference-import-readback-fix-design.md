# NPBS Pairing Preference 导入回读与 Pairing Search 修复设计

## 1. 背景与问题

2026-07-23 使用正式批量接口为 crew `264` 导入 July 2026 NPBS bid 后，Portal 可以读取并展示 5 条条件，但调用：

```text
POST /api/pairing-search/current-rules/counts
```

返回：

```json
{
  "code": 400,
  "data": null,
  "message": "Pairing Preference must use Pairing IDs selected from the list."
}
```

本次问题不是 Pairing Search SQL 或 pairing 匹配失败，而是批量导入仍写入了已废弃的 occurrence 子表数据，导致保存格式与回读格式不一致。

## 2. 已确认的根因

当前 Pairing Preference 标准语义为：

```json
{
  "type": "pairing-preference",
  "pairingIds": ["98991", "99126"],
  "pairingLabels": ["C4107"]
}
```

即只保存用户从列表中选择的稳定 pairing IDs，不再保留 run date、fulfilment 或 occurrence 级语义。

当前 `live-server` 导入器已经把上述标准 JSON 写入 `pbs_bid_group.param_a`，但随后仍调用旧的 occurrence 写入逻辑，把解析出的每个 pairing/date 组合写入 `f8_pbs.pbs_bid_pairing_occurrence`。

`pbs-server` 的 Pairing draft read model 在发现 occurrence 子表记录后，会优先把 property `102` 重建为：

```json
{
  "type": "pairing-occurrence-list",
  "occurrences": []
}
```

因此产生以下错误链路：

```text
批量导入
  -> pbs_bid_group.param_a 写入正确 pairing-preference
  -> 同时写入旧 pbs_bid_pairing_occurrence
  -> Portal 回读时旧 occurrence 覆盖正确 JSON
  -> Pairing Search 只接受当前 pairing-preference
  -> counts 返回 400
```

已对当前数据库执行只读核查：有效 occurrence 数据共 `18` 行、仅属于 `1` 个 bid，即 crew `264` 的 bidId `4300`。该 bid 下两条 property `102` 的 `param_a` 均已包含非空、有效的稳定 pairing IDs，因此删除旧 occurrence 行后不会丢失 Pairing Preference 内容。

## 3. 目标

- 正式 NPBS 批量导入只持久化当前标准 `pairing-preference + pairingIds`。
- 导入后的 Pairing draft 回读保持 `pairing-preference`，不再被重建为旧 `pairing-occurrence-list`。
- crew `264` 已导入的 5 条条件全部保留。
- `/api/pairing-search/current-rules/counts` 对 crew `264` 返回 200。
- 防止后续批量导入再次产生旧 occurrence 数据。

## 4. 非目标

- 不放宽 Pairing Search，使其兼容旧 `pairing-occurrence-list`。
- 不恢复 Pairing Preference 的 run-date 语义。
- 不修改 Portal 编辑器、摘要或 tier 行为。
- 不修改数据库 schema，也不新增 migration。
- 不重新导入其他 crew，不执行全量 July 导入。

## 5. 方案比较

### 方案 A：修正导入持久化并清理本次旧数据（采用）

- 导入器继续使用 pairing occurrence resolver，把 NPBS pairing number 解析成目标 period、base、rank 范围内的稳定 pairing IDs。
- 写 bid group 时只保存解析后的 `pairing-preference` JSON。
- 不再向 `pbs_bid_pairing_occurrence` 插入 property `102` 的旧 occurrence 行。
- 删除 crew `264` / bidId `4300` 当前 18 条旧 occurrence 行。

优点：符合当前标准答案语义，改动最小，不改变 Pairing Search 行为。

### 方案 B：Pairing Search 兼容 occurrence list（不采用）

该方案可以消除 400，但会重新引入已明确取消的日期级 Pairing Preference 语义，并掩盖导入器写入旧数据的问题。

### 方案 C：Portal 回读时临时转换（不采用）

该方案只修饰读取结果，数据库仍保留冲突的双份事实来源，后续保存、导出、回滚和搜索仍可能产生分歧。

## 6. 详细设计

### 6.1 导入写入规则

保留现有 pairing resolver：

1. 从 NPBS 文本解析 Pairing Number。
2. 按目标 period、crew base 和 rank 查找真实 pairing。
3. 严格模式下，任一 pairing 无法匹配则整条 preference 失败。
4. 把匹配结果的稳定 `pairingId` 去重后写入 `pairing-preference.pairingIds`。
5. `pairingLabels` 仅用于用户可读摘要，不作为搜索主键。

删除正式写入阶段对 `pbs_bid_pairing_occurrence` 的新增写入。导入前快照和 rollback 对历史 occurrence 数据的读取/恢复能力暂时保留，以确保旧 run 的回滚仍可恢复其原始快照；本次不做无关的表或 rollback 重构。

### 6.2 crew 264 数据修复

实施顺序固定为：先完成并验证导入器停止旧 occurrence 写入，再清理 crew `264` 的 18 条旧数据，最后执行真实接口与 Playwright 回归。不得先清理后继续使用尚未修复的导入器，避免旧数据被再次写回。

数据修复必须先执行以下 pre-check：

- bidId 为 `4300`，crew 为 `264`，period 为 `Jul 2026`；
- property `102` 恰好为两组；
- 两组 `param_a.type` 均为 `pairing-preference`；
- 两组 `pairingIds` 均非空且全部为稳定数字 ID；
- `pbs_bid_pairing_occurrence` 有且仅有当前确认的 18 条有效行，并全部属于 bidId `4300`。

pre-check 全部通过后，在事务中删除 bidId `4300` 的 18 条 occurrence 行。不得删除 `pbs_bid`、`pbs_bid_tier`、`pbs_bid_group` 或 crew `264` 的其他条件。

删除后执行 post-check：

- occurrence 有效行数为 0；
- bidId `4300` 仍有 5 个 bid groups；
- Days Off 回读 1 条；
- Pairing 回读 4 条；
- 两条 property `102` 回读类型均为 `pairing-preference`。

### 6.3 错误处理

- 若 pre-check 数量或 bid 身份不一致，停止数据修复，不做模糊删除。
- 若 canonical `pairingIds` 为空或包含非法 ID，停止并报告，不用 occurrence 行反向猜测或修补。
- 导入事务继续保持按 crew savepoint、run receipt、备份和 rollback 能力。
- unmatched pairing 继续作为 blocker，不允许保存匹配子集。

## 7. 测试与验证

### 7.1 后端回归测试

更新 `live-server` focused tests，覆盖：

- property `102` resolver 仍产生稳定 pairing IDs；
- bid group 的标准 JSON 写入不变；
- 正式导入不再执行 occurrence INSERT；
- imported snapshot/readback 不依赖 occurrence 子表；
- 其他 property 和 rollback 快照行为不受影响。

更新 `pbs-server` 或跨模块 focused test，覆盖：

- 导入形状的 `pairing-preference` 可被 Pairing Search counts 接受；
- 不把 counts 放宽为接受 `pairing-occurrence-list`；已有拒绝旧格式测试继续保留。

### 7.2 真实接口验证

以 crew `264` 登录 Portal 使用的 pbs-server：

1. `GET /api/days-off-bids/current`：1 条。
2. `GET /api/pairing-bids/current`：4 条，其中两条 property `102` 为 `pairing-preference`。
3. `POST /api/pairing-search/current-rules/counts`：HTTP 200。
4. Portal 点击 `REFRESH` 和 `SEARCH PAIRINGS`：不再出现 400，T1-T5 仍可见。

UI 核验必须通过真实 Playwright 操作完成，并保存运行结果；不得只用数据库查询代替。

### 7.3 验证命令范围

- `live-server` crew-bid-import focused Vitest。
- `pbs-server` pairing-search focused Vitest。
- NPBS parser/mapper Node tests。
- focused PBS Portal Playwright：crew `264` 导入后回读和 Pairing Search。
- `live-server npm run build`、`pbs-server npm run build`。
- `git diff --check`。
- GitNexus `detect_changes --scope compare --base-ref main`。

## 8. 验收标准

- crew `264` 的 5 条条件仍全部存在，tier、action 和值不变。
- crew `264` 的两条 Pairing Preference 均回读为 `pairing-preference`。
- 当前数据库 `pbs_bid_pairing_occurrence` 有效行从 18 降为 0。
- counts 接口返回 HTTP 200，不再返回“must use Pairing IDs”错误。
- 新导入的 Pairing Preference 不再产生 occurrence 子表记录。
- focused tests、build 和 Playwright 全部 PASS。
- 不为 Pairing Search 新增 `pairing-occurrence-list` 兼容分支；现有旧格式读取及 rollback 恢复能力保持不变。

## 9. 风险与回滚

- 风险：停止写 occurrence 后，若 canonical JSON 未正确填充 pairing IDs，会导致条件内容为空。通过写入测试、pre-check 和真实回读防止。
- 风险：清理范围错误可能影响其他 crew。当前只读核查已证明有效 occurrence 行仅属于 bidId `4300`；执行时仍需再次严格核对。
- 代码回滚：恢复导入器旧写入逻辑，但不推荐作为长期方案。
- 数据回滚：执行删除前导出 bidId `4300` 的 18 条 occurrence 行到本地临时 receipt；仅在验证失败时按原主键和审计字段恢复，不提交包含 crew bid 数据的文件。

## 10. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 导入写入、数据清理和 counts 验证具有严格顺序依赖，核心修改集中在同一导入服务。
- Suggested split: 单 agent 完成代码、数据修复和验证。
- Write boundaries: `live-server` 导入服务及 focused tests；必要的 `pbs-server` 回归测试；本 spec。
- Conflict risk: 低。
- Execution gate: 用户审阅并明确批准本 spec 后才允许修改产品代码或业务数据。
