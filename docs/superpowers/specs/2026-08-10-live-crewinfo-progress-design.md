# Design: Live Gantt CrewInfo 提速 + 真实加载进度条

> Module: `gantt` frontend（`crew-info-dialog.tsx` / `pane-loading-bar.tsx` / `apply-filters.ts` / stores）
> Date: 2026-08-10
> Context: CrewInfo 打开慢（7 个串并行请求）；PaneLoadingBar 是 indeterminate 动画，无真实进度；RP 选择已解耦（commit 65bf0171），现在把加载本身做对。

---

## 0. Scope

两个独立需求，一次交付：

1. **CrewInfo 提速** — 打开弹窗不再发 7 个请求，改为 3 个。
2. **真实加载进度条** — 各 pane 顶部 PaneLoadingBar 从 indeterminate 动画改为真实百分比；roster/pairing 各自独立进度；flight 后台静默、不显示进度。

**不在范围：**
- pairing 500（TAFB 迁移）已由另一任务修复并重启，本 spec 不涉及。
- 加载方式一刀切全量/一刀切分批——按实测差异化（见 §3.2）。

---

## 1. 现状

### 1.1 CrewInfo

`gantt/src/components/roster/crew-info-dialog.tsx` 打开时调 `crewApi.getInfo(crewId)`，**并行发 7 个请求**：

```ts
const [list, ranks, bases, fleets, qualifications, certifications, teams] = await Promise.all([
  crewApi.list({ crewIds: [crewId], page: 1, pageSize: 1 }, 'gantt-panel'),
  api.get(`/api/crew/${crewId}/ranks`),
  api.get(`/api/crew/${crewId}/bases`),
  api.get(`/api/crew/${crewId}/fleets`),
  api.get(`/api/crew/${crewId}/qualifications`),
  api.get(`/api/crew/${crewId}/certificates`),
  api.get(`/api/crew/${crewId}/teams`),
])
```

弹窗展示 7 个区块：basic 摘要（crew 字段）+ Crew Base / Crew Rank / Crew Fleet / Crew Qualification / Crew Certification / Crew Team。

### 1.2 已加载 crew 数据

全量 crew 列表（`fetchCrews()`，pageSize=0，非 slim）**已内联** 817/817 crew 的 `ranks` / `bases` / `fleets` 历史数组（`Crew` 类型，字段与 `CrewInfo` 的对应区块同构）。实测列表返回 0.14s / 1.29MB。

`qualifications` / `certifications` / `teams` **不在列表里**，必须后端拉。

### 1.3 进度条

`gantt/src/components/panes/pane-loading-bar.tsx`：2px 条，`rois-bar` 无限循环动画（indeterminate），由布尔 `loading` 驱动。

各 pane 的 loading 标志：roster 用 `rosterStore.main.loading || crewStore.loading`；pairing 用 `pairingStore.loading`；flight 用 `flightStore.loading`。全部是布尔值，无进度概念。

### 1.4 加载管线

`apply-filters.ts` 当前两轮：
- **phase-1（窗口化首帧）**：bootstrap 取前 40 crew + 首月 roster；pairing 窗口取前 40。
- **phase-2（后台全量）**：`fetchCrews()` 全量 + `loadRosterProgressive` 全量 append + `fetchPairings` 全量 + flight + compositions。

phase-2 的 `appendRoster` 不置 loading（静默后台），所以进度条只反映 phase-1 的 40 行，全量阶段"无感"。这就是"进度条没显示真实进度"的根因。

---

## 2. 实测证据（本机 dev server + 远端 PG，2026-08-10）

| 数据 | 单次全量 | 分批并发 | 结论 |
|------|---------|---------|------|
| roster（817 crew） | 2.15s / 28.9MB | **0.49s**（4 批 ~205 crew） | **分批快 4.4×** |
| pairing（3120 条） | **0.32s** / 23.4MB | 1.16s（4 日期窗） | **全量快** |
| crew list（817） | 0.14s / 1.29MB | — | 已带 ranks/bases/fleets |
| flight（60 条） | 0.14s / 1.87MB | — | 很小 |

**结论：分批并发不是普遍更快，取决于数据特征。**
- roster 单条查询是「跨 crew × 跨日期」的大 JOIN，拆小后 PG 并行 → 快 4.4×。
- pairing 按日期窗拆会重复扫描边界 + 4 请求聚合成本 > 单请求 → 反而慢。
- 因此：**roster 分批并发、pairing 单次全量**。

---

## 3. 设计

### 3.1 Part A — CrewInfo 提速

**数据流：**
1. `CrewInfoDialog` 打开时，不再调 `crewApi.getInfo`。
2. 从 `useCrewStore.getState().items` 按 `crewId` 找 crew，取 `crew.ranks/bases/fleets`。
3. `Promise.all` 并行拉 3 个后端请求：`/api/crew/:id/qualifications`、`/certificates`、`/teams`。
4. 合并成 `CrewInfo` 形状返回。

