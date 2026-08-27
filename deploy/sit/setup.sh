#!/usr/bin/env bash
# deploy/dev/setup.sh
#
# 一次性初始化脚本。
#
# 在本机运行（会 SSH 到 PortalServer / WebServer 做远端初始化）：
#   bash deploy/dev/setup.sh all
#
# 单独初始化各端：
#   bash deploy/dev/setup.sh portal     — 只做 PortalServer 端初始化
#   bash deploy/dev/setup.sh webserver  — 只做 WebServer 端初始化
#   bash deploy/dev/setup.sh local      — 只做本机（crontab 等）
#
# 初始化完成后执行一次全量部署：
#   bash deploy/dev/deploy.sh --all

set -euo pipefail

ROIS_AI="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HASH_DIR="$SCRIPT_DIR/.pkghash"

PORTAL="yuan.z@10.15.12.4"
PORTAL_DEV="/home/yuan.z/rois/dev"

# 本机 = WebServer，直接操作本地路径
LOCAL_ROIS="/home/yuan.z/rois"

ts()   { date '+%Y-%m-%d %H:%M:%S'; }
log()  { echo "[$(ts)] $*"; }
ok()   { echo "[$(ts)] ✓ $*"; }
fail() { echo "[$(ts)] ✗ $*" >&2; exit 1; }

check_ssh() {
    local host="$1"
    ssh -o ConnectTimeout=10 -o BatchMode=yes "$host" true \
        || fail "SSH 连接 $host 失败，请先执行: ssh-copy-id $host"
}

# 本机 = WebServer，直接检查本地目录
check_local() { echo "本机即 WebServer，跳过 SSH 检查"; }

# ── PortalServer 初始化 ───────────────────────────────────────────
setup_portal() {
    log "=== PortalServer 初始化 ==="
    check_ssh "$PORTAL"

    # 1. 创建目录结构（所有运行时文件都在 PORTAL_DEV 下）
    ssh "$PORTAL" "mkdir -p \
        '$PORTAL_DEV/live-server/dist' \
        '$PORTAL_DEV/pbs-server/dist' \
        '$PORTAL_DEV/connector-server/dist' \
        '$PORTAL_DEV/engine-server' \
        '$PORTAL_DEV/env' \
        '$PORTAL_DEV/logs' \
        '$PORTAL_DEV/run'"
    ok "PortalServer 目录创建完成: $PORTAL_DEV"

    # 2. 推送 service.sh
    scp "$SCRIPT_DIR/service.sh" "$PORTAL:$PORTAL_DEV/service.sh"
    ssh "$PORTAL" "chmod +x '$PORTAL_DEV/service.sh'"
    ok "service.sh 已推送到 PortalServer"

    # 3. 复制 env 模板（若目标不存在才复制，不覆盖已有配置）
    for svc in live-server pbs-server connector-server engine-server; do
        local src="$SCRIPT_DIR/env/${svc}.env.example"
        local dst_remote="$PORTAL_DEV/env/${svc}.env"
        # 检查远端是否已存在
        if ! ssh "$PORTAL" "test -f '$dst_remote'" 2>/dev/null; then
            scp "$src" "$PORTAL:$dst_remote"
            log "已推送 env 模板 → $dst_remote（请在 PortalServer 上填入真实密码）"
        else
            log "$dst_remote 已存在，跳过"
        fi
    done

    # 4. 检查 Node.js 和 Python3 是否可用
    ssh "$PORTAL" "node --version && npm --version" \
        || fail "PortalServer 上未找到 Node.js，请先安装 Node.js 18+"
    ssh "$PORTAL" "python3 --version" \
        || fail "PortalServer 上未找到 Python3，请先安装 Python 3.10+"
    ok "Node.js 和 Python3 检查通过"

    ok "=== PortalServer 初始化完成 ==="
    echo ""
    echo "下一步（在 PortalServer 上手动编辑，见 deploy/sit/CONFIG.md）："
    echo "  ssh $PORTAL"
    echo "  vim $PORTAL_DEV/env/live-server.env   # 填入 JWT_SECRET"
    echo "  vim $PORTAL_DEV/env/pbs-server.env    # 填入 JWT_SECRET / f8_pbs 密码"
    echo "  vim $PORTAL_DEV/env/connector-server.env # DB URL + 与 live 相同的 JWT_SECRET"
    echo "  vim $PORTAL_DEV/env/engine-server.env # DB URL + 与 live 相同的 JWT_SECRET"
    echo "  # 禁止在 engine-server/config.yaml 写真实密钥（会被 auto-deploy 覆盖）"
}

# ── WebServer（本机）初始化 ───────────────────────────────────────
setup_webserver() {
    log "=== 本机（WebServer）前端目录初始化 ==="

    # 创建 dev 和 uat 目录（本机本地操作）
    mkdir -p \
        "$LOCAL_ROIS/dev/gantt" \
        "$LOCAL_ROIS/dev/pbs" \
        "$LOCAL_ROIS/uat/gantt" \
        "$LOCAL_ROIS/uat/pbs"
    ok "本机目录创建完成"

    # 迁移 UAT 前端文件（旧位置 → uat/ 子目录）
    if [ -d "$LOCAL_ROIS/gantt" ] && [ "$(ls -A "$LOCAL_ROIS/gantt" 2>/dev/null)" ]; then
        log "迁移 gantt → uat/gantt..."
        cp -r "$LOCAL_ROIS/gantt/." "$LOCAL_ROIS/uat/gantt/"
        ok "UAT gantt 迁移完成（原目录保留作备份）"
    fi
    if [ -d "$LOCAL_ROIS/pbs" ] && [ "$(ls -A "$LOCAL_ROIS/pbs" 2>/dev/null)" ]; then
        log "迁移 pbs → uat/pbs..."
        cp -r "$LOCAL_ROIS/pbs/." "$LOCAL_ROIS/uat/pbs/"
        ok "UAT pbs 迁移完成（原目录保留作备份）"
    fi

    ok "=== 本机（WebServer）初始化完成 ==="
    echo ""
    echo "下一步：更新本机 nginx"
    echo "  参考 deploy/dev/nginx/uat-migration.conf — 把 alias 路径改为 uat/"
    echo "  参考 deploy/dev/nginx/dev.conf           — 在 server{} 末尾添加 dev location 块"
    echo "  sudo nginx -t && sudo nginx -s reload"
}

# ── 本机初始化 ────────────────────────────────────────────────────
setup_local() {
    log "=== 本机初始化 ==="

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

# ── 主逻辑 ────────────────────────────────────────────────────────
TARGET="${1:-}"
case "$TARGET" in
    portal)    setup_portal ;;
    webserver) setup_webserver ;;
    local)     setup_local ;;
    all)
        setup_portal
        setup_webserver
        setup_local
        echo ""
        log "所有初始化完成，执行首次全量部署..."
        bash "$SCRIPT_DIR/deploy.sh" --all
        ;;
    *)
        echo "用法: $0 [all|portal|webserver|local]"
        echo ""
        echo "  all       — 初始化所有端 + 首次全量部署（推荐）"
        echo "  portal    — 仅初始化 PortalServer (10.15.12.4)"
        echo "  webserver — 仅初始化 WebServer (10.15.12.2)"
        echo "  local     — 仅配置本机 crontab + 权限"
        exit 1
        ;;
esac
