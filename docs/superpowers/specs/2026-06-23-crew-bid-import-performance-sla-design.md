# Crew Bid Import 性能 SLA 优化设计

> 日期：2026-06-23  
> 状态：Draft，等待用户 review  
> 范围：Gantt Admin Tools 调用的 `live-server` Crew Bid Import dry run / import 性能、阶段耗时报告、resolver 与写库路径优化

## 1. 背景

当前 Crew Bid Import 已经完成第一轮 Playwright parity 改造：

- 入口仍在 Gantt Admin Tools。
- 后端实际实现位于 `live-server/src/services/crew-bid-import/crew-bid-import-service.ts`。
- Import 已经异步启动，前端通过 run detail 轮询后台状态。
- Current Bid 优先、Default Bid 兜底、真实 preference 映射到 `T1-T7`、超过 7 条记录 warning。
- Pairing Number 与 Airport 会按 `period + base + rank` 做当前可见性过滤，不可用值进入导入报告。

用户实测 `CLASS-BidsReport_March2026.txt` 只导入 `19,73,96` 三个 crew 时，后台完成耗时约 3 分钟。这个耗时不可接受，因为三人导入不应该接近全量导入成本；即使全量导入，目标也应控制在 2-3 分钟内。

## 2. 问题判断

截图里的 `FAILED PREFS 1` 不是人员导入失败。当前 run 显示 `Imported Crew = 3`、`Failed Crew = 0`，说明三个人都完成导入；失败的一条 preference 是员工 `73` 的 `Pairing TB5355` 在 `YYZ FO / Mar 2026` 当前 pairing 可见池中不可用。

真正严重的问题是性能。根据当前代码路径，慢点主要可能来自：

1. **重复解析整份 TXT**
   - `dryRun` 会解析一次。
   - `startImport` 创建 run 时会解析一次。
   - 后台 `runImportForExistingRun` 还会再次解析一次。
   - 即使只选 3 个 crew，也会多次处理完整 source text。
2. **resolver 查询仍可能扫大表**
   - Pairing Number 和 Airport resolver 按 `period + base + rank` 查询 live pairing。
   - Airport 查询中仍存在对时间列做函数包装的写法，例如 `(p.sch_str_dt_utc at time zone 'UTC')::date between ...`，不利于索引。
   - 多个 base/rank scope 会重复访问 live pairing / pairing segment。
3. **写库路径串行且 round trip 多**
   - 每个 crew 依次处理。
   - 每个 crew 会读取 previous snapshot、删除旧 bid、逐 tier / group / occurrence 插入、读取 imported snapshot、写 backup。
   - `readBidSnapshot` 本身会并发读取多张表，但每个 crew 都要执行一组查询。
4. **run items / problems 后置写入**
   - 导入完成前需要写入 run detail 数据。
   - 如果问题行、item 行较多，逐条写入会放大耗时。
5. **缺少分段耗时**
   - 当前用户只能看到 run 用了多久，不知道慢在 parse、resolver、写库还是 snapshot。
   - 没有稳定的性能基线，后续优化容易变成猜测。

## 3. 性能目标

本次优化的验收 SLA：

| 场景 | 目标 |
| --- | --- |
| 全量 dry run `CLASS-BidsReport_March2026.txt` | `<= 60s` |
| 定向 import 3 个 crew，例如 `19,73,96` | `<= 30s` |
| 全量正式 import `CLASS-BidsReport_March2026.txt` | `<= 3min` |

补充要求：

- warning 不应阻断可导入内容。
- Pairing / airport 不可用仍进入报告，不作为 crew 整体失败。
- 性能优化不能破坏 rollback。
- 性能报告必须能解释一次 run 慢在哪里。

## 4. 非目标

- 不改变 Crew Bid Import 的业务语义。
- 不新增 bid property。
- 不改变 Current 优先、Default 兜底、T1-T7 容量规则。
- 不改变 Pairing Number / Airport 当前可见性过滤口径。
- 不强行把缺失的 pairing / airport seed 到当前 period。
- 不重写整个导入模块为全新 bulk loader。
- 不迁移接口位置，仍使用现有 Gantt Admin Tools 与 `live-server` route。

## 5. 推荐方案

采用“先可观测，再优化高成本路径”的分阶段方案。

### 5.1 阶段 1：run 级性能可观测性

