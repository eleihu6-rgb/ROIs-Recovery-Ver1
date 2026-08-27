# PBS Pairing 候选 Pairing Rank 过滤修复设计

## 背景

在 Bid 页面左侧日历新增 Pairing Preference 时，日历候选弹窗会显示当前 crew 不适用的 pairing。例如当前 crew 是 `IFD`，左侧仍可选择只包含 `CA/FO` 编制的 `T4115`；保存后进入 Search Pairings，右侧搜索结果为 0。

这不是 SIT 单独数据问题，本地也可复现。原因是不同入口使用的过滤规则不一致：

- Search Pairings 已按当前 actor 的 `base` 和 `rank` 过滤。
- 日历候选 pairing occurrence 只按 `base/date` 过滤，没有按 `pairing_composition.acting_rank` 过滤。
- Pairing Number 自动补全也存在同类风险：只按 `base` 搜索候选。

## 目标

让所有会给用户提供 Pairing Preference 候选的入口，与 Search Pairings 使用同一套 actor 适配规则。

## 范围

本次只改 PBS Server 的 Pairing Search 候选查询逻辑：

- `pairing-occurrences/by-date`
- `pairing-occurrences`
- `pairing-ids` 自动补全

不改前端 UI，不改 bid payload，不做 migration，不删除既有用户数据。

## 设计

1. `createPbsPairingSearchService` 中 Pairing ID / occurrence 相关入口改为解析完整 actor context：`base + rank`。
2. SQL 在已有 `p.base = actorBase` 基础上增加可选 rank 过滤：
   - 当前 actor 有 rank 时，要求存在同一 pairing 的 `pairing_composition` 行：
     - `pc.pairing_id = p.id`
     - `pc.acting_rank = actorRank`
     - `pc.is_deleted = 0`
   - actor rank 为空时保持旧逻辑，只按 base 过滤。
3. `loadPairingOccurrences`、`searchPairingOccurrencesByDate`、`searchPairingIdOptions` 接受 `actorRank` 参数。
4. 搜索条件、日期范围、timezone、display label 逻辑保持不变。

## 验收

- IFD crew 不应在左侧日历 Pairing Bid 弹窗中看到只适配 CA/FO 的 pairing。
- Pairing Number 搜索不应返回当前 actor rank 不适配的 pairing。
- Search Pairings、候选弹窗、编辑回显使用同一套 base/rank 语义。
- 无 rank 的 actor 仍保留旧兼容行为。

## 测试计划

- 更新 `pbs-server/src/services/pairing-search/pairing-search-service.test.ts`：
  - Pairing Number 搜索 SQL 带 rank exists 过滤。
  - Pairing occurrence 查询 SQL 带 rank exists 过滤。
  - Pairing occurrence by date 查询 SQL 带 rank exists 过滤。
  - actor rank 为空时不生成 rank exists 条件。
- 运行 focused node tests。
- 运行 `pbs-server npm run build`。
- 对远端 PostgreSQL 做最小 `EXPLAIN` / 只读验证，确认动态 SQL 可解析。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在同一组 Pairing Search service/query 文件，拆分会增加冲突风险。
- Suggested split: 不拆。
- Write boundaries: `pbs-server/src/services/pairing-search/*` 和对应测试。
- Conflict risk: Medium。当前工作树已有大量其它未提交 UI/Tier 改动，本次必须只触碰 pairing-search 后端和本 spec。
- Execution gate: 用户已确认按该方向修复。
