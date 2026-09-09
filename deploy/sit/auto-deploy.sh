#!/usr/bin/env bash
# deploy/sit/auto-deploy.sh
#
# 自动部署守护脚本 — 在本机（WebServer）运行，由 crontab 每 10 分钟调用。
# 检测 GitHub main 是否有新提交，分析 diff 后只构建/推送受影响模块。
# 防止并发：本机 deploy.lock 存在时跳过。
#
# crontab 配置（在本机执行 crontab -e 添加）：
#   */10 * * * * /home/yuan.z/dev/recovery/deploy/sit/auto-deploy.sh >> /home/yuan.z/dev/recovery/deploy/sit/.pkghash/auto-deploy.log 2>&1
#
# 模块 → 部署动作映射：
#   live-server/**       → --live    （本机 build → push dist → Rust 法规二进制 → 远程重启）
#   rule-engine/*         → --live    （TS 包被 live-server import，触发重建）
#   rule-engine-rs/**     → --live    （vendored Rust 源码；ruletool + check-* 重建推送）
#   engine-server/**      → --engine  （push 源码 → 远程重启，无 build）
#   rois-rule-engine/**   → --engine  （Python 依赖变更，重启即可）
#   packages/ui/**        → --gantt   （workspace 直接引用，gantt 重建即可）
#   gantt/**              → --gantt
#   packages/shared-rules / packages/contracts / packages/saml / packages/legality-messages
#                         → 跟随 --live 自动推送（通过 deploy.sh push_contracts / push_shared_rules）
#   docs / sql / e2e / *.md / deploy/** 等 → 仅静默 pull，不触发任何动作
#
# 本次范围外（不部署，仅静默 pull）：
#   pbs-server / pbs-portal / connector-server / pbs-engine / pbs-optimization-report
#   po-engine / ro-engine / ai-server / crewrule-dev / data-migration / pbs-app

set -euo pipefail

ROIS_AI="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HASH_DIR="$SCRIPT_DIR/.pkghash"
LOCK_FILE="$HASH_DIR/deploy.lock"
LOG_FILE="$HASH_DIR/auto-deploy.log"
PENDING_FILE="$HASH_DIR/pending-deploy.args"
CRON_LINE="*/10 * * * * $SCRIPT_DIR/auto-deploy.sh >> $LOG_FILE 2>&1"

mkdir -p "$HASH_DIR"

ts()  { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $*" | tee -a "$LOG_FILE"; }
ok()  { echo "[$(ts)] ✓ $*" | tee -a "$LOG_FILE"; }

check_cron() {
    if ! command -v crontab >/dev/null 2>&1; then
        log "crontab 命令不存在，无法检查自动部署定时任务"
        return 1
    fi
    if crontab -l 2>/dev/null | grep -F "$SCRIPT_DIR/auto-deploy.sh" >/dev/null; then
        ok "auto-deploy cron 已安装"
        return 0
    fi
    log "auto-deploy cron 未安装；执行 $SCRIPT_DIR/auto-deploy.sh --install-cron 可安装"
    return 1
}

install_cron() {
    if ! command -v crontab >/dev/null 2>&1; then
        log "crontab 命令不存在，无法安装自动部署定时任务"
        return 1
    fi
    local tmp
    tmp=$(mktemp)
    crontab -l 2>/dev/null | grep -Fv "$SCRIPT_DIR/auto-deploy.sh" > "$tmp" || true
    echo "$CRON_LINE" >> "$tmp"
    crontab "$tmp"
    rm -f "$tmp"
    ok "auto-deploy cron 已安装: $CRON_LINE"
}

case "${1:-}" in
    --check-cron)
        check_cron
        exit $?
        ;;
    --install-cron)
        install_cron
        exit $?
        ;;
esac

set_need_from_arg() {
    case "$1" in
        --live)    NEED_LIVE=1 ;;
        --engine)  NEED_ENGINE=1 ;;
        --gantt)   NEED_GANTT=1 ;;
    esac
}

load_pending_plan() {
    if [ ! -s "$PENDING_FILE" ]; then
        return
    fi

    log "检测到上次未完成部署计划，合并到本次执行："
    while IFS= read -r arg; do
        [ -z "$arg" ] && continue
        log "  $arg"
        set_need_from_arg "$arg"
    done < "$PENDING_FILE"
}

build_deploy_args() {
    # Use if/then, not `cmd && append`: under `set -e`, a final false
    # `[ cond ] && append` returns 1 and aborts the whole auto-deploy
    # after git pull (so pending plan is never written and deploy never runs).
    DEPLOY_ARGS=()
    if [ "$NEED_LIVE"   -eq 1 ]; then DEPLOY_ARGS+=(--live); fi
    if [ "$NEED_ENGINE" -eq 1 ]; then DEPLOY_ARGS+=(--engine); fi
    if [ "$NEED_GANTT"  -eq 1 ]; then DEPLOY_ARGS+=(--gantt); fi
}

write_pending_plan() {
    build_deploy_args
    : > "$PENDING_FILE"
    for arg in "${DEPLOY_ARGS[@]}"; do
        echo "$arg" >> "$PENDING_FILE"
    done
}

clear_pending_plan() {
    rm -f "$PENDING_FILE"
}

# rule-engine-rs is vendored in the main repo (not a submodule). git pull / reset
# already brings the tree; verify Cargo.toml before deploy/build steps run.
ensure_rule_engine_rs() {
    if [ -f "$ROIS_AI/rule-engine-rs/Cargo.toml" ]; then
        return 0
    fi
    log "✗ rule-engine-rs/Cargo.toml 缺失 — 主仓库应包含 vendored rule-engine-rs/ 目录"
    return 1
}

