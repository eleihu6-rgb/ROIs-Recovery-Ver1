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