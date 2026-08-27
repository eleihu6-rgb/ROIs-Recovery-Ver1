# Monitoring & Task Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a Grafana observability stack (Prometheus + Loki) for logs and metrics across all rois-ai services, plus Windmill for business-level scheduled tasks.

**Architecture:** A dedicated monitoring server runs Loki, Prometheus, Grafana, and Windmill via docker-compose. Each application server runs Promtail (log shipper) and Node Exporter (system metrics) as systemd services. All Node.js services expose a `/metrics` endpoint via a `prom-client` Fastify plugin; engine-server exposes `/metrics` via `prometheus-client` mounted into FastAPI. Windmill connects to the existing PostgreSQL instance (new `windmill` database).

**Tech Stack:** Loki 3.x, Prometheus 2.x, Grafana 11.x, Windmill (latest), prom-client 15.x (Node.js), prometheus-client 0.21.x (Python), Node Exporter 1.8.x, Promtail 3.x, postgres_exporter 0.15.x, redis_exporter 1.x.

---

## Phase 1: Monitoring Server Infrastructure

### Task 1: Create monitoring server docker-compose

**Files:**
- Create: `monitoring/docker-compose.yml`
- Create: `monitoring/.env.example`

- [ ] **Step 1: Create `monitoring/` directory and docker-compose.yml**

```yaml
# monitoring/docker-compose.yml
# Deploy on the dedicated monitoring server.
# cp .env.example .env, fill in APP_SERVER_POSTGRES_HOST, then: docker compose up -d

services:
  loki:
    image: grafana/loki:3.4.3
    container_name: rois-loki
    restart: unless-stopped
    ports:
      - "3100:3100"
    volumes:
      - ./loki/loki-config.yml:/etc/loki/loki-config.yml:ro
      - loki_data:/loki
    command: -config.file=/etc/loki/loki-config.yml
    networks:
      - monitor-net

  prometheus:
    image: prom/prometheus:v3.3.1
    container_name: rois-prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.retention.time=30d"
    networks:
      - monitor-net

  grafana:
    image: grafana/grafana:11.6.1
    container_name: rois-grafana
    restart: unless-stopped
    ports:
      - "3001:3000"
    environment:
      GF_SECURITY_ADMIN_USER: ${GRAFANA_ADMIN_USER:-admin}
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD:?required}
      GF_SERVER_ROOT_URL: http://${MONITORING_HOST:?required}:3001
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
      - grafana_data:/var/lib/grafana
    depends_on:
      - prometheus
      - loki
    networks:
      - monitor-net

  windmill:
    image: ghcr.io/windmill-labs/windmill:main
    container_name: rois-windmill
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://${WM_DB_USER:-postgres}:${WM_DB_PASSWORD:?required}@${APP_SERVER_POSTGRES_HOST:?required}:5432/windmill
      BASE_URL: http://${MONITORING_HOST:?required}:8000
      WM_SERVER_BIND_ADDR: "0.0.0.0:8000"
    networks:
      - monitor-net

volumes:
  loki_data:
  prometheus_data:
  grafana_data:

networks:
  monitor-net:
    driver: bridge
```

- [ ] **Step 2: Create `.env.example`**

```bash
# monitoring/.env.example
MONITORING_HOST=192.168.1.100        # IP of this monitoring server
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=changeme      # REQUIRED: change before starting
APP_SERVER_POSTGRES_HOST=192.168.1.10  # IP of your PostgreSQL server
WM_DB_USER=postgres
WM_DB_PASSWORD=postgres              # REQUIRED: match your postgres password
```

- [ ] **Step 3: Commit**

```bash
git add monitoring/
git commit -m "feat(monitoring): add monitoring server docker-compose skeleton"
```

---

### Task 2: Configure Loki

**Files:**
- Create: `monitoring/loki/loki-config.yml`

- [ ] **Step 1: Create Loki config**

```yaml
# monitoring/loki/loki-config.yml
auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9096

common:
  instance_addr: 127.0.0.1
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

query_range:
  results_cache:
    cache:
      embedded_cache:
        enabled: true
        max_size_mb: 100

schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

ruler:
  alertmanager_url: http://localhost:9093

limits_config:
  retention_period: 720h   # 30 days

compactor:
  working_directory: /loki/compactor
  delete_request_store: filesystem
  retention_enabled: true
  retention_delete_delay: 2h
```

- [ ] **Step 2: Verify Loki starts**

Run on monitoring server:
```bash
docker compose up -d loki
docker compose logs loki --tail 20
curl http://localhost:3100/ready
```
Expected: `ready`

- [ ] **Step 3: Commit**

```bash
git add monitoring/loki/
git commit -m "feat(monitoring): add Loki config with 30-day retention"
```

---

### Task 3: Configure Prometheus

**Files:**
- Create: `monitoring/prometheus/prometheus.yml`

- [ ] **Step 1: Create Prometheus scrape config**

