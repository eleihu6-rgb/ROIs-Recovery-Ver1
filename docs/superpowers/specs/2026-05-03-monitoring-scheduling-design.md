# Monitoring & Task Scheduling Design

**Date:** 2026-05-03  
**Topic:** 系统日志监控、健康度监控、定时任务调度  
**Status:** Approved

## Background

ROIS-AI 包含多个 Node.js 和 Python 微服务，部署在多台 Linux 服务器上（无容器编排）。目前缺乏集中式日志采集、服务健康监控和业务级定时任务管理能力。

## Requirements

1. **日志监控**：集中采集所有服务的日志，支持跨服务搜索和过滤
2. **健康监控**：实时监控所有服务的系统指标（CPU、内存、延迟、错误率等），支持告警
3. **定时任务调度**：业务级 Cron 任务，需要 Web UI 配置、手动触发、执行历史查看

## Chosen Approach: Grafana Stack + Windmill

| 需求 | 工具 | 理由 |
|------|------|------|
| 日志采集 | Promtail → Loki | 轻量，无需 Elasticsearch，与 Grafana 原生集成 |
| 健康监控 | Prometheus + Exporters | 行业标准，生态最成熟，Node.js/Python 均有官方客户端 |
| 可视化 | Grafana | 统一界面同时展示日志和指标 |
| 定时任务 | Windmill | 原生支持 TypeScript/Python，有完整的调度 UI |

---

## Section 1: Overall Architecture

```
┌─────────────────────────────────────────────────────┐
│                  监控服务器（独立一台）                │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │Prometheus│  │  Loki    │  │    Windmill      │  │
│  │  :9090   │  │  :3100   │  │    :8000         │  │
│  └────┬─────┘  └────┬─────┘  └──────────────────┘  │
│       │             │                               │
│  ┌────▼─────────────▼──────────────────────────┐   │
│  │              Grafana :3001                  │   │
│  │        （日志 + 指标 统一仪表盘）              │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘

┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  应用服务器 1  │  │  应用服务器 2  │  │  应用服务器 N  │
│ live-server  │  │ pbs-server   │  │ po-engine    │
│ rule-engine  │  │ pbs-portal   │  │ ro-engine    │
│              │  │ connector    │  │ engine-server│
│ ┌──────────┐ │  │ ┌──────────┐ │  │ ┌──────────┐ │
│ │ Promtail │ │  │ │ Promtail │ │  │ │ Promtail │ │
│ └──────────┘ │  │ └──────────┘ │  │ └──────────┘ │
│ Node Exporter│  │ Node Exporter│  │ Node Exporter│
└──────────────┘  └──────────────┘  └──────────────┘
```

**数据流：**
- 每台应用服务器运行 Promtail（推送日志到 Loki）和 Node Exporter（暴露系统指标）
- 每个 Node.js 服务在 `/metrics` 暴露 prom-client 指标；Python 服务通过独立端口暴露
- Prometheus 从所有服务器 pull 指标
- Grafana 统一查询 Prometheus（指标）和 Loki（日志）
- Windmill 独立部署，通过 HTTP 调用各服务 API 或直连 PostgreSQL 执行业务任务

---

## Section 2: Log Monitoring (Promtail + Loki)

### Loki（监控服务器）

单节点模式，数据持久化到本地磁盘，保留 30 天（`retention_period: 720h`）。无需 Elasticsearch。

### Promtail（每台应用服务器）

监听各服务的日志文件或 stdout，打标签后推送到 Loki。

**标签策略：**
```yaml
labels:
  job: "live-server"     # 服务名
  host: "server-01"      # 所在服务器
  level: "error"         # 从日志内容解析
  airline: "f8"          # 可选业务标签
```

### 服务日志格式要求

- **Node.js 服务（Fastify）**：使用内置 pino，输出 JSON 格式（生产环境禁用 pino-pretty）
- **Python 服务**：使用 `structlog` 输出 JSON 格式

JSON 日志示例：
```json
{"level":"error","time":1714732800000,"msg":"DB connection failed","service":"live-server","airline":"f8"}
```

### Grafana 查询示例

```logql
{job="live-server"} |= "error"                        # 某服务所有 error
{host="server-01"} | json | level="error"             # 某服务器所有 error
{job=~"live-server|pbs-server"} | json | airline="f8" # 多服务 f8 航司日志
```

---

## Section 3: Health Monitoring (Prometheus + Grafana)

### Exporter 清单

| Exporter | 端口 | 监控内容 | 部署位置 |
|----------|------|---------|---------|
| Node Exporter | 9100 | CPU、内存、磁盘、网络 | 每台应用服务器 |
| prom-client（Node.js 服务） | 服务端口/metrics | HTTP QPS、响应延迟、事件循环延迟 | 服务内集成 |
| prometheus_client（Python 服务） | 服务端口+99（如 engine-server=3003 → 3102） | 请求数、引擎计算耗时 | 服务内集成 |
| postgres_exporter | 9187 | 连接数、慢查询、表大小、锁等待 | 数据库服务器 |
| redis_exporter | 9121 | 内存使用、命中率、BullMQ 队列深度 | Redis 服务器 |

### 服务集成代码

**Node.js (Fastify)：**
```typescript
import { collectDefaultMetrics, register } from 'prom-client'

collectDefaultMetrics({ prefix: 'rois_' })

fastify.get('/metrics', async (_, reply) => {
  reply.header('Content-Type', register.contentType)
  return register.metrics()
})
```

