# ROIS-AI 监控系统架构

> 日志采集、服务健康监控、定时任务调度一体化方案

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                   监控服务器（独立部署）                          │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  Prometheus  │  │    Loki      │  │      Windmill         │ │
│  │   :9090      │  │   :3100      │  │       :8000           │ │
│  │  指标存储     │  │  日志存储     │  │    定时任务调度        │ │
│  └───────┬──────┘  └───────┬──────┘  └───────────────────────┘ │
│          │                 │                                    │
│  ┌───────▼─────────────────▼───────────────────────────────┐   │
│  │                    Grafana :3001                        │   │
│  │              （日志 + 指标 统一仪表盘）                    │   │
│  │              （告警规则 + 通知渠道）                       │   │
│  └────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   应用服务器 1   │  │   应用服务器 2   │  │   应用服务器 N   │
│  live-server    │  │  engine-server  │  │  pbs-server     │
│  rule-engine    │  │  po-engine      │  │  pbs-portal     │
│  connector      │  │  ro-engine      │  │                 │
│                 │  │                 │  │                 │
│ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │
│ │  Promtail   │ │  │ │  Promtail   │ │  │ │  Promtail   │ │
│ │  日志采集    │ │  │ │  日志采集    │ │  │ │  日志采集    │ │
│ └─────────────┘ │  │ └─────────────┘ │  │ └─────────────┘ │
│ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │
│ │Node Exporter│ │  │ │Node Exporter│ │  │ │Node Exporter│ │
│ │  系统指标    │ │  │ │  系统指标    │ │  │ │  系统指标    │ │
│ └─────────────┘ │  │ └─────────────┘ │  │ └─────────────┘ │
│   :9100         │  │   :9100         │  │   :9100         │
└─────────────────┘  └─────────────────┘  └─────────────────┘

┌─────────────────┐  ┌─────────────────┐
│  PostgreSQL服务器│  │   Redis服务器    │
│                 │  │                 │
│ ┌─────────────┐ │  │ ┌─────────────┐ │
│ │postgres_exp │ │  │ │redis_exporter│ │
│ │   :9187     │ │  │ │  :9121/9122 │ │
│ └─────────────┘ │  │ └─────────────┘ │
└─────────────────┘  └─────────────────┘
```

---

## 数据流

| 数据类型 | 采集方式 | 存储位置 | 可视化 |
|---------|---------|---------|--------|
| 服务日志 | Promtail → Loki | Loki (30天) | Grafana Logs面板 |
| 系统指标 | Node Exporter → Prometheus pull | Prometheus (30天) | Grafana Dashboard |
| 应用指标 | prom-client /metrics → Prometheus pull | Prometheus (30天) | Grafana Dashboard |
| 定时任务 | Windmill Scheduler | PostgreSQL windmill库 | Windmill UI |

---

## 技术选型

| 需求 | 工具 | 版本 | 理由 |
|------|------|------|------|
| 日志存储 | Loki | 3.4.3 | 轻量，无需Elasticsearch，与Grafana原生集成 |
| 日志采集 | Promtail | 3.4.3 | Loki官方客户端，配置简单 |
| 指标存储 | Prometheus | 3.3.1 | 行业标准，生态最成熟 |
| 系统指标 | Node Exporter | 1.8.2 | 官方 exporter，CPU/内存/磁盘全覆盖 |
| PostgreSQL指标 | postgres_exporter | 0.17.0 | 连接数、慢查询、表大小 |
| Redis指标 | redis_exporter | 1.67.0 | 内存、命中率、队列深度 |
| Node.js应用指标 | prom-client | 15.x | 默认Node.js指标 + 自定义Counter/Histogram |
| Python应用指标 | prometheus-client | 0.21.x | FastAPI集成，Histogram buckets |
| 可视化 | Grafana | 11.6.1 | 统一界面展示日志+指标+告警 |
| 定时任务 | Windmill | 1.380.1 | Web UI配置，支持TS/Python，执行历史 |

---

## 端口规划

| 服务 | 端口 | 说明 |
|------|------|------|
| Grafana | 3001 | 监控UI入口 |
| Prometheus | 9090 | 指标查询API |
| Loki | 3100 | 日志写入/查询API |
| Windmill | 8000 | 定时任务UI |
| Node Exporter | 9100 | 系统指标（每台服务器） |
| postgres_exporter | 9187 | PostgreSQL指标 |
| redis_exporter | 9121/9122 | Redis指标（多实例） |
| live-server /metrics | 3000/metrics | Node.js应用指标 |
| pbs-server /metrics | 3002/metrics | Node.js应用指标 |
| rule-engine /metrics | 3001/metrics | Node.js应用指标 |
| connector-server /metrics | 3004/metrics | Node.js应用指标 |
| engine-server /metrics | 3003/metrics | Python应用指标 |

---

## 指标体系

### 默认指标（prom-client collectDefaultMetrics）

| 指标 | 说明 |
|------|------|
| `process_cpu_user_seconds_total` | CPU使用时间 |
| `process_resident_memory_bytes` | 内存使用 |
| `nodejs_eventloop_lag_seconds` | 事件循环延迟 |
| `nodejs_active_requests_total` | 活跃HTTP请求 |
| `nodejs_heap_size_total_bytes` | 堆内存大小 |

### 自定义指标（业务级）

| 服务 | 指标 | 类型 | 说明 |
|------|------|------|------|
| engine-server | `rois_engine_server_optimization_jobs_total` | Counter | 优化任务总数（optimizer_type, status标签） |
| engine-server | `rois_engine_server_optimization_job_duration_seconds` | Histogram | 优化任务耗时（buckets: 10,30,60,120,300,600,1800） |

---

## 日志标签策略

```yaml
# Promtail 自动添加的标签
labels:
  job: "live-server"     # 服务名（用于筛选）
  host: "server-01"      # 服务器名（用于定位）
  level: "error"         # 日志级别（从JSON解析）
  airline: "f8"          # 航司代码（可选业务标签）
