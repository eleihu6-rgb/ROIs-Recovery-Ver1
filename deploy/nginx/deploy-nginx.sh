#!/usr/bin/env bash
#
# deploy-nginx.sh — apply the version-managed nginx configs (this repo's
# deploy/nginx/) to /etc/nginx on the webserver. Run ON the webserver
# (yuan.z@10.15.12.2), where this repo is checked out at ~/rois/rois-ai.
#
#   ./deploy/nginx/deploy-nginx.sh          # backup → apply → nginx -t → reload
#   ./deploy/nginx/deploy-nginx.sh --check  # drift check + nginx -t, no change
#   ./deploy/nginx/deploy-nginx.sh --diff   # diff tracked vs live
#
# Requires passwordless sudo (yuan.z is in the sudo group on the webserver).
set -uo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$REPO/deploy/nginx"
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP="/etc/nginx/.backup/$TS"

# src-rel:dest (dest relative to /etc/nginx)
FILES=(
  "nginx.conf:nginx.conf"
  "conf.d/f8-sit.conf:conf.d/f8-sit.conf"
  "conf.d/f8-uat.conf:conf.d/f8-uat.conf"
  "conf.d/plan.conf:conf.d/plan.conf"
  "conf.d/pentagi.conf:conf.d/pentagi.conf"
)

die() { echo "ERROR: $*" >&2; exit 1; }

nginx_master_pid() {
  local pids
  pids="$(ps -eo pid=,args= | awk '/nginx: [m]aster process/ { print $1 }')"
  [[ "$(wc -w <<<"$pids")" -eq 1 ]] || die "expected exactly one nginx master process, found: ${pids:-none}"
  printf '%s\n' "$pids"
}

ensure_nginx_pid_file() {
  local master_pid current_pid
  master_pid="$(nginx_master_pid)"
  current_pid="$(sudo cat /run/nginx.pid 2>/dev/null || true)"
  if [[ "$current_pid" != "$master_pid" ]]; then
    echo "repairing nginx PID file: ${current_pid:-empty} → $master_pid" >&2
    printf '%s\n' "$master_pid" | sudo tee /run/nginx.pid >/dev/null
  fi
  [[ "$(sudo cat /run/nginx.pid 2>/dev/null || true)" == "$master_pid" ]] || die "failed to write nginx PID file"
  printf '%s\n' "$master_pid"
}

drift_check() {
  local dirty=0
  for f in "${FILES[@]}"; do
    local src="${f%%:*}" dest="${f#*:}"
    if diff -q "$SRC/$src" "/etc/nginx/$dest" >/dev/null 2>&1; then
      echo "ok     $dest"
    else
      echo "DRIFT  $dest"
      dirty=1
    fi
  done
  return $dirty
}

[[ -x /usr/sbin/nginx ]] || [[ -x /usr/bin/nginx ]] || die "nginx not found — run this on the webserver (yuan.z@10.15.12.2), not the dev box"
sudo -n true 2>/dev/null || die "passwordless sudo required on this host"

case "${1:-}" in
  --check)
    echo "=== drift (tracked → /etc/nginx) ==="
    drift_check || echo "(drift found — tracked ≠ live)"
    echo "=== nginx -t ==="
    sudo nginx -t && echo "nginx -t OK"
    ;;
  --diff)
    for f in "${FILES[@]}"; do
      src="${f%%:*}" dest="${f#*:}"
      echo "=== $dest (live → tracked) ==="
      diff -u "/etc/nginx/$dest" "$SRC/$src" || true
    done
    ;;
  "")
    echo "=== deploying $(basename "$SRC") → /etc/nginx ==="
    drift_check
    sudo mkdir -p "$BACKUP"
    for f in "${FILES[@]}"; do
      src="${f%%:*}" dest="${f#*:}"
      sudo cp -a "/etc/nginx/$dest" "$BACKUP/$(basename "$dest")" 2>/dev/null || true
      sudo cp "$SRC/$src" "/etc/nginx/$dest" || die "copy failed: $dest"
    done
    if sudo nginx -t >/dev/null 2>&1; then
      master_pid="$(ensure_nginx_pid_file)"
      if sudo nginx -s reload; then
        echo "OK — applied + reloaded. PID: $master_pid. Backup: $BACKUP"
      else
        echo "nginx reload FAILED — restoring backup" >&2
        for f in "${FILES[@]}"; do
          dest="${f#*:}"
          sudo cp -a "$BACKUP/$(basename "$dest")" "/etc/nginx/$dest" 2>/dev/null || true
        done
        sudo nginx -t 2>&1 | tail -3
        exit 1
      fi
    else
      echo "nginx -t FAILED — restoring backup" >&2
      for f in "${FILES[@]}"; do
        dest="${f#*:}"
        sudo cp -a "$BACKUP/$(basename "$dest")" "/etc/nginx/$dest" 2>/dev/null || true
      done
      sudo nginx -t 2>&1 | tail -3
      exit 1
    fi
    ;;
  *)
    echo "usage: $0 [--check | --diff]" >&2; exit 2
    ;;
esac
