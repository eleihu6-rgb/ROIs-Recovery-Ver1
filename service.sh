#!/bin/bash
#
# ROIS 服务管理脚本
# 支持: 启动/停止/重启 所有服务或单个服务
#
# 服务列表:
#   report-python    - PBS Report Python (5001)
#   report-backend   - PBS Report Backend (5003)
#   report-frontend  - PBS Report Frontend (5002)
#   flair-backend    - Royce-Flair Backend (3500)
#   flair-frontend   - Royce-Flair Frontend (5173)
#   live-server      - rois-ai Live Server (3000)
#   rule-engine      - rois-ai Rule Engine (3001)
#   pbs-server       - rois-ai PBS Server (3002)
#   engine-server    - rois-ai Engine Server (3103, local development)
#   connector-server - rois-ai Connector Server (3104, local development)
#   gantt            - rois-ai Gantt Frontend (5566)
#   pbs-portal       - rois-ai PBS Portal (3030)
#
# 使用方式:
#   ./service.sh start [all|服务名]
#   ./service.sh stop [all|服务名]
#   ./service.sh restart [all|服务名]
#   ./service.sh status
#

set -e

# === 配置区 ===
ROIS_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="/tmp/rois-services"

# 端口配置
declare -A PORTS=(
    ["report-python"]=5001
    ["report-backend"]=5003
    ["report-frontend"]=5002
    ["flair-backend"]=3500
    ["flair-frontend"]=5173
    ["live-server"]=3000
    ["rule-engine"]=3001
    ["pbs-server"]=3002
    ["engine-server"]=3103
    ["connector-server"]=3104
    ["gantt"]=5566
    ["pbs-portal"]=3030
)

# 服务分组
REPORT_SERVICES=("report-python" "report-backend" "report-frontend")
FLAIR_SERVICES=("flair-backend" "flair-frontend")
ROIS_AI_SERVICES=("live-server" "rule-engine" "pbs-server" "engine-server" "connector-server" "gantt" "pbs-portal")
ALL_SERVICES=(
    "report-python" "report-backend" "report-frontend"
    "flair-backend" "flair-frontend"
    "live-server" "rule-engine" "pbs-server" "engine-server" "connector-server" "gantt" "pbs-portal"
)

# 创建日志目录
mkdir -p "$LOG_DIR"

# === 辅助函数 ===

log_info() { echo "✅ $1"; }
log_warn() { echo "⚠️  $1"; }
log_error() { echo "❌ $1"; }
log_action() { echo "🔧 $1"; }

# 检查端口是否被占用
check_port() {
    local port=$1
    lsof -t -i:$port >/dev/null 2>&1
}

# 检查端口是否被占用（带重试）
check_port_retry() {
    local port=$1
    local retries=${2:-5}
    local delay=${3:-1}
    for i in $(seq 1 $retries); do
        if lsof -t -i:$port >/dev/null 2>&1; then
            return 0
        fi
        sleep $delay
    done
    return 1
}

# 获取端口占用的 PID
get_port_pid() {
    local port=$1
    lsof -t -i:$port 2>/dev/null
}

# 强制释放端口
kill_port() {
    local port=$1
    local pids=$(get_port_pid $port)
    if [ -n "$pids" ]; then
        kill -9 $pids >/dev/null 2>&1 || true
        sleep 1
    fi
}

# === 启动函数 ===

start_report_python() {
    log_action "启动 report-python (端口 5001)..."
    kill_port 5001
    cd "$ROIS_DIR/Flair_PBS_Optimization_Report/python_services"
    # 使用系统 Python 或用户安装的 uvicorn
    if [ -f "/root/miniconda3/bin/python" ] && [ -x "/root/miniconda3/bin/python" ]; then
        PYTHON_CMD="/root/miniconda3/bin/python"
    else
        PYTHON_CMD="python3"
    fi
    nohup $PYTHON_CMD -m uvicorn src.main:app --host 0.0.0.0 --port 5001 --reload > "$LOG_DIR/report-python.log" 2>&1 &
    cd "$ROIS_DIR"
    if check_port_retry 5001 5 1; then
        log_info "report-python 已启动"
    else
        log_error "report-python 启动失败，查看日志: $LOG_DIR/report-python.log"
    fi
}

start_report_backend() {
    log_action "启动 report-backend (端口 5003)..."
    kill_port 5003
    cd "$ROIS_DIR/Flair_PBS_Optimization_Report/backend"
    nohup npm run dev > "$LOG_DIR/report-backend.log" 2>&1 &
    cd "$ROIS_DIR"
    if check_port_retry 5003 5 1; then
        log_info "report-backend 已启动"
    else
        log_error "report-backend 启动失败，查看日志: $LOG_DIR/report-backend.log"
    fi
}