为每个 dry run / import run 记录阶段耗时，至少包括：

- `parseSourceMs`
- `selectBlocksMs`
- `prepareItemsMs`
- `loadCrewContextMs`
- `resolvePairingsMs`
- `resolveAirportsMs`
- `loadPropertyIdentitiesMs`
- `writeBidsMs`
- `writeSnapshotsMs`
- `writeRunDetailMs`
- `totalMs`

实现要求：

- 优先在 service 内部用轻量计时器收集，不引入新依赖。
- 对 dry run 和 import 使用同一套 timing 结构。
- run detail response 增加可选 `performance` 字段。
- 数据库 run 表新增 `performance_json jsonb`，完成态 run 必须持久化 performance，确保刷新页面后 `GET /api/admin/crew-bid-imports/:runId` 仍能展示耗时。
- 前端可以先以简洁文本或表格展示阶段耗时；如果不改 UI，至少 run detail API 要返回。

价值：

- 用户能看到一次 run 到底慢在哪里。
- 后续优化能用同一份报告验证收益。
- 避免只靠总耗时猜测瓶颈。

### 5.2 阶段 2：减少重复解析与重复 prepare

目标是让定向导入真正只按 selected crew 付成本。

设计：

1. 把 `parseCrewBidTxt`、`selectCrewBlocks`、`buildInitialSummary` 封装成一次 request context。
2. `startImport` 创建 run 时可以复用该 context，不再在后台重复做完全相同的解析。
3. 如果架构上无法安全跨异步任务传递完整 parsed object，则至少避免 dry run 与 import 间的强依赖；正式 import 内部只解析一次，然后将 parsed / selected context 传入后台执行函数。
4. 只对 selected blocks 执行后续 `prepareImportItems`，不能让后续 resolver 基于全量 block 构建 scope。

注意：

- 不要求 dry run 结果跨请求缓存，因为上传文件可能变化。
- 可以用 `sourceSha256 + period + scope` 作为未来缓存键，但本阶段不强制持久化缓存。
- 如果要持久化缓存，必须限制 TTL 和大小，避免大文本长期占内存。

### 5.3 阶段 3：resolver 查询优化

Pairing 和 Airport resolver 继续保持当前可见性规则，但要减少查询成本。

Pairing Number resolver：

- 保持按 `(periodCode, base, rank)` 分组。
- 每个 scope 只查一次。
- 只传入该 scope 实际需要的 pairing number list。
- 时间过滤改为索引友好写法：
  - 计算 UTC start/end timestamp。
  - 优先使用 `p.sch_str_dt_utc >= startTs and p.sch_str_dt_utc < endTs`。
  - 如果业务必须使用 segment earliest start，则把 segment earliest start 作为 CTE 结果后再过滤，但需要评估索引影响。
- rank 过滤继续使用 `pairing_composition.acting_rank`。

Airport resolver：

- 保持按 `(periodCode, base, rank)` 分组。
- 只有 selected items 中实际存在 airport property 时才查 airport options。
- landing / layover airport 可以合并一次查询返回 role + airport。
- 时间过滤同样改为索引友好写法，避免对列做函数。
- 本次 run 内缓存 scope 查询结果，后续 item 只读缓存。

验收指标：

- 3 个 crew 的 resolver query 次数应接近 scope 数，而不是 preference 数。
- 全量 import 的 resolver 耗时在 performance report 中可见，并相对优化前明显下降。

### 5.4 阶段 4：写库路径减 round trip

目标是在不破坏 rollback 的前提下减少每个 crew 的串行 SQL。

优先级从低风险到高收益：

1. **批量读取 existing bids**
   - 对 selected crew 一次性读取 `Current` bid ids。
   - 将结果传给每个 item，避免 `insertBidForItem` 内部逐 crew 查询。
2. **批量读取 previous snapshots 的基础数据**
   - 可以先保留现有 `readBidSnapshot`，但把耗时单独记入 `writeSnapshotsMs`。
   - 如果 snapshot 成为瓶颈，再按表批量读取所有 previous bid rows 并按 bid_id 分组。
3. **批量删除旧 bid 关联表**
   - 当前 `deleteBids` 已能接收 bidIds，但每个 crew 单独调用。
   - 可先在每个 crew 内保持 savepoint；后续再评估跨 crew 批量 delete。
