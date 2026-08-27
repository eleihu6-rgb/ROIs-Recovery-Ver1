# PO 引擎 API 规格

> 以 PO 为例说明，RO / TO / BO 引擎遵循完全相同的 URL 模式和语义。
> 将路径中的 `po` 替换为对应引擎代码即可。

---

## 一、核心设计原则

| 原则 | 说明 |
|------|------|
| `workset_id` 是主键 | 所有操作以场景工作集 ID 为核心，而非临时 job_id |
| 同场景互斥运行 | 同一 `workset_id` 只允许一个 RUNNING 状态的任务，拒绝并发提交 |
| 多次运行保留 | 同一 `workset_id` 可多次运行，每次分配自增 `run_id`（001、002…） |
| 结果独立对比 | 任意两次运行的 KPI 可直接对比，由调用方选择回写哪次 |
| 回写明确指定 | 回写必须指定 `run_id`，不自动回写最新结果 |

---

## 二、API 总览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/po/worksets/{workset_id}/runs` | 提交新的优化运行 |
| GET | `/api/po/worksets/{workset_id}/runs` | 列出该场景的所有运行历史 |
| GET | `/api/po/worksets/{workset_id}/runs/{run_id}` | 查询指定运行状态 + 进度 |
| DELETE | `/api/po/worksets/{workset_id}/runs/{run_id}` | 取消正在运行的任务 |
| GET | `/api/po/worksets/{workset_id}/compare` | 对比多次运行 KPI |
| POST | `/api/po/worksets/{workset_id}/runs/{run_id}/writeback` | 将指定运行回写 Live |
| GET | `/api/po/worksets/{workset_id}/runs/{run_id}/input` | 下载 input.gz（调试） |
| GET | `/api/po/worksets/{workset_id}/runs/{run_id}/output` | 下载 out.gz（调试） |
| GET | `/api/po/health` | 健康检查 |

---

## 三、POST /api/po/worksets/{workset_id}/runs — 提交新运行

### 请求

```json
POST /api/po/worksets/99/runs
Content-Type: application/json

{
  "airline": "f8",
  "startDate": "2026-05-01",
  "endDate": "2026-05-31",
  "fleet": "320",
  "baseAirports": ["PEK", "SHA"],
  "division": "P",
  "ruleGroupCode": "CAAC_FTL",
  "timeLimitSeconds": 300,
  "weights": {
    "wPairings": 1000,
    "wDeadhead": 500,
    "wDutyTime": 1,
    "wPenalty": 100
  },
  "notes": "调整权重，减少死飞"
}
```

### 响应（202 Accepted — 已入队）

```json
{
  "code": 202,
  "data": {
    "worksetId": 99,
    "runId": "002",
    "status": "PENDING",
    "estimatedSeconds": 120,
    "createdAt": "2026-05-01T14:22:00Z"
  },
  "message": "Run queued"
}
```

### 响应（409 Conflict — 已有运行中的任务）

```json
{
  "code": 409,
  "data": {
    "worksetId": 99,
    "runId": "001",
    "status": "RUNNING",
    "startedAt": "2026-05-01T10:00:05Z",
    "elapsedSeconds": 87,
    "progress": 45
  },
  "message": "Workset 99 already has a running job (run_001). Cancel it first or wait for completion."
}
```

> **互斥逻辑**：提交时检查 Redis 锁 `optimizer:lock:po:{workset_id}`。
> 若锁存在且对应任务仍为 RUNNING → 拒绝，返回 409。
> 锁的 TTL 设为 `timeLimitSeconds × 1.5`，防止 Worker 崩溃时锁永久不释放。

---

## 四、GET /api/po/worksets/{workset_id}/runs — 列出所有运行

### 响应

```json
{
  "code": 200,
  "data": {
    "worksetId": 99,
    "runs": [
      {
        "runId": "001",
        "status": "DONE",
        "startedAt": "2026-05-01T10:00:05Z",
        "completedAt": "2026-05-01T10:03:12Z",
        "solveTimeSec": 187.3,
        "kpi": {
          "totalPairings": 98,
          "coveragePct": 100.0,
          "totalDeadheads": 12,
          "avgDutyMin": 420.5
        },
        "writebackScenarioId": 42,
        "notes": ""
      },
      {
        "runId": "002",
        "status": "DONE",
        "startedAt": "2026-05-01T14:22:00Z",
        "completedAt": "2026-05-01T14:25:44Z",
        "solveTimeSec": 224.1,
        "kpi": {
          "totalPairings": 95,
          "coveragePct": 100.0,
          "totalDeadheads": 8,
          "avgDutyMin": 435.0
        },
        "writebackScenarioId": null,
        "notes": "调整权重，减少死飞"
      },
      {
        "runId": "003",
        "status": "RUNNING",
        "startedAt": "2026-05-02T09:10:00Z",
        "completedAt": null,
        "progress": 62,
        "phase": "solving",
        "notes": ""
      }
    ]
  },
  "message": "ok"
}
```

