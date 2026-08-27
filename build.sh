#!/usr/bin/env bash
# build.sh — 构建前端项目并将 dist 覆盖到 10.15.12.2 对应目录
#
# 用法:
#   ./build.sh             # 构建并部署 gantt + pbs → UAT (/home/yuan.z/rois/uat/)
#   ./build.sh gantt       # 仅构建并部署 gantt → UAT
#   ./build.sh pbs         # 仅构建并部署 pbs-portal → UAT
#   ./build.sh --env dev [gantt|pbs|all]
#              构建 dev 环境版本（/dev/gantt/ base + /dev/ API 前缀）并推送到 WebServer /home/yuan.z/rois/dev/
#
# 部署目标 (WebServer 10.15.12.2):
#   UAT: gantt → /home/yuan.z/rois/uat/gantt/   pbs → /home/yuan.z/rois/uat/pbs/
#   Dev: gantt → /home/yuan.z/rois/dev/gantt/   pbs → /home/yuan.z/rois/dev/pbs/
#
# 前置条件: 配置 SSH 免密登录
#   ssh-copy-id yuan.z@10.15.12.2

set -euo pipefail

ROIS_AI="$HOME/rois/rois-ai"
REMOTE="yuan.z@10.15.12.2"

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
ok()   { echo "[$(date '+%H:%M:%S')] ✓ $*"; }
fail() { echo "[$(date '+%H:%M:%S')] ✗ $*" >&2; exit 1; }

# ── 解析参数 ─────────────────────────────────────────────────────
ENV="uat"
ARGS=()
for arg in "$@"; do
    case "$arg" in
        --env) : ;;
        uat|dev)
            if [[ "${PREV:-}" == "--env" ]]; then ENV="$arg"; else ARGS+=("$arg"); fi
            ;;
        *) ARGS+=("$arg") ;;
    esac
    PREV="$arg"
done
# Second pass: detect --env X pattern
for i in "${!@}"; do
    if [[ "${!i}" == "--env" ]]; then
        next=$((i+1))
        ENV="${!next:-uat}"
    fi
done

if [ "$ENV" = "dev" ]; then
    REMOTE_GANTT="/home/yuan.z/rois/dev/gantt"
    REMOTE_PBS="/home/yuan.z/rois/dev/pbs"
    BUILD_ENV_GANTT="$ROIS_AI/deploy/dev/env/gantt.build.env"
    BUILD_ENV_PBS="$ROIS_AI/deploy/dev/env/pbs-portal.build.env"
else
    REMOTE_GANTT="/home/yuan.z/rois/uat/gantt"
    REMOTE_PBS="/home/yuan.z/rois/uat/pbs"
    BUILD_ENV_GANTT="$ROIS_AI/deploy/uat/env/gantt.build.env"
    BUILD_ENV_PBS="$ROIS_AI/deploy/uat/env/pbs-portal.build.env"
fi

check_ssh() {
    ssh -o ConnectTimeout=10 -o BatchMode=yes "$REMOTE" true \
        || fail "SSH 连接 $REMOTE 失败，请先执行: ssh-copy-id yuan.z@10.15.12.2"
}

# 原子覆盖: scp 到临时目录后再替换，避免部署中途暴露不完整文件
deploy() {
    local dist="$1"
    local remote_dir="$2"
    local label="$3"
    local tmp="${remote_dir}.new"

    log "[$label] 上传 dist → $REMOTE:$tmp"
    ssh "$REMOTE" "rm -rf '$tmp' && mkdir -p '$tmp'"
    scp -r "$dist/." "$REMOTE:$tmp/"

    log "[$label] 覆盖 $remote_dir"
    ssh "$REMOTE" "rm -rf '$remote_dir' && mv '$tmp' '$remote_dir'"

    ok "[$label] 完成 → $REMOTE:$remote_dir"
}

build_gantt() {
    log "[gantt/$ENV] 构建..."
    cd "$ROIS_AI/gantt"
    if [ -n "$BUILD_ENV_GANTT" ]; then
        env $(cat "$BUILD_ENV_GANTT" | grep -v '^#' | grep -v '^$' | xargs) npm run build
    else
        npm run build
    fi
    ok "[gantt/$ENV] 构建完成"
    deploy "$ROIS_AI/gantt/dist" "$REMOTE_GANTT" "gantt/$ENV"
}

build_pbs() {
    log "[pbs/$ENV] 构建..."
    cd "$ROIS_AI/pbs-portal"
    if [ -n "$BUILD_ENV_PBS" ]; then
        env $(cat "$BUILD_ENV_PBS" | grep -v '^#' | grep -v '^$' | xargs) npm run build
    else
        npm run build
    fi
    ok "[pbs/$ENV] 构建完成"
    deploy "$ROIS_AI/pbs-portal/dist" "$REMOTE_PBS" "pbs/$ENV"
}

START=$(date +%s)
check_ssh

TARGET="${ARGS[0]:-all}"
case "$TARGET" in
    gantt) build_gantt ;;
    pbs)   build_pbs ;;
    all)   build_gantt; build_pbs ;;
    *)     echo "用法: $0 [--env uat|dev] [gantt|pbs|all]"; exit 1 ;;
esac

echo "[$(date '+%H:%M:%S')] 全部完成 ($ENV)，耗时 $(($(date +%s) - START))s"