```yaml
# monitoring/prometheus/prometheus.yml
# Add/remove targets as you deploy services to more servers.
# Node Exporter port: 9100, prom-client services expose /metrics on their own port.

global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    project: rois-ai

scrape_configs:
  # ── System metrics (all app servers) ──────────────────────────
  - job_name: "node"
    static_configs:
      - targets:
          - "APP_SERVER_1_IP:9100"   # Replace with real IPs
          - "APP_SERVER_2_IP:9100"
        labels:
          env: production

  # ── PostgreSQL ────────────────────────────────────────────────
  - job_name: "postgres"
    static_configs:
      - targets: ["APP_SERVER_DB_IP:9187"]

  # ── Redis (live-server) ────────────────────────────────────────
  - job_name: "redis-live"
    static_configs:
      - targets: ["APP_SERVER_REDIS_IP:9121"]

  # ── Redis (pbs-server) ────────────────────────────────────────
  - job_name: "redis-pbs"
    static_configs:
      - targets: ["APP_SERVER_REDIS_IP:9122"]

  # ── Application services ───────────────────────────────────────
  - job_name: "live-server"
    metrics_path: /metrics
    static_configs:
      - targets: ["APP_SERVER_1_IP:3000"]

  - job_name: "pbs-server"
    metrics_path: /metrics
    static_configs:
      - targets: ["APP_SERVER_1_IP:3002"]

  - job_name: "rule-engine"
    metrics_path: /metrics
    static_configs:
      - targets: ["APP_SERVER_1_IP:3001"]

  - job_name: "connector-server"
    metrics_path: /metrics
    static_configs:
      - targets: ["APP_SERVER_1_IP:3004"]

  - job_name: "engine-server"
    metrics_path: /metrics
    static_configs:
      - targets: ["APP_SERVER_2_IP:3003"]
```

- [ ] **Step 2: Verify Prometheus starts**

