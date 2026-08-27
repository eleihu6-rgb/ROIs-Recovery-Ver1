# F8 数据导入流水线设计

**日期:** 2026-05-21  
**模块:** connector-server + live-server  
**状态:** 待实施

---

## 1. 架构总览

### 数据流

```
F8 API
  │
  ▼
connector-server (port 3004)
  ├── 按 10 天 chunk 拉取 API 数据
  ├── 原始 JSON 写入本地磁盘（调试备用）
  ├── 预加载 crew set（只读 DB 连接）
  ├── 过滤无效 crew_id → rejection 文件
  ├── Transform → ImportRecord 类型
  └── BullMQ FlowProducer → 有序推送队列
        │
        ▼
live-server (port 3000)
  ├── 消费 inbound 队列
  ├── FK 解析（interfaceFltId / pairingInterfaceId → DB id）
  ├── Savepoint 隔离，逐条写入
  └── 返回 ImportJobResult（imported / filtered / errors）
        │
        ▼
PostgreSQL (rois.f8 schema)
```

### 组件职责

| 组件 | 权限 | 职责 |
|---|---|---|
| connector-server | READ-ONLY DB | 拉取 API、存 JSON、过滤、转换、推队列 |
| live-server | READ + WRITE DB | FK 解析、事务写入、缓存失效 |
| Bull Board | — | 队列/Job 监控 UI，挂载在 connector-server |
| dictionary 表 | — | 存储用户可编辑的 cron 配置 |

### BullMQ 依赖链

```
crew.import  ──────────────────────────────────┐
                                               ▼
flight.import ──→ pairing.import ──→ roster.import
```

- `crew.import` 与 `flight.import` 并行，独立推送
- `pairing.import` 等待 `flight.import` 完成（FlowProducer child）
- `roster.import` 等待 `pairing.import` 完成（FlowProducer child）

---

## 2. connector-server 详细设计

### 2.1 新增目录结构

```
connector-server/src/
├── services/sync/f8/
│   ├── f8-sync-orchestrator.ts   # 拉取所有实体，构建 FlowProducer
│   ├── f8-flight-sync.ts
│   ├── f8-crew-sync.ts
│   ├── f8-pairing-sync.ts
│   └── f8-roster-sync.ts         # 含 flight + ground 两种路径
├── transform/f8/db/
│   ├── transform-flight.ts
│   ├── transform-crew.ts
│   ├── transform-pairing.ts
│   ├── transform-roster-flight.ts
│   └── transform-roster-ground.ts
└── utils/
    ├── chunk-date.ts             # chunk 切分 + HTTP retry 退避
    ├── json-store.ts             # 原始 JSON 原子写盘
    └── rejection-store.ts        # rejection 文件写盘
```

### 2.2 Chunk Retry 策略

默认 chunk 大小 10 天，存储在 `connector_config.chunk_days`（各实体可独立配置）。

```
fetchWithChunkRetry(fn, start, end, chunkDays):
  for (chunkStart, chunkEnd) of chunks(start, end, chunkDays):
    try:
      return fn(chunkStart, chunkEnd)
    catch HTTP 5xx / timeout:
      if chunkDays == 10 → retry with chunkDays=5
      if chunkDays == 5  → retry with chunkDays=3
      if chunkDays == 3  → throw（不可恢复，记录日志）
    catch HTTP 401/403 → throw immediately（auth 问题，不重试）
    catch HTTP 429     → wait retry-after，retry same chunk
```

RosterGround 的 `Unknown` 类型本期跳过不同步；其他类型可在 `connector_config` 中配置独立的 `chunk_days`。

### 2.3 JSON Store

每个 chunk 拉取完成后立即写盘（fetch 阶段，早于 DB 写入），支持后续 replay。

```
connector-server/data/
  raw/
    f8/
      flight/     2026-05-01_2026-05-10.json
      crew/       2026-05-01_2026-05-30.json
      pairing/    2026-05-01_2026-05-10.json
      roster_flight/ 2026-05-01_2026-05-10.json
      roster_ground/ 2026-05-01_2026-05-10_SBY.json   # suffix = assignment type
  rejected/
    f8/
      roster_flight/ 2026-05-21_2026-05-21_143022_rejected.json
```