**Python (FastAPI)：**
```python
from prometheus_client import start_http_server, Counter, Histogram
import threading

# 在应用启动时调用
def start_metrics_server(port: int = 8099):
    thread = threading.Thread(target=start_http_server, args=(port,), daemon=True)
    thread.start()
```

### Grafana 预置仪表盘（直接导入 ID）

| 服务 | Dashboard ID |
|------|-------------|
| 系统（CPU/内存/磁盘） | 1860 |
| Node.js 应用 | 11159 |
| PostgreSQL | 9628 |
| Redis | 11835 |

### 告警规则

| 触发条件 | 持续时间 | 严重级别 |
|---------|---------|---------|
| 服务 `/metrics` 不可达 | 2 分钟 | Critical |
| HTTP 5xx 错误率 > 1% | 5 分钟 | Warning |
| 事件循环延迟 > 500ms | 5 分钟 | Warning |
| PostgreSQL 连接数 > 80% 上限 | 5 分钟 | Warning |
| Redis 内存使用 > 90% | 5 分钟 | Warning |
| 磁盘使用 > 85% | 10 分钟 | Warning |

**告警通知渠道：** Grafana Alerting 原生支持邮件和企业微信 Webhook，无需额外工具。

---

## Section 4: Task Scheduling (Windmill)

### 部署

监控服务器上独立运行。Windmill 需要 PostgreSQL，可复用现有 PostgreSQL 服务（新建 `windmill` 数据库，独立于 `rois`）。

**访问地址：** `http://<监控服务器IP>:8000`（独立服务器，不与应用服务器混部署）

### 核心概念

| 概念 | 说明 |
|------|------|
| Script | TypeScript / Python 代码，任务执行单元 |
| Schedule | 给 Script 绑定 Cron 表达式，支持手动触发 |
| Variable | 统一管理敏感配置（DB 连接串、API 密钥） |
| Flow | 多步骤任务编排（可选，复杂场景使用） |

### 与 rois-ai 集成方式

```
Windmill Script
  ├── 调用 live-server / pbs-server HTTP API
  ├── 直连 PostgreSQL 执行 SQL 统计
  └── 调用 engine-server 触发优化任务
```

### 典型业务任务示例

```typescript
// 每天 02:00 生成排班统计
import { Client } from "pg"

export async function main() {
  const db = new Client(Deno.env.get("ROIS_F8_DB_URL"))
  await db.connect()
  const { rows } = await db.query(`
    SELECT COUNT(*) as total, SUM(CASE WHEN is_deleted=1 THEN 1 ELSE 0 END) as cancelled
    FROM f8.roster_flight
    WHERE local_date = CURRENT_DATE - 1
  `)
  await db.end()
  // 推送统计结果到企业微信 Webhook
  await fetch(Deno.env.get("WECHAT_WEBHOOK_URL"), {
    method: "POST",
    body: JSON.stringify({ msgtype: "text", text: { content: `昨日排班统计：${JSON.stringify(rows[0])}` } })
  })
}
```

### Web UI 功能

- 新建/编辑 Schedule，图形化配置 Cron 表达式
- 查看每次执行历史、stdout 输出、失败原因
- 手动触发任意 Schedule
- 任务失败自动重试（可配置重试次数和间隔）
- 内置用户/角色权限管理

---

## Deployment Checklist

### 监控服务器

- [ ] 安装 Docker，使用 docker-compose 启动 Loki、Prometheus、Grafana、Windmill
- [ ] 配置 Prometheus `scrape_configs`，添加所有应用服务器的 exporter 地址
- [ ] 配置 Loki 数据保留策略（30 天）
- [ ] 在 Grafana 添加 Prometheus 和 Loki 两个 Data Source
- [ ] 导入预置仪表盘（Dashboard ID：1860、11159、9628、11835）
- [ ] 配置 Grafana Alerting，绑定邮件/企业微信通知渠道
- [ ] 初始化 Windmill，创建 windmill 数据库

### 每台应用服务器

- [ ] 安装并配置 Promtail，指向 Loki 地址
- [ ] 安装 Node Exporter（`/usr/local/bin/node_exporter`，systemd 托管）
- [ ] 安装 postgres_exporter（数据库服务器）
- [ ] 安装 redis_exporter（Redis 服务器）

### 各服务代码改动

- [ ] live-server：添加 prom-client，暴露 `/metrics`
- [ ] pbs-server：添加 prom-client，暴露 `/metrics`
- [ ] rule-engine：添加 prom-client，暴露 `/metrics`
- [ ] connector-server：添加 prom-client，暴露 `/metrics`
- [ ] engine-server：添加 prometheus_client，启动 metrics server
- [ ] po-engine：添加 prometheus_client，启动 metrics server
- [ ] ro-engine：添加 prometheus_client，启动 metrics server

---

## Constraints & Decisions

- **不引入 Elasticsearch**：Loki 足以满足日志需求，资源占用低 10 倍以上
- **Windmill 复用 PostgreSQL**：新建独立数据库，不与 rois 业务数据混用
- **Promtail 而非 Fluentd/Vector**：Promtail 是 Loki 官方客户端，配置最简单
- **告警通过 Grafana 原生**：不引入额外 Alertmanager，减少组件数量
- **日志保留 30 天**：根据磁盘容量可调整，Loki 配置一行修改
