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