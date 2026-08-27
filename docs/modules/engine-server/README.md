# Engine Server — 优化引擎调度服务

**版本**：1.0  
**日期**：2026-04-16  
**状态**：已实现（MVP）  
**作者**：yuan.zhu + Claude Sonnet 4.6

---

## 一、定位

Engine Server 是 ROIS-AI 系统中**所有优化引擎的统一调度层**，负责管理 PO / RO / TO / Rule 四类优化器的完整生命周期。

```
Gantt UI
    │ HTTP（触发优化、轮询进度）
    ▼
Live Server（:3000）
    │ HTTP  POST /api/engine-server/optimize/start
    ▼
Engine Server（:3003）          ← 本服务
    │ subprocess（按需启动）
    ├──▶ PO Engine（黑盒进程，无常驻端口）
    ├──▶ RO Engine（黑盒进程，无常驻端口）
    ├──▶ TO Engine（黑盒进程，无常驻端口）
    └──▶ Rule Engine 脚本（黑盒进程）
```

**黑盒原则**：PO / RO / TO / Rule 引擎均为纯进程，不开 HTTP 端口，不连数据库，只由 Engine Server 按需启动。优化完成后进程自动退出。

---

## 二、服务端口总览

| 服务 | 端口 | 技术栈 | 说明 |
|------|------|--------|------|
| live-server | 3000 | Fastify + TypeScript | 排班业务主服务 |
| rule-engine | 3001 | Node.js HTTP | 法规计算 HTTP 接口 |
| pbs-server | 3002 | Fastify + TypeScript | PBS 竞标后端 |
| **engine-server** | **3003** | **FastAPI + Python** | **优化引擎调度（本服务）** |
| gantt | 5173 | React + Vite | 排班前端（dev） |
| pbs-portal | 5174 | React + Vite | PBS 前端（dev） |
| po-engine | — | Python 黑盒进程 | 配对优化，由 engine-server 启动 |
| ro-engine | — | Python 黑盒进程 | 排班优化，由 engine-server 启动 |

---

## 三、模块调用链

### 3.1 PO 优化完整链路

```
排班员在 Gantt UI 点击「运行 PO 优化」
    │
    ▼
Live Server (3000)
    ├── 收到触发请求，校验 workset_id、权限
    └── POST http://engine-server:3003/api/optimize/start
        {
          "airline": "f8",
          "type": "PO",
          "parameters": { "scenarioId": 99 },
          "url": "http://live-server:3000",
          "token": "<JWT>"
        }
            │
            ▼
        Engine Server (3003)
            ├── 认证（JWT / API Key）
            ├── 分配 task_id（UUID）
            ├── GET {live-server}/api/orengine/po/comptxt  ← 拉取 input 数据
            ├── 写入 workspace/{airline}/{task}/input.gz
            ├── subprocess: python -m po_engine --input ... --output ...
            │       └── 子进程运行中 → stdout 解析 PROGRESS:N
            ├── 完成后 POST {live-server}/api/orengine/po/solution  ← 回写结果
            └── 归档文件至 finished/{airline}/{task}/

    ◀── 202 { task_id: "abc123" }
    │
    ▼
Live Server 返回 task_id 给 Gantt
    │
    ▼  （前端每 3 秒轮询）
GET /api/optimize/progress/{task_id}
    └── { progress: 65, status: "running" }
```

### 3.2 RO 优化链路

RO 优化依赖 PO 的输出结果作为输入。典型触发顺序：

```
PO 优化完成（Live Server 已有配对数据）
    │
    ▼
触发 RO 优化
    │  POST /api/optimize/start { type: "RO", parameters: { scenarioId: 99 } }
    ▼
Engine Server
    ├── GET {live-server}/api/orengine/ro/comptxt  ← 读取包含PO配对的数据
    ├── subprocess: python -m ro_engine --input ... --output ...
    └── POST {live-server}/api/orengine/ro/solution
```