start_report_frontend() {
    log_action "启动 report-frontend (端口 5002)..."
    kill_port 5002
    cd "$ROIS_DIR/Flair_PBS_Optimization_Report/frontend"
    nohup npm run dev > "$LOG_DIR/report-frontend.log" 2>&1 &
    cd "$ROIS_DIR"
    if check_port_retry 5002 5 1; then
        log_info "report-frontend 已启动"
    else
        log_error "report-frontend 启动失败，查看日志: $LOG_DIR/report-frontend.log"
    fi
}

start_flair_backend() {
    log_action "启动 flair-backend (端口 3500)..."
    kill_port 3500
    cd "$ROIS_DIR/Royce-Flair/backend"
    source venv/bin/activate
    nohup python -m uvicorn main:app --host 0.0.0.0 --port 3500 --reload > "$LOG_DIR/flair-backend.log" 2>&1 &
    deactivate
    cd "$ROIS_DIR"
    if check_port_retry 3500 5 1; then
        log_info "flair-backend 已启动"
    else
        log_error "flair-backend 启动失败，查看日志: $LOG_DIR/flair-backend.log"
    fi
}

start_flair_frontend() {
    log_action "启动 flair-frontend (端口 5173)..."
    kill_port 5173
    cd "$ROIS_DIR/Royce-Flair/frontend"
    nohup npm run dev -- --host 0.0.0.0 > "$LOG_DIR/flair-frontend.log" 2>&1 &
    cd "$ROIS_DIR"
    if check_port_retry 5173 5 1; then
        log_info "flair-frontend 已启动"
    else
        log_error "flair-frontend 启动失败，查看日志: $LOG_DIR/flair-frontend.log"
    fi
}

start_live_server() {
    log_action "启动 live-server (端口 3000)..."
    kill_port 3000
    cd "$ROIS_DIR/rois-ai/live-server"
    nohup npm run dev > "$LOG_DIR/live-server.log" 2>&1 &
    cd "$ROIS_DIR"
    if check_port_retry 3000 5 1; then
        log_info "live-server 已启动"
    else
        log_error "live-server 启动失败，查看日志: $LOG_DIR/live-server.log"
    fi
}

start_rule_engine() {
    log_action "启动 rule-engine (端口 3001)..."
    kill_port 3001
    cd "$ROIS_DIR/rois-ai/rule-engine"
    nohup npm run dev > "$LOG_DIR/rule-engine.log" 2>&1 &
    cd "$ROIS_DIR"
    if check_port_retry 3001 5 1; then
        log_info "rule-engine 已启动"
    else
        log_error "rule-engine 启动失败，查看日志: $LOG_DIR/rule-engine.log"
    fi
}

start_pbs_server() {
    log_action "启动 pbs-server (端口 3002)..."
    kill_port 3002
    cd "$ROIS_DIR/rois-ai/pbs-server"
    nohup npm run dev > "$LOG_DIR/pbs-server.log" 2>&1 &
    cd "$ROIS_DIR"
    if check_port_retry 3002 5 1; then
        log_info "pbs-server 已启动"
    else
        log_error "pbs-server 启动失败，查看日志: $LOG_DIR/pbs-server.log"
    fi
}

start_engine_server() {
    log_action "启动 engine-server (端口 3103)..."
    kill_port 3103
    cd "$ROIS_DIR/engine-server"
    nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 3103 --reload > "$LOG_DIR/engine-server.log" 2>&1 &
    cd "$ROIS_DIR"
    if check_port_retry 3103 5 1; then
        log_info "engine-server 已启动"
    else
        log_error "engine-server 启动失败，查看日志: $LOG_DIR/engine-server.log"
    fi
}

start_connector_server() {
    log_action "启动 connector-server (端口 3104)..."
    kill_port 3104
    cd "$ROIS_DIR/connector-server"
    PORT=3104 nohup npm run dev > "$LOG_DIR/connector-server.log" 2>&1 &
    cd "$ROIS_DIR"
    if check_port_retry 3104 5 1; then
        log_info "connector-server 已启动"
    else
        log_error "connector-server 启动失败，查看日志: $LOG_DIR/connector-server.log"
    fi
}

start_gantt() {
    log_action "启动 gantt (端口 5566)..."
    kill_port 5566
    cd "$ROIS_DIR/rois-ai/gantt"
    export VITE_PORT=5566
    nohup npm run dev -- --host 0.0.0.0 > "$LOG_DIR/gantt.log" 2>&1 &
    cd "$ROIS_DIR"
    if check_port_retry 5566 5 1; then
        log_info "gantt 已启动"
    else
        log_error "gantt 启动失败，查看日志: $LOG_DIR/gantt.log"
    fi
}

start_pbs_portal() {
    log_action "启动 pbs-portal (端口 3030)..."
    kill_port 3030
    cd "$ROIS_DIR/rois-ai/pbs-portal"
    export PBS_PORTAL_DEV_PORT=3030
    nohup npm run dev -- --host 0.0.0.0 > "$LOG_DIR/pbs-portal.log" 2>&1 &
    cd "$ROIS_DIR"
    if check_port_retry 3030 5 1; then
        log_info "pbs-portal 已启动"
    else
        log_error "pbs-portal 启动失败，查看日志: $LOG_DIR/pbs-portal.log"
    fi
}

