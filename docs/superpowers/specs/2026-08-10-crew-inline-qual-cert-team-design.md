# Design: Crew 全量内联 qual/cert/team，CrewInfo 零后端请求

> Module: `live-server` crew-service + `gantt` crew-store/CrewInfo
> Date: 2026-08-10
> Context: CrewInfo 打开仍需 3 个后端请求（qual/cert/team）。把这三类数据随 crew 全量加载一起内联到前端，CrewInfo 从 store 读全部 6 类历史，零后端请求。

---

## 0. Scope

1. **后端** `/api/crew` list 全量分支内联 `qualifications/certifications/teams`（与现有 ranks/bases/fleets 同机制）。
2. **前端** `Crew` 类型加 3 字段；`fetchCrews` 改分批批量 + 失败递归切小；`crewInfoFromStore` 从 store 读全部 6 类。
3. **Find Crew / getInfo / bootstrap 保留 slim**（用户已确认）；首屏 slim 模式不再用于主加载。

**不在范围：**
- 不删 slim 机制（Find Crew 仍用）。
- 不改 roster/pairing 加载（已分批）。
- 不影响其他服务（已确认无外部消费方）。

---

## 1. 现状

- `crewService.list`（live-server）全量分支已内联 ranks/bases/fleets 历史数组，slim 分支（`view=gantt-panel`）只带当前值。
- gantt `fetchCrews` 调 `crewApi.list(params)`（不带 view = 全量），响应已含 ranks/bases/fleets。
- `crewInfoFromStore`（gantt）从 store 读 ranks/bases/fleets，但 qual/cert/team 仍需 3 个后端请求。

**数据规模（UAT 实测）：**
| 表 | 行数 | 磁盘 |
|----|------|------|
| crew_qualification | 1273 | 2.5MB |
| crew_certificate | 11128 | 21MB |
| crew_team | 11464 | 13MB |

JSON 传输（选中列）：cert+team ≈ 2-3MB。crew full 当前 1.29MB → 加内联后 ~4-5MB。分批每批 ~200 crew 约 1-1.5MB。

**消费方确认：**
- gantt `fetchCrews`（全量）— 改造受益。
- live-server Data tab（`routes/data` crew case）— 分页全量，只读所需字段，响应变大但不破坏。
- gantt `fetchCrewsByIds`/getInfo/bootstrap（slim）— 保留 slim。
- 无外部服务调 `/api/crew`。

---

## 2. 设计

### 2.1 后端 `crew-service.list` 全量分支加内联

在 `live-server/src/services/crew/crew-service.ts`：
- 加 3 个 `inArray` 批量查询（`crewQualification`/`crewCertificate`/`crewTeam` 全表 select，这些表无 is_deleted）。
- `needHistory=true`（全量）时并行执行，按 `crewId` 分组。
- 附加到 crew 对象：`qualifications` / `certifications` / `teams`（与 ranks/bases/fleets 同结构）。
- slim 分支（`needHistory=false`）不加（Find Crew/getInfo 用 slim，保持轻量）。

**查询形状：**
```ts
const fullQualQuery = fastify.db.select().from(crewQualification).where(inArray(crewQualification.crewId, crewIds))
const fullCertQuery = fastify.db.select().from(crewCertificate).where(inArray(crewCertificate.crewId, crewIds))
const fullTeamQuery = fastify.db.select().from(crewTeam).where(inArray(crewTeam.crewId, crewIds))
```
（与现有 fullRank/Base/Fleet 并行，`Promise.all` 一次取 9 个表。）

### 2.2 前端类型 + 加载

**`Crew` 类型**（`gantt/src/types/crew.ts`）加：
```ts
qualifications?: CrewQualificationRecord[]
certifications?: CrewCertificateRecord[]
teams?: CrewTeamRecord[]
```
（`CrewQualificationRecord`/`CrewCertificateRecord`/`CrewTeamRecord` 已存在。）

**`fetchCrews` 改分批**（`crew-store.ts`）：
- 按 ~200 crew 拆批，并发 `crewApi.list({ crewIds: batch, pageSize: 0 })`（全量，含内联）。
- 失败批**递归对半切小重试**（与 `loadRosterBatched` 同模式）。
- 合并 `items`/`selectedCrewIds`，一次 set。
- 移除 `markPartiallyLoaded` 依赖（不再是"首屏 40 + 后台全量"两轮）。

> 注意：`crewApi.list` 支持 `crewIds` 参数（现有 `fetchCrewsByIds` 已用），可复用。

### 2.3 CrewInfo 零后端请求

**`crewInfoFromStore`**（`crew-store.ts`）：
- 从 store 读全部 6 类：`ranks/bases/fleets/qualifications/certifications/teams`（都内联在 Crew 上）。
- 不再发 qual/cert/team 后端请求。
- store 未命中（如 slim 加载的 Find Crew crew）仍回退 `crewApi.getInfo` 全量。

---

## 3. 测试

- **后端**：`crew-service.list` 单测——全量模式返回含 qual/cert/team；slim 模式不含；分组正确。
- **前端**：`crewInfoFromStore` 单测——从 store 读 6 类，不发 qual/cert/team 请求；store 未命中回退。
- **E2E**：CrewInfo 打开时**零网络请求**（无 `/api/crew/:id/qualifications|certificates|teams`）；crew 分批加载 + 进度条。
- **回归**：load-progress、Live-1095、空态、CrewInfo E2E。

---

## 4. 文件改动清单

| 文件 | 改动 |
|------|------|
| `live-server/src/services/crew/crew-service.ts` | 全量分支加 3 个 inArray 查询 + 分组内联 |
| `live-server/src/services/crew/__tests__/crew-service-list.test.ts` | 新增内联单测 |
| `gantt/src/types/crew.ts` | Crew 加 3 字段 |
| `gantt/src/stores/crew-store.ts` | fetchCrews 分批 + crewInfoFromStore 读 6 类 |
| `gantt/src/stores/gantt-view-store.ts` | 若引用 removed crew 分批，调整 |
| `gantt/src/utils/apply-filters.ts` | fetchCrews 调用点 |
| 单测 + E2E | 见 §3 |

---

## 5. 风险与取舍

- **crew full 响应增大**（1.29MB → ~4-5MB）：分批 + 进度条缓解首屏感知；Data tab 分页不受影响。
- **后端 list 9 表并行**：queries 增加，但都是 `inArray` 索引查询（有 crew_id 索引），数据量小（24K 行）。实测后再确认耗时。
- **Find Crew/getInfo 保留 slim**：不破坏现有快速路径；仅全量加载路径受益。
- 若 crew full 内联后太大，可再评估"分两批"（主 crew 一批 + qual/cert/team 一批），但首选单接口（用户倾向内联）。
