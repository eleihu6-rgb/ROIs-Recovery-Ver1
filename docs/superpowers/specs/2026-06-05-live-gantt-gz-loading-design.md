# Live Gantt 全量 GZ 加载设计

**日期：** 2026-06-05
**模块：** gantt / live-server
**状态：** 待实施

---

## 背景与动机

现有 Live Gantt 采用分段渐进式加载：bootstrap API 拉取第一页 crew + 首屏 roster 窗口，用户滚动时 loadMore 继续拉取，pairing/flight 通过各自独立 API 补充。这种方式在需要做跨机组查询（crew ↔ pairing 双向定位、按 pairing 属性聚合排序）时无法实现，因为数据从未全部在内存中。

目标：将 Live Gantt 改为**全量一次性加载**，前端持有完整内存索引，支持：

- 按 crew_id 搜索后跳转至其 Roster Pane 行
- 从 RosterItem 定位至对应 Pairing Pane 的环
- 从 Pairing 反查所有携带该环的机组，聚合置顶
- 按 Pairing 或 Crew 属性做本地排序和过滤

**Wire Format** 统一采用与 Scenario Gantt 相同的 CSV gz 格式，确保 Live → Scenario 转换无需格式转换。

---

## 约束与边界

| 项目 | 值 |
|------|-----|
| 活跃机组规模 | ~4000 人 |
| 典型视窗 | 3 个月 |
| roster_flight 行数 | ≤ 500K 行（3 个月） |
| 部署环境 | 外网云服务器，广域网访问 |
| 目标加载时间 | 10-15 秒（含 DB 查询 + 传输 + 浏览器解析） |
| 交互可用前提 | **全量数据到位后**才解锁界面（无两阶段） |

**本 spec 范围：** 全量 gz 加载。WebSocket 实时同步、增量 delta 刷新为后续独立设计。

---

## 整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (Main Thread)                                           │
│                                                                  │
│  LiveGanttStore                                                  │
│  ├── loadData(params) ──→ spawn Web Worker                       │
│  ├── loadProgress: { section, percent }  ←── postMessage        │
│  ├── data: LiveGanttData | null          ←── postMessage(done)   │
│  ├── crewsByPairingId: Map<number, string[]>                     │
│  └── pairingsByCrewId: Map<string, number[]>                     │
│                                                                  │
│  Roster Pane / Pairing Pane / Flight Pane ← 读 LiveGanttStore   │
└──────────────────┬───────────────────────────────────────────────┘
                   │  Worker.postMessage({ url, headers })
┌──────────────────▼───────────────────────────────────────────────┐
│  live-gz.worker.ts  (Web Worker)                                 │
│  1. fetch('/api/gantt/live-data.gz')                             │
│  2. ReadableStream → DecompressionStream('gzip')                 │
│  3. 逐行扫描 ## section 分隔符，解析 CSV                         │
│  4. 每节完成 → postMessage({ type:'progress', section, percent })│
│  5. 全部完成 → postMessage({ type:'done', data: LiveGanttData }) │
└──────────────────┬───────────────────────────────────────────────┘
                   │  GET /api/gantt/live-data.gz?startDate&endDate&...
┌──────────────────▼───────────────────────────────────────────────┐
│  live-server: buildLiveInputGz(fastify, params)                  │
│  ├── 8 张表 Promise.all 并发 SELECT                              │
│  ├── toCsvSection × 8 组装 CSV                                   │
│  └── gzip → Buffer → reply（Content-Type: application/gzip）    │
└──────────────────────────────────────────────────────────────────┘
```

**不变范围：** `draft-store`、`history-store`、`rule-check-store`、`lock-store`、所有写操作 API 路径均不改动。

---

## Wire Format：Live gz 的 Sections

### Live gz vs Scenario gz 对比

| Section | Scenario gz | Live gz | 说明 |
|---------|------------|---------|------|
| `scenario` / `workset` | ✓ | ✗ | 优化专用 |
| `crew` | ✓ | ✓ | 同格式 |
| `crew_rank` | ✓ | ✓ | date-effective 过滤 |
| `crew_base` | ✓ | ✓ | date-effective 过滤 |
| `crew_fleet` | ✓ | ✓ | 机队显示 |
| `crew_qualification / status / certificate` | ✓ | ✗ | 优化专用 |
| `pairing` | ✓ | ✓ | 日期窗口过滤 |
| `pairing_segment` | ✓ | ✓ | 同格式 |
| `pairing_composition` | ✓ | ✗ | 优化专用 |
| `flight` | ✓ | ✓ | 日期窗口过滤 |
| `flight_composition` | ✓ | ✗ | 优化专用 |
| `roster_flight` | ✓（全量） | ✓（**日期窗口过滤**） | Live 核心数据，替代 output.gz assignments |
| `rule_group / rule_instance / rule_template` | ✓ | ✗ | 法规引擎专用 |
| `base / rank / fleet / airport` | ✓ | ✗ | 参考数据另有接口 |

Live gz 共 **8 个 sections**（含 crew_fleet），Scenario gz 共 22 个。

### 各 Section 过滤条件

```sql
crew            WHERE crew_id IN (crewIdSet)
                -- crewIdSet 由 filterParams 动态构造，空 = SELECT crew_id FROM crew

