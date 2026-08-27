# Live 全量加载 + 客户端排序 设计文档

**日期**：2026-06-13
**状态**：已确认，待实施

---

## 背景与目标

当前 Live 模式按 crew 分页加载（每页 100 条），Pairing 每页 100 条，Flight 每页 20 条。所有排序操作需向后台重新发起请求，增加网络往返，且 Roster/Pairing/Flight 的客户端排序功能无法实现。

**目标**：用户点击 Apply Filters 后，一次性将符合条件的全量数据加载至浏览器，排序在本地完成。Pairing 详情展开时，优先从本地已有数据中查找，缺失部分再按需拉取。

---

## 数据规模

| 数据类型 | 典型筛选后规模 |
|----------|---------------|
| Crew | ~500 人 |
| Roster | 500 × 完整日期范围 |
| Pairing | ~3000 个 |
| Flight | ~3000 个 |

均在浏览器可承受范围内（内存 / 渲染）。

---

## 整体数据流

### 打开 Gantt

三个面板全空（空启动），不触发任何数据请求。

### Apply Filters

```
Apply Filters
  ① fetchAllCrew  (pageSize=0, 全量)
       └→ loadRosterProgressive
            ├─ 首 14 天先请求（先渲染）
            └─ 后台追加剩余日期范围
  ② fetchAllPairings (pageSize=0, 全量)  ← 与①并发
  ③ fetchAllFlights  (pageSize=0, 全量)  ← 与①并发
```

Crew + Roster 仍串行（Roster 依赖全量 crewId），Pairing 和 Flight 与 Crew 并发。

Roster 的渐进式首屏窗口（14 天）**保留**，因为 500 人 × 60 天的 roster payload 较大，分两步可以快速呈现首屏。排序针对 crew 行顺序，crew 全量加载完毕后即可排序，不受 roster 渐进影响。

### 排序

```
用户点击排序列
  → store.applySort(sortBy, sortOrder)
  → 本地 [...items].sort(compareFn)
  → set({ items: sorted })
  → markDirty()          ← Canvas 重绘，0ms 网络
```

### Pairing 详情（本地优先）

```
打开 Pairing 详情
  ─ 航段信息 → flight-store.items 查找 → 命中直接用
                                         缺失 → 请求 live-server
  ─ 分配机组 → roster-store.main.rosterItems (WHERE pairingId=xxx)
             + crew-store.items 补基础信息
             → 命中直接用，缺失 → 请求 live-server
```

---

## Store 层改动

### 通用常量

```typescript
// 新增，Apply Filters 时使用
const ALL_DATA_PAGE_SIZE = 5000
// 原有
const PAGE_SIZE = 100  // 保留，供 Find Crew / loadMore 兜底使用
```

### Crew Store

| 方法 / 字段 | 改动 |
|-------------|------|
| `fetchCrews` | pageSize 改为 `ALL_DATA_PAGE_SIZE` |
| `fetchCrewsWithFilter` | pageSize 改为 `ALL_DATA_PAGE_SIZE` |
| `fetchCrewsByIds` | 不变（Find Crew 按需拉，数量小）|
| `applySort` | 从"re-fetch 后台"改为"本地 sort `items`" |
| `loadMore` | 逻辑保留；`hasMore` 全量加载后为 `false`，UI 自然不显示 |
| append mode | 每个 session 全量拉取，合并逻辑不变；新 session 追加后对整体 items 重排 |

`applySort` 新实现：

```typescript
applySort: (sortBy, sortOrder) => {
  set({ sortBy, sortOrder })
  const sorted = [...get().items].sort((a, b) =>
    compareCrewItems(a, b, sortBy, sortOrder)
  )
  set({ items: sorted })
  // 不发请求，不重置 sessions
}
```

### Pairing Store

| 方法 / 字段 | 改动 |
|-------------|------|
| `fetchPairings` | pageSize 改为 `ALL_DATA_PAGE_SIZE` |
| `applySort` | 本地 sort `items` |
| `loadMore` | 保留，`hasMore=false` 后隐藏 |

### Flight Store

