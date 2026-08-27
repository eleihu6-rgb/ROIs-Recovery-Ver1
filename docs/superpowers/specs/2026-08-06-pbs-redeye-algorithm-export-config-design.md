# PBS Redeye 遗留导出配置对齐设计

## 目标

修复 `pbs-server` 遗留 `PAIRING_SCORE.csv` 导出副本未传入 Redeye 字典配置的问题，恢复 `pbs-server` 全量测试，并保持该副本与当前统一条件构造器的参数契约一致。

本次不是生产算法包故障修复：真实算法包已经迁移到 `live-server`，其 Redeye 导出当前已正确读取字典配置。

## 现状与根因

- Redeye 时间范围由 `dictionary` 的 `PBS_PAIRING_REDEYE_CONFIG / START_TIME / END_TIME` 管理。
- Portal Pairing Search 已通过 `loadRedeyeConfig` 读取该配置并传给统一条件构造器。
- `pbs-server` 的算法导出路由已固定返回 `410`，真实导出入口位于 `live-server`。
- 活跃 `live-server` 导出仅在存在 Property `117` 时读取 Redeye 字典，并已将配置传入条件构造器。
- `pbs-server` 仍保留一套没有生产调用者的遗留导出实现及测试。该副本遗漏 `redeye` 上下文，条件构造器抛出 `503`，导致现有回归测试失败。
- 因此这是遗留副本与共享契约发生漂移，不是当前生产算法 CSV 的错误。

## 方案比较

1. **推荐：最小修复遗留副本**。让 `pbs-server` 遗留导出仅在包含 Property `117` 时复用 `loadRedeyeConfig`，恢复测试并保持契约一致；不改变生产路由和活跃导出。
2. 删除 `pbs-server/src/services/algorithm-export` 整套遗留实现与测试。架构更干净，但涉及约 20 个文件，超出本次单一失败修复范围，后续可独立清理。
3. 只删除失败测试或恢复硬编码时间。不采用：前者掩盖契约漂移，后者违反参数化规范。

## 实施设计

- `pbs-server` 的 `loadPairingScoreCsv` 检测本次 Bid 是否包含 Redeye Property `117`。
- 存在时，基于现有 `pgPool` 创建 Drizzle DB，并通过现有 `loadRedeyeConfig` 读取一次配置；不扩大 `options.db` 的测试契约。
- 扩展 `loadMatchingPairings` 的上下文参数，将 `redeye` 传给 `buildPreviewCondition`。
- 继续强制以 Award 正向条件查询，再根据保存的 `action_id` 将命中写入 Award 或 Avoid counter；禁止把实际 Avoid action 传入条件构造器计算补集。
- 不修改 `PAIRING_SCORE.csv` 文件名、列、counter 规则或 Solver 接口。
- 不修改 Redeye 字典数据和算法项目。
- 字典配置缺失或非法时，保留现有明确 skipped 诊断；不得回退为硬编码时间，也不得静默伪造匹配结果。
- `live-server` 活跃导出代码不改；同步修正其 Redeye 测试桩与参数断言，使测试按当前字典参数化行为验证真实导出链路。

## 验收标准

1. `pbs-server` 遗留 Redeye Award/Avoid Bid 使用字典配置生成匹配 SQL，并写入正确 Tier counter。
2. Avoid 仍只把 Redeye 正向命中写入 Avoid counter，不计算补集。
3. 没有 Redeye Bid 时不额外查询 Redeye 配置。
4. 使用非默认、跨午夜字典值（例如 `23:00–05:00`）证明配置来源；断言字典只读取一次，时间与日期按正确参数顺序进入 SQL。
5. 配置缺失时产生精确的 `Redeye configuration is unavailable...` skipped 原因，且不执行 Pairing 匹配查询。
6. 没有 Redeye Bid 时字典读取次数为零。
7. 更新原有回归测试并新增配置缺失测试。
8. 运行 `pbs-server` Pairing Score 聚焦测试、全量测试与构建；原失败用例必须通过。
9. 更新并运行 `live-server` Redeye 导出回归测试：测试桩必须区分字典查询与 Pairing 查询，使用非默认跨午夜配置，并断言参数化 SQL 与 Avoid counter；测试必须通过。

## 影响范围与风险

- 预计修改 `pbs-server` 的遗留 Pairing Score 导出服务及其测试，以及 `live-server` 的 Redeye 导出测试。
- `live-server` 活跃业务代码不修改。
- 不涉及数据库 migration、Portal UI、Gantt 和 `pbs-engine`。
- 本次保留 `pbs-server` 的遗留导出目录；是否整体删除需要单独评估和批准。
- 实施前对 `loadPairingScoreCsv`、`loadMatchingPairings` 执行 GitNexus upstream impact；若为 HIGH/CRITICAL，先向用户报告。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 修复集中在同一遗留导出文件与同一测试文件，逻辑紧密，拆分会增加冲突和协调成本。
- Suggested split: 单 Agent 完成实现、两侧回归测试和验证。
- Write boundaries: `pbs-server/src/services/algorithm-export/pairing-score-export.ts`、对应测试，以及 `live-server/src/services/algorithm-export/pairing-score-export.test.ts` 中的 Redeye 用例。
- Conflict risk: 当前工作树已有 Period 未提交改动，实施时只触碰上述 Redeye 文件，避免混入其他变更。
- Execution gate: 用户审阅并明确批准本 spec 后开始实现。
