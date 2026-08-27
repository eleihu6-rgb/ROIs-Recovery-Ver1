# ROIS-AI Monitoring Stack

## Prerequisites

- Docker and Docker Compose on monitoring server
- PostgreSQL server (existing) - create `windmill` database before starting
- App servers with Node Exporter running (port 9100)

## Quick Start

```bash
# 1. Create windmill database on PostgreSQL server
psql -U postgres -c "CREATE DATABASE windmill;"

# 2. Copy and configure environment
cp .env.example .env
# Edit .env and fill in:
#   - MONITORING_HOST (this server's IP)
#   - GRAFANA_ADMIN_PASSWORD (secure password)
#   - APP_SERVER_POSTGRES_HOST (PostgreSQL server IP)
#   - WM_DB_PASSWORD (postgres password)

# 3. Replace placeholder IPs in Prometheus config
# NOTE: The example IPs below are PLACEHOLDERS - replace with your actual server IPs!
# See "Prometheus Target IPs" section below for details.
sed -i 's/APP_SERVER_1_IP/192.168.1.10/g' prometheus/prometheus.yml
sed -i 's/APP_SERVER_2_IP/192.168.1.11/g' prometheus/prometheus.yml
sed -i 's/APP_SERVER_DB_IP/192.168.1.12/g' prometheus/prometheus.yml
sed -i 's/APP_SERVER_REDIS_IP/192.168.1.12/g' prometheus/prometheus.yml

# 4. Start the stack
docker compose up -d

# 5. Verify services
curl http://localhost:3100/ready      # Loki
curl http://localhost:9090/-/healthy  # Prometheus
curl http://localhost:3001/api/health # Grafana
curl http://localhost:8000/api/health # Windmill
```

## Services

| Service    | Port | URL                             | Purpose           |
|-----------|------|----------------------------------|-------------------|
| Grafana   | 3001 | http://<MONITORING_HOST>:3001   | Logs + metrics UI |
| Prometheus| 9090 | http://<MONITORING_HOST>:9090   | Metrics storage   |
| Loki      | 3100 | http://<MONITORING_HOST>:3100   | Log storage       |
| Windmill  | 8000 | http://<MONITORING_HOST>:8000   | Scheduled tasks   |

## Initial Setup

### Grafana

1. Open http://<MONITORING_HOST>:3001
2. Login with admin / your GRAFANA_ADMIN_PASSWORD
3. Go to Connections → Data sources — verify Prometheus and Loki are configured

### Windmill

1. Open http://<MONITORING_HOST>:8000
2. Complete setup wizard (superadmin email/password)
3. Create workspace named `rois`

## Grafana Dashboards

Import community dashboards for quick visualization:

| Dashboard Name         | ID    | Purpose                          |
|------------------------|-------|----------------------------------|
| Node Exporter Full     | 1860  | System metrics (CPU, memory, disk) |
| Node.js Application    | 11159 | Node.js app metrics               |
| PostgreSQL Database    | 9628  | PostgreSQL metrics                |
| Redis                  | 11835 | Redis metrics                     |

**Import steps:**
1. Go to Dashboards → Import
2. Enter Dashboard ID (e.g., 1860)
3. Click Load
4. Select Prometheus datasource
5. Click Import

**Create custom Logs dashboard:**
1. Go to Dashboards → New → New Dashboard → Add Visualization
2. Datasource: Loki
3. Panel type: Logs
4. Query: `{job=~"live-server|pbs-server|rule-engine|connector-server|engine-server"}`
5. Title: `ROIS-AI All Service Logs`
6. Save dashboard as `ROIS-AI Logs`

## Grafana Alerting

Configure alerts for critical monitoring:

### Contact Points

1. Go to Alerting → Contact points → New contact point
2. Name: `ops-email`
3. Type: `Email`
4. Addresses: your ops team email
5. Test and Save

### Alert Rules

**Service Down Alert:**
- Rule name: `Service Down`
- Query: `up{job=~"live-server|pbs-server|rule-engine|connector-server|engine-server"} == 0`
- Condition: IS ABOVE 0 for 2m
- Contact point: `ops-email`

**High Disk Usage Alert:**
- Rule name: `Disk Usage High`
- Query: `100 - ((node_filesystem_avail_bytes{mountpoint="/"} * 100) / node_filesystem_size_bytes{mountpoint="/"}) > 85`
- Condition: IS ABOVE 0 for 10m
- Contact point: `ops-email`