| 方法 / 字段 | 改动 |
|-------------|------|
| `fetchFlights` | pageSize 改为 `ALL_DATA_PAGE_SIZE` |
| `applySort` | 本地 sort `items` |
| `loadMore` | 保留，`hasMore=false` 后隐藏 |

### Roster Store

不变。`fetchRoster` / `appendRoster` 本身按 crewId 列表全量返回，无分页。

---

## 客户端排序实现

每个 store 需实现对应的 `compareFn`，字段名沿用现有后端字段名：

| Store | 典型排序字段 |
|-------|-------------|
| Crew | `crew_id` / `seniority` / `base` / `fleet` / `rank` |
| Pairing | `label` / `sch_start` / `coverage` / `fleet` |
| Flight | `registration` / `flt_num` / `dep_arp` / `sch_dep` |

服务端请求**不再**携带 `sortBy` / `sortOrder` 参数（全量数据加载后服务端排序无意义）。

Append 模式下，新 session 追加合并后，对整体 `items` 按当前 `sortBy/sortOrder` 重排一次。

---

## Pairing 详情本地优先

改动位置：`gantt/src/services/pairing-detail-cache.ts`

```typescript
async function getPairingDetail(pairingId: number): Promise<PairingDetail> {
  // 1. 航段：flight-store 本地查找
  const localFlights = lookupFlightsForPairing(pairingId)
  // 2. 分配机组：roster-store + crew-store 本地查找
  const localCrew = lookupCrewForPairing(pairingId)
  // 3. 全部命中 → 直接构建，零网络
  if (localFlights && localCrew) return buildFromLocal(localFlights, localCrew)
  // 4. 有缺失 → fallback 到现有服务端请求
  return fetchFromServer(pairingId)
}
```

Apply Filters 后 flight-store 已全量，绝大多数情况下本地命中，无额外请求。

---

## 服务端改动

需修改的接口（均在 `live-server/src/routes/`）：

| 接口 | 文件 | 改动 |
|------|------|------|
| `GET /fpqe/live/crew` | crew 路由 | `pageSize=0` 时去掉 LIMIT/OFFSET |
| `GET /fpqe/live/pairing` | pairing 路由 | 同上 |
| `GET /fpqe/live/flight` | flight 路由 | 同上 |

实现模式：

```typescript
if (params.pageSize !== 0) {
  const limit = params.pageSize ?? 100
  const offset = ((params.page ?? 1) - 1) * limit
  query.limit(limit).offset(offset)
}
// pageSize=0 → 不加 LIMIT，返回全部
```

- `pageSize=0` 仅在已认证请求下有效（现有鉴权中间件覆盖）
- `total` 字段继续返回，`hasMore = items.length < total` 自然为 `false`
- 无需新增接口，无需额外限流

**不需要修改**：
- `GET /fpqe/live/roster/view` — 本身按 crewId 列表全量返回
- Pairing 详情接口 — 按需调用，不分页

---

## apply-filters.ts 并发结构调整

当前 `applyGanttFilters` 中，Pairing / Flight 的 fetch 在 Crew+Roster 完成后才发起（串行）。新方案中 Pairing 和 Flight 与 Crew 完全独立，应同步并发：

```typescript
// 新并发结构
await Promise.all([
  (async () => {
    // ① Crew 全量 → Roster 渐进式（串行，因 roster 依赖 crewId）
    await fetchAllCrew(...)
    await loadRosterProgressive(...)
  })(),
  fetchAllPairings(...),   // ② 与①并发
  fetchAllFlights(...),    // ③ 与①并发
])
```

**`loadFromBootstrap` 处理**：bootstrap 路径（首次 Apply、无 crew filter）内部仍使用 `PAGE_SIZE=100`，与全量目标冲突。新方案中，该条件分支改为直接走普通 `fetchCrews(ALL_DATA_PAGE_SIZE)` + `loadRosterProgressive`，bootstrap 接口不再调用。

---

## 不在本次范围内

- Sub pane（`roster-sub`）排序：与 main 独立，暂不改动
- Scenario Gantt 数据加载：走独立路径，不影响
- `loadMore` 按钮彻底删除：保留代码，`hasMore=false` 后 UI 自然隐藏；后续再清理
- Append mode 多 session 详细 UX 调整：本次仅保证功能正确
