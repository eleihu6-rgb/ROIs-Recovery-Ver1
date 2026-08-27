# ROIS-AI 部署实施指南

> 生产环境部署完整流程，涵盖应用服务、监控堆栈、数据库配置

---

## 目录

1. [环境准备](#1-环境准备)
2. [数据库部署](#2-数据库部署)
3. [应用服务部署](#3-应用服务部署)
4. [监控堆栈部署](#4-监控堆栈部署)
5. [验证与测试](#5-验证与测试)
6. [运维操作](#6-运维操作)

---

## 1. 环境准备

### 服务器规划

| 服务器 | 角色 | 部署服务 | 最小配置 |
|--------|------|---------|---------|
| 监控服务器 | 监控中枢 | Grafana, Prometheus, Loki, Windmill | 4核 8G 100G SSD |
| 应用服务器1 | 核心业务 | live-server, rule-engine, connector-server | 4核 16G |
| 应用服务器2 | 优化引擎 | engine-server, pbs-engine | 8核 32G |

> Current F8 optimization uses `pbs-engine/` through `engine-server`. `po-engine/` and `ro-engine/` are temporarily retained legacy modules, not current F8 delivery services.
| 数据库服务器 | 数据存储 | PostgreSQL, Redis | 8核 32G 500G SSD |
| PBS服务器 | 机组申请 | pbs-server, pbs-portal | 4核 8G |

### 软件依赖

```bash
# 每台服务器基础环境
sudo apt update
sudo apt install -y docker.io docker-compose-v2 nodejs npm python3.12 python3-pip

# Node.js 版本锁定
sudo npm install -g n
sudo n 20

# Python 虚拟环境（各Python服务目录）
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

## 2. 数据库部署

### PostgreSQL 初始化

```bash
# 1. 安装 PostgreSQL 16
sudo apt install -y postgresql-16

# 2. 创建 rois 数据库
sudo -u postgres psql -c "CREATE DATABASE rois;"

# 3. 创建航司 schema 和用户（使用 init-airline.sh 脚本）
# 脚本会自动完成：创建 Schema → 建表 → seed 数据 → 设置 filiale 约束
cd sql
./init-airline.sh f8

# 或手动执行：
sudo -u postgres psql << 'EOF'
CREATE USER f8 WITH PASSWORD 'Pier2026AIf8';
CREATE SCHEMA f8 AUTHORIZATION f8;
GRANT ALL PRIVILEGES ON SCHEMA f8 TO f8;
ALTER DEFAULT PRIVILEGES IN SCHEMA f8 GRANT ALL ON TABLES TO f8;
ALTER DEFAULT PRIVILEGES IN SCHEMA f8 GRANT ALL ON SEQUENCES TO f8;
EOF

# 4. 手动执行建表和 seed 脚本（如果不用 init-airline.sh）
PGOPTIONS="-c search_path=f8" psql -U f8 -d rois -h localhost -f sql/schema/01-core-tables.sql
PGOPTIONS="-c search_path=f8" psql -U f8 -d rois -h localhost -f sql/seed/01-dictionary.sql
# ... 其他 seed 脚本

# 5. 设置 filiale 大写约束（init-airline.sh 会自动执行）
# 约束强制所有 filiale 值必须大写，防止查询不匹配问题
PGOPTIONS="-c search_path=f8" psql -U f8 -d rois -h localhost -f sql/migration/2026-05-06-filiale-uppercase-default.sql

# 6. 创建 windmill 数据库（监控堆栈）
sudo -u postgres psql -c "CREATE DATABASE windmill;"
```

#### 航司初始化脚本说明

`sql/init-airline.sh <航司二字码>` 执行流程：

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1 | 创建 Schema | `CREATE SCHEMA <code>` |
| 2 | 建表 | 执行 `sql/schema/*.sql` |
| 3 | Seed 数据 | 执行 `sql/seed/*.sql`，**必须显式提供 filiale 值（大写）** |
| 4 | filiale 约束 | 添加 CHECK 约束 `filiale = UPPER(filiale)` |

**重要：filiale 字段规范**

- 所有含 `filiale` 字段的表都有 CHECK 约束，强制值必须大写
- Seed 脚本必须显式提供 `filiale = 'F8'`（大写），不依赖 DEFAULT
- 小写值会被拒绝：`INSERT ... filiale = 'f8'` → ERROR
- 后端查询使用 `schema.toUpperCase()` 过滤，必须匹配大写值

### Redis 配置

```bash
# 安装 Redis 7
sudo apt install -y redis-server

# live-server 专用实例（端口 6379）
sudo systemctl enable redis-server

# PBS 专用实例（端口 6380）
sudo cp /etc/redis/redis.conf /etc/redis/redis-pbs.conf
sudo sed -i 's/port 6379/port 6380/' /etc/redis/redis-pbs.conf
sudo systemctl start redis-server@pbs
```

---

## 3. 应用服务部署

### live-server (端口 3000)

```bash
cd live-server

# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env：
#   DATABASE_URL=postgresql://f8:Pier2026AIf8@db-server:5432/rois?options=-c%20search_path%3Df8
#   REDIS_URL=redis://redis-server:6379
#   JWT_SECRET=<生成随机密钥>
#   LOG_LEVEL=info

# 3. 启动服务（PM2 管理）
npm install -g pm2
pm2 start npm --name "live-server" -- run start
pm2 save
pm2 startup
```

### rule-engine (端口 3001)

```bash
cd rule-engine

npm install
cp .env.example .env
pm2 start npm --name "rule-engine" -- run start
pm2 save
```

### connector-server (端口 3004)

```bash
cd connector-server

npm install
cp .env.example .env
pm2 start npm --name "connector-server" -- run start
pm2 save
```

### pbs-server (端口 3002)

```bash
cd pbs-server

npm install
cp .env.example .env
# PBS 使用独立 Redis 实例
pm2 start npm --name "pbs-server" -- run start
pm2 save
```

### engine-server (端口 3003)

```bash
cd engine-server

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 使用 systemd 管理
sudo cat > /etc/systemd/system/engine-server.service << 'EOF'
[Unit]
Description=ROIS Engine Server
After=network.target

[Service]
Type=simple
User=rois
WorkingDirectory=/home/rois/rois-ai/engine-server
Environment="PATH=/home/rois/rois-ai/engine-server/.venv/bin"
ExecStart=/home/rois/rois-ai/engine-server/.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 3003
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable engine-server
sudo systemctl start engine-server
```

---

## 4. 监控堆栈部署

### 监控服务器 Docker Compose

```bash
# 1. 克隆项目到监控服务器
git clone <repo-url> /opt/rois-ai
cd /opt/rois-ai/monitoring

# 2. 配置环境变量
cp .env.example .env
vi .env
# 必填项：
#   MONITORING_HOST=<监控服务器IP>
#   GRAFANA_ADMIN_PASSWORD=<安全密码>
#   APP_SERVER_POSTGRES_HOST=<PostgreSQL服务器IP>
#   WM_DB_PASSWORD=<PostgreSQL密码>

# 3. 替换 Prometheus 目标 IP
sed -i 's/APP_SERVER_1_IP/<应用服务器1IP>/g' prometheus/prometheus.yml
sed -i 's/APP_SERVER_2_IP/<应用服务器2IP>/g' prometheus/prometheus.yml
sed -i 's/APP_SERVER_DB_IP/<数据库服务器IP>/g' prometheus/prometheus.yml
sed -i 's/APP_SERVER_REDIS_IP/<Redis服务器IP>/g' prometheus/prometheus.yml

# 4. 启动监控堆栈
docker compose up -d

# 5. 验证服务状态
curl http://localhost:3100/ready      # Loki
curl http://localhost:9090/-/healthy  # Prometheus
curl http://localhost:3001/api/health # Grafana
curl http://localhost:8000/api/health # Windmill
```

### 应用服务器 Exporter 安装

**每台应用服务器执行：**

```bash
# 1. Node Exporter（系统指标）
sudo bash monitoring/scripts/install-node-exporter.sh

# 2. Promtail（日志采集）
sudo bash monitoring/scripts/install-promtail.sh http://<监控服务器IP>:3100 <服务器名>

# 验证
curl http://localhost:9100/metrics | grep node_cpu
systemctl status promtail
```

**数据库服务器执行：**

```bash
# postgres_exporter
sudo bash monitoring/scripts/install-postgres-exporter.sh \
  "postgresql://postgres:<密码>@localhost:5432/postgres?sslmode=disable"

# redis_exporter (live-server)
sudo bash monitoring/scripts/install-redis-exporter.sh redis://localhost:6379 9121

# redis_exporter (pbs-server)
sudo bash monitoring/scripts/install-redis-exporter.sh redis://localhost:6380 9122

# 验证
curl http://localhost:9187/metrics | grep pg_up
curl http://localhost:9121/metrics | grep redis_up
```

### Grafana 初始化

1. **登录 Grafana**
   - URL: `http://<监控服务器IP>:3001`
   - 用户: admin
   - 密码: .env 中设置的 GRAFANA_ADMIN_PASSWORD

2. **验证数据源**
   - Connections → Data sources
   - 确认 Prometheus 和 Loki 已自动配置

3. **导入社区 Dashboard**

   | Dashboard | ID | 用途 |
   |-----------|-----|------|
   | Node Exporter Full | 1860 | 系统指标 |
   | Node.js Application | 11159 | Node.js 应用 |
   | PostgreSQL | 9628 | 数据库指标 |
   | Redis | 11835 | 缓存指标 |

   导入步骤：Dashboards → Import → 输入 ID → Load → 选择 Prometheus → Import

4. **创建日志 Dashboard**
   - Dashboards → New → Add Visualization
   - 数据源: Loki
   - 查询: `{job=~"live-server|pbs-server|rule-engine|connector-server|engine-server"}`
   - 保存为 "ROIS-AI Logs"

### Grafana 告警配置

1. **配置通知渠道**
   - Alerting → Contact points → New contact point
   - 类型: Email 或 企业微信 Webhook

2. **创建告警规则**

```promql
# 服务宕机告警
up{job=~"live-server|pbs-server|rule-engine|connector-server|engine-server"} == 0

# 磁盘告警
100 - ((node_filesystem_avail_bytes{mountpoint="/"} * 100) / node_filesystem_size_bytes{mountpoint="/"}) > 85
```

### Windmill 初始化

1. **访问 Windmill UI**
   - URL: `http://<监控服务器IP>:8000`

2. **完成初始设置**
   - 设置 superadmin 邮箱/密码
   - 创建 workspace: `rois`

3. **配置 Variables（敏感配置）**
   - Variables → New Variable
   - `ROIS_F8_DB_URL`: 数据库连接串（Secret）
   - `WECHAT_WEBHOOK_URL`: 企业微信 Webhook（Secret）

4. **导入定时任务脚本**
   - Scripts → New Script → TypeScript (Deno)
   - 路径: `f8/daily-roster-summary`
   - 复制 `monitoring/windmill/scripts/daily-roster-summary.ts` 内容

5. **创建 Schedule**
   - Schedules → New Schedule
   - Script: `f8/daily-roster-summary`
   - Cron: `0 2 * * *`（每日 02:00）
   - Arguments: 选择对应 Variables
   - 点击 "Run now" 测试执行

---

## 5. 验证与测试

### 服务健康检查

```bash
# 应用服务 API
curl http://<app-server>:3000/health
curl http://<app-server>:3001/health
curl http://<app-server>:3002/health
curl http://<app-server>:3003/health
curl http://<app-server>:3004/health

# Metrics 端点
curl http://<app-server>:3000/metrics | grep rois_live_server
curl http://<app-server>:3002/metrics | grep rois_pbs_server
curl http://<app-server>:3003/metrics | grep rois_engine_server
```

### Prometheus 目标验证

1. 打开 `http://<监控服务器>:9090/targets`
2. 确认所有 job 状态为 UP
3. 检查是否有 scrape 错误

### Grafana 数据验证

1. 打开 Node Exporter Dashboard (1860)
2. 确认能看到各服务器 CPU/内存数据
3. 打开日志 Dashboard
4. 确认能看到服务日志流

---

## 6. 运维操作

### 服务重启

```bash
# Node.js 服务
pm2 restart live-server
pm2 restart pbs-server
pm2 restart rule-engine
pm2 restart connector-server

# Python 服务
sudo systemctl restart engine-server

# 监控堆栈
cd monitoring && docker compose restart grafana
cd monitoring && docker compose restart prometheus
cd monitoring && docker compose restart loki
cd monitoring && docker compose restart windmill
```

### 日志查看

```bash
# Node.js 服务日志
pm2 logs live-server --lines 100

# Promtail 日志
journalctl -u promtail -f

# Grafana 容器日志
docker logs rois-grafana --tail 100
```

### Prometheus 配置更新

```bash
# 修改 prometheus.yml 后 reload
vi monitoring/prometheus/prometheus.yml
docker compose exec prometheus kill -HUP 1
```

### Windmill 任务调试

1. 打开 Windmill UI → Runs
2. 查看执行历史、stdout 输出、错误信息
3. 点击 "Run now" 手动触发测试

---

## 附录：端口汇总

| 服务 | 端口 | 协议 | 监控方式 |
|------|------|------|---------|
| live-server | 3000 | HTTP | /metrics (prom-client) |
| rule-engine | 3001 | HTTP | /metrics (prom-client) |
| pbs-server | 3002 | HTTP | /metrics (prom-client) |
| engine-server | 3003 | HTTP | /metrics (prometheus-client) |
| connector-server | 3004 | HTTP | /metrics (prom-client) |
| Grafana | 3001 | HTTP | Web UI |
| Prometheus | 9090 | HTTP | Web UI + API |
| Loki | 3100 | HTTP | API |
| Windmill | 8000 | HTTP | Web UI |
| Node Exporter | 9100 | HTTP | Prometheus scrape |
| postgres_exporter | 9187 | HTTP | Prometheus scrape |
| redis_exporter | 9121/9122 | HTTP | Prometheus scrape |
| PostgreSQL | 5432 | TCP | - |
| Redis | 6379/6380 | TCP | - |
