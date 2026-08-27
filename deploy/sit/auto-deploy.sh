#!/usr/bin/env bash
# deploy/sit/auto-deploy.sh
#
# 自动部署守护脚本 — 在本机运行，由 crontab 每 10 分钟调用。
# 检测 GitHub main 是否有新提交，分析 diff 后只构建/推送受影响模块。
# 防止并发：本机 deploy.lock 存在时跳过。
#
# crontab 配置（在本机执行 crontab -e 添加）：
#   */10 * * * * /home/yuan.z/rois/rois-ai/deploy/sit/auto-deploy.sh >> /home/yuan.z/rois/rois-ai/deploy/sit/.pkghash/auto-deploy.log 2>&1
#
# 模块 → 部署动作映射：
#   live-server/**       → --live    （本机 build → push dist → 远程重启）
#   rule-engine/**       → --live    （TS 包被 live-server import，触发重建）
#   rule-engine-rs       → --live    （Rust 法规二进制 ruletool + check-* 重建推送）
#   pbs-server/**        → --pbs-srv
#   connector-server/**  → --connector
#   engine-server/**     → --engine  （push 源码 → 远程重启，无 build）
#   rois-rule-engine/**  → --engine  （Python 依赖变更，重启即可）
#   pbs-engine/**        → --engine  （solver 源码推送依赖本机 submodule）
#   packages/ui/**       → --ui-lib --gantt --pbs-ui
#   gantt/**             → --gantt
#   pbs-portal/**        → --pbs-ui
#   docs / sql / e2e / *.md / deploy/** 等 → 仅静默 pull，不触发任何动作

set -euo pipefail

ROIS_AI="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HASH_DIR="$SCRIPT_DIR/.pkghash"
LOCK_FILE="$HASH_DIR/deploy.lock"
LOG_FILE="$HASH_DIR/auto-deploy.log"
PENDING_FILE="$HASH_DIR/pending-deploy.args"
CRON_LINE="*/10 * * * * $SCRIPT_DIR/auto-deploy.sh >> $HASH_DIR/auto-deploy.log 2>&1"

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
        --pbs-srv) NEED_PBS_SRV=1 ;;
        --connector) NEED_CONNECTOR=1 ;;
        --engine)  NEED_ENGINE=1 ;;
        --gantt)   NEED_GANTT=1 ;;
        --pbs-ui)  NEED_PBS_UI=1 ;;
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
    if [ "$NEED_LIVE" -eq 1 ]; then DEPLOY_ARGS+=(--live); fi
    if [ "$NEED_PBS_SRV" -eq 1 ]; then DEPLOY_ARGS+=(--pbs-srv); fi
    if [ "$NEED_CONNECTOR" -eq 1 ]; then DEPLOY_ARGS+=(--connector); fi
    if [ "$NEED_ENGINE" -eq 1 ]; then DEPLOY_ARGS+=(--engine); fi
    if [ "$NEED_GANTT" -eq 1 ]; then DEPLOY_ARGS+=(--gantt); fi
    if [ "$NEED_PBS_UI" -eq 1 ]; then DEPLOY_ARGS+=(--pbs-ui); fi
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

# SIT 机器对部分 GitHub 仓库只有 deploy key / SSH 访问；.gitmodules 里的 https
# URL 会在 git submodule update 时要求交互账号密码并失败。对已知需要 SSH 的
# submodule 强制改写 url（不改 .gitmodules 文件，避免污染部署镜像工作树）。
ensure_submodule_ssh_url() {
    local name="$1"
    local ssh_url="$2"
    local current
    current=$(git config -f .gitmodules --get "submodule.${name}.url" 2>/dev/null || true)
    if [ -z "$current" ]; then
        return
    fi
    # Always pin the runtime config to SSH so both init and subsequent updates work.
    git config "submodule.${name}.url" "$ssh_url"
    if [ -d "$name/.git" ] || [ -f "$name/.git" ]; then
        git -C "$name" remote set-url origin "$ssh_url" 2>/dev/null || true
    fi
}

submodule_marker_ok() {
    local name="$1"
    case "$name" in
        # pbs-engine)      [ -f "$name/run_solver.py" ] && [ -d "$name/ColumnModelSolver_python" ] ;;
        rule-engine-rs)  [ -f "$name/Cargo.toml" ] ;;
        *)               return 1 ;;
    esac
}

update_one_submodule() {
    local name="$1"
    local ssh_url="${2:-}"

    if ! git config -f .gitmodules --get "submodule.${name}.path" >/dev/null 2>&1; then
        return
    fi

    local needs=0
    # Missing checkout ("-"), diverged ("+"), or merge conflict ("U").
    if git submodule status "$name" 2>/dev/null | grep -q '^[+-U]'; then
        needs=1
    elif ! submodule_marker_ok "$name"; then
        # Empty dir / failed prior init with a "clean-looking" status still needs recovery.
        needs=1
    fi

    if [ "$needs" -eq 0 ]; then
        return
    fi

    log "同步 ${name} submodule 到当前提交记录..."
    # sync copies .gitmodules → .git/config (often https); re-pin SSH afterwards.
    git submodule sync --quiet "$name" || true
    if [ -n "$ssh_url" ]; then
        git config "submodule.${name}.url" "$ssh_url"
    fi
    if ! git submodule update --init --recursive --quiet "$name"; then
        log "✗ ${name} submodule 同步失败（检查 SSH 访问 / 子模块 URL）"
        return 1
    fi
    if ! submodule_marker_ok "$name"; then
        log "✗ ${name} submodule 同步后仍缺关键文件"
        return 1
    fi
    ok "${name} submodule 已同步"
}

