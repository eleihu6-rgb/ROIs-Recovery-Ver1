#!/bin/bash
# Keep exactly ONE live-server (the crew roster API on port 3000) alive.
#
# Why this exists (2026-09-11, Ryan testing crew J4002):
#   The crew app's ET/F8 login posts to https://cr.rois.one/api, which the
#   Cloudflare tunnel forwards to this Mac's :3000. Two orphaned `tsx watch`
#   supervisors were left running, so every code edit restarted two children at
#   once; the port ended up empty (or mid-restart) and Cloudflare answered 502.
#   The app then showed "roster service unavailable" and the crew could not log
#   in — while the account and roster data were perfectly fine.
#
# What it does:
#   * owns port 3000 — clears any stray live-server before taking over
#   * keeps one child running with hot reload (`tsx watch src/index.ts`)
#   * restarts the child when it exits, AND when it is alive but no longer
#     listening (the silent zombie-watch failure mode)
#   * logs both the server and the supervisor to /tmp/rois-services/
#
# Usage:
#   scripts/live-server-supervisor.sh start    # idempotent: safe to re-run
#   scripts/live-server-supervisor.sh status
#   scripts/live-server-supervisor.sh stop
#   scripts/live-server-supervisor.sh install    # launchd agent: survives logout/reboot
#   scripts/live-server-supervisor.sh uninstall
set -u

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LIVE_DIR="$REPO_DIR/live-server"
LOG_DIR="/tmp/rois-services"
SERVER_LOG="$LOG_DIR/live-server.log"
SUPERVISOR_LOG="$LOG_DIR/live-server-supervisor.log"
PID_FILE="$LOG_DIR/live-server-supervisor.pid"
AGENT_LABEL="com.rois.live-server-supervisor"
AGENT_PLIST="$HOME/Library/LaunchAgents/$AGENT_LABEL.plist"
PORT=3000
HEALTH_URL="http://127.0.0.1:$PORT/api/health"
CHECK_SECONDS=5
# Two misses in a row (~10s) before restarting, so a normal tsx reload (a few
# seconds of downtime on a code edit) is not treated as a crash.
FAILURES_BEFORE_RESTART=2

mkdir -p "$LOG_DIR"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$SUPERVISOR_LOG"
}

# Every live-server process for THIS checkout, whatever started it. Matched on
# the exact repo path + entrypoint so we never touch another worktree's server.
stray_server_pids() {
  local pid cmd
  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    [ "$pid" = "$$" ] && continue
    cmd="$(ps -o command= -p "$pid" 2>/dev/null)"
    case "$cmd" in
      '') continue ;;
      *grep*) continue ;;
      *live-server-supervisor*) continue ;;
      *"$LIVE_DIR"*'src/index.ts'*) echo "$pid" ;;
    esac
  done < <(pgrep -f "$LIVE_DIR" 2>/dev/null)
}

# Any other manager that keeps a live-server on :3000 makes two children fight
# for the port (EADDRINUSE → port empty → Cloudflare 502 → "cannot log in").
# 2026-09-11: an ad-hoc `launchctl submit -l rois-live-server-3000` job was doing
# exactly that against this supervisor.
retire_duplicate_managers() {
  if launchctl list 2>/dev/null | grep -q 'rois-live-server-3000'; then
    log "retiring duplicate launcher: rois-live-server-3000"
    launchctl remove rois-live-server-3000 2>/dev/null
  fi
}

port_pid() {
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1
}

healthy() {
  curl -fsS -m 3 -o /dev/null "$HEALTH_URL" 2>/dev/null
}

kill_strays() {
  local pids
  pids="$(stray_server_pids)"
  if [ -z "$pids" ]; then
    return 0
  fi
  log "clearing stray live-server process(es): $(echo "$pids" | tr '\n' ' ')"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null
  sleep 2
  pids="$(stray_server_pids)"
  if [ -n "$pids" ]; then
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null
    sleep 1
  fi
}

start_child() {
  log "starting tsx watch src/index.ts (port $PORT)"
  (
    cd "$LIVE_DIR" || exit 1
    exec npx tsx watch src/index.ts
  ) >> "$SERVER_LOG" 2>&1 &
  CHILD_PID=$!
  log "child pid $CHILD_PID"
}