写入方式：先写 `{file}.tmp`，完成后 `rename` → 原子操作，不产生损坏文件。

### 2.4 Rejection 文件格式

```json
{
  "filiale": "F8",
  "entity": "roster_flight",
  "syncRangeDt": ["2026-05-21", "2026-05-21"],
  "timestamp": "2026-05-21T14:30:22Z",
  "filteredCount": 23,
  "totalReceived": 450,
  "reason": "crew_id_not_found",
  "records": [
    { "crewId": "F8-12345", "pairingInterfaceId": "P-9901", "type": "flight" }
  ]
}
```

### 2.5 Crew 预加载过滤

roster sync 开始前，一次性从 DB 加载所有 crew_code：

```typescript
// 一次 SELECT，整个 sync 生命周期复用
const crewSet = await loadCrewSet(readonlyDb)
// SELECT crew_code FROM crew → Set<string>

const [valid, rejected] = partition(records, r => crewSet.has(r.crewId))
// valid → 推 BullMQ；rejected → 写 rejection 文件
```

connector-server 使用独立的只读 DB 连接（Drizzle，只执行 SELECT），不写入任何表。

### 2.6 Orchestrator 执行流程

```typescript
// f8-sync-orchestrator.ts
async function runF8Sync(connectorCode: string, startDt: string, endDt: string) {
  const syncId = randomUUID()

  // Phase 1: 并行拉取所有实体 API（各自存 JSON）
  const [flightRecords, crewRecords, pairingRecords, rosterRecords] =
    await Promise.all([
      fetchFlight(startDt, endDt),
      fetchCrew(startDt, endDt),
      fetchPairing(startDt, endDt),
      fetchRoster(startDt, endDt),   // flight + ground 合并
    ])

  // Phase 2: crew 过滤（预加载 Set → 内存过滤）
  const { valid: validRoster, rejected } = filterByCrewSet(rosterRecords)
  if (rejected.length > 0) await writeRejectionStore(rejected, syncId)

  // Phase 3: FlowProducer 有序推送
  await flowProducer.add({
    name: 'roster.import',
    queueName: 'connector.roster.inbound',
    data: { syncId, filiale: 'F8', syncRangeDt: [startDt, endDt], records: validRoster },
    children: [{
      name: 'pairing.import',
      queueName: 'connector.pairing.inbound',
      data: { syncId, filiale: 'F8', syncRangeDt: [startDt, endDt], pairings: pairingRecords },
      children: [{
        name: 'flight.import',
        queueName: 'connector.flight.inbound',
        data: { syncId, filiale: 'F8', syncRangeDt: [startDt, endDt], records: flightRecords },
      }]
    }]
  })

  // crew 独立推送（不进 Flow）
  await crewQueue.add('crew.import', {
    syncId, filiale: 'F8', syncRangeDt: [startDt, endDt], records: crewRecords,
  })
}
```

### 2.7 Transform 层说明

`transform/f8/db/` 为新增的 DB-ready transform，与已有的 `transform/f8/`（标准格式，push 用途）完全隔离，互不影响。

**pairing 节点字段分配规则：**
- 每个 duty 的第一个 segment → 填 `pickupStartUtc/End`、`briefStartUtc/End`
- 每个 duty 的最后一个 segment → 填 `debriefStartUtc/End`、`dropoffStartUtc/End`
- 单 segment duty → 四组节点字段全部填入
- `double_*` 字段仅在 API 返回双签到/签离数据时填入

---

## 3. live-server 详细设计

### 3.1 新增 Worker 文件

```
live-server/src/workers/import/
  flight-inbound-worker.ts
  crew-inbound-worker.ts
  pairing-inbound-worker.ts
  roster-inbound-worker.ts
```

注册在 `src/index.ts`，与现有 BullMQ consumer 并列启动，使用已定义的队列（无需新增队列）。

### 3.2 Flight Worker

