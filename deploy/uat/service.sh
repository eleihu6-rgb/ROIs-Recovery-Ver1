#!/usr/bin/env bash
# deploy/uat/service.sh
#
# UAT 环境后端服务管理 — 部署产物位于 /home/rois/uat/（由 deploy.sh 构建部署）。
# 与 rois.sh 同构（kill_service_procs / check_port_retry 思路），但不依赖 git 仓库。
#
# 配置契约：
#   - 环境私有配置只在 $DEV_DIR/env/*.env，deploy 永不覆盖该目录
#   - Redis 为本机 localhost:6379（UAT），无需 SSH 隧道
#
# 用法：
#   bash service.sh start  [all|live-server|pbs-server|engine-server|connector-server]
#   bash service.sh stop   [all|...]
#   bash service.sh restart [all|...]
#   bash service.sh status
#   bash service.sh logs   [服务名]

set -euo pipefail

# NOTE: every service is started with `setsid nohup ... </dev/null >> log 2>&1 &`.
# - setsid puts the child in a new session, so it does NOT receive SIGHUP when
#   the service.sh script (or its parent SSH session) exits.
# - nohup makes the child ignore SIGHUP defensively.
# - </dev/null detaches stdin so the child never sees terminal EOF.
# - >>log 2>&1 redirects stdout/stderr to the per-service log file. The file
#   fd is held open by the child for its entire lifetime, so the parent
#   service.sh exit (which would otherwise close the inherited fd and turn
#   stdout into a SIGPIPE generator) does not affect the child.
# Together: the child survives service.sh returning to the shell and any
# SSH session disconnect, and keeps logging to the per-service log file.

DEV_DIR="/home/rois/uat"
LOG_DIR="$DEV_DIR/logs"
RUN_DIR="$DEV_DIR/run"
ENV_DIR="$DEV_DIR/env"

mkdir -p "$LOG_DIR" "$RUN_DIR"

ts()    { date '+%Y-%m-%d %H:%M:%S'; }
log()   { echo "[$(ts)] $*"; }
ok()    { echo "[$(ts)] ✓ $*"; }
warn()  { echo "[$(ts)] ⚠ $*"; }
err()   { echo "[$(ts)] ✗ $*" >&2; }

# ── PID 管理 ──────────────────────────────────────────────────────
pid_file()  { echo "$RUN_DIR/$1.pid"; }
get_pid()   { local f; f=$(pid_file "$1"); [ -f "$f" ] && cat "$f" || echo ""; }
save_pid()  { echo "$!" > "$(pid_file "$1")"; }

is_running() {
    local pid
    pid=$(get_pid "$1")
    [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

is_listening() {
    local port
    port=$(service_port "$1")
    [ -z "$port" ] && return 0
    ss -lptn "sport = :$port" 2>/dev/null | grep -q "pid=$(get_pid "$1")"
}

service_port() {
    case "$1" in
        live-server)   echo 3000 ;;
        pbs-server)    echo 3002 ;;
        engine-server) echo 3003 ;;
        connector-server) echo 3004 ;;
        *)             echo "" ;;
    esac
}