run_loop() {
  echo "$$" > "$PID_FILE"
  log "supervisor started (pid $$)"
  retire_duplicate_managers
  kill_strays
  start_child
  local failures=0
  while true; do
    sleep "$CHECK_SECONDS"
    if ! kill -0 "$CHILD_PID" 2>/dev/null; then
      log "child $CHILD_PID exited — restarting"
      kill_strays
      start_child
      failures=0
      continue
    fi
    if healthy; then
      failures=0
      continue
    fi
    failures=$((failures + 1))
    log "health check failed ($failures/$FAILURES_BEFORE_RESTART)"
    if [ "$failures" -ge "$FAILURES_BEFORE_RESTART" ]; then
      log "port $PORT not serving — recycling child $CHILD_PID"
      kill "$CHILD_PID" 2>/dev/null
      sleep 2
      kill -9 "$CHILD_PID" 2>/dev/null
      kill_strays
      start_child
      failures=0
    fi
  done
}

supervisor_pid() {
  local pid
  [ -f "$PID_FILE" ] || return 1
  pid="$(cat "$PID_FILE" 2>/dev/null)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && echo "$pid"
}

case "${1:-start}" in
  start)
    if pid="$(supervisor_pid)"; then
      echo "live-server supervisor already running (pid $pid)"
      exit 0
    fi
    retire_duplicate_managers
    nohup bash "$0" __run >> "$SUPERVISOR_LOG" 2>&1 &
    sleep 6
    if pid="$(supervisor_pid)"; then
      echo "live-server supervisor started (pid $pid)"
      echo "  health: $(healthy && echo ok || echo 'not up yet')"
      echo "  logs:   $SERVER_LOG"
      echo "          $SUPERVISOR_LOG"
    else
      echo "supervisor failed to start — see $SUPERVISOR_LOG" >&2
      exit 1
    fi
    ;;
  __run)
    run_loop
    ;;
  install)
    # launchd owns the supervisor so it survives a terminal closing, a logout
    # and a reboot — the failure mode that took the crew app's login down.
    mkdir -p "$(dirname "$AGENT_PLIST")"
    cat > "$AGENT_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$AGENT_LABEL</string>
  <key>Comment</key>
  <string>Keep exactly one live-server (crew roster API, port 3000) running. Manage with scripts/live-server-supervisor.sh.</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$REPO_DIR/scripts/live-server-supervisor.sh</string>
    <string>__run</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$LIVE_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$SUPERVISOR_LOG</string>
  <key>StandardErrorPath</key>
  <string>$SUPERVISOR_LOG</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
PLIST
    launchctl bootout "gui/$(id -u)/$AGENT_LABEL" 2>/dev/null
    launchctl bootstrap "gui/$(id -u)" "$AGENT_PLIST" || {
      echo "launchctl bootstrap failed — see $AGENT_PLIST" >&2
      exit 1
    }
    sleep 8
    echo "launchd agent installed: $AGENT_LABEL"
    "$0" status
    ;;
  uninstall)
    launchctl bootout "gui/$(id -u)/$AGENT_LABEL" 2>/dev/null
    find "$(dirname "$AGENT_PLIST")" -maxdepth 1 -name "$AGENT_LABEL.plist" -delete 2>/dev/null
    "$0" stop
    echo "launchd agent removed: $AGENT_LABEL"
    ;;
  stop)
    launchctl bootout "gui/$(id -u)/$AGENT_LABEL" 2>/dev/null
    if pid="$(supervisor_pid)"; then
      kill "$pid" 2>/dev/null
      log "supervisor stopped (pid $pid)"
      sleep 1
    fi
    find "$LOG_DIR" -maxdepth 1 -name 'live-server-supervisor.pid' -delete 2>/dev/null
    kill_strays
    echo "live-server supervisor stopped"
    ;;
  status)
    if launchctl list 2>/dev/null | grep -q "$AGENT_LABEL"; then
      echo "launchd agent: installed ($AGENT_LABEL)"
    else
      echo "launchd agent: not installed"
    fi
    if pid="$(supervisor_pid)"; then
      echo "supervisor: running (pid $pid)"
    else
      echo "supervisor: not running"
    fi
    if launchctl list 2>/dev/null | grep -q 'rois-live-server-3000'; then
      echo "WARNING: duplicate launcher still present: rois-live-server-3000"
    fi
    echo "port $PORT: $(port_pid || echo 'no listener')"
    echo "health:    $(healthy && echo ok || echo DOWN)"
    echo "server pid(s): $(stray_server_pids | tr '\n' ' ')"
    ;;
  *)
    echo "usage: $0 {start|stop|status|__run}" >&2
    exit 2
    ;;
esac