- 消费 `connector.flight.inbound`
- Upsert：`INSERT INTO flight ... ON CONFLICT (interface_flt_id, flt_dt) DO UPDATE SET ...`
- 批量 500 条，返回 `{ imported: N }`

### 3.3 Crew Worker

- 消费 `connector.crew.inbound`
- Upsert：`INSERT INTO crew ... ON CONFLICT (crew_code) DO UPDATE SET ...`

### 3.4 Pairing Worker

- 消费 `connector.pairing.inbound`，每 job 含 50 条 pairing 树
- FK 解析：`SELECT id FROM flight WHERE interface_flt_id = $1 AND flt_dt = $2`（批量预查，不逐条）
- 每条 pairing 用 Savepoint 隔离：

```typescript
for (const pairing of pairings) {
  await sql`SAVEPOINT sp`
  try {
    // 1. upsert pairing ON CONFLICT (interface_id) DO UPDATE → pairingId
    // 2. DELETE FROM pairing_segment WHERE pairing_id = $pairingId
    // 3. 批量 INSERT pairing_segment（含 duty 冗余字段 + node 字段）
    // 4. upsert pairing_composition（如有）
    await sql`RELEASE SAVEPOINT sp`
    result.imported++
  } catch (e) {
    await sql`ROLLBACK TO SAVEPOINT sp`
    result.errors.push({ id: pairing.interfaceId, reason: e.message })
  }
}
```

`interface_flt_id` 解析失败（flight 未就绪）→ job 抛出 → BullMQ 重试（FlowProducer 顺序保障下极少发生，3 次 × 30s 退避兜底）。

### 3.5 Roster Worker

消费 `connector.roster.inbound`，处理 `type: 'flight'` 和 `type: 'ground'` 两种记录：

**Flight 路径：**
1. 解析 `pairingInterfaceId → pairing.id`
2. `SELECT id, flt_id, duty_seq, seg_seq FROM pairing_segment WHERE pairing_id = $id ORDER BY duty_seq, seg_seq`
3. `DELETE FROM roster_flight WHERE pairing_id = $id AND crew_id = $crewId`
4. 批量 INSERT 每 segment 一行 `roster_flight`（`pairing_id` 非空，`pairing_segment_id` 非空）

**Ground 路径：**
```sql
INSERT INTO roster_flight (pairing_id, pairing_segment_id, flt_id, crew_id, assignment, str_dt_utc, end_dt_utc, ...)
VALUES (NULL, NULL, NULL, $crewId, $assignment, $strDtUtc, $endDtUtc, ...)
ON CONFLICT (crew_id, str_dt_utc, assignment) WHERE pairing_id IS NULL
DO UPDATE SET end_dt_utc = EXCLUDED.end_dt_utc, ...
```

---

## 4. BullMQ Job Payload 接口定义