```

**LogQL 查询示例：**

```logql
# 查询某服务所有错误日志
{job="live-server"} |= "error"

# 查询某服务器所有服务日志
{host="server-01"} | json | level="error"

# 查询多服务某航司日志
{job=~"live-server|pbs-server"} | json | airline="f8"
```

---

## 告警规则

| 触发条件 | 持续时间 | 严重级别 | 说明 |
|---------|---------|---------|------|
| 服务 `/metrics` 不可达 | 2 分钟 | Critical | 服务宕机 |
| HTTP 5xx 错误率 > 1% | 5 分钟 | Warning | 异常响应增多 |
| 事件循环延迟 > 500ms | 5 分钟 | Warning | Node.js 性能瓶颈 |
| PostgreSQL 连接数 > 80% 上限 | 5 分钟 | Warning | 连接池接近耗尽 |
| Redis 内存使用 > 90% | 5 分钟 | Warning | 缓存即将溢出 |
| 磁盘使用 > 85% | 10 分钟 | Warning | 存储空间不足 |

**通知渠道：** Grafana Alerting 原生支持邮件和企业微信 Webhook。

---

## 定时任务（Windmill）

### 核心概念

| 概念 | 说明 |
|------|------|
| Script | TypeScript / Python 代码，任务执行单元 |
| Schedule | 给 Script 绑定 Cron 表达式，支持手动触发 |
| Variable | 统一管理敏感配置（DB连接串、API密钥） |
| Flow | 多步骤任务编排（可选） |

### 与 rois-ai 集成方式

```
Windmill Script
  ├── 调用 live-server / pbs-server HTTP API
  ├── 直连 PostgreSQL 执行 SQL 统计
  └── 调用 engine-server 触发优化任务
```

### 典型业务任务

| 任务 | Cron | 说明 |
|------|------|------|
| daily-roster-summary | 0 2 * * * | 每日02:00，生成昨日排班统计推送企业微信 |
| weekly-report | 0 8 * * 1 | 每周一08:00，生成周报邮件发送 |
| data-sync-check | */30 * * * * | 每30分钟，检查外部系统数据同步状态 |

---

## 相关文档

- [部署实施指南](../../deployment/deployment-guide.md) — 一步步部署流程
- Grafana Dashboard 配置 — 待补充预置仪表盘导入文档
- 告警规则配置 — 待补充告警规则详细配置文档
- Windmill 任务开发 — 待补充定时任务开发指南
