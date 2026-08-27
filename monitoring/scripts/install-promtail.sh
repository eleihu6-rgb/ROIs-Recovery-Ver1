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