# 清理端口残留进程（陈旧 pid 文件 / 孤儿进程）
free_service_port() {
    local name="$1"
    local port
    port=$(service_port "$name")
    [ -z "$port" ] && return 0

    local pids
    pids=$(ss -lptn "sport = :$port" 2>/dev/null \
        | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' \
        | sort -u || true)
    [ -z "$pids" ] && return 0

    log "清理 $name 端口 $port 残留进程: $pids"
    for pid in $pids; do
        kill "$pid" 2>/dev/null || true
    done
    local i=0
    while [ $i -lt 20 ]; do
        pids=$(ss -lptn "sport = :$port" 2>/dev/null \
            | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' \
            | sort -u || true)
        [ -z "$pids" ] && break
        sleep 0.5
        i=$((i+1))
    done
    rm -f "$(pid_file "$name")"
}

# ── env ────────────────────────────────────────────────────────────
load_env() {
    local name="$1"
    local env_file="$ENV_DIR/${name}.env"
    if [ ! -f "$env_file" ]; then
        err "缺少 $env_file — 请先按 env/*.env.example 创建"
        exit 1
    fi
    set -a
    # shellcheck disable=SC1090
    source <(grep -v '^#' "$env_file" | grep -v '^$')
    set +a
}

# ── 启动 ───────────────────────────────────────────────────────────
start_live_server() {
    if is_running "live-server"; then warn "live-server 已在运行 (pid $(get_pid live-server))"; return; fi
    free_service_port "live-server"
    log "启动 live-server (port 3000)..."
    local svc_dir="$DEV_DIR/live-server"
    [ -f "$svc_dir/dist/index.js" ] || { err "$svc_dir/dist/index.js 不存在，请先 deploy"; exit 1; }
    load_env "live-server"
    cd "$svc_dir"
    setsid nohup node dist/index.js </dev/null >> "$LOG_DIR/live-server.log" 2>&1 &
    save_pid "live-server"
    local i=0
    while [ $i -lt 15 ]; do
        if is_running "live-server" && is_listening "live-server"; then
            ok "live-server 已启动 (pid $(get_pid live-server))"
            return
        fi
        sleep 0.5
        i=$((i + 1))
    done
    err "live-server 启动失败，查看日志: $LOG_DIR/live-server.log"
    tail -20 "$LOG_DIR/live-server.log" >&2
    exit 1
}

start_pbs_server() {
    if is_running "pbs-server"; then warn "pbs-server 已在运行 (pid $(get_pid pbs-server))"; return; fi
    free_service_port "pbs-server"
    log "启动 pbs-server (port 3002)..."
    local svc_dir="$DEV_DIR/pbs-server"
    [ -f "$svc_dir/dist/index.js" ] || { err "$svc_dir/dist/index.js 不存在，请先 deploy"; exit 1; }
    load_env "pbs-server"
    cd "$svc_dir"
    setsid nohup node dist/index.js </dev/null >> "$LOG_DIR/pbs-server.log" 2>&1 &
    save_pid "pbs-server"
    local i=0
    while [ $i -lt 15 ]; do
        if is_running "pbs-server" && is_listening "pbs-server"; then
            ok "pbs-server 已启动 (pid $(get_pid pbs-server))"
            return
        fi
        sleep 0.5
        i=$((i + 1))
    done
    err "pbs-server 启动失败，查看日志: $LOG_DIR/pbs-server.log"
    tail -20 "$LOG_DIR/pbs-server.log" >&2
    exit 1
}

start_engine_server() {
    if is_running "engine-server"; then warn "engine-server 已在运行 (pid $(get_pid engine-server))"; return; fi
    free_service_port "engine-server"
    log "启动 engine-server (port 3003)..."
    local svc_dir="$DEV_DIR/engine-server"
    local python="$svc_dir/.venv/bin/python"
    [ -f "$svc_dir/main.py" ] || { err "$svc_dir/main.py 不存在，请先 deploy --engine"; exit 1; }
    [ -x "$python" ] || { err "$python 不存在，请先 deploy --engine"; exit 1; }
    load_env "engine-server"
    cd "$svc_dir"
    setsid nohup "$python" -m uvicorn main:app --host 0.0.0.0 --port 3003 </dev/null >> "$LOG_DIR/engine-server.log" 2>&1 &
    save_pid "engine-server"
    local i=0
    while [ $i -lt 15 ]; do
        if is_running "engine-server" && is_listening "engine-server"; then
            ok "engine-server 已启动 (pid $(get_pid engine-server))"
            return
        fi
        sleep 0.5
        i=$((i + 1))
    done
    err "engine-server 启动失败，查看日志: $LOG_DIR/engine-server.log"
    tail -20 "$LOG_DIR/engine-server.log" >&2
    exit 1
}

start_connector_server() {
    if is_running "connector-server"; then warn "connector-server 已在运行 (pid $(get_pid connector-server))"; return; fi
    free_service_port "connector-server"
    log "启动 connector-server (port 3004)..."
    local svc_dir="$DEV_DIR/connector-server"
    [ -f "$svc_dir/dist/index.js" ] || { err "$svc_dir/dist/index.js 不存在，请先 deploy --connector"; exit 1; }
    load_env "connector-server"
    cd "$svc_dir"
    setsid nohup node dist/index.js </dev/null >> "$LOG_DIR/connector-server.log" 2>&1 &
    save_pid "connector-server"
    local i=0
    while [ $i -lt 15 ]; do
        if is_running "connector-server" && is_listening "connector-server"; then
            ok "connector-server 已启动 (pid $(get_pid connector-server))"
            return
        fi
        sleep 0.5
        i=$((i + 1))
    done
    err "connector-server 启动失败，查看日志: $LOG_DIR/connector-server.log"
    tail -20 "$LOG_DIR/connector-server.log" >&2
    exit 1
}

# ── 停止 / 重启 ───────────────────────────────────────────────────
stop_one() {
    local name="$1"
    if ! is_running "$name"; then
        warn "$name 未在运行"
        free_service_port "$name"
        return
    fi
    local pid
    pid=$(get_pid "$name")
    log "停止 $name (pid $pid)..."
    kill "$pid" 2>/dev/null || true
    local i=0
    while [ $i -lt 15 ]; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.5
        i=$((i + 1))
    done
    kill -9 "$pid" 2>/dev/null || true
    free_service_port "$name"
    ok "$name 已停止"
}

restart_one() {
    local name="$1"
    stop_one "$name"
    case "$name" in
        live-server) start_live_server ;;
        pbs-server)  start_pbs_server ;;
        engine-server) start_engine_server ;;
        connector-server) start_connector_server ;;
    esac
}

