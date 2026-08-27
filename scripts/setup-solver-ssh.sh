#!/usr/bin/env bash
# One-time SSH key setup for CoreServer access (via WebServer jump)
# Run this once; after it pull-solver.sh works without any passwords.
#
# Topology: local → WebServer (47.89.181.217) → CoreServer (10.15.12.3)
# Both use the same root password.

set -euo pipefail

WEB_HOST="47.89.181.217"
CORE_HOST="10.15.12.3"
REMOTE_USER="root"
KEY="$HOME/.ssh/id_ed25519.pub"
PASS="${SOLVER_SSH_PASS:-}"

if [[ ! -f "$KEY" ]]; then
  echo "ERROR: No SSH public key at $KEY. Run: ssh-keygen -t ed25519" >&2
  exit 1
fi

if [[ -z "$PASS" ]]; then
  echo "Enter the root password for both servers (same on WebServer and CoreServer):"
  read -rs PASS
  echo
fi

PUB="$(cat "$KEY")"

echo "▶ Installing key on WebServer ($WEB_HOST)..."
sshpass -p "$PASS" ssh-copy-id \
  -i "$KEY" \
  -o StrictHostKeyChecking=no \
  -o ConnectTimeout=15 \
  "$REMOTE_USER@$WEB_HOST"

echo "▶ Installing key on CoreServer ($CORE_HOST) via WebServer..."
# WebServer now accepts key auth; CoreServer still needs password for this one install
sshpass -p "$PASS" ssh \
  -o ProxyCommand="ssh -W %h:%p -o StrictHostKeyChecking=no $REMOTE_USER@$WEB_HOST" \
  -o StrictHostKeyChecking=no \
  -o ConnectTimeout=15 \
  "$REMOTE_USER@$CORE_HOST" \
  "mkdir -p ~/.ssh && chmod 700 ~/.ssh
   grep -qxF '$PUB' ~/.ssh/authorized_keys 2>/dev/null \
     || echo '$PUB' >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   echo 'Key installed on CoreServer'"

echo ""
echo "✓ Setup complete. Test with:"
echo "  ssh -J $REMOTE_USER@$WEB_HOST $REMOTE_USER@$CORE_HOST echo OK"
echo ""
echo "Then pull with: ./scripts/pull-solver.sh"