# === 停止函数 ===

stop_service() {
    local service=$1
    local port=${PORTS[$service]}
    if [ -z "$port" ]; then
        log_error "未知服务: $service"
        return 1
    fi
    log_action "停止 $service (端口 $port)..."
    kill_port $port
    if check_port $port; then
        log_warn "$service 端口仍被占用"
    else
        log_info "$service 已停止"
    fi
}

# === 状态检查 ===

show_status() {
    echo ""
    echo "┌─────────────────────────────────────────────────────────┐"
    echo "│                   ROIS 服务状态                          │"
    echo "├─────────────────────┬──────────┬────────────────────────┤"
    echo "│ 服务                │ 端口     │ 状态                   │"
    echo "├─────────────────────┼──────────┼────────────────────────┤"

    for service in "${ALL_SERVICES[@]}"; do
        port=${PORTS[$service]}
        if check_port $port; then
            status="✅ 运行中"
        else
            status="⬜ 已停止"
        fi
        printf "│ %-19s │ %-8s │ %-22s │\n" "$service" "$port" "$status"
    done

    echo "└─────────────────────┴──────────┴────────────────────────┘"
    echo ""
    echo "日志目录: $LOG_DIR"
}

# === 主逻辑 ===

case "$1" in
    start)
        if [ -z "$2" ] || [ "$2" = "all" ]; then
            echo "🚀 启动所有服务..."
            for service in "${ALL_SERVICES[@]}"; do
                "start_${service//-/_}"
            done
        elif [ "$2" = "report" ]; then
            echo "🚀 启动 Report 服务..."
            start_report_python
            start_report_backend
            start_report_frontend
        elif [ "$2" = "flair" ]; then
            echo "🚀 启动 Flair 服务..."
            start_flair_backend
            start_flair_frontend
        elif [ "$2" = "rois-ai" ]; then
            echo "🚀 启动 rois-ai 服务..."
            start_live_server
            start_rule_engine
            start_pbs_server
            start_engine_server
            start_connector_server
            start_gantt
            start_pbs_portal
        else
            service=$2
            if [[ " ${ALL_SERVICES[*]} " =~ " $service " ]]; then
                "start_${service//-/_}"
            else
                log_error "未知服务: $service"
                echo "可用服务: ${ALL_SERVICES[*]}"
                echo "分组: report, flair, rois-ai, all"
                exit 1
            fi
        fi
        ;;

    stop)
        if [ -z "$2" ] || [ "$2" = "all" ]; then
            echo "🛑 停止所有服务..."
            for service in "${ALL_SERVICES[@]}"; do
                stop_service "$service"
            done
        elif [ "$2" = "report" ]; then
            echo "🛑 停止 Report 服务..."
            for service in "${REPORT_SERVICES[@]}"; do
                stop_service "$service"
            done
        elif [ "$2" = "flair" ]; then
            echo "🛑 停止 Flair 服务..."
            for service in "${FLAIR_SERVICES[@]}"; do
                stop_service "$service"
            done
        elif [ "$2" = "rois-ai" ]; then
            echo "🛑 停止 rois-ai 服务..."
            for service in "${ROIS_AI_SERVICES[@]}"; do
                stop_service "$service"
            done
        else
            service=$2
            if [[ " ${ALL_SERVICES[*]} " =~ " $service " ]]; then
                stop_service "$service"
            else
                log_error "未知服务: $service"
                echo "可用服务: ${ALL_SERVICES[*]}"
                echo "分组: report, flair, rois-ai, all"
                exit 1
            fi
        fi
        ;;

    restart)
        $0 stop "$2"
        sleep 2
        $0 start "$2"
        ;;

    status)
        show_status
        ;;

    logs)
        service=$2
        if [ -n "$service" ] && [ -f "$LOG_DIR/${service//-/_}.log" ]; then
            tail -50 "$LOG_DIR/${service//-/_}.log"
        elif [ -n "$service" ]; then
            log_error "日志文件不存在: $LOG_DIR/${service//-/_}.log"
        else
            echo "日志文件列表:"
            ls -la "$LOG_DIR"
        fi
        ;;

    *)
        echo "使用方式:"
        echo "  $0 start [all|服务名|分组名]   - 启动服务"
        echo "  $0 stop [all|服务名|分组名]    - 停止服务"
        echo "  $0 restart [all|服务名|分组名] - 重启服务"
        echo "  $0 status                     - 查看状态"
        echo "  $0 logs [服务名]               - 查看日志"
        echo ""
        echo "服务列表:"
        echo "  report:    report-python (5001), report-backend (5003), report-frontend (5002)"
        echo "  flair:     flair-backend (3500), flair-frontend (5173)"
        echo "  rois-ai:   live-server (3000), rule-engine (3001), pbs-server (3002),"
        echo "             engine-server (3103), connector-server (3104),"
        echo "             gantt (5566), pbs-portal (3030)"
        echo ""
        echo "分组名: report, flair, rois-ai, all"
        ;;
esac