```typescript
// 共用信封
interface ImportJobMeta {
  syncId: string
  filiale: string
  syncRangeDt: [string, string]
}

// ---- Flight ----
interface FlightImportJob extends ImportJobMeta {
  records: FlightImportRecord[]
}
interface FlightImportRecord {
  interfaceFltId: string
  fltNum: string
  airline: string
  depArp: string
  arvArp: string
  fltDt: string                   // 'YYYY-MM-DD'
  fleet: string
  tailNum: string | null
  schStrDtUtc: string
  schEndDtUtc: string
  actStrDtUtc: string | null
  actEndDtUtc: string | null
  fltSts: string
}

// ---- Crew ----
interface CrewImportJob extends ImportJobMeta {
  records: CrewImportRecord[]
}
interface CrewImportRecord {
  crewCode: string
  crewName: string
  rank: string
  division: string
  base: string
  isActive: boolean
}

// ---- Pairing ----
interface PairingImportJob extends ImportJobMeta {
  pairings: PairingImportRecord[]  // 每 job 50 条
}
interface PairingImportRecord {
  interfaceId: string
  pairingLabel: string
  base: string
  schStrDtUtc: string
  schEndDtUtc: string
  actStrDtUtc: string | null
  actEndDtUtc: string | null
  duties: PairingDutyRecord[]
}
interface PairingDutyRecord {
  dutySeq: number
  strArp: string
  endArp: string
  schStrDtUtc: string
  schEndDtUtc: string
  actStrDtUtc: string | null
  actEndDtUtc: string | null
  // node 字段全部 optional（分配规则见 Section 2.7）
  pickupStartUtc?: string;  pickupEndUtc?: string
  briefStartUtc?: string;   briefEndUtc?: string
  debriefStartUtc?: string; debriefEndUtc?: string
  dropoffStartUtc?: string; dropoffEndUtc?: string
  doublePickupStartUtc?: string;  doublePickupEndUtc?: string
  doubleBriefStartUtc?: string;   doubleBriefEndUtc?: string
  doubleDebriefStartUtc?: string; doubleDebriefEndUtc?: string
  doubleDropoffStartUtc?: string; doubleDropoffEndUtc?: string
  segments: PairingSegmentRecord[]
}
interface PairingSegmentRecord {
  segSeq: number
  interfaceFltId: string | null
  fltNum: string
  airline: string
  depArp: string
  arvArp: string
  fleet: string
  schStrDtUtc: string
  schEndDtUtc: string
  actStrDtUtc: string | null
  actEndDtUtc: string | null
  segAssignment: string            // 'FLY' | 'DHD' | 'SBY'
}

// ---- Roster ----
interface RosterImportJob extends ImportJobMeta {
  records: RosterImportRecord[]   // flight + ground 混合
}
type RosterImportRecord = RosterFlightRecord | RosterGroundRecord

interface RosterFlightRecord {
  type: 'flight'
  crewId: string
  pairingInterfaceId: string
  actingRank: string
  activeRank: string
  division: string
  seqOrder: number
  assignment: string              // 'FLY' | 'DHD' | 'SBY'
  assignmentGroup: string
  pairingStartUtc: string | null
}
interface RosterGroundRecord {
  type: 'ground'
  crewId: string
  assignment: string              // 'SBY' | 'VAC' | 'OFF' | 'TRN' | ...
  assignmentGroup: string
  strDtUtc: string
  endDtUtc: string
  location: string
  division: string
  label: string
  role: string
}

// ---- Job 返回值 ----
interface ImportJobResult {
  entity: string
  imported: number
  skipped: number
  filtered: number               // crew_id 不存在（roster only，connector-server 侧统计）
  errors: Array<{ id: string; reason: string }>
  durationMs: number
}
```

---

## 5. 错误处理

### 5.1 HTTP 层（connector-server）

| 错误类型 | 处理方式 |
|---|---|
| 5xx / timeout | chunk 拆分退避：10→5→3 天；3 天仍失败则 abort 并记录 |
| 401 / 403 | 立即 throw，不重试（auth 问题需人工介入） |
| 429 | 读 `retry-after` 头等待，重试同一 chunk |
| 成功但数据为空 | 正常继续，json 写盘为空数组 |

### 5.2 BullMQ Job 层

```typescript
defaultJobOptions: {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },  // 30s → 60s → 120s
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
}
```

FlowProducer 链：子 job 彻底失败 → 父 job 永不启动，Bull Board 可见。

### 5.3 Record 层（live-server）

Savepoint 隔离：单条失败 → rollback to savepoint → 继续下一条 → job 仍标记 `completed`（部分成功），`returnvalue.errors` 记录失败详情。只有整个 job 抛出（DB 断连等）才触发 BullMQ 重试。

### 5.4 Sync 状态（connector_log 表）

| 字段 | 说明 |
|---|---|
| `sync_id` | UUID，贯穿整个 Flow |
| `connector_code` | 'f8-roster-flight' |
| `status` | RUNNING → COMPLETED \| PARTIAL \| FAILED |
| `fetch_count` | API 拉取总条数 |
| `import_count` | 实际写入 DB 条数 |
| `filtered_count` | crew_id 不存在被过滤条数 |
| `error_count` | record 层失败条数 |
| `rejection_file` | rejection JSON 路径（有时才有） |
| `started_at` / `finished_at` | 时间戳 |