数据来源：读取 `runs.csv` 索引文件 + 查询 Redis 获取 RUNNING 任务的实时进度。

---

## 五、GET /api/po/worksets/{workset_id}/runs/{run_id} — 查询指定运行

### 响应（RUNNING）

```json
{
  "code": 200,
  "data": {
    "worksetId": 99,
    "runId": "003",
    "status": "RUNNING",
    "progress": 62,
    "phase": "solving",
    "phaseDetail": "MIP: best bound gap 2.1%, elapsed 74s / 300s limit",
    "startedAt": "2026-05-02T09:10:00Z",
    "elapsedSeconds": 74
  },
  "message": "ok"
}
```

### 响应（DONE）

```json
{
  "code": 200,
  "data": {
    "worksetId": 99,
    "runId": "002",
    "status": "DONE",
    "startedAt": "2026-05-01T14:22:00Z",
    "completedAt": "2026-05-01T14:25:44Z",
    "solveTimeSec": 224.1,
    "kpi": {
      "totalFlights": 486,
      "totalPairings": 95,
      "coveragePct": 100.0,
      "totalDeadheads": 8,
      "avgDutyMin": 435.0,
      "avgTafbMin": 1410.0,
      "totalFltMin": 58320
    },
    "writebackScenarioId": null,
    "outputAvailable": true,
    "notes": "调整权重，减少死飞"
  },
  "message": "ok"
}
```

### 响应（FAILED）

```json
{
  "code": 200,
  "data": {
    "worksetId": 99,
    "runId": "003",
    "status": "FAILED",
    "errorCode": "INFEASIBLE",
    "errorMessage": "No feasible solution found under current constraints.",
    "suggestions": [
      "检查 PEK 基地航班是否存在孤立子集（无法形成回路）",
      "尝试放宽最大 TAFB 限制（当前 72h）"
    ]
  },
  "message": "ok"
}
```

---

## 六、DELETE /api/po/worksets/{workset_id}/runs/{run_id} — 取消运行

```
DELETE /api/po/worksets/99/runs/003
```

```json
{
  "code": 200,
  "data": { "worksetId": 99, "runId": "003", "status": "CANCELLED" },
  "message": "Run cancelled"
}
```

Worker 在下一个 checkpoint（约每 10 秒）检查 Redis 取消标志并优雅退出，释放互斥锁。

---

## 七、GET /api/po/worksets/{workset_id}/compare — 对比多次运行

### 请求

```
GET /api/po/worksets/99/compare?runs=001,002
```

### 响应

```json
{
  "code": 200,
  "data": {
    "worksetId": 99,
    "runs": [
      {
        "runId": "001",
        "status": "DONE",
        "solveTimeSec": 187.3,
        "notes": "",
        "kpi": {
          "totalPairings": 98,
          "totalDeadheads": 12,
          "avgDutyMin": 420.5,
          "avgTafbMin": 1380.0,
          "coveragePct": 100.0
        }
      },
      {
        "runId": "002",
        "status": "DONE",
        "solveTimeSec": 224.1,
        "notes": "调整权重，减少死飞",
        "kpi": {
          "totalPairings": 95,
          "totalDeadheads": 8,
          "avgDutyMin": 435.0,
          "avgTafbMin": 1410.0,
          "coveragePct": 100.0
        }
      }
    ],
    "diff": {
      "totalPairings":  { "001": 98,    "002": 95,    "delta": -3,   "better": "002" },
      "totalDeadheads": { "001": 12,    "002": 8,     "delta": -4,   "better": "002" },
      "avgDutyMin":     { "001": 420.5, "002": 435.0, "delta": +14.5, "better": "001" },
      "solveTimeSec":   { "001": 187.3, "002": 224.1, "delta": +36.8, "better": "001" }
    }
  },
  "message": "ok"
}
```

最多支持同时对比 **10** 次运行。

---

## 八、POST /api/po/worksets/{workset_id}/runs/{run_id}/writeback — 回写 Live

将选定的运行结果写入 Live Server（创建场景 + 写入配对 + 写入 KPI）。

### 请求

```json
POST /api/po/worksets/99/runs/002/writeback
Content-Type: application/json

{
  "airline": "f8"
}
```

### 响应（200 OK）