```bash
docker compose up -d prometheus
curl http://localhost:9090/api/v1/targets | python3 -m json.tool | grep '"health"'
```
Expected: targets listed (may show "unknown" until services expose /metrics — that's fine for now).

- [ ] **Step 3: Commit**

```bash
git add monitoring/prometheus/
git commit -m "feat(monitoring): add Prometheus scrape config"
```

---

### Task 4: Configure Grafana datasource provisioning

**Files:**
- Create: `monitoring/grafana/provisioning/datasources/datasources.yml`

- [ ] **Step 1: Create Grafana datasource provisioning**

```yaml
# monitoring/grafana/provisioning/datasources/datasources.yml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    jsonData:
      timeInterval: "15s"

  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    jsonData:
      maxLines: 1000
```

- [ ] **Step 2: Start Grafana and verify datasources auto-provision**

```bash
docker compose up -d grafana
```

Open `http://<MONITORING_HOST>:3001` in a browser.
Login with admin / your GRAFANA_ADMIN_PASSWORD.
Go to **Connections → Data sources** — verify both Prometheus and Loki appear.
Click **Test** on each — both should show green.

- [ ] **Step 3: Commit**

```bash
git add monitoring/grafana/
git commit -m "feat(monitoring): provision Grafana datasources (Prometheus + Loki)"
```

---

### Task 5: Start Windmill and create windmill database

**Files:** None (database setup + docker compose up)

- [ ] **Step 1: Create windmill database on app server PostgreSQL**

Run this on the server that hosts PostgreSQL:
```bash
psql -U postgres -c "CREATE DATABASE windmill;"
```

- [ ] **Step 2: Start Windmill**

```bash
# On monitoring server, with .env filled in:
docker compose up -d windmill
docker compose logs windmill --tail 30
```
Expected output includes: `Windmill server started` and no connection errors.

- [ ] **Step 3: Verify Windmill UI**

Open `http://<MONITORING_HOST>:8000` in a browser.
Complete the initial setup wizard:
- Set superadmin email/password
- Create workspace named `rois`

- [ ] **Step 4: Commit monitoring README**

Create `monitoring/README.md`:
```markdown
# ROIS-AI Monitoring Stack

## Starting the stack

\`\`\`bash
cp .env.example .env
# Fill in all required values in .env
docker compose up -d
\`\`\`

## Services

| Service    | URL                          | Purpose               |
|-----------|------------------------------|-----------------------|
| Grafana   | http://<host>:3001           | Logs + metrics UI     |
| Prometheus| http://<host>:9090           | Metrics storage       |
| Loki      | http://<host>:3100           | Log storage           |
| Windmill  | http://<host>:8000           | Scheduled tasks UI    |

## Updating Prometheus targets

Edit `prometheus/prometheus.yml` — replace `APP_SERVER_*_IP` placeholders with real IPs.
After editing: `docker compose exec prometheus kill -HUP 1`
```

```bash
git add monitoring/
git commit -m "feat(monitoring): add stack README and complete infrastructure setup"
```

---

## Phase 2: App Server Agent Deployment Scripts

### Task 6: Promtail install script

**Files:**
- Create: `monitoring/scripts/install-promtail.sh`
- Create: `monitoring/promtail/promtail-config.yml`

- [ ] **Step 1: Create Promtail config template**

```yaml
# monitoring/promtail/promtail-config.yml
# Copy to each app server and set the variables below.
# LOKI_URL: http://<monitoring-server-ip>:3100
# SERVER_NAME: server-01 (unique per server)

server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: ${LOKI_URL}/loki/api/v1/push

scrape_configs:
  - job_name: "live-server"
    static_configs:
      - targets: ["localhost"]
        labels:
          job: live-server
          host: ${SERVER_NAME}
          __path__: /home/*/rois/rois-ai/logs/live-server/*.log

  - job_name: "pbs-server"
    static_configs:
      - targets: ["localhost"]
        labels:
          job: pbs-server
          host: ${SERVER_NAME}
          __path__: /home/*/rois/rois-ai/logs/pbs-server/*.log

  - job_name: "rule-engine"
    static_configs:
      - targets: ["localhost"]
        labels:
          job: rule-engine
          host: ${SERVER_NAME}
          __path__: /home/*/rois/rois-ai/logs/rule-engine/*.log

  - job_name: "connector-server"
    static_configs:
      - targets: ["localhost"]
        labels:
          job: connector-server
          host: ${SERVER_NAME}
          __path__: /home/*/rois/rois-ai/logs/connector-server/*.log

  - job_name: "engine-server"
    static_configs:
      - targets: ["localhost"]
        labels:
          job: engine-server
          host: ${SERVER_NAME}
          __path__: /home/*/rois/rois-ai/engine-server/logs/*.log

  - job_name: "po-engine"
    static_configs:
      - targets: ["localhost"]
        labels:
          job: po-engine
          host: ${SERVER_NAME}
          __path__: /home/*/rois/rois-ai/po-engine/logs/*.log

  - job_name: "ro-engine"
    static_configs:
      - targets: ["localhost"]
        labels:
          job: ro-engine
          host: ${SERVER_NAME}
          __path__: /home/*/rois/rois-ai/ro-engine/logs/*.log

  # Systemd journal (system-level logs)
  - job_name: "journal"
    journal:
      max_age: 12h
      labels:
        job: systemd-journal
        host: ${SERVER_NAME}
    relabel_configs:
      - source_labels: ["__journal__systemd_unit"]
        target_label: unit
```

- [ ] **Step 2: Create Promtail install script**

```bash
#!/usr/bin/env bash
# monitoring/scripts/install-promtail.sh
# Usage: sudo bash install-promtail.sh <loki-url> <server-name>
# Example: sudo bash install-promtail.sh http://192.168.1.100:3100 server-01
set -euo pipefail

LOKI_URL="${1:?Usage: $0 <loki-url> <server-name>}"
SERVER_NAME="${2:?Usage: $0 <loki-url> <server-name>}"
PROMTAIL_VERSION="3.4.3"

echo "Installing Promtail ${PROMTAIL_VERSION} on ${SERVER_NAME}..."

# Download
cd /tmp
curl -fsSL "https://github.com/grafana/loki/releases/download/v${PROMTAIL_VERSION}/promtail-linux-amd64.zip" -o promtail.zip
unzip -o promtail.zip
chmod +x promtail-linux-amd64
mv promtail-linux-amd64 /usr/local/bin/promtail

# Install config
mkdir -p /etc/promtail
SCRIPT_DIR="$(dirname "$0")"
sed -e "s|\${LOKI_URL}|${LOKI_URL}|g" \
    -e "s|\${SERVER_NAME}|${SERVER_NAME}|g" \
    "${SCRIPT_DIR}/../promtail/promtail-config.yml" \
    > /etc/promtail/config.yml

# Create systemd service
cat > /etc/systemd/system/promtail.service << EOF
[Unit]
Description=Promtail log shipper
After=network.target

[Service]
ExecStart=/usr/local/bin/promtail -config.file=/etc/promtail/config.yml
Restart=always
RestartSec=5s
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable promtail
systemctl start promtail

echo "Promtail installed and started."
systemctl status promtail --no-pager
```

- [ ] **Step 3: Make executable and commit**

```bash
chmod +x monitoring/scripts/install-promtail.sh
git add monitoring/scripts/ monitoring/promtail/
git commit -m "feat(monitoring): add Promtail install script and config template"
```

---

### Task 7: Node Exporter + exporters install scripts

**Files:**
- Create: `monitoring/scripts/install-node-exporter.sh`
- Create: `monitoring/scripts/install-postgres-exporter.sh`
- Create: `monitoring/scripts/install-redis-exporter.sh`

- [ ] **Step 1: Create Node Exporter install script**

```bash
#!/usr/bin/env bash
# monitoring/scripts/install-node-exporter.sh
# Usage: sudo bash install-node-exporter.sh
set -euo pipefail

NE_VERSION="1.8.2"
echo "Installing Node Exporter ${NE_VERSION}..."

cd /tmp
curl -fsSL "https://github.com/prometheus/node_exporter/releases/download/v${NE_VERSION}/node_exporter-${NE_VERSION}.linux-amd64.tar.gz" | tar xz
mv "node_exporter-${NE_VERSION}.linux-amd64/node_exporter" /usr/local/bin/node_exporter

cat > /etc/systemd/system/node_exporter.service << EOF
[Unit]
Description=Prometheus Node Exporter
After=network.target

[Service]
ExecStart=/usr/local/bin/node_exporter --collector.systemd
Restart=always
RestartSec=5s
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable node_exporter
systemctl start node_exporter

echo "Node Exporter installed."
curl -s http://localhost:9100/metrics | grep node_cpu_seconds_total | head -3
```

- [ ] **Step 2: Create postgres_exporter install script**

```bash
#!/usr/bin/env bash
# monitoring/scripts/install-postgres-exporter.sh
# Usage: sudo bash install-postgres-exporter.sh <postgres-dsn>
# Example: sudo bash install-postgres-exporter.sh "postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable"
set -euo pipefail

DATA_SOURCE_NAME="${1:?Usage: $0 <postgres-dsn>}"
PE_VERSION="0.17.0"
echo "Installing postgres_exporter ${PE_VERSION}..."

cd /tmp
curl -fsSL "https://github.com/prometheus-community/postgres_exporter/releases/download/v${PE_VERSION}/postgres_exporter-${PE_VERSION}.linux-amd64.tar.gz" | tar xz
mv "postgres_exporter-${PE_VERSION}.linux-amd64/postgres_exporter" /usr/local/bin/postgres_exporter

cat > /etc/systemd/system/postgres_exporter.service << EOF
[Unit]
Description=Prometheus PostgreSQL Exporter
After=network.target

[Service]
Environment="DATA_SOURCE_NAME=${DATA_SOURCE_NAME}"
ExecStart=/usr/local/bin/postgres_exporter --web.listen-address=:9187
Restart=always
RestartSec=5s
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable postgres_exporter
systemctl start postgres_exporter

echo "postgres_exporter installed."
curl -s http://localhost:9187/metrics | grep pg_up | head -3
```

- [ ] **Step 3: Create redis_exporter install script**

```bash
#!/usr/bin/env bash
# monitoring/scripts/install-redis-exporter.sh
# Usage: sudo bash install-redis-exporter.sh <redis-addr> <port>
# Example: sudo bash install-redis-exporter.sh redis://localhost:6379 9121
set -euo pipefail

REDIS_ADDR="${1:?Usage: $0 <redis-addr> <listen-port>}"
LISTEN_PORT="${2:-9121}"
RE_VERSION="1.67.0"
echo "Installing redis_exporter ${RE_VERSION} on port ${LISTEN_PORT}..."

cd /tmp
curl -fsSL "https://github.com/oliver006/redis_exporter/releases/download/v${RE_VERSION}/redis_exporter-v${RE_VERSION}.linux-amd64.tar.gz" | tar xz
mv "redis_exporter-v${RE_VERSION}.linux-amd64/redis_exporter" /usr/local/bin/redis_exporter_${LISTEN_PORT}

cat > /etc/systemd/system/redis_exporter_${LISTEN_PORT}.service << EOF
[Unit]
Description=Prometheus Redis Exporter (port ${LISTEN_PORT})
After=network.target

[Service]
ExecStart=/usr/local/bin/redis_exporter_${LISTEN_PORT} --redis.addr=${REDIS_ADDR} --web.listen-address=:${LISTEN_PORT}
Restart=always
RestartSec=5s
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable redis_exporter_${LISTEN_PORT}
systemctl start redis_exporter_${LISTEN_PORT}

echo "redis_exporter installed on port ${LISTEN_PORT}."
curl -s http://localhost:${LISTEN_PORT}/metrics | grep redis_up | head -3
```

- [ ] **Step 4: Make executable and commit**

```bash
chmod +x monitoring/scripts/install-node-exporter.sh
chmod +x monitoring/scripts/install-postgres-exporter.sh
chmod +x monitoring/scripts/install-redis-exporter.sh
git add monitoring/scripts/
git commit -m "feat(monitoring): add Node Exporter, postgres_exporter, redis_exporter install scripts"
```

---

## Phase 3: Node.js Service Metrics (prom-client)

### Task 8: live-server metrics plugin

**Files:**
- Create: `live-server/src/plugins/metrics.ts`
- Create: `live-server/src/__tests__/plugins/metrics.test.ts`
- Modify: `live-server/src/index.ts` (register plugin)

- [ ] **Step 1: Install prom-client**

```bash
cd live-server
npm install prom-client
```

- [ ] **Step 2: Write the failing test**

```typescript
// live-server/src/__tests__/plugins/metrics.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import { register } from 'prom-client'
import metricsPlugin from '../../plugins/metrics.js'

describe('metricsPlugin', () => {
  const app = Fastify({ logger: false })

  beforeAll(async () => {
    register.clear()
    await app.register(metricsPlugin)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    register.clear()
  })

  it('GET /metrics returns 200 with prometheus content type', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/plain')
  })

  it('GET /metrics body contains default Node.js metrics', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' })
    expect(res.body).toContain('rois_live_server_process_cpu_user_seconds_total')
  })
})
```

- [ ] **Step 3: Run test — verify it fails**

```bash
cd live-server
npx vitest run src/__tests__/plugins/metrics.test.ts
```
Expected: `FAIL` — `Cannot find module '../../plugins/metrics.js'`

- [ ] **Step 4: Create `src/plugins/metrics.ts`**

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { collectDefaultMetrics, register } from 'prom-client'

export default fp(async function metricsPlugin(fastify: FastifyInstance) {
  collectDefaultMetrics({ prefix: 'rois_live_server_' })

  fastify.get('/metrics', { logLevel: 'silent' }, async (_request, reply) => {
    reply.header('Content-Type', register.contentType)
    return register.metrics()
  })
})
```

- [ ] **Step 5: Run test — verify it passes**

```bash
npx vitest run src/__tests__/plugins/metrics.test.ts
```
Expected: `PASS` (2 tests)

- [ ] **Step 6: Register plugin in `src/index.ts`**

In `live-server/src/index.ts`, add the import after the existing plugin imports:
```typescript
import metricsPlugin from './plugins/metrics.js'
```

In the `start()` function, register it alongside the other plugins (after cors, before routes):
```typescript
await server.register(metricsPlugin)
```

- [ ] **Step 7: Verify the endpoint works with the full server**

```bash
npm run dev &
sleep 3
curl http://localhost:3000/metrics | head -5
kill %1
```
Expected: lines starting with `# HELP rois_live_server_...`

- [ ] **Step 8: Commit**

```bash
cd live-server
git add src/plugins/metrics.ts src/__tests__/plugins/metrics.test.ts src/index.ts package.json package-lock.json
git commit -m "feat(live-server): expose /metrics endpoint via prom-client"
```

---

### Task 9: pbs-server metrics plugin

**Files:**
- Create: `pbs-server/src/plugins/metrics.ts`
- Create: `pbs-server/src/__tests__/plugins/metrics.test.ts`
- Modify: `pbs-server/src/app.ts` (register plugin)

- [ ] **Step 1: Install prom-client**

```bash
cd pbs-server
npm install prom-client
```

- [ ] **Step 2: Write the failing test**

```typescript
// pbs-server/src/__tests__/plugins/metrics.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import { register } from 'prom-client'
import metricsPlugin from '../../plugins/metrics.js'

describe('metricsPlugin', () => {
  const app = Fastify({ logger: false })

  beforeAll(async () => {
    register.clear()
    await app.register(metricsPlugin)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    register.clear()
  })

  it('GET /metrics returns 200 with prometheus content type', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/plain')
  })

  it('GET /metrics body contains default Node.js metrics', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' })
    expect(res.body).toContain('rois_pbs_server_process_cpu_user_seconds_total')
  })
})
```

- [ ] **Step 3: Run test — verify it fails**

```bash
cd pbs-server
npx vitest run src/__tests__/plugins/metrics.test.ts
```
Expected: `FAIL` — module not found

- [ ] **Step 4: Create `src/plugins/metrics.ts`**

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { collectDefaultMetrics, register } from 'prom-client'

export default fp(async function metricsPlugin(fastify: FastifyInstance) {
  collectDefaultMetrics({ prefix: 'rois_pbs_server_' })

  fastify.get('/metrics', { logLevel: 'silent' }, async (_request, reply) => {
    reply.header('Content-Type', register.contentType)
    return register.metrics()
  })
})
```

- [ ] **Step 5: Run test — verify it passes**

```bash
npx vitest run src/__tests__/plugins/metrics.test.ts
```
Expected: `PASS` (2 tests)

- [ ] **Step 6: Register in `pbs-server/src/app.ts`**

Add import near the top of `app.ts`:
```typescript
import metricsPlugin from './plugins/metrics.js'
```

Inside `buildServer()`, after the `cors` registration block:
```typescript
await server.register(metricsPlugin)
```

- [ ] **Step 7: Commit**

```bash
cd pbs-server
git add src/plugins/metrics.ts src/__tests__/plugins/metrics.test.ts src/app.ts package.json package-lock.json
git commit -m "feat(pbs-server): expose /metrics endpoint via prom-client"
```

---

### Task 10: rule-engine metrics plugin

**Files:**
- Create: `rule-engine/src/plugins/metrics.ts`
- Modify: `rule-engine/src/server.ts` (register plugin)

- [ ] **Step 1: Install prom-client**

```bash
cd rule-engine
npm install prom-client
```

- [ ] **Step 2: Write the failing test**

```typescript
// rule-engine/src/__tests__/plugins/metrics.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import { register } from 'prom-client'
import metricsPlugin from '../../plugins/metrics.js'

describe('metricsPlugin', () => {
  const app = Fastify({ logger: false })

  beforeAll(async () => {
    register.clear()
    await app.register(metricsPlugin)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    register.clear()
  })

  it('GET /metrics returns 200 with prometheus content type', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/plain')
  })

  it('GET /metrics body contains default Node.js metrics', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' })
    expect(res.body).toContain('rois_rule_engine_process_cpu_user_seconds_total')
  })
})
```

- [ ] **Step 3: Run test — verify it fails**

```bash
cd rule-engine
npx vitest run src/__tests__/plugins/metrics.test.ts
```
Expected: `FAIL`

- [ ] **Step 4: Create `src/plugins/metrics.ts`**

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { collectDefaultMetrics, register } from 'prom-client'

export default fp(async function metricsPlugin(fastify: FastifyInstance) {
  collectDefaultMetrics({ prefix: 'rois_rule_engine_' })

  fastify.get('/metrics', { logLevel: 'silent' }, async (_request, reply) => {
    reply.header('Content-Type', register.contentType)
    return register.metrics()
  })
})
```