update_submodules() {
    if [ ! -f .gitmodules ]; then
        return
    fi

    # Deploy-key friendly SSH remotes (SIT cannot prompt for HTTPS credentials).
    local rs_url="git@github.com:yuanzhu-ai/rois-rule-engine-rs.git"
    local pbs_url="git@github.com:yuapply/PBS_column_based_algorithm.git"
    ensure_submodule_ssh_url "rule-engine-rs" "$rs_url"
    # ensure_submodule_ssh_url "pbs-engine" "$pbs_url"

    # rule-engine-rs: live-server legality binaries.
    # pbs-engine 发布链已暂停：SIT solver 使用 /home/rois/PBS_column_based_algorithm-main。
    update_one_submodule "rule-engine-rs" "$rs_url" || true
    # update_one_submodule "pbs-engine" "$pbs_url" || true
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

# ── 检查新提交 / 恢复未完成部署计划 ───────────────────────────────
cd "$ROIS_AI"
discard_local_changes
git fetch origin main --quiet

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

NEED_LIVE=0
NEED_PBS_SRV=0
NEED_CONNECTOR=0
NEED_ENGINE=0
NEED_GANTT=0
NEED_PBS_UI=0

load_pending_plan
update_submodules

if [ "$LOCAL" = "$REMOTE" ]; then
    TOTAL=$((NEED_LIVE + NEED_PBS_SRV + NEED_CONNECTOR + NEED_ENGINE + NEED_GANTT + NEED_PBS_UI))
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
        rule-engine-rs | rule-engine-rs/*)        NEED_LIVE=1 ;;
        pbs-server/*)                            NEED_PBS_SRV=1 ;;
        connector-server/*)                      NEED_CONNECTOR=1 ;;
        engine-server/* | rois-rule-engine/*)    NEED_ENGINE=1 ;;
        pbs-engine | pbs-engine/*)               NEED_ENGINE=1 ;;
        packages/ui/*)      NEED_GANTT=1; NEED_PBS_UI=1 ;;  # workspace 直接引用，gantt/pbs-portal 重建即可
        gantt/*)                                 NEED_GANTT=1 ;;
        pbs-portal/*)                            NEED_PBS_UI=1 ;;
        # 以下路径不触发部署
        docs/* | sql/* | e2e/* | *.md | \
        .github/* | .claude/* | .agents/* | .plane/* | \
        scripts/* | monitoring/* | deploy/* | \
        .gitignore | .gitmodules | \
        po-engine/* | ro-engine/* | \
        ai-server/* | crewrule-dev/* | data-migration/* | \
        pbs-app/* | packages/rule-engine-rs/* | \
        pbs-optimization-report | pbs-optimization-report/*)
            ;;
        *)
            log "  [?] 未知路径，保守触发全量检查: $file"
            # 未识别路径不自动全量，仅记录
            ;;
    esac
done <<< "$CHANGED_FILES"

# ── 部署计划 ─────────────────────────────────────────────────────
TOTAL=$((NEED_LIVE + NEED_PBS_SRV + NEED_CONNECTOR + NEED_ENGINE + NEED_GANTT + NEED_PBS_UI))

if [ $TOTAL -eq 0 ]; then
    log "无需部署（仅文档/配置变更），静默 pull"
    if [ "$LOCAL" != "$REMOTE" ]; then
        git pull --ff-only origin main --quiet
        ok "静默 pull 完成 → $(git rev-parse --short HEAD)"
        update_submodules
    fi
    clear_pending_plan
    exit 0
fi

log "部署计划："
[ $NEED_LIVE    -eq 1 ] && log "  • live-server   → 本机 build + push dist + 远程重启"
[ $NEED_PBS_SRV -eq 1 ] && log "  • pbs-server    → 本机 build + push dist + 远程重启"
[ $NEED_CONNECTOR -eq 1 ] && log "  • connector-server → 本机 build + push dist + 远程重启"
[ $NEED_ENGINE  -eq 1 ] && log "  • engine-server → push 源码 + 远程重启"
[ $NEED_GANTT   -eq 1 ] && log "  • gantt         → 本机 build + 本地写入 /rois/sit/gantt/"
[ $NEED_PBS_UI  -eq 1 ] && log "  • pbs-portal    → 本机 build + 本地写入 /rois/sit/pbs/"

# ── 先 pull，再执行部署 ───────────────────────────────────────────
if [ "$LOCAL" != "$REMOTE" ]; then
    git pull --ff-only origin main --quiet
    ok "git pull 完成 → $(git rev-parse --short HEAD)"
fi
update_submodules

# 先持久化计划：若 deploy.sh 中途失败，下次 cron 即使无新提交也会补跑。
write_pending_plan

build_deploy_args
log "执行: deploy.sh ${DEPLOY_ARGS[*]}"
bash "$SCRIPT_DIR/deploy.sh" "${DEPLOY_ARGS[@]}"

clear_pending_plan
ok "自动部署完成"