```json
{
  "code": 200,
  "data": {
    "worksetId": 99,
    "runId": "002",
    "scenarioId": 43,
    "pairingsWritten": 95,
    "status": "DONE"
  },
  "message": "Run 002 written back to Live Server as scenario 43"
}
```

- 回写成功后，`runs.csv` 中该行的 `writeback_scenario_id` 字段自动更新为 `43`
- 同一 run 可多次回写（创建多个 scenario，每次生成新的 `scenario_id`）

---

## 九、文件下载（调试）

```
GET /api/po/worksets/99/runs/002/input    → 返回 input.gz（二进制流）
GET /api/po/worksets/99/runs/002/output   → 返回 out.gz（二进制流）
```

响应头：
```
Content-Type: application/gzip
Content-Disposition: attachment; filename="po_w99_r002_input.gz"
```

---

## 十、进度阶段定义

| phase | 说明 | 进度区间 |
|-------|------|---------|
| `loading` | 加载航班数据 + 规则配置 | 0–5% |
| `compiling` | 编译法规约束 | 5–8% |
| `building_graph` | 构建航班网络图 | 8–15% |
| `generating_duties` | 枚举合法值勤期候选 | 15–40% |
| `generating_pairings` | 枚举合法配对候选 | 40–60% |
| `solving` | MIP / 列生成求解 | 60–90% |
| `extracting` | 提取结果 + 写文件 | 90–100% |

---

## 十一、与 Live Server 的集成

### Live Server 调用 PO Engine

```typescript
// live-server: po-engine-client.ts
export class PoEngineClient {
  async submitRun(worksetId: number, params: PoRunParams): Promise<{ runId: string }> {
    const res = await this.http.post(`/api/po/worksets/${worksetId}/runs`, params)
    return res.data
  }

  async listRuns(worksetId: number): Promise<PoRunSummary[]> {
    const res = await this.http.get(`/api/po/worksets/${worksetId}/runs`)
    return res.data.runs
  }

  async pollRun(worksetId: number, runId: string): Promise<PoRunStatus> {
    const res = await this.http.get(`/api/po/worksets/${worksetId}/runs/${runId}`)
    return res.data
  }

  async writeback(worksetId: number, runId: string, airline: string): Promise<number> {
    const res = await this.http.post(
      `/api/po/worksets/${worksetId}/runs/${runId}/writeback`,
      { airline }
    )
    return res.data.scenarioId
  }

  async compareRuns(worksetId: number, runIds: string[]): Promise<PoComparison> {
    const res = await this.http.get(
      `/api/po/worksets/${worksetId}/compare?runs=${runIds.join(',')}`
    )
    return res.data
  }
}
```

### Gantt 前端轮询示例

```typescript
// gantt: usePoRun hook
export function usePoRun(worksetId: number, runId: string | null) {
  const [status, setStatus] = useState<PoRunStatus | null>(null)

  useEffect(() => {
    if (!runId) return
    const interval = setInterval(async () => {
      const s = await liveApi.pollPoRun(worksetId, runId)
      setStatus(s)
      if (['DONE', 'FAILED', 'CANCELLED', 'TIMEOUT'].includes(s.status)) {
        clearInterval(interval)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [worksetId, runId])

  return status
}
```

---

## 十二、健康检查

```json
GET /api/po/health

{
  "code": 200,
  "data": {
    "status": "healthy",
    "workers": { "total": 4, "busy": 1, "idle": 3 },
    "queue":   { "pending": 0, "running": 1 },
    "locks":   { "active": ["po:lock:99"] },
    "redis":      "connected",
    "liveServer": "reachable",
    "ruleEngine": "reachable"
  },
  "message": "ok"
}
```

---

## 十三、错误码

| errorCode | 含义 | 建议操作 |
|-----------|------|---------|
| `ALREADY_RUNNING` | 该 workset 已有任务运行中 | 等待完成或取消后重试 |
| `INFEASIBLE` | 约束矛盾，无可行解 | 检查基地机场、放宽软约束 |
| `TIMEOUT` | 超出时间限制，已返回当前最优解 | 查看结果是否可接受 |
| `NO_FLIGHTS` | 指定日期范围无航班数据 | 检查 Live Server 数据 |
| `RULE_CONFIG_ERROR` | 法规配置获取失败 | 检查 Rule Engine 状态 |
| `INTERNAL_ERROR` | Worker 内部错误 | 查看 Worker 日志 |
| `RUN_NOT_FOUND` | 指定 run_id 不存在 | 检查 workset_id 和 run_id |
| `OUTPUT_NOT_READY` | out.gz 尚未生成（任务未完成） | 等待任务完成后再操作 |