**新纯函数** `crewInfoFromStore(crewId): Promise<CrewInfo>`（放 `crew-store` 或独立 util）：
- 输入：crewId
- store 内 `items.find(c => c.crew.crewId === crewId)` → `crew`
- 若找到：`ranks/bases/fleets` 取 `crew.ranks/bases/fleets`（缺省 `[]`），qual/cert/team 后端拉
- 若未找到：**回退**调 `crewApi.getInfo(crewId)` 全量（覆盖 Find Crew 带来的未全量 crew）

**错误处理：** store 未找到且回退也失败 → 保持现有 error 提示。

**测试：**
- 单测 `crewInfoFromStore`：store 命中（4 项本地取 + 3 项 mock 后端）、store 未命中（回退 getInfo）、后端失败。
- E2E：打开 CrewInfo 后断言 Crew Base/Rank/Fleet 区块内容与列表数据一致（§No-Illusion：具体值）。

### 3.2 Part B — 真实加载进度条

**store 层：**
- roster store：`main.loading: boolean` 保留，**新增** `main.progress: number | null`（0-100）。分批加载时逐批更新：`progress = 已完成批 / 总批 × 100`。
- pairing store：新增 `progress: number | null`。单请求模式：开始置 0，完成置 100，随后清 null。
- crew store：进度并入 roster 进度（roster 依赖 crew），不单独立。

**PaneLoadingBar：**
- 入参 `loading: boolean` → `progress: number | null`。
- `progress !== null` → 渲染 determinate 条（`width: ${progress}%`），`transition` 平滑推进。
- `progress === null` → 隐藏（同现状 loading=false 行为）。
- 兼容：保留一个 `loading` 兼容分支或直接替换调用点（roster/pairing 两处调用）。

**加载管线（apply-filters.ts）：**
- **去掉窗口化两轮** → 单轮。
- roster：`fetchCrews()` 全量后，把 crewIds 拆 **4 批并发** `fetchRoster`，每批到就 append + 更新 `progress`。
- pairing：**单次** `fetchPairings`（全量），加载中 `progress` 0→100（或加载中 + 完成跳满），完成后清 null。
- flight：维持后台静默（`fetchFlights` + compositions 无条件，不驱动任何进度条）。
- 删除 phase-1 的 `loadFromBootstrap` / `markPartiallyLoaded` / 40 行窗口路径（被单轮分批取代）。
- `markFullyLoaded` 语义：所有分批完成后置位（保留给客户端排序 `whenFullyLoaded`）。

**去重保证（"完成后不重复加载"）：**
- 单轮加载无 phase-2 重复全量。
- `useGanttViewport` 的 loadMore append 与分批并发并行时，复用现有 `rosterLoadSeq`/abort 机制：分批全部绑定同一 seq，新加载取代旧 seq 时丢弃过期批次。

**测试：**
- 单测：进度计算纯函数（分批数→每批 progress 序列）、`crewInfoFromStore`。
- E2E（`live-empty-start` / 新增 spec）：Apply 后 PaneLoadingBar 出现 → progress 到 100 → 消失；roster/pairing 计数在进度条消失后不再变化（不重复加载）。

---

## 4. 文件改动清单

| 文件 | 改动 |
|------|------|
| `gantt/src/components/roster/crew-info-dialog.tsx` | 改用 `crewInfoFromStore`，删 `crewApi.getInfo` 直调 |
| `gantt/src/stores/crew-store.ts`（或新 util） | 新增 `crewInfoFromStore(crewId)` + 映射 + 回退 |
| `gantt/src/components/panes/pane-loading-bar.tsx` | `loading` → `progress`，determinate 渲染 |
| `gantt/src/stores/roster-store.ts` | 新增 `progress`，分批加载更新 |
| `gantt/src/stores/pairing-store.ts` | 新增 `progress`，单请求更新 |
| `gantt/src/utils/apply-filters.ts` | 单轮分批并发；去 bootstrap 窗口路径 |
| `gantt/src/components/panes/roster-pane.tsx` | PaneLoadingBar 调用点改 `progress` |
| `gantt/src/components/panes/pairing-pane.tsx` | PaneLoadingBar 调用点改 `progress` |
| 单测 + E2E | 见 §3 测试节 |

---

## 5. 风险与取舍

- **首屏首帧略慢**：不再有"先 40 行"的极快首帧，第一批到达（~0.1s）才开始画。但全量 0.49s 完成，比现状 2.15s 快 4.4×；且"两轮感"消失。
- **改动集中**在首屏性能调优过的 `apply-filters.ts`，需要 E2E `windowed-first-paint`、`first-paint-phases` 等 spec 复核（它们可能断言旧的窗口化行为——按 §Stale-Test 更新）。
- pairing 全量 23MB 传输成本仍在；进度条只在"网络传输"阶段有意义，后端 SQL 是 0.32s，瓶颈在 payload。
