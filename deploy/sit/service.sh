#!/usr/bin/env bash
# deploy/sit/service.sh
#
# SIT 环境后端服务管理 — 部署到 PortalServer (10.16.11.18, ecs-user) 后由 deploy.sh 远程调用。
# 运行产物来自 /home/ecs-user/sit/ 各子目录，不需要 git 仓库。
#
# 配置契约（deploy/sit/CONFIG.md）：
#   - 环境私有配置只在 $DEV_DIR/env/*.env，deploy 永不覆盖该目录
#   - engine-server 的 JWT_SECRET 必须与 live-server 相同（见 ensure_engine_jwt_secret）
#
# DB + Redis 与本服务同机（10.16.11.18 本机 Docker），通过 localhost 暴露。
#
# 用法（在 PortalServer 上）：
#   bash service.sh start  [all|live-server|engine-server]
#   bash service.sh stop   [all|...]
#   bash service.sh restart [all|...]
#   bash service.sh status
#   bash service.sh logs   [服务名]
#
# 由 deploy.sh 通过 SSH 远程调用：
#   ssh ecs-user@10.16.11.18 "bash /home/ecs-user/sit/service.sh restart live-server"

set -euo pipefail

DEV_DIR="/home/ecs-user/sit"
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
        engine-server) echo 3003 ;;
        *)             echo "" ;;
    esac
}