discard_local_changes() {
    local dirty
    dirty=$(git status --short)
    if [ -z "$dirty" ]; then
        return
    fi

    log "检测到部署镜像存在本地改动，自动丢弃后继续更新："
    while IFS= read -r line; do log "  $line"; done <<< "$dirty"
    git reset --hard HEAD --quiet
    git clean -fd --quiet
    ok "本地改动已丢弃，部署镜像恢复到 HEAD"
}

# ── 并发锁 ───────────────────────────────────────────────────────
if [ -f "$LOCK_FILE" ]; then
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
        log "Deploy in progress (pid $LOCK_PID)，跳过本次"
        exit 0
    fi
    rm -f "$LOCK_FILE"
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# ── 检查新提交 / 恢复未完成部署计划 ──────────────────────────────
cd "$ROIS_AI"
discard_local_changes
git fetch origin main --quiet

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

NEED_LIVE=0
NEED_ENGINE=0
NEED_GANTT=0

load_pending_plan
ensure_rule_engine_rs || true

if [ "$LOCAL" = "$REMOTE" ]; then
    TOTAL=$((NEED_LIVE + NEED_ENGINE + NEED_GANTT))
    if [ $TOTAL -eq 0 ]; then
        log "无新提交 ($LOCAL)，跳过"
        exit 0
    fi
    log "无新提交，但存在未完成部署计划，继续补跑"
    CHANGED_FILES=""
else
    # ── 获取变更文件列表（在 pull 之前，分析即将到来的 diff）─────
    log "新提交：${LOCAL:0:8} → ${REMOTE:0:8}"
    CHANGED_FILES=$(git diff --name-only "$LOCAL" "$REMOTE")

    log "变更文件："
    while IFS= read -r f; do log "  $f"; done <<< "$CHANGED_FILES"
fi

# ── 模块检测 ─────────────────────────────────────────────────────
while IFS= read -r file; do
    [ -z "$file" ] && continue
    case "$file" in
        live-server/*)                           NEED_LIVE=1 ;;
        rule-engine/*)                           NEED_LIVE=1 ;;
        rule-engine-rs | rule-engine-rs/*)       NEED_LIVE=1 ;;
        engine-server/* | rois-rule-engine/*)    NEED_ENGINE=1 ;;
        packages/ui/*)                           NEED_GANTT=1 ;;  # workspace 直接引用，gantt 重建即可
        gantt/*)                                 NEED_GANTT=1 ;;
        packages/shared-rules/*)                 NEED_LIVE=1 ;;  # live-server 运行时依赖
        packages/contracts/*)                    NEED_LIVE=1 ;;
        packages/saml/*)                         NEED_LIVE=1 ;;
        packages/legality-messages/*)            NEED_LIVE=1 ;;
        # 以下路径不触发部署（仅静默 pull）
        docs/* | sql/* | e2e/* | *.md | \
        .github/* | .claude/* | .agents/* | .plane/* | \
        scripts/* | monitoring/* | deploy/* | \
        .gitignore | .gitmodules | \
        po-engine/* | ro-engine/* | \
        ai-server/* | crewrule-dev/* | data-migration/* | \
        pbs-app/* | \
        pbs-engine | pbs-engine/* | \
        pbs-server/* | connector-server/* | pbs-portal/* | \
        pbs-optimization-report | pbs-optimization-report/*)
            ;;
        *)
            log "  [?] 未知路径，仅记录不自动触发: $file"
            ;;
    esac
done <<< "$CHANGED_FILES"

# ── 部署计划 ─────────────────────────────────────────────────────
TOTAL=$((NEED_LIVE + NEED_ENGINE + NEED_GANTT))

# Deploy mirror must track origin/main exactly. Local-only commits (or rewritten
# history) make `git pull --ff-only` fail forever — that is what stuck SIT after
# 876613c diverged from GitHub. Always hard-reset after the LOCAL..REMOTE diff
# has already been computed above.
sync_to_origin_main() {
    git reset --hard origin/main --quiet
    ok "已同步到 origin/main → $(git rev-parse --short HEAD)"
}

if [ $TOTAL -eq 0 ]; then
    log "无需部署（仅文档/配置变更），静默同步"
    if [ "$LOCAL" != "$REMOTE" ]; then
        sync_to_origin_main
        ensure_rule_engine_rs || true
    fi
    clear_pending_plan
    exit 0
fi

log "部署计划："
[ $NEED_LIVE   -eq 1 ] && log "  • live-server    → 本机 build + push dist + Rust 法规二进制 + 远程重启"
[ $NEED_ENGINE -eq 1 ] && log "  • engine-server  → push 源码 + 远程重启 + JWT 探针"
[ $NEED_GANTT  -eq 1 ] && log "  • gantt          → 本机 build + 写本地 /home/recovery/sit/gantt/"

# ── 先同步到 origin/main，再执行部署 ─────────────────────────────────
if [ "$LOCAL" != "$REMOTE" ]; then
    sync_to_origin_main
fi
ensure_rule_engine_rs || exit 1

# 先持久化计划：若 deploy.sh 中途失败，下次 cron 即使无新提交也会补跑。
write_pending_plan

build_deploy_args
log "执行: deploy.sh ${DEPLOY_ARGS[*]}"
bash "$SCRIPT_DIR/deploy.sh" "${DEPLOY_ARGS[@]}"

clear_pending_plan
ok "自动部署完成"