crew_rank       WHERE crew_id IN (crewIdSet)
                  AND eff_dt <= :endDate
                  AND (exp_dt >= :startDate OR exp_dt IS NULL)

crew_base       同上

crew_fleet      同上

pairing         WHERE sch_str_dt_utc <= :endDate
                  AND sch_end_dt_utc >= :startDate

pairing_segment WHERE pairing_id IN (pairingIdSet)

flight          WHERE sch_dep_dt_utc <= :endDate
                  AND sch_arv_dt_utc >= :startDate

roster_flight   WHERE crew_id IN (crewIdSet)
                  AND sch_str_dt_utc <= :endDate
                  AND sch_end_dt_utc >= :startDate    ← Live 独有：日期过滤
```

与 Scenario gz 唯一语义差异：`roster_flight` 在 Scenario 中无日期过滤（优化器需要完整历史约束），在 Live 中只取视窗内数据。

### 查询参数接口

```typescript
interface LiveFilterParams {
  divisions?: string[]   // 如 ['FLT', 'CAB']
  ranks?:     string[]   // 如 ['CA', 'FO']
  bases?:     string[]   // 如 ['PEK', 'SHA']
  fleets?:    string[]   // 如 ['B737', 'A320']
}
```

全部为空时 crewIdSet = `SELECT crew_id FROM crew`（全机队）。

### 体积估算（500K roster_flight，3 个月）

| Section | 原始 CSV | gzip 后 |
|---------|---------|--------|
| crew (4K 行) | ~1 MB | ~80 KB |
| crew_rank / base / fleet | ~3 MB | ~200 KB |
| pairing (50K 行) | ~8 MB | ~600 KB |
| pairing_segment (200K 行) | ~35 MB | ~2.5 MB |
| flight (30K 行) | ~3 MB | ~250 KB |
| roster_flight (500K 行) | ~55 MB | ~4 MB |
| **合计** | **~105 MB** | **~7.5 MB** |

WAN 2.5 MB/s 传输约 3 秒，浏览器解压 + CSV 解析约 4-6 秒，服务端 DB 查询约 3-5 秒，**总计 10-14 秒**。

---

## Backend 实现

### 文件变更

```
live-server/src/
├── utils/
│   └── csv.ts                        新增：csvEscape + toCsvSection（从 scenario-export-service.ts 移出）
├── services/
│   └── gantt/
│       └── live-gz-service.ts        新增：buildLiveInputGz + buildCrewWhere
└── routes/
    └── gantt/
        └── gantt.ts                  新增路由：GET /live-data.gz
