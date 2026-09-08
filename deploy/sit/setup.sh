#!/usr/bin/env bash
# deploy/sit/setup.sh
#
# 一次性初始化脚本 — 把 ~/dev/recovery/ 仓库与 10.16.11.18 SIT 环境打通。
#
# 在本机（WebServer / dev 工作站）运行：会 SSH 到 PortalServer (10.16.11.18)
# 做远端初始化，并配置本机 cron。
#
# 用法:
#   bash deploy/sit/setup.sh all
#
# 单独初始化各端：
#   bash deploy/sit/setup.sh portal    — 只做 PortalServer 端初始化（10.16.11.18）
#   bash deploy/sit/setup.sh local     — 只做本机（crontab 等）
#
# 初始化完成后执行一次全量部署：
#   bash deploy/sit/deploy.sh --all
#
# 部署范围（裁剪版）：
#   - live-server      : 后端 (Fastify, :3000)
#   - engine-server    : 后端 (FastAPI, :3003)
#   - rule-engine-rs   : Rust 法规二进制 (ruletool + check-*)
#   - packages/shared-rules / saml / contracts / legality-messages : live 运行时依赖
#   - gantt            : 前端 (静态 dist → 本机 /home/recovery/sit/gantt/)
#   不在范围：pbs-server / pbs-portal / connector-server / pbs-engine / pbs-optimization-report
#
# 前置条件：
#   本机 ~/.ssh/sit_ecs_10_16_11_18.pub 已 ssh-copy-id 到 ecs-user@10.16.11.18
#   （推荐在 ~/.ssh/config 配 Host 别名 sit-db-ecs；本脚本使用该别名）
#   本机已装：node 18+ / npm / cargo / rsync / python3

set -euo pipefail

ROIS_AI="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HASH_DIR="$SCRIPT_DIR/.pkghash"

# 远端 = 10.16.11.18 (ecs-user, sudo NOPASSWD)；通过 ~/.ssh/config 别名 sit-db-ecs 复用专用 key
PORTAL="sit-db-ecs"
PORTAL_DEV="/home/ecs-user/sit"

# 本机 = WebServer，gantt dist 直接写本地路径
LOCAL_ROIS="/home/recovery/sit"

ts()   { date '+%Y-%m-%d %H:%M:%S'; }
log()  { echo "[$(ts)] $*"; }
ok()   { echo "[$(ts)] ✓ $*"; }
fail() { echo "[$(ts)] ✗ $*" >&2; exit 1; }

check_ssh() {
    local host="$1"
    ssh -o ConnectTimeout=10 -o BatchMode=yes "$host" true \
        || fail "SSH 连接 $host 失败，请先执行: ssh-copy-id $host"
}

# ── PortalServer (10.16.11.18) 初始化 ─────────────────────────────────────
setup_portal() {
    log "=== PortalServer (10.16.11.18) 初始化 ==="
    check_ssh "$PORTAL"

    # 1. 创建目录结构（所有运行时文件都在 $PORTAL_DEV 下）
    ssh "$PORTAL" "mkdir -p \
        '$PORTAL_DEV/live-server/dist' \
        '$PORTAL_DEV/live-server/scripts' \
        '$PORTAL_DEV/engine-server' \
        '$PORTAL_DEV/rule-engine-rs/target/release' \
        '$PORTAL_DEV/packages' \
        '$PORTAL_DEV/env' \
        '$PORTAL_DEV/logs' \
        '$PORTAL_DEV/run'"
    ok "PortalServer 目录创建完成: $PORTAL_DEV"

    # 2. 推送 service.sh
    scp "$SCRIPT_DIR/service.sh" "$PORTAL:$PORTAL_DEV/service.sh"
    ssh "$PORTAL" "chmod +x '$PORTAL_DEV/service.sh'"
    ok "service.sh 已推送到 PortalServer"

    # 3. 复制 env 模板（若目标不存在才复制，不覆盖已有配置）
    for svc in live-server engine-server; do
        local src="$SCRIPT_DIR/env/${svc}.env.example"
        local dst_remote="$PORTAL_DEV/env/${svc}.env"
        if ! ssh "$PORTAL" "test -f '$dst_remote'" 2>/dev/null; then
            scp "$src" "$PORTAL:$dst_remote"
            log "已推送 env 模板 → $dst_remote（请在 PortalServer 上填入真实密码/密钥）"
        else
            log "$dst_remote 已存在，跳过"
        fi
    done

    # 4. 检查 Node.js / Python3 / gcc (rust binary 运行时不需要，但 engine-server venv 需要)
    ssh "$PORTAL" "node --version && npm --version" \
        || fail "PortalServer 上未找到 Node.js，请先安装 Node.js 18+"
    ssh "$PORTAL" "python3 --version" \
        || fail "PortalServer 上未找到 Python3，请先安装 Python 3.10+"
    ok "Node.js 和 Python3 检查通过"

    ok "=== PortalServer 初始化完成 ==="
    echo ""
    echo "下一步（在 PortalServer 上手动编辑，见 deploy/sit/CONFIG.md）："
    echo "  ssh $PORTAL"
    echo "  vim $PORTAL_DEV/env/live-server.env   # 填入 JWT_SECRET（openssl rand -base64 48）"
    echo "  vim $PORTAL_DEV/env/engine-server.env # 与 live 相同的 JWT_SECRET"
    echo "  # 禁止在 engine-server/config.yaml 写真实密钥（会被 auto-deploy 覆盖）"
}

# ── 本机（WebServer）初始化 ──────────────────────────────────────────────
setup_local() {
    log "=== 本机（WebServer）初始化 ==="

    # gantt dist 落点（atomic_local_copy 会自动 mkdir，但预创建更直观）
    mkdir -p "$LOCAL_ROIS/gantt"
    ok "本机 gantt 目录就绪: $LOCAL_ROIS/gantt"

    mkdir -p "$HASH_DIR"

    # 配置 crontab（每 10 分钟自动检测并部署）
    CRON_CMD="*/10 * * * * $SCRIPT_DIR/auto-deploy.sh >> $HASH_DIR/auto-deploy.log 2>&1"
    if crontab -l 2>/dev/null | grep -qF "auto-deploy.sh"; then
        log "crontab 已配置 auto-deploy，跳过"
    else
        (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
        ok "crontab 已配置：每 10 分钟自动检测并部署"
        log "  查看日志：$HASH_DIR/auto-deploy.log"
    fi

    chmod +x "$SCRIPT_DIR"/*.sh

    ok "=== 本机初始化完成 ==="
}

# ── 主逻辑 ───────────────────────────────────────────────────────────────
TARGET="${1:-}"
case "$TARGET" in
    portal)    setup_portal ;;
    local)     setup_local ;;
    all)
        setup_portal
        setup_local
        echo ""
        log "所有初始化完成，执行首次全量部署..."
        bash "$SCRIPT_DIR/deploy.sh" --all
        ;;
    *)
        echo "用法: $0 [all|portal|local]"
        echo ""
        echo "  all       — 初始化所有端 + 首次全量部署（推荐）"
        echo "  portal    — 仅初始化 PortalServer (10.16.11.18)"
        echo "  local     — 仅配置本机 crontab + 权限"
        exit 1
        ;;
esac