## Windmill Scheduled Tasks

The `windmill/scripts/daily-roster-summary.ts` script demonstrates a typical business task.

**Setup in Windmill UI:**
1. Go to Scripts → New Script
2. Language: TypeScript (Deno)
3. Path: `f8/daily-roster-summary`
4. Paste script content
5. Save

**Create Variables:**
- `ROIS_F8_DB_URL`: Database connection string (Secret)
- `WECHAT_WEBHOOK_URL`: WeChat webhook URL (Secret)

**Create Schedule:**
- Script: `f8/daily-roster-summary`
- Cron: `0 2 * * *` (daily at 02:00)
- Arguments: Use variables above
- Enable schedule

## Updating Prometheus Targets

Edit `prometheus/prometheus.yml` to add/remove targets, then reload:
```bash
docker compose exec prometheus kill -HUP 1
```

## Environment Variables

| Variable                    | Required | Description                              |
|----------------------------|----------|------------------------------------------|
| MONITORING_HOST            | Yes      | IP address of this monitoring server     |
| GRAFANA_ADMIN_USER         | No       | Grafana admin username (default: admin)  |
| GRAFANA_ADMIN_PASSWORD     | Yes      | Grafana admin password                    |
| APP_SERVER_POSTGRES_HOST   | Yes      | IP of PostgreSQL server for Windmill      |
| WM_DB_USER                 | No       | PostgreSQL username (default: postgres)  |
| WM_DB_PASSWORD             | Yes      | PostgreSQL password                        |

## Prometheus Target IPs

The Prometheus configuration uses placeholder variables that must be replaced with your actual server IPs:

| Placeholder          | Description                                                        | Services Monitored                          |
|----------------------|--------------------------------------------------------------------|---------------------------------------------|
| APP_SERVER_1_IP      | First app server IP                                                | live-server, pbs-server, rule-engine, connector-server |
| APP_SERVER_2_IP      | Second app server IP                                               | engine-server                               |
| APP_SERVER_DB_IP     | PostgreSQL database server IP                                      | postgres_exporter (port 9187)               |
| APP_SERVER_REDIS_IP  | Redis server IP                                                    | redis_exporter (port 9121/9122)              |

**Example replacement:**
```bash
# Replace with your actual IPs
sed -i 's/APP_SERVER_1_IP/10.0.1.10/g' prometheus/prometheus.yml
sed -i 's/APP_SERVER_2_IP/10.0.1.11/g' prometheus/prometheus.yml
sed -i 's/APP_SERVER_DB_IP/10.0.1.12/g' prometheus/prometheus.yml
sed -i 's/APP_SERVER_REDIS_IP/10.0.1.13/g' prometheus/prometheus.yml
```

## Exporter Installation

Before starting the monitoring stack, ensure the following exporters are installed and running on your servers:

| Exporter           | Default Port | Server               | Install Script                    |
|--------------------|--------------|----------------------|-----------------------------------|
| Node Exporter      | 9100         | All app servers      | `monitoring/scripts/install-node-exporter.sh` |
| postgres_exporter  | 9187         | PostgreSQL server    | `monitoring/scripts/install-postgres-exporter.sh` |
| redis_exporter     | 9121/9122    | Redis server         | `monitoring/scripts/install-redis-exporter.sh` |

**Verify exporters are running:**
```bash
# On each app server
curl http://localhost:9100/metrics

# On PostgreSQL server
curl http://localhost:9187/metrics

# On Redis server
curl http://localhost:9121/metrics
```

## Troubleshooting

### Windmill fails to start

Ensure the `windmill` database exists:
```bash
psql -U postgres -c "SELECT datname FROM pg_database WHERE datname = 'windmill';"
```

If missing, create it:
```bash
psql -U postgres -c "CREATE DATABASE windmill;"
```

### Grafana shows no data

1. Verify Prometheus is scraping targets: http://<MONITORING_HOST>:9090/targets
2. Verify Loki is receiving logs: `curl http://localhost:3100/ready`
3. Check data source connections in Grafana UI

### Prometheus cannot reach targets

1. Verify Node Exporter is running on app servers: `curl http://<app-server>:9100/metrics`
2. Check firewall rules allow traffic from monitoring server
3. Verify IP addresses in `prometheus/prometheus.yml` are correct