### 3.3 Rule 引擎链路

Rule 优化按类别区分（change_flight / manday / manday_byCrew），每种类别有独立的 input/output URL：

```
POST /api/optimize/start
{
  "type": "Rule",
  "parameters": { "category": "manday", "scenarioId": 99 }
}
    │
    ▼
Engine Server
    ├── 按 category 查找配置的 URL 和脚本路径
    ├── GET {live-server}/api/orengine/ro/partial/comptxt
    ├── subprocess: ./F8/rule_manday.sh
    └── POST {live-server}/api/crewMandayFd/partlySave/csv/comp
```

---

## 四、认证与调用方式

Engine Server 支持三层认证，调用方根据场景选择：

| 认证方式 | 适用场景 | Header |
|---------|---------|--------|
| JWT（推荐） | Live Server 转发用户请求 | `Authorization: Bearer <JWT>` |
| API Key | 服务间调用（无用户态） | `X-API-Key: <key>` |
| Bearer Token | 向后兼容旧客户端 | `Authorization: Bearer <static>` |

**JWT 透传**：Live Server 调用 Engine Server 时，将用户 JWT 透传，Engine Server 再将同一 JWT 用于调用 Live Server 接口，无需二次登录。

### Live Server 调用示例（TypeScript）

```typescript
// live-server: engine-server-client.ts
export class EngineServerClient {
  private baseUrl = process.env.ENGINE_SERVER_URL ?? 'http://localhost:3003'

  async startOptimization(params: {
    airline: string
    type: 'PO' | 'RO' | 'TO' | 'Rule'
    scenarioId: number
    jwtToken: string
  }): Promise<{ taskId: string }> {
    const res = await fetch(`${this.baseUrl}/api/optimize/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${params.jwtToken}`,
        'X-Airline': params.airline,
      },
      body: JSON.stringify({
        airline: params.airline,
        type: params.type,
        parameters: { scenarioId: params.scenarioId },
        url: process.env.LIVE_SERVER_URL ?? 'http://localhost:3000',
      }),
    })
    const data = await res.json()
    return { taskId: data.task_id }
  }

  async getProgress(taskId: string, jwtToken: string): Promise<{
    progress: number
    status: string
  }> {
    const res = await fetch(`${this.baseUrl}/api/optimize/progress/${taskId}`, {
      headers: { 'Authorization': `Bearer ${jwtToken}` },
    })
    return res.json()
  }

  async stopOptimization(taskId: string, jwtToken: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/optimize/stop/${taskId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${jwtToken}` },
    })
  }
}
```

### Gantt 前端轮询示例（TypeScript）

```typescript
// gantt: useOptimizeRun hook
export function useOptimizeRun(taskId: string | null) {
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<'running' | 'completed' | 'failed'>('running')

  useEffect(() => {
    if (!taskId) return
    const interval = setInterval(async () => {
      const res = await liveApi.getOptimizeProgress(taskId)
      setProgress(res.progress)
      setStatus(res.status)
      if (['completed', 'failed', 'stopped'].includes(res.status)) {
        clearInterval(interval)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [taskId])

  return { progress, status }
}
```

---

## 五、Live Server 需实现的 Engine Server 接入接口

Live Server 需对外暴露以下接口供 Engine Server 回调：

### 5.1 Input 接口（Engine Server 拉取输入数据）

| 引擎 | 方法 | 路径 | 说明 |
|------|------|------|------|
| PO | GET | `/api/orengine/po/comptxt` | 返回 PO 优化输入数据（gzip） |
| RO | GET | `/api/orengine/ro/comptxt` | 返回 RO 优化输入数据（gzip） |
| TO | GET | `/api/orengine/to/comptxt` | 返回 TO 优化输入数据（gzip） |
| Rule/change_flight | GET | `/api/orengine/byFlight/comptxt` | Rule 按航班输入 |
| Rule/manday | GET | `/api/orengine/ro/partial/comptxt` | Manday 规则输入 |
| Rule/manday_byCrew | GET | `/api/orengine/byCrew/comptxt` | 按机组 Manday 输入 |

### 5.2 Output 接口（Engine Server 回写优化结果）

| 引擎 | 方法 | 路径 | 说明 |
|------|------|------|------|
| PO | POST | `/api/orengine/po/solution` | 写入 PO 配对结果 |
| RO | POST | `/api/orengine/ro/solution` | 写入 RO 排班结果 |
| TO | POST | `/api/orengine/to/solution` | 写入 TO 培训排班结果 |
| Rule/change_flight | POST | `/api/orengine/byFlight/save/csv` | Change flight 规则结果 |
| Rule/manday | POST | `/api/crewMandayFd/partlySave/csv/comp` | Manday 结果 |
| Rule/manday_byCrew | POST | `/api/crewMandayFd/partlySave/csv/comp` | 按机组 Manday 结果 |

---

## 六、Engine Server API 速览

完整 API 规格见 [documents/api_documentation.md](./documents/api_documentation.md)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/optimize/start` | 启动优化任务 |
| POST | `/api/optimize/stop/{task_id}` | 停止任务（SIGTERM） |
| GET | `/api/optimize/status/{task_id}` | 查询任务状态 |
| GET | `/api/optimize/progress/{task_id}` | 查询进度（0–100） |
| GET | `/api/optimizers` | 获取当前航司可用优化器列表 |
| GET | `/api/tasks/running` | 查询当前运行中任务 |
| GET | `/api/tasks/all` | 查询所有任务（含历史） |
| GET | `/api/system/info` | 服务版本 + git 信息 |

---

## 七、配置与部署

### 7.1 环境变量

```bash
JWT_SECRET=<与 Live Server 共享的 JWT 密钥>
ROIS_API_KEY=<服务间调用 API Key>
```

### 7.2 本地启动

```bash
cd engine-server
cp src/config/config.yaml.example config.yaml
# 编辑 config.yaml 填入 JWT_SECRET 等
python3 main.py
# 服务启动在 http://localhost:3003
```

### 7.3 生产部署（无源码）

```bash
# 构建单文件可执行包
./build.sh
./deploy.sh pack

# 目标机解压部署
tar -xzf rois-optimizer-server.tar.gz
cp config.yaml.example config.yaml && vi config.yaml
./deploy.sh install && ./deploy.sh start
```

详细部署流程见 [documents/deployment_guide.md](./documents/deployment_guide.md)

### 7.4 docker-compose 集成

```yaml
# docker-compose.yml（添加 engine-server）
services:
  engine-server:
    image: rois/engine-server:latest
    ports:
      - "3003:3003"
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - ROIS_API_KEY=${ROIS_API_KEY}
    volumes:
      - ./engine-server/config.yaml:/app/config.yaml:ro
      - optimizer-workspace:/app/workspace
      - optimizer-finished:/app/finished
    depends_on:
      - live-server
    networks:
      - rois-net
```

---

## 八、文档索引

| 文档 | 内容 |
|------|------|
| [documents/api_documentation.md](./documents/api_documentation.md) | 完整 API 端点、请求/响应格式、认证示例 |
| [documents/system_architecture.md](./documents/system_architecture.md) | 分层架构、模块关系 |
| [documents/auth_design_proposal.md](./documents/auth_design_proposal.md) | JWT / API Key 认证设计 |
| [documents/architecture_review.md](./documents/architecture_review.md) | 架构审查报告、问题清单 |
| [documents/deployment_guide.md](./documents/deployment_guide.md) | 环境准备、配置、启动、多机部署 |
| [documents/optimize_server_requirements.md](./documents/optimize_server_requirements.md) | 功能/非功能需求 |
| [documents/optimize_server_implementation_plan.md](./documents/optimize_server_implementation_plan.md) | 10 个任务的开发计划 |