```

`scenario-export-service.ts` 改为从 `utils/csv.ts` import，不修改其他逻辑。

### `buildLiveInputGz` 核心逻辑

```typescript
export async function buildLiveInputGz(
  fastify: FastifyInstance,
  p: { startDate: string; endDate: string; filterParams?: LiveFilterParams },
): Promise<Buffer> {
  const crewWhere = buildCrewWhere(p.filterParams)

  const [crew, crewRank, crewBase, crewFleet,
         pairings, pairingSegs, flights, roster] = await Promise.all([
    db.execute(sql`SELECT * FROM crew ${crewWhere}`),
    db.execute(sql`SELECT * FROM crew_rank WHERE crew_id IN (SELECT crew_id FROM crew ${crewWhere})
                   AND eff_dt <= ${p.endDate} AND (exp_dt >= ${p.startDate} OR exp_dt IS NULL)`),
    // ... crew_base, crew_fleet 同上
    db.execute(sql`SELECT * FROM pairing
                   WHERE sch_str_dt_utc <= ${p.endDate} AND sch_end_dt_utc >= ${p.startDate}`),
    // ... pairing_segment, flight 同上
    db.execute(sql`SELECT * FROM roster_flight
                   WHERE crew_id IN (SELECT crew_id FROM crew ${crewWhere})
                     AND sch_str_dt_utc <= ${p.endDate} AND sch_end_dt_utc >= ${p.startDate}`),
  ])

  const csv = [
    toCsvSection('crew',            crew.rows),
    toCsvSection('crew_rank',       crewRank.rows),
    toCsvSection('crew_base',       crewBase.rows),
    toCsvSection('crew_fleet',      crewFleet.rows),
    toCsvSection('pairing',         pairings.rows),
    toCsvSection('pairing_segment', pairingSegs.rows),
    toCsvSection('flight',          flights.rows),
    toCsvSection('roster_flight',   roster.rows),
  ].join('\n')

  // 生产环境改为异步 zlib.gzip 避免阻塞 event loop
  return gzipSync(Buffer.from(csv, 'utf-8'))
}
```

`buildCrewWhere` 由 `buildLiveInputGz` 和（未来）`buildRoInputGz` 共用，接受 `LiveFilterParams` 返回 Drizzle sql 片段。

### 路由

```
GET /api/gantt/live-data.gz
Query: startDate (YYYY-MM-DD), endDate, divisions?, ranks?, bases?, fleets?
Response: Content-Type: application/gzip（不设 Content-Encoding，由 Worker 手动解压）
```

不使用 `Content-Encoding: gzip`：浏览器遇到该 header 会自动解压，导致 Worker 无法控制流式解析进度。

---

## Frontend 实现

### 文件变更

```
gantt/src/
├── workers/
│   └── live-gz.worker.ts             新增：fetch → 解压 → 解析 → postMessage
├── stores/
│   └── live-gantt-store.ts           新增：LiveGanttData + 派生索引 + loadData
├── services/
│   └── live-gz-api.ts                新增：buildLiveGzUrl 参数构造
├── utils/
│   └── parse-sections-browser.ts     新增：浏览器端 CSV section 流式解析器
└── types/
    └── gantt-shared.ts               新增：GanttCrew / GanttPairing 等共用类型
                                            （原 ScenarioGanttXxx 重命名并 re-export）
```

### 浏览器端 Section 解析器

使用 Web API `DecompressionStream('gzip')` + `TextDecoderStream`，无 Node.js 依赖：

```typescript
export async function parseSectionsStream(
  gzStream: ReadableStream<Uint8Array>,
  onSection: (name: string, rows: Record<string, string>[]) => void,
  onProgress: (section: string, done: number, total: number) => void,
): Promise<void> {
  const reader = gzStream
    .pipeThrough(new DecompressionStream('gzip'))
    .pipeThrough(new TextDecoderStream())
    .getReader()

  let lineBuffer = ''
  let currentSection = '', headers: string[] = [], rows: Record<string, string>[] = []
  let completedCount = 0
  const TOTAL = 8

  const flush = () => {
    if (currentSection && rows.length > 0) {
      onSection(currentSection, rows)
      onProgress(currentSection, ++completedCount, TOTAL)
    }
  }

  // 逐块读取 → 拆行 → 状态机解析 ## header / CSV header / data row
  // ...（完整实现见代码）
}
```

### Web Worker 流程

```typescript
// live-gz.worker.ts
self.onmessage = async (e: MessageEvent<{ url: string; headers: Record<string, string> }>) => {
  const response = await fetch(e.data.url, { headers: e.data.headers })
  if (!response.ok || !response.body) {
    self.postMessage({ type: 'error', message: `HTTP ${response.status}` })
    return
  }

  const sections: Record<string, Record<string, string>[]> = {}

  let accumulatedPercent = 0
  await parseSectionsStream(
    response.body,
    (name, rows) => { sections[name] = rows },
    (section) => {
      accumulatedPercent += SECTION_WEIGHTS[section] ?? 0
      self.postMessage({ type: 'progress', section, percent: accumulatedPercent })
    },
  )

  self.postMessage({ type: 'done', data: buildLiveGanttData(sections) })
}
```

`buildLiveGanttData` 在 Worker 内构建所有派生索引：

```typescript
interface LiveGanttData {
  crew:               GanttCrew[]
  pairingById:        Map<number, GanttPairing>
  segmentsByPairingId:Map<number, GanttPairingSegment[]>
  flightById:         Map<number, GanttFlight>
  rosterByCrew:       Map<string, GanttRosterItem[]>
  crewsByPairingId:   Map<number, string[]>   // 反向索引，供「环→机组」聚合
  pairingsByCrewId:   Map<string, number[]>   // 正向索引，供「机组→环」跳转
}
```

### LiveGanttStore

```typescript
interface LiveGanttStore {
  loading:      boolean
  loadProgress: { section: string; percent: number } | null
  error:        string | null
  data:         LiveGanttData | null
  lastParams:   LiveLoadParams | null