status_all() {
    for name in live-server pbs-server engine-server connector-server; do
        if is_running "$name"; then
            log "$name: 运行中 (pid $(get_pid $name), port $(service_port $name))"
        else
            log "$name: 未运行"
        fi
    done
}

logs() {
    local name="${1:-live-server}"
    tail -50 "$LOG_DIR/$name.log"
}

# ── 主入口 ─────────────────────────────────────────────────────────
CMD="${1:-}"
TARGET="${2:-all}"

case "$CMD" in
    start)
        case "$TARGET" in
            all|live-server|pbs-server|engine-server|connector-server)
                case "$TARGET" in all|live-server) start_live_server;; esac
                case "$TARGET" in all|pbs-server)  start_pbs_server;; esac
                case "$TARGET" in all|engine-server) start_engine_server;; esac
                case "$TARGET" in all|connector-server) start_connector_server;; esac
                ;;
            *) echo "未知服务: $TARGET"; exit 1 ;;
        esac
        ;;
    stop)
        case "$TARGET" in
            all) stop_one live-server; stop_one pbs-server; stop_one engine-server; stop_one connector-server ;;
            live-server|pbs-server|engine-server|connector-server) stop_one "$TARGET" ;;
            *) echo "未知服务: $TARGET"; exit 1 ;;
        esac
        ;;
    restart)
        case "$TARGET" in
            all|live-server|pbs-server|engine-server|connector-server)
                case "$TARGET" in all|live-server) restart_one live-server;; esac
                case "$TARGET" in all|pbs-server)  restart_one pbs-server;; esac
                case "$TARGET" in all|engine-server) restart_one engine-server;; esac
                case "$TARGET" in all|connector-server) restart_one connector-server;; esac
                ;;
            *) echo "未知服务: $TARGET"; exit 1 ;;
        esac
        ;;
    status)
        status_all
        ;;
    logs)
        logs "$TARGET"
        ;;
    *)
        echo "用法: $0 {start|stop|restart|status|logs} [all|live-server|pbs-server|engine-server|connector-server]"
        exit 1
        ;;
esac