**状态判断：**
- `error_count == 0` → `COMPLETED`
- `error_count > 0 && import_count > 0` → `PARTIAL`
- `import_count == 0 && error_count > 0` → `FAILED`

### 5.5 人工恢复路径

| 场景 | 恢复方式 |
|---|---|
| F8 API 不可用 | 等待恢复后 Admin 触发 manual trigger 补跑指定日期段 |
| BullMQ Job 3 次重试全失败 | Bull Board 手动 retry，或 `POST /connectors/:id/trigger` |
| Fetch 成功但 DB 写入失败（JSON 已在磁盘） | `POST /connectors/:id/replay?syncId=xxx` 从本地 JSON 重放，跳过 API 拉取 |
| 数据污染，需整段重跑 | Admin API 指定 `startDt/endDt` 全量重跑（upsert 幂等） |

---

## 6. 测试策略

### 6.1 单元测试（connector-server，Vitest）

| 测试文件 | 覆盖内容 |
|---|---|
| `chunk-date.test.ts` | chunk 切分；5xx → 10→5→3 退避；401 立即抛出；429 等待重试 |
| `json-store.test.ts` | 原子写（temp→rename）；文件命名含 suffix；并发写不冲突 |
| `rejection-store.test.ts` | 写入格式正确；count 字段；目录自动创建 |
| `transform-flight.test.ts` | 字段映射；null 值处理 |
| `transform-pairing.test.ts` | duty/segment 树构建；node 分配规则（first/last/single seg） |
| `transform-roster-flight.test.ts` | flight/ground 区分；pairingId=0 过滤 |
| `crew-filter.test.ts` | 预加载 Set；in-memory 过滤；rejected/valid 分离 |

### 6.2 单元测试（live-server，Vitest）

| 测试文件 | 覆盖内容 |
|---|---|
| `flight-inbound-worker.test.ts` | upsert 幂等：同数据写两次行数不增加 |
| `pairing-inbound-worker.test.ts` | FK 解析；savepoint 隔离（一条失败不影响其余）；delete+re-insert |
| `roster-inbound-worker.test.ts` | flight 路径：段展开行数与 segment 数一致；ground 路径：单行 upsert |

### 6.3 集成测试（connector-server，真实只读 DB）

```
tests/integration/import/
  crew-preload.test.ts        — 从真实 DB 加载 crew set，验证过滤逻辑
  chunk-retry.test.ts         — mock HTTP server 返回 5xx，验证 chunk 拆分
  json-store-atomic.test.ts   — 并发写入无损坏
```

### 6.4 集成测试（live-server，真实读写 DB）

```
tests/integration/import/
  flight-upsert.test.ts          — insert → 重复 insert（幂等）→ 字段更新后 re-insert
  pairing-fk-resolution.test.ts  — 先插 flight，再插 pairing，FK 解析成功
  pairing-fk-miss-retry.test.ts  — flight 未插时 pairing job 失败；插入后手动重跑成功
  roster-segment-expand.test.ts  — 2-duty 3-seg pairing → 产生 3 条 roster_flight
  roster-ground-upsert.test.ts   — ground 记录 upsert 幂等
  savepoint-isolation.test.ts    — 批次中第 3 条异常，1/2/4 条正常写入
  partial-status.test.ts         — returnvalue error_count/import_count 正确
```

### 6.5 Flow 顺序测试

```typescript
// flow-ordering.test.ts
it('pairing job stays waiting until flight job completes', async () => {
  const flow = await flowProducer.add({ /* 标准 flow */ })
  const pairingJob = await pairingQueue.getJob(flow.children[0].job.id)
  expect(await pairingJob.getState()).toBe('waiting-children')
  await flightWorker.processJob(flightJob)
  expect(await pairingJob.getState()).toBe('waiting')
})
```

### 6.6 Fixtures