- [ ] **Step 5: Run test — verify it passes**

```bash
npx vitest run src/__tests__/plugins/metrics.test.ts
```
Expected: `PASS`

- [ ] **Step 6: Register in `rule-engine/src/server.ts`**

In `buildServer()`, add import:
```typescript
import metricsPlugin from './plugins/metrics.js'
```

Register after the existing plugin registrations (after `rateLimit`):
```typescript
await app.register(metricsPlugin)
```

- [ ] **Step 7: Commit**

```bash
cd rule-engine
git add src/plugins/metrics.ts src/__tests__/plugins/metrics.test.ts src/server.ts package.json package-lock.json
git commit -m "feat(rule-engine): expose /metrics endpoint via prom-client"
```

---

### Task 11: connector-server metrics plugin

**Files:**
- Create: `connector-server/src/plugins/metrics.ts`
- Modify: `connector-server/src/index.ts` (register plugin)

- [ ] **Step 1: Install prom-client**

```bash
cd connector-server
npm install prom-client
```

- [ ] **Step 2: Write the failing test**

```typescript
// connector-server/src/__tests__/plugins/metrics.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import { register } from 'prom-client'
import metricsPlugin from '../../plugins/metrics.js'

describe('metricsPlugin', () => {
  const app = Fastify({ logger: false })

  beforeAll(async () => {
    register.clear()
    await app.register(metricsPlugin)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    register.clear()
  })

  it('GET /metrics returns 200 with prometheus content type', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/plain')
  })

  it('GET /metrics body contains default Node.js metrics', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' })
    expect(res.body).toContain('rois_connector_server_process_cpu_user_seconds_total')
  })
})
```

