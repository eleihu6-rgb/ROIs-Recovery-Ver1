# Pane 搜索、排序与追加查询设计规格

**日期：** 2026-04-25  
**范围：** Pairing / Crew / Flight 三个 Pane，通用模式  
**背景：** 现有分段加载（每页100条）不支持跨页搜索与全局排序，需要统一设计查询层。

---

## 一、核心约束

- **Canvas 已实现虚拟行渲染**（`getVisibleRowRange`），无论加载多少行，每帧只绘制可见的 15–25 行，5000 条数据不会引起渲染卡顿。
- **排序必须在服务端执行**：客户端只能排已加载的子集，无法保证全局顺序。
- **搜索/排序/追加全部是服务端 API 参数**，前端 Store 负责维护查询状态并在 `loadMore` 时传递。
- 同一模式适用于 Pairing / Crew / Flight，差异仅在过滤字段定义。

---

## 二、后端：增强现有 List 端点

**不新增端点**，扩展 `GET /api/pairing`（Crew / Flight 同理）：

```
GET /api/pairing
  ?startDate=2026-01-01&endDate=2026-03-31   ← 现有
  &page=1&pageSize=100                        ← 现有
  &sortBy=tafb&sortOrder=desc                 ← 现有（扩展可选值）
  &label=CI1                                  ← 新增：pairingLabel ILIKE '%CI1%'
  &fleet=A330                                 ← 新增：精确匹配
  &base=TPE                                   ← 新增：精确匹配
  &division=P                                 ← 新增：精确匹配
  &segFltNum=CI123                            ← 新增：EXISTS pairing_segment.flt_num
  &depArp=TPE                                 ← 新增：EXISTS pairing_segment.dep_arp
  &isFull=true                                ← 新增：满编过滤
```

### 可排序字段

| sortBy 值 | 说明 | 现状 |
|-----------|------|------|
| `schStrDtUtc` | 起飞时间（默认） | 已有 |
| `pairingLabel` | 编号 | 已有 |
| `tafb` | 离基时长 | 新增 |
| `fleet` | 机队 | 新增 |
| `base` | 基地 | 新增 |
| `segCount` | 航段数 | 新增 |
| `durationDays` | 执勤天数 | 新增 |

### PairingSegment 穿透实现

```typescript
// service 层，EXISTS 子查询
if (filters.segFltNum) {
  conditions.push(
    sql`EXISTS (
      SELECT 1 FROM pairing_segment ps
      WHERE ps.pairing_id = ${pairing.id}
        AND ps.flt_num ILIKE ${`%${filters.segFltNum}%`}
        AND ps.is_deleted = 0
    )`
  )
}
```

### 需新增的 DB 索引

```sql
-- pairing 表（partial index，排除已删除行）
CREATE INDEX IF NOT EXISTS idx_pairing_fleet
  ON pairing(fleet) WHERE is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_pairing_base
  ON pairing(base) WHERE is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_pairing_tafb
  ON pairing(tafb) WHERE is_deleted = 0;

-- pairing_segment 表
CREATE INDEX IF NOT EXISTS idx_pairing_segment_flt_num
  ON pairing_segment(flt_num) WHERE is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_pairing_segment_dep_arp
  ON pairing_segment(dep_arp) WHERE is_deleted = 0;
```

### 缓存 Key 规范

```
pairing:list:{startDate}:{endDate}:{page}:{pageSize}:{sortBy}:{sortOrder}:{filtersHash}
```

- `filtersHash`：过滤参数按 key 排序后 JSON.stringify，再取 MD5/stable hash。无过滤时为空字符串。
- 写操作（create / update / delete）继续执行 `invalidatePattern('pairing:list:*')`，零改动。
- TTL 保持 600s（10 分钟）。

---

## 三、前端：Store 重构

### 数据结构

```typescript
interface PairingFilters {
  label?: string      // pairingLabel 模糊搜索
  fleet?: string      // 精确匹配
  base?: string       // 精确匹配
  division?: string   // 精确匹配
  segFltNum?: string  // segment.flt_num 模糊搜索
  depArp?: string     // segment.dep_arp 精确匹配
  isFull?: boolean    // 满编过滤
}

interface QuerySession {
  id: number               // 1, 2, 3...（追加次序）
  filters: PairingFilters
  page: number             // 已加载到第几页
  total: number            // 服务端返回的匹配总数
  exhausted: boolean       // 是否已全部加载
}

interface PairingItem {
  pairing: Pairing
  segments: PairingSegment[]
  sessionTags: number[]    // 新增：[1] 仅Session①命中，[1,2] 两次都命中
}

interface PairingStore {
  // 展示数据
  items: PairingItem[]         // 去重后的展示列表
  unfilteredTotal: number      // 日期范围内的总数（不含任何过滤，Badge ≡ 用）
  loading: boolean
  loadingMore: boolean

  // 查询模式
  queryMode: 'replace' | 'append'

  // 查询会话队列（replace 模式最多1个，append 模式可多个）
  sessions: QuerySession[]

  // 排序（独立于 session，全局生效）
  sortBy: string
  sortOrder: 'asc' | 'desc'

  // 计算属性
  matchedTotal: number         // 所有 session.total 的去重估算（⌕ Badge 用）
  loadedCount: number          // items.length（↓ Badge 用）
  hasMore: boolean             // 任意 session 未耗尽

  // Actions
  fetchPairings: (dateRange: DateRange) => Promise<void>   // 初始化，设置 unfilteredTotal
  search: (filters: PairingFilters) => Promise<void>        // replace/append 取决于 queryMode
  loadMore: () => Promise<void>                             // 顺序消费 session 队列
  applySort: (sortBy: string, sortOrder: 'asc' | 'desc') => Promise<void>
  setQueryMode: (mode: 'replace' | 'append') => void
  clearFilters: () => void                                  // 清除全部，回到初始状态
  removeFilter: (sessionId: number, key: keyof PairingFilters) => Promise<void>
}
```