4. **批量插入 group / occurrence**
   - `pbs_bid_group` 需要返回 group id；可使用 multi-row `insert ... returning`。
   - occurrence 可按 group 映射后批量 insert。
5. **批量插入 run items / problems**
   - run detail 数据不影响业务 bid，可优先批量化。

rollback 要求：

- `previous_snapshot_json` 必须可靠保留。
- `previous_bid_id` / `imported_bid_id` 必须可靠写入 backup。
- `imported_snapshot_json` 默认保留现有写入行为；只有在实现阶段确认 rollback 完全不依赖它，并补充对应测试后，才允许改为延后写入。
- 任一 crew 写库失败仍只能影响该 crew，不能导致整批回滚，除非发生系统级错误。

### 5.5 阶段 5：前端反馈优化

前端不需要复杂改版，但要避免用户看到长时间无解释的等待。

建议：

- run detail 展示 `Performance` 小节。
- active run 显示 `running` 时，如果 response 有 performance progress，可显示当前已完成阶段。
- 完成后展示总耗时和最慢阶段。

如果第一阶段只做后端返回，不做 UI，也必须保证 API response 可以被前端后续展示。

## 6. API / 类型设计

在共享 contract 中扩展可选字段，保持向后兼容：

```ts
export type PbsCrewBidImportPerformancePhase =
  | "parseSource"
  | "selectBlocks"
  | "prepareItems"
  | "loadCrewContext"
  | "resolvePairings"
  | "resolveAirports"
  | "loadPropertyIdentities"
  | "writeBids"
  | "writeSnapshots"
  | "writeRunDetail"
  | "total";

export type PbsCrewBidImportPerformanceTiming = {
  phase: PbsCrewBidImportPerformancePhase;
  durationMs: number;
  detail?: Record<string, number | string | boolean>;
};

export type PbsCrewBidImportPerformance = {
  totalMs: number;
  timings: PbsCrewBidImportPerformanceTiming[];
  selectedCrew: number;
  selectedBlocks: number;
  resolverScopeCount?: number;
  pairingResolverQueryCount?: number;
  airportResolverQueryCount?: number;
  writtenBidCount?: number;
};
```

`PbsCrewBidImportResponse` 和 `PbsCrewBidImportRunDetailResponse` 增加：

```ts
performance?: PbsCrewBidImportPerformance;
```

数据库持久化策略：

- 新增 migration，为 `pbs_crew_bid_import_run` 增加 `performance_json jsonb`。
- `insertRunRecord` 创建 queued run 时可以为空。
- `updateRunRecordSummary` 完成 run 时写入最终 performance。
- `updateRunRecordFailed` 如果已有部分 timing，也应尽量写入 performance，便于分析失败前卡在哪一步。
- `getRun` 从 `performance_json` 映射为 response 的 `performance` 字段。
- `listRuns` 不必返回 performance，避免 run list 过大。

## 7. 数据流设计

### 7.1 Dry Run

```text
multipart request
  -> parse source once
  -> select selected blocks
  -> prepare selected items
  -> resolve pairing / airport by scope
  -> build response with problems + performance
  -> no business write
```

### 7.2 Import

```text
multipart request
  -> validate confirm / overwrite options
  -> parse source once for run creation context
  -> insert queued run
  -> schedule background task with parsed/selected context or compact execution context
  -> background marks running
  -> prepare selected items
  -> resolve pairing / airport by scope
  -> write bids per crew with savepoint
  -> write backups
  -> write run items/problems
  -> update run summary/status/performance
```

关键约束：

- 后台任务不能重新从 request source text 开始做完整重复解析，除非跨异步传递 context 存在安全问题。
- 即使保留 source text 用于审计，也不应因此重复构建 document / selected blocks。

## 8. 错误处理

- 文件格式错误：dry run 直接失败；import run 创建前失败则不创建 run。
- 后台系统错误：run 标记 `failed`，写入 `import_run_failed`。
- 单个 crew 写库失败：该 crew item 标记 `failed`，其他 crew 继续。
- pairing / airport 不可用：继续作为 warning problem，不影响其他可导入内容。
- performance 记录失败：不能影响业务导入，最多写日志。
- 前端无法识别 `performance` 字段：不影响旧 UI。

## 9. 测试计划