- [ ] **Step 3: Run test — verify it fails**

```bash
cd connector-server
npx vitest run src/__tests__/plugins/metrics.test.ts
```
Expected: `FAIL`

- [ ] **Step 4: Create `src/plugins/metrics.ts`**

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { collectDefaultMetrics, register } from 'prom-client'

export default fp(async function metricsPlugin(fastify: FastifyInstance) {
  collectDefaultMetrics({ prefix: 'rois_connector_server_' })

  fastify.get('/metrics', { logLevel: 'silent' }, async (_request, reply) => {
    reply.header('Content-Type', register.contentType)
    return register.metrics()
  })
})
```

- [ ] **Step 5: Run test — verify it passes**

```bash
npx vitest run src/__tests__/plugins/metrics.test.ts
```
Expected: `PASS`

- [ ] **Step 6: Register in `connector-server/src/index.ts`**

Add import:
```typescript
import metricsPlugin from './plugins/metrics.js'
```

In `start()`, register after the existing `fastify.register(bullmqPlugin)` call:
```typescript
await fastify.register(metricsPlugin)
```

- [ ] **Step 7: Commit**

```bash
cd connector-server
git add src/plugins/metrics.ts src/__tests__/plugins/metrics.test.ts src/index.ts package.json package-lock.json
git commit -m "feat(connector-server): expose /metrics endpoint via prom-client"
```

---

## Phase 4: Python Service Metrics (engine-server)

> Note: po-engine and ro-engine are short-lived CLI processes (no HTTP server). Their execution is tracked via engine-server job metrics below.

### Task 12: engine-server metrics endpoint

**Files:**
- Modify: `engine-server/requirements.txt` (add prometheus-client)
- Modify: `engine-server/main.py` (mount /metrics and add job counters)

- [ ] **Step 1: Add prometheus-client to requirements**

Check if `engine-server` uses `requirements.txt` or `pyproject.toml`:
```bash
ls engine-server/requirements*.txt engine-server/pyproject.toml 2>/dev/null
```

Add `prometheus-client==0.21.1` to whichever file is present (add on its own line).

- [ ] **Step 2: Install the dependency**

```bash
cd engine-server
pip install prometheus-client==0.21.1
```

- [ ] **Step 3: Write a manual test (no pytest, verify via curl)**

We will verify by starting the server and hitting `/metrics`.

- [ ] **Step 4: Modify `engine-server/main.py`**

Add these imports near the top (after existing imports):
```python
from prometheus_client import make_asgi_app, Counter, Histogram, CollectorRegistry, REGISTRY
```

Add these metric definitions after the `logger = getLogger(__name__)` line:
```python
optimization_jobs_total = Counter(
    'rois_engine_server_optimization_jobs_total',
    'Total optimization jobs started',
    ['optimizer_type', 'status'],
)
optimization_job_duration_seconds = Histogram(
    'rois_engine_server_optimization_job_duration_seconds',
    'Duration of optimization jobs in seconds',
    ['optimizer_type'],
    buckets=[10, 30, 60, 120, 300, 600, 1800],
)
```

In the `@asynccontextmanager` lifespan function, mount the metrics endpoint. Find the `app = FastAPI(...)` construction (near the end of `main.py`) and add:
```python
# Mount Prometheus metrics endpoint
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)
```

> To record job metrics, in `engine-server/src/api/routes.py`, update the `start_optimization` endpoint to call:
> `optimization_jobs_total.labels(optimizer_type=request.optimizer_type, status="started").inc()`
> at the point where a task is successfully created, and
> `optimization_jobs_total.labels(optimizer_type=request.optimizer_type, status="completed").inc()`
> in the task completion callback.

- [ ] **Step 5: Verify the endpoint**

```bash
cd engine-server
python -m uvicorn main:app --port 3003 &
sleep 3
curl http://localhost:3003/metrics | grep rois_engine_server
kill %1
```
Expected: lines containing `rois_engine_server_optimization_jobs_total`

- [ ] **Step 6: Commit**

```bash
cd engine-server
git add main.py requirements.txt
git commit -m "feat(engine-server): expose /metrics with prometheus-client"
```

---

## Phase 5: Grafana Dashboards & Alerting

### Task 13: Import community dashboards

**Files:** (Grafana UI steps only — no files to commit)

- [ ] **Step 1: Import Node Exporter Full dashboard**

In Grafana UI → **Dashboards → Import**:
- Enter Dashboard ID: `1860`
- Click **Load**
- Set datasource: `Prometheus`
- Click **Import**

- [ ] **Step 2: Import Node.js Application dashboard**

In Grafana UI → **Dashboards → Import**:
- Enter Dashboard ID: `11159`
- Click **Load**, set datasource: `Prometheus`, click **Import**

- [ ] **Step 3: Import PostgreSQL dashboard**

Dashboard ID: `9628` — same steps as above.

- [ ] **Step 4: Import Redis dashboard**

Dashboard ID: `11835` — same steps as above.

- [ ] **Step 5: Create a Logs dashboard**

In Grafana UI → **Dashboards → New → New Dashboard → Add Visualization**:
- Datasource: `Loki`
- Panel type: `Logs`
- Query: `{job=~"live-server|pbs-server|rule-engine|connector-server|engine-server"}`
- Title: `ROIS-AI All Service Logs`
- Save dashboard as `ROIS-AI Logs`

---

### Task 14: Configure Grafana alerting rules

**Files:** (Grafana UI steps)

- [ ] **Step 1: Configure email notification channel**

In Grafana UI → **Alerting → Contact points → New contact point**:
- Name: `ops-email`
- Type: `Email`
- Addresses: your ops team email
- Click **Test** to verify email delivery, then **Save**

- [ ] **Step 2: Create service down alert**

In Grafana UI → **Alerting → Alert rules → New alert rule**:
- Rule name: `Service Down`
- Metric query:
  ```promql
  up{job=~"live-server|pbs-server|rule-engine|connector-server|engine-server"} == 0
  ```
- Condition: IS ABOVE `0` for `2m`
- Contact point: `ops-email`
- Annotations:
  - Summary: `Service {{ $labels.job }} is down on {{ $labels.instance }}`
- Save

- [ ] **Step 3: Create high error rate alert**

New alert rule:
- Rule name: `High HTTP Error Rate`
- Metric query (Node.js services expose `rois_*_http_requests_total` if you add HTTP middleware in a future iteration; for now use `up` as baseline):
  ```promql
  100 * sum(rate(rois_live_server_process_resident_memory_bytes[5m])) > 500000000
  ```
  > This is a memory alert as a starting point. Replace with HTTP error rate metrics once you add the HTTP instrumentation middleware in a later iteration.
- Condition: IS ABOVE `0` for `5m`
- Contact point: `ops-email`
- Save

- [ ] **Step 4: Create disk space alert**

New alert rule:
- Rule name: `Disk Usage High`
- Query:
  ```promql
  100 - ((node_filesystem_avail_bytes{mountpoint="/"} * 100) / node_filesystem_size_bytes{mountpoint="/"}) > 85
  ```
- Condition: IS ABOVE `0` for `10m`
- Contact point: `ops-email`
- Save

---

## Phase 6: Windmill Task Scheduling

### Task 15: Create example business task with schedule

**Files:** (Windmill UI steps + one TypeScript script file for reference)
- Create: `monitoring/windmill/scripts/daily-roster-summary.ts`

- [ ] **Step 1: Save the example script for reference**

```typescript
// monitoring/windmill/scripts/daily-roster-summary.ts
// This script runs in Windmill's Deno runtime.
// Deploy via Windmill UI: Workspace "rois" → Scripts → New Script → TypeScript (Deno)

