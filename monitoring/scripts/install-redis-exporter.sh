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