# Kill any leftover listener on the service port (stale pid file / orphan process).
free_service_port() {
    local name="$1"
    local port
    port=$(service_port "$name")
    [ -z "$port" ] && return 0

    local pids
    pids=$(ss -lptn "sport = :$port" 2>/dev/null \
        | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' \
        | sort -u || true)
    if [ -z "$pids" ]; then
        return 0
    fi

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
    if [ -n "$pids" ]; then
        for pid in $pids; do
            kill -9 "$pid" 2>/dev/null || true
        done
    fi
}

stop_one() {
    local name="$1"
    if is_running "$name"; then
        local pid
        pid=$(get_pid "$name")
        log "停止 $name (pid $pid)..."
        kill "$pid" 2>/dev/null || true
        local i=0
        while is_running "$name" && [ $i -lt 20 ]; do sleep 0.5; i=$((i+1)); done
        if is_running "$name"; then kill -9 "$pid" 2>/dev/null || true; fi
        rm -f "$(pid_file "$name")"
        free_service_port "$name"
        ok "$name 已停止"
    else
        warn "$name 未运行"
        rm -f "$(pid_file "$name")"
        free_service_port "$name"
    fi
}

load_env() {
    local name="$1"
    local env_file="$ENV_DIR/${name}.env"
    if [ ! -f "$env_file" ]; then
        err "缺少 $env_file — 请先按 env/*.env.example 创建"
        exit 1
    fi
    # 导出变量（跳过注释和空行）
    set -a
    # shellcheck disable=SC1090
    source <(grep -v '^#' "$env_file" | grep -v '^$')
    set +a
}

# Read KEY=value from an env file without sourcing the whole file.
# Prints the value only; empty if missing.
read_env_value() {
    local env_file="$1"
    local key="$2"
    [ -f "$env_file" ] || return 0
    # Prefer the last assignment if the key appears more than once.
    grep -E "^${key}=" "$env_file" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

# engine-server config.yaml uses secret: "${JWT_SECRET}". Auto-deploy rsyncs that
# template on every --engine push; real secrets live only in $ENV_DIR (see CONFIG.md).
# If engine-server.env omits JWT_SECRET, inherit from live-server.env; refuse to start if empty.
ensure_engine_jwt_secret() {
    local eng_env="$ENV_DIR/engine-server.env"
    local live_env="$ENV_DIR/live-server.env"
    local secret="${JWT_SECRET:-}"
    local live_secret
    live_secret=$(read_env_value "$live_env" "JWT_SECRET")

    if [ -z "$secret" ]; then
        secret=$(read_env_value "$eng_env" "JWT_SECRET")
    fi
    if [ -z "$secret" ] || [ "$secret" = 'your_jwt_secret_here' ] || [ "$secret" = 'replace-with-same-value-as-live-server-jwt-secret' ] || [ "$secret" = 'replace-with-32-plus-char-random-secret' ] || [ "$secret" = '${JWT_SECRET}' ]; then
        if [ -n "$live_secret" ] && [ "$live_secret" != 'your_jwt_secret_here' ]; then
            secret="$live_secret"
            log "engine-server JWT_SECRET 未配置或为占位符，已从 live-server.env 继承"
            if [ -f "$eng_env" ]; then
                if grep -qE '^JWT_SECRET=' "$eng_env"; then
                    local tmp
                    tmp=$(mktemp)
                    while IFS= read -r line || [ -n "$line" ]; do
                        if [[ "$line" == JWT_SECRET=* ]]; then
                            printf 'JWT_SECRET=%s\n' "$secret"
                        else
                            printf '%s\n' "$line"
                        fi
                    done < "$eng_env" > "$tmp"
                    mv "$tmp" "$eng_env"
                    ok "已更新 JWT_SECRET → $eng_env"
                else
                    printf '\n# Shared with live-server (required for /api/optimize/* JWT auth)\nJWT_SECRET=%s\n' "$secret" >> "$eng_env"
                    ok "已写入 JWT_SECRET → $eng_env"
                fi
            fi
        fi
    elif [ -n "$live_secret" ] && [ "$secret" != "$live_secret" ]; then
        warn "engine-server JWT_SECRET 与 live-server.env 不一致 — /optimize/start 可能 401（见 CONFIG.md）"
    fi

    if [ -z "$secret" ] || [ "$secret" = 'your_jwt_secret_here' ] || [ "$secret" = 'replace-with-same-value-as-live-server-jwt-secret' ] || [ "$secret" = 'replace-with-32-plus-char-random-secret' ] || [ "$secret" = '${JWT_SECRET}' ]; then
        err "engine-server 缺少有效 JWT_SECRET（须与 live-server 相同）。"
        err "请在 $eng_env 设置 JWT_SECRET=... 后重试。参见 deploy/sit/CONFIG.md"
        exit 1
    fi
    export JWT_SECRET="$secret"
}

# ── 启动函数 ──────────────────────────────────────────────────────
start_live_server() {
    if is_running "live-server"; then warn "live-server 已在运行 (pid $(get_pid live-server))"; return; fi
    log "启动 live-server (port 3000)..."
    local svc_dir="$DEV_DIR/live-server"
    [ -f "$svc_dir/dist/index.js" ] || { err "$svc_dir/dist/index.js 不存在，请先 deploy --live"; exit 1; }
    load_env "live-server"
    cd "$svc_dir"
    nohup node dist/index.js >> "$LOG_DIR/live-server.log" 2>&1 &
    save_pid "live-server"
    # Cold start can exceed 1s under load; poll instead of single sleep.
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

start_engine_server() {
    if is_running "engine-server"; then warn "engine-server 已在运行 (pid $(get_pid engine-server))"; return; fi
    log "启动 engine-server (port 3003)..."
    local svc_dir="$DEV_DIR/engine-server"
    [ -f "$svc_dir/main.py" ] || { err "$svc_dir/main.py 不存在，请先 deploy --engine"; exit 1; }
    load_env "engine-server"
    ensure_engine_jwt_secret
    cd "$svc_dir"
    local py3
    if [ -f "$svc_dir/venv/bin/python3" ]; then
        py3="$svc_dir/venv/bin/python3"
    else
        py3="python3"
    fi
    export ROIS_CONFIG_PATH="$svc_dir/config.yaml"
    nohup "$py3" -m uvicorn main:app --host 0.0.0.0 --port 3003 \
        >> "$LOG_DIR/engine-server.log" 2>&1 &
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

# ── 状态显示 ──────────────────────────────────────────────────────
show_status() {
    echo ""
    printf "┌──────────────────────┬────────┬──────────────────────────────┐\n"
    printf "│ 服务                 │ Port   │ 状态                         │\n"
    printf "├──────────────────────┼────────┼──────────────────────────────┤\n"
    for svc in live-server engine-server; do
        local port=""
        case "$svc" in
            live-server)   port=3000 ;;
            engine-server) port=3003 ;;
        esac
        if is_running "$svc"; then
            status="running  pid=$(get_pid $svc)"
        else
            status="stopped"
        fi
        printf "│ %-20s │ %-6s │ %-28s │\n" "$svc" "$port" "$status"
    done
    printf "└──────────────────────┴────────┴──────────────────────────────┘\n"
    echo "  Logs : $LOG_DIR/"
    echo "  Env  : $ENV_DIR/"
}

# ── 主逻辑 ────────────────────────────────────────────────────────
CMD="${1:-status}"
TARGET="${2:-all}"

SERVICES=(live-server engine-server)

case "$CMD" in
    start)
        case "$TARGET" in
            all)           for s in "${SERVICES[@]}"; do "start_${s//-/_}"; done ;;
            live-server)   start_live_server ;;
            engine-server) start_engine_server ;;
            *) err "未知服务: $TARGET"; exit 1 ;;
        esac
        ;;
    stop)
        case "$TARGET" in
            all) for s in "${SERVICES[@]}"; do stop_one "$s"; done ;;
            *)   stop_one "$TARGET" ;;
        esac
        ;;
    restart)
        case "$TARGET" in
            all)
                for s in "${SERVICES[@]}"; do stop_one "$s"; done
                sleep 1
                for s in "${SERVICES[@]}"; do "start_${s//-/_}"; done
                ;;
            live-server)   stop_one live-server;   sleep 1; start_live_server ;;
            engine-server) stop_one engine-server; sleep 1; start_engine_server ;;
            *) err "未知服务: $TARGET"; exit 1 ;;
        esac
        ;;
    status)
        show_status
        ;;
    logs)
        local_svc="${2:-}"
        if [ -n "$local_svc" ]; then
            tail -f "$LOG_DIR/${local_svc}.log"
        else
            echo "用法: $0 logs <service>"
            ls "$LOG_DIR/" 2>/dev/null || echo "(无日志文件)"
        fi
        ;;
    *)
        echo "用法: $0 [start|stop|restart|status|logs] [all|live-server|engine-server]"
        exit 1
        ;;
esac