  loadData(params: LiveLoadParams): Promise<void>
  refresh():                        Promise<void>

  // 内存计算，不发网络请求
  getCrewsForPairing(pairingId: number): GanttCrew[]
  getRosterForCrew(crewId: string):      GanttRosterItem[]
  getPairingsForCrew(crewId: string):    GanttPairing[]
}
```

数据到位后，通过 `bridgeToExistingStores(data)` 填充现有 store，令 Roster / Pairing / Flight Pane 组件无需改动：

```typescript
function bridgeToExistingStores(data: LiveGanttData) {
  // crew-store：绕过分页，直接落全量
  useCrewStore.setState({
    items: data.crew.map(c => ({ crew: c, sessionTags: [1] })),
    selectedCrewIds: data.crew.map(c => c.crewId),
    total: data.crew.length,
    hasMore: false,
    loading: false,
  })

  // roster-store：复用 setMainRoster（自动应用 draft ops）
  useRosterStore.getState().setMainRoster([...data.rosterByCrew.values()].flat())

  // pairing-store / flight-store：类似 setState
}
```

---

## 加载条件弹框 + localStorage 持久化

### 加载流程

```
首次打开（无 localStorage）          后续打开（有 localStorage）
─────────────────────────            ──────────────────────────
Gantt 空状态                          读取 live-gantt-load-params
自动打开 Filters 弹框                 直接调用 loadData(savedParams)
（日期范围 + 职级/基地/机队/部门）     显示 Loading 覆盖层
用户确认 → loadData(params)
         → 保存至 localStorage