### 9.1 单元测试

更新 `live-server/src/services/crew-bid-import/__tests__/crew-bid-import-service.test.ts`：

- dry run response 包含 `performance.totalMs` 和基础 timings。
- import run detail 可以返回 performance。
- 定向 crew 只对 selected blocks prepare，不会把未选 crew 计入 resolver input。
- airport resolver 在没有 airport property 时不查询。
- pairing resolver 按 scope 去重查询。
- run item / problem 批量插入后统计不变。

### 9.2 集成 / 服务测试

- 用包含 `19,73,96` 的 fixture 验证 summary、problems、items 与现有行为一致。
- 验证 `unmatched_pairing_number` 和 `preference_ignored_tier_capacity` 仍按 warning 报告。
- 验证 rollback 可以恢复 previous bid。
- 验证单个 crew 写库失败不会影响其他 crew。

### 9.3 性能验证

使用同一个 `CLASS-BidsReport_March2026.txt`：

1. dry run 全量，记录 total 和各阶段耗时。
2. import `19,73,96`，记录 total 和各阶段耗时。
3. import 全量，记录 total 和各阶段耗时。

验收：

- 全量 dry run `<= 60s`。
- 3 个 crew import `<= 30s`。
- 全量 import `<= 3min`。
- 如果测试环境硬件或远程 DB 抖动导致超标，必须能从 performance report 说明具体瓶颈阶段。

### 9.4 建议命令

```bash
cd live-server
npm test -- --run src/services/crew-bid-import/__tests__/crew-bid-property-mapper.test.ts src/services/crew-bid-import/__tests__/crew-bid-import-service.test.ts
npx vitest run src/routes/admin/pbs-crew-bid-imports.test.ts
```

如触碰 Gantt 展示：

```bash
cd gantt
npx tsc --noEmit
```

已知注意事项：

- 之前 `live-server npm run build` 曾被不相关测试类型错误阻断；实现时仍需运行并说明结果。

## 10. 验收标准

1. `POST /api/admin/crew-bid-imports` 仍快速返回 queued run。
2. run detail 能返回本次 run 的 `performance`。
3. performance 至少能区分 parse、prepare、resolver、write、run detail 写入。
4. 导入结果语义不变，warning / failed prefs 统计不因性能优化漂移。
5. `19,73,96` 定向 import 目标 `<= 30s`。
6. 全量 dry run 目标 `<= 60s`。
7. 全量正式 import 目标 `<= 3min`。
8. pairing / airport resolver 查询按 scope 去重。
9. 无 airport 条件时不执行 airport options 查询。
10. rollback 仍可删除本次导入并恢复 previous bid。

## 11. 实施顺序

推荐按以下顺序实施，避免一次性大改导致难以定位问题：

1. 加 performance timing 类型、内部计时器、response 字段。
2. 新增 `performance_json jsonb` migration，并让 run detail 可读取历史完成 run 的 performance。
3. 给 dry run / import 添加阶段耗时，不改业务逻辑。
4. 修正 import 内部重复解析，保证一次 import request 内只解析一次。
5. 优化 resolver 查询与 scope cache。
6. 批量化低风险写入：run items / problems、occurrence insert。
7. 根据 performance report 决定是否继续批量化 snapshot / delete / group insert。
8. 如需要，再补 Gantt UI 的 Performance 小节。

## 12. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 性能瓶颈集中在 `crew-bid-import-service.ts` 的 request context、resolver、事务写库、rollback backup 和 run detail 写入。多 agent 并行改同一条数据流容易产生事务边界和统计口径不一致。
- Suggested split: 不建议拆实现。可以单独做只读 benchmark 分析，但代码写入由一个 agent 串行完成。
- Write boundaries: `live-server/src/services/crew-bid-import/*`、`packages/contracts/pbs-crew-bid-imports.*`、`sql/migration/*crew-bid-import-performance*.sql`、必要的 `live-server` tests；只有展示 performance 时才触碰 `gantt/src/components/pbs/pbs-admin-tools.tsx` 和 `gantt/src/services/pbs-admin-tools-api.ts`。
- Conflict risk: Medium-high。当前已有导入 parity 逻辑、rollback 和 run 状态机，优化必须保持行为不变。
- Execution gate: 用户 review 本 spec 并明确批准后，才能进入实现。