// Variables set in Windmill workspace:
//   ROIS_F8_DB_URL: postgresql://f8:Pier2026AIf8@<db-host>:5432/rois?options=-c%20search_path%3Df8
//   WECHAT_WEBHOOK_URL: https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...

export async function main(
  db_url: string,
  webhook_url: string,
) {
  // Query yesterday's roster stats
  const { Client } = await import("npm:pg@8")
  const client = new Client(db_url)
  await client.connect()

  const { rows } = await client.query<{ local_date: string; total: string; cancelled: string }>(`
    SELECT
      local_date::text,
      COUNT(*) AS total,
      SUM(CASE WHEN is_deleted = 1 THEN 1 ELSE 0 END) AS cancelled
    FROM roster_flight
    WHERE local_date = CURRENT_DATE - 1
    GROUP BY local_date
  `)
  await client.end()

  const stats = rows[0] ?? { local_date: 'N/A', total: '0', cancelled: '0' }
  const message = `[ROIS-AI] Roster Summary ${stats.local_date}: ${stats.total} flights, ${stats.cancelled} cancelled`

  // Push to WeChat Work webhook
  await fetch(webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgtype: 'text', text: { content: message } }),
  })

  return { stats, message }
}
```

- [ ] **Step 2: Create the script in Windmill UI**

1. Open `http://<MONITORING_HOST>:8000`
2. Select workspace `rois`
3. Go to **Scripts → New Script**
4. Language: `TypeScript (Deno)`
5. Path: `f8/daily-roster-summary`
6. Paste the content of `daily-roster-summary.ts` (function body only)
7. Click **Save**