### Replace 模式行为

```
search(filters)
  → set queryMode = 'replace'（若当前是 replace）
  → 清空 items、sessions
  → 创建 Session { id:1, filters, page:1, total:0, exhausted:false }
  → 请求第1页 → 填充 items，每条 sessionTags: [1]
  → sessions[0].total = response.total

loadMore
  → sessions[0] 未耗尽 → 请求下一页，append 到 items，sessionTags: [1]
  → sessions[0].exhausted = (items.length >= sessions[0].total)
```

### Append 模式行为

```
search(filters)   ← 第N次追加搜索
  → 创建 Session { id:N, filters, page:1, total:0, exhausted:false }
  → 立即请求 Session N 第1页
  → 遍历返回100条：
      if item.id 已在 items → items[i].sessionTags.push(N)  （仅打标签）
      else → items.push({ ...item, sessionTags: [N] })      （追加新行）
  → sessions.push(新 session)

loadMore
  → 找 sessions 中第一个 exhausted=false 的 session（FIFO 顺序）
  → 请求该 session 的下一页
  → 同样执行去重 + 打标签逻辑
  → 当前 session 耗尽后，下次 loadMore 消费下一个 session
```

### 排序行为

```
applySort(sortBy, sortOrder)
  → 更新 store.sortBy / store.sortOrder
  → 保存当前所有 sessions 的 filters（历史查询条件）
  → 清空 items、sessions
  → 按顺序重新执行每个历史 session 的 search()（带新 sort 参数）
  → 视觉效果：列表重置，以新排序顺序重新加载
  
  注意：只有点击排序按钮才触发此流程，search() 不触发排序重置
```

---

## 四、Pane Header 重设计

### 布局

```
行1（32px，固定）：
  [● 色块]  [Pane标题]  [≡ N]  [⌕ N]  [↓ N]  [⠿]  [×]

行2（24px，有激活条件时出现）：
  [① chip × ]  [② chip × ]  [↑/↓ 排序字段]  [Clear all]
```

### 三个计数 Badge

| Badge | 数据来源 | 颜色 | 显示条件 |
|-------|---------|------|---------|
| `≡ N` | `unfilteredTotal` | `text-muted-foreground` | 始终（有数据时） |
| `⌕ N` | `matchedTotal`（sessions 总和） | `text-amber-400` | 仅有激活搜索时 |
| `↓ N` | `items.length` | `text-blue-400` | 始终（有数据时） |

Tooltip：
- `≡` → "Total in date range"
- `⌕` → "Matching search filters"
- `↓` → "Loaded in view"

### Filter Strip（第二行）

- 每个激活的过滤条件显示为 chip：`[① fleet:A330 ×]`
- `①②` 前缀对应 Session 编号（追加模式），颜色与 Canvas 行头标签一致
- 排序显示为：`↑ tafb`（升序）或 `↓ tafb`（降序），无 `×`（排序不可单独清除）
- `Clear all` 按钮：清除全部 sessions 和排序，恢复初始状态
- 无任何条件时：行2完全消失，Pane 高度恢复

### Session 颜色系统

```typescript
const SESSION_COLORS = [
  '#f97316',  // ① 橙
  '#3b82f6',  // ② 蓝
  '#22c55e',  // ③ 绿
  '#a855f7',  // ④ 紫
]
```

---

## 五、Canvas 行头 Session 标签

在每个 Pairing/Crew/Flight 行的最左侧绘制 4px 宽竖条：

```typescript
// pairing-renderer.ts 中
if (item.sessionTags.length === 1) {
  ctx.fillStyle = SESSION_COLORS[item.sessionTags[0] - 1]
  ctx.fillRect(0, rowTop, 4, rowHeight)
} else if (item.sessionTags.length > 1) {
  // 多个 session 命中：平均分割竖条
  const segH = rowHeight / item.sessionTags.length
  item.sessionTags.forEach((tag, i) => {
    ctx.fillStyle = SESSION_COLORS[tag - 1]
    ctx.fillRect(0, rowTop + i * segH, 4, segH)
  })
}
// 无 sessionTags：不绘制
```

---

## 六、Crew / Flight 适配

同一套模式，差异仅在过滤字段定义：

```typescript
interface CrewFilters {
  empCode?: string    // 员工号模糊
  name?: string       // 姓名模糊
  rank?: string       // 职级精确
  base?: string       // 基地精确
  fleet?: string      // 机队精确
}

interface FlightFilters {
  fltNum?: string     // 航班号模糊
  depArp?: string     // 出发地精确
  arvArp?: string     // 目的地精确
  fleet?: string      // 机队精确
  status?: string     // 状态精确
}
```

相应 DB 索引、cache key、store 结构对称实现。

---

## 七、实现顺序建议

1. **DB 索引**（`sql/migration/`）
2. **后端 service 层**：pairing / crew / flight 各自增加过滤参数处理
3. **`pairingStore` 重构**（新增 sessions / queryMode / unfilteredTotal）
4. **`PaneHeader` 重设计**（三 Badge + Filter Strip）
5. **Canvas 行头 Session 标签**（pairing-renderer / roster-renderer / flight-renderer）
6. **crewStore / flightStore** 按相同模式同步实现

---

## 八、不在本次范围内

- 搜索 UI 入口（搜索框/过滤面板的具体交互设计）属于独立功能，后续另行设计
- Crew Pane 的 `selectedCrewIds` 行为不变，搜索不影响选中状态
- E2E 测试用例（另行补充）