```
tests/fixtures/f8/
  flight-raw.json           — F8 API 原始响应样本（5 条，从生产脱敏截取）
  crew-raw.json
  pairing-raw.json          — 含 2-duty × 2-seg 的 pairing 树
  roster-flight-raw.json    — 含 pairingId=0 无效记录（过滤测试用）
  roster-ground-raw.json    — 含 Unknown 类型（跳过测试用）
```

覆盖率目标：后端 ≥ 80%，集成 ≥ 70%，transform 纯函数 ≥ 95%。

---

## 7. Cron 基础设施

### 7.1 Bull Board

安装 `@bull-board/api`、`@bull-board/fastify`，挂载在 connector-server `/admin/queues`，admin auth 中间件保护。所有 6 个队列注册到 Board，可查看 job 状态、`returnvalue`、失败原因。

### 7.2 Cron 配置存储

`connector_config.schedule_cron` 为 BullMQ 运行时值；`dictionary` 表为用户可编辑的 source of truth。两者通过 Admin API 保持同步：

`PUT /api/admin/connectors/:id` 收到 cron 变更时：
1. 更新 `connector_config.schedule_cron`
2. 更新 `dictionary.value`（`parent_code='CONNECTOR_SYNC'`，`code='F8_XXX_CRON'`）
3. `unschedule` + `reschedule` BullMQ repeatable job

### 7.3 SQL Seed 文件

**`sql/seed/f8/09-connector-f8.sql`**

```sql
-- connector_config
INSERT INTO connector_config
  (connector_code, connector_name, filiale, is_active, schedule_cron,
   lookback_days, chunk_days, created_by, updated_by)
VALUES
  ('f8-crew',          'F8 Crew Sync',          'F8', true, '0 */4 * * *', 7,  10, 'system', 'system'),
  ('f8-flight',        'F8 Flight Sync',         'F8', true, '0 * * * *',   30, 10, 'system', 'system'),
  ('f8-pairing',       'F8 Pairing Sync',        'F8', true, '0 */2 * * *', 60, 10, 'system', 'system'),
  ('f8-roster-flight', 'F8 Roster Flight Sync',  'F8', true, '0 * * * *',   30, 10, 'system', 'system')
ON CONFLICT (connector_code) DO NOTHING;

-- dictionary（cron 配置，可通过 Admin UI 编辑）
INSERT INTO dictionary
  (code, parent_code, value, label, sort_order, is_active, created_by, updated_by)
VALUES
  ('F8_CREW_CRON',    'CONNECTOR_SYNC', '0 */4 * * *', 'F8 机组同步周期',   1, true, 'system', 'system'),
  ('F8_FLIGHT_CRON',  'CONNECTOR_SYNC', '0 * * * *',   'F8 航班同步周期',   2, true, 'system', 'system'),
  ('F8_PAIRING_CRON', 'CONNECTOR_SYNC', '0 */2 * * *', 'F8 配对同步周期',   3, true, 'system', 'system'),
  ('F8_ROSTER_CRON',  'CONNECTOR_SYNC', '0 * * * *',   'F8 排班同步周期',   4, true, 'system', 'system')
ON CONFLICT (code) DO NOTHING;
```

---

## 8. 关键约束与注意事项

- **pairing_segment 字段全部 nullable**：node 字段（pickup/brief/debrief/dropoff 及 double_*）均为 nullable，不得写入 NOT NULL 默认值
- **地面任务**：`roster_flight.pairing_id = NULL`（不是 0），`pairing_segment_id = NULL`，`flt_id = NULL`
- **connector-server 只读 DB**：只执行 SELECT（crew set 预加载等），禁止任何 INSERT/UPDATE/DELETE
- **幂等保证**：所有写操作必须支持重复执行不产生副作用（upsert / delete+insert）
- **rejection 文件不阻塞 sync**：过滤写文件失败仅记录日志，不中断主流程
- **RosterGround Unknown 类型**：本期跳过，`ALL_ROSTER_GROUND_ASSIGNMENTS` 中排除
- **FlowProducer job 命名**：`flight.import`、`pairing.import`、`roster.import`、`crew.import`，Bull Board 按此名称聚合展示