```

Filters 按钮（工具栏已有）承担两个职责：
1. **首次**：用户手动点击或空状态自动弹出，配置加载条件
2. **后续**：修改条件 → 全量重载

工具栏变化：
- 移除 `DateRangePicker` 组件（日期并入 Filters 弹框）
- 新增只读日期标签（如 `01 Jan – 31 Mar 2026`），点击触发 Filters 弹框

### Filters 弹框字段

| 字段 | 类型 |
|------|------|
| Date Range | DateRangePicker（必填） |
| Rank | 多选（CA / FO / SE 等） |
| Base | 多选 |
| Fleet | 多选 |
| Division | 多选 |

### LocalStorage Schema

```typescript
// key: 'live-gantt-load-params'（schema 隔离由 JWT token 中的 schema 字段保证）
interface PersistedLiveLoadParams {
  startDate:    string          // 'YYYY-MM-DD'
  endDate:      string
  filterParams: LiveFilterParams
  savedAt:      string          // ISO，预留给未来过期判断
}
```

---

## Progress UX + 错误处理

### 进度权重

Worker 用预定义权重 Map 而非简单计数，使进度视觉与实际等待时间对应：

```typescript
const SECTION_WEIGHTS: Record<string, number> = {
  crew: 2, crew_rank: 3, crew_base: 3, crew_fleet: 2,
  pairing: 10, pairing_segment: 25, flight: 5, roster_flight: 50,
}
// 累计 totalWeight = 100，每节完成后 percent += SECTION_WEIGHTS[section]
```

| Section | 用户显示名 | 单节权重 | 完成后累计 |
|---------|-----------|---------|---------|
| `crew` | Crew list | 2% | 2% |
| `crew_rank` | Crew details | 3% | 5% |
| `crew_base` | — | 3% | 8% |
| `crew_fleet` | — | 2% | 10% |
| `pairing` | Pairings | 10% | 20% |
| `pairing_segment` | Pairing details | 25% | 45% |
| `flight` | Flights | 5% | 50% |
| `roster_flight` | Roster assignments | 50% | 100% |

### Loading 覆盖层

全量加载期间覆盖 Gantt，阻断操作：

```
┌────────────────────────────────────────┐
│                                        │
│       Loading Live Gantt Data          │
│                                        │
│  ████████████████░░░░░░░░   64%        │
│  Roster assignments                    │
│                                        │
│  Crew list ✓  Pairings ✓              │
│  Pairing details ✓  Flights ✓         │
│  Roster assignments…                   │
│                                        │
└────────────────────────────────────────┘
```

### 错误处理矩阵

| 场景 | 检测时机 | 处理 |
|------|---------|------|
| 网络中断 | Worker fetch 抛出 | postMessage(error) → Store 显示 + Retry |
| 服务端 5xx | response.ok === false | 同上，含 HTTP 状态码 |
| gz 解压失败 | DecompressionStream 抛出 | 同上 |
| CSV 行格式异常 | parseCsvRow 抛出 | 跳过该行 + 累计 parseWarnings，done 时一并返回 |
| 超时 > 30s | Store 侧 setTimeout | abort Worker + 显示超时错误 + Retry |
| 浏览器不支持 DecompressionStream | Worker 启动特性检测 | postMessage(error: 'Browser not supported') |

Retry 复用 `lastParams`，旧数据保留（不清空），Loading 覆盖层重新出现。

---

## 与 Scenario 的共用边界

### 共用层

| 位置 | 内容 |
|------|------|
| `live-server/src/utils/csv.ts` | csvEscape + toCsvSection（两侧 import） |
| `gantt/src/utils/parse-sections-browser.ts` | 浏览器端解析器（Live 用，Scenario 未来可接入） |
| `gantt/src/types/gantt-shared.ts` | GanttCrew / GanttPairing / GanttPairingSegment / GanttFlight / GanttRosterItem |
| `live-server/src/services/gantt/live-gz-service.ts` | buildCrewWhere（Live + 未来 buildRoInputGz 共用） |

### Scenario Gantt 本次不迁移

Scenario Gantt 当前由后端解析 gz 后返回 JSON，运行正常。`parseSectionsStream` 已备好，未来 Scenario 若切换为前端解析 gz，接入点已存在。

### Live → Scenario 转换路径

```
用户在 Live Gantt 点击「Create Scenario」
        ↓
后端独立调用 buildRoInputGz（现有函数）重新查询数据库
        ↓ （不复用 Live gz，原因见下）
optimizer input.gz 写入 engine-server
        ↓
Scenario 创建完成，跳转 Scenario Gantt
```

Live gz 与 Scenario input.gz **不共用同一文件**：

| | Live gz | Scenario input.gz |
|-|---------|------------------|
| 用途 | 前端展示 | RO 优化器输入 |
| roster_flight | 日期窗口过滤 | 全量（历史约束） |
| 额外 sections | 无 | rule_group / pairing_composition 等 |

两者共享查询逻辑（通过 `buildCrewWhere`），不共享文件。

---

## 类型统一

`scenario-gantt.ts` 中的 `ScenarioGanttXxx` 类型移至 `gantt-shared.ts` 并重命名为 `GanttXxx`，原文件做 re-export alias 保持向后兼容：

```typescript
// types/scenario-gantt.ts（保留，向后兼容）
export type { GanttCrew as ScenarioGanttCrew } from './gantt-shared'
export type { GanttPairing as ScenarioGanttPairing } from './gantt-shared'
// ...
```

---

## 不在本 spec 范围内

- **增量 delta 刷新**：需要独立设计 delete_log 或事件溯源机制
- **WebSocket 与内存 store 的同步**：现有 WebSocket 继续工作，不与 gz 加载路径耦合
- **gzipSync → 异步优化**：标注为实现时优化点（使用 `zlib.gzip` 异步版本）
- **服务端缓存**：生产优化，按需设计
- **Scenario Gantt 迁移至 gz 传输**：下一阶段独立 spec