- [ ] **Step 3: Create Windmill Variables**

Go to **Variables → New Variable**:
- Name: `ROIS_F8_DB_URL`, Value: `postgresql://f8:Pier2026AIf8@<db-server-ip>:5432/rois?options=-c%20search_path%3Df8`, mark as **Secret**
- Name: `WECHAT_WEBHOOK_URL`, Value: your WeChat webhook URL, mark as **Secret**

- [ ] **Step 4: Create a Schedule**

Go to **Schedules → New Schedule**:
- Script: `f8/daily-roster-summary`
- Cron: `0 2 * * *` (every day at 02:00)
- Arguments:
  - `db_url`: select Variable `ROIS_F8_DB_URL`
  - `webhook_url`: select Variable `WECHAT_WEBHOOK_URL`
- Enable the schedule

- [ ] **Step 5: Test run manually**

On the schedule page, click **Run now**.
Check the run result in **Runs** tab — verify it returns `{ stats: {...}, message: "..." }` without errors.

- [ ] **Step 6: Commit the reference script**

```bash
git add monitoring/windmill/
git commit -m "feat(monitoring): add Windmill daily roster summary script reference"
```

---

## Self-Review Notes

**Spec coverage:**
- ✅ Log monitoring: Tasks 2, 6 (Loki + Promtail)
- ✅ Health monitoring: Tasks 3, 7, 8–12, 13, 14 (Prometheus + exporters + prom-client + Grafana dashboards + alerts)
- ✅ Task scheduling: Tasks 5, 15 (Windmill + example schedule)

**Known limitations (YAGNI — not in scope):**
- po-engine and ro-engine are CLI processes with no HTTP server; they are monitored indirectly via engine-server job counters
- HTTP request duration histograms are not included in the prom-client plugin (only default Node.js metrics) — can be added as a follow-up
- Grafana dashboards in Task 13 are imported via UI, not provisioned as code — acceptable for initial setup

**Deployment order:**
Phase 1 (monitoring server) → Phase 2 (app server agents) → Phase 3-4 (service code changes + redeploy) → Phase 5 (Grafana UI) → Phase 6 (Windmill)
