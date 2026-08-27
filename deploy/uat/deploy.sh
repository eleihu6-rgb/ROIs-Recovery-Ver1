#!/usr/bin/env bash
# deploy/uat/deploy.sh
#
# UAT 环境手动部署 — 在自动构建服务器（WebServer 10.15.12.2）上运行，与 SIT 部署同构：
#   1. 本机（10.15.12.2）从 origin/main 构建各模块
#   2. rsync 编译产物 → UAT 主机 10.15.12.3:/home/rois/uat/
#   3. 远程重启 live-server(3000) / pbs-server(3002) / engine-server(3003)
#   4. 给 main 打 UAT-YYYY-MM-DD tag 并 push（记录 UAT 当前所在 main 提交）
#
# 构建源：$ROIS_AI（本机 SIT/UAT 共用的部署镜像，deploy 时 reset 到 origin/main）。
# 与 SIT auto-deploy 并发冲突防护：SIT 部署进行中时（lock 文件存在）拒绝执行。
#
# 用法：
#   bash deploy.sh [--live --pbs-srv --engine --connector --gantt --pbs-ui]   # 缺省 = --all

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROIS_AI="$(cd "$SCRIPT_DIR/../.." && pwd)"          # 本机部署镜像（10.15.12.2）
PORTAL="yuan.z@10.15.12.3"                            # UAT 主机
PORTAL_DEV="/home/rois/uat"                           # UAT 部署目标
LEGACY_ENGINE_DIR="/home/yuan.z/rois/rois-ai/engine-server"
HASH_DIR="$SCRIPT_DIR/.pkghash"
DEPLOY_LOG="${HASH_DIR}/../deploy.log"
SIT_LOCK="$ROIS_AI/deploy/sit/.pkghash/deploy.lock"

# 先同步构建镜像（git clean 会移除 deploy/uat/.pkghash，须在创建日志目录之前）
git -C "$ROIS_AI" fetch origin main --quiet
git -C "$ROIS_AI" reset --hard origin/main --quiet
git -C "$ROIS_AI" clean -fd --quiet

mkdir -p "$HASH_DIR"
touch "$DEPLOY_LOG"

ts()   { date '+%Y-%m-%d %H:%M:%S'; }
log()  { echo "[$(ts)] $*" | tee -a "$DEPLOY_LOG"; }
ok()   { echo "[$(ts)] ✓ $*" | tee -a "$DEPLOY_LOG"; }
warn() { echo "[$(ts)] ⚠ $*" | tee -a "$DEPLOY_LOG" >&2; }
fail() { echo "[$(ts)] ✗ $*" | tee -a "$DEPLOY_LOG" >&2; exit 1; }

# ── SIT auto-deploy 并发防护 ───────────────────────────────────────
check_sit_not_deploying() {
    if [ -f "$SIT_LOCK" ]; then
        local pid
        pid=$(cat "$SIT_LOCK" 2>/dev/null || echo "")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            fail "SIT auto-deploy 正在运行 (pid $pid) — 共用同一构建镜像，请稍后再跑 UAT deploy"
        fi
        rm -f "$SIT_LOCK"
    fi
    # 持有 SIT lock，防止 UAT 部署期间 SIT cron 重置构建镜像
    echo $$ > "$SIT_LOCK"
    trap 'rm -f "$SIT_LOCK"' EXIT
}

# ── 构建依赖（package.json 变化才重装）──────────────────────────────
pkgjson_changed() {
    local module="$1"
    local package_file="$ROIS_AI/$module/package.json"
    local hash_file="$HASH_DIR/${module}.package-json.pkghash"
    local cur_hash last_hash
    cur_hash=$(sha256sum "$package_file" | cut -d' ' -f1)
    last_hash=$(cat "$hash_file" 2>/dev/null || echo "")
    [ "$cur_hash" != "$last_hash" ]
}

ensure_build_deps() {
    local module="$1"
    local tool="$2"
    local module_dir="$ROIS_AI/$module"
    if [ -x "$module_dir/node_modules/.bin/$tool" ] && ! pkgjson_changed "$module"; then
        return
    fi
    log "[$module] 同步构建依赖..."
    (cd "$module_dir" && npm install --include=dev --legacy-peer-deps --prefer-offline) >>"$DEPLOY_LOG" 2>&1
    [ -x "$module_dir/node_modules/.bin/$tool" ] || fail "[$module] 安装后仍缺 $tool"
    sha256sum "$module_dir/package.json" | cut -d' ' -f1 > "$HASH_DIR/${module}.package-json.pkghash"
    ok "[$module] 构建依赖已就绪"
}

# ── 构建（本机 10.15.12.2）────────────────────────────────────────
build_live() {
    log "[live-server] 本机构建..."
    ensure_build_deps "live-server" "tsc"
    (cd "$ROIS_AI/live-server" && npm run build) >>"$DEPLOY_LOG" 2>&1
    ok "[live-server] 构建完成"
}
build_pbs_srv() {
    log "[pbs-server] 本机构建..."
    ensure_build_deps "pbs-server" "tsc"
    (cd "$ROIS_AI/pbs-server" && npm run build) >>"$DEPLOY_LOG" 2>&1
    ok "[pbs-server] 构建完成"
}
build_gantt() {
    log "[gantt] 本机构建（base=/altair/ prefix=）..."
    ensure_build_deps "gantt" "tsc"
    (cd "$ROIS_AI/gantt" && env $(grep -v '^#' "$SCRIPT_DIR/env/gantt.build.env" | grep -v '^$' | xargs) npm run build) >>"$DEPLOY_LOG" 2>&1
    ok "[gantt] 构建完成"
}
build_pbs_ui() {
    log "[pbs-portal] 本机构建（base=/pbs/ api=/pbs/api）..."
    ensure_build_deps "pbs-portal" "vite"
    (cd "$ROIS_AI/pbs-portal" && env $(grep -v '^#' "$SCRIPT_DIR/env/pbs-portal.build.env" | grep -v '^$' | xargs) npx vite build) >>"$DEPLOY_LOG" 2>&1
    ok "[pbs-portal] 构建完成"
}
build_connector() {
    log "[connector-server] 本机构建..."
    ensure_build_deps "connector-server" "tsc"
    (cd "$ROIS_AI/connector-server" && npm run build) >>"$DEPLOY_LOG" 2>&1
    ok "[connector-server] 构建完成"
}

# rule-engine Rust 二进制（live-server ruletool / check-*，从部署根解析）
build_rust_bins() {
    log "[rust-bins] 本机编译法规引擎二进制..."
    (
        source "$HOME/.cargo/env" 2>/dev/null || true
        git -C "$ROIS_AI" submodule update --init --recursive rule-engine-rs >>"$DEPLOY_LOG" 2>&1 || true
        cd "$ROIS_AI/rule-engine-rs"
        cargo build --release --quiet
    ) >>"$DEPLOY_LOG" 2>&1
    local cargo="$ROIS_AI/rule-engine-rs/Cargo.toml"
    local list
    local bin
    list=$(node "$ROIS_AI/deploy/common/list-rule-engine-bins.mjs" "$cargo") \
        || fail "[rust-bins] 无法从 $cargo 读取二进制清单"
    while IFS= read -r bin; do
        [ -n "$bin" ] || continue
        if [ ! -x "$ROIS_AI/rule-engine-rs/target/release/$bin" ]; then
            fail "[rust-bins] 构建后缺少 $bin"
        fi
    done <<<"$list"
    ok "[rust-bins] 编译完成"
}

# ── 推送（→ 10.15.12.3:/home/rois/uat）────────────────────────────
push_module() {
    local src="$1" dst="$2" label="$3"
    ssh "$PORTAL" "mkdir -p '$PORTAL_DEV/$dst'"
    rsync -az --delete "$src" "$PORTAL:$PORTAL_DEV/$dst" >>"$DEPLOY_LOG" 2>&1
    ok "[$label] 推送完成 → $PORTAL_DEV/$dst"
}

# 后端：dist + 生产依赖（node dist/index.js 运行需要 node_modules）
push_backend() {
    local label="$1"          # live-server / pbs-server
    local dst="$2"            # live-server/dist / pbs-server/dist
    push_module "$ROIS_AI/$label/dist/" "$dst" "$label"
    scp "$ROIS_AI/$label/package.json" "$ROIS_AI/$label/package-lock.json" \
        "$PORTAL:$PORTAL_DEV/$label/" >>"$DEPLOY_LOG" 2>&1
    ssh "$PORTAL" "cd '$PORTAL_DEV/$label' && npm ci --omit=dev --legacy-peer-deps --prefer-offline" >>"$DEPLOY_LOG" 2>&1
    ok "[$label] 生产依赖安装完成"
}

push_live_scripts() {
    local cargo="$ROIS_AI/rule-engine-rs/Cargo.toml"
    local manifest="$ROIS_AI/live-server/scripts/rust-bins.json"
    node "$ROIS_AI/deploy/common/generate-rust-bins-manifest.mjs" "$cargo" "$manifest" \
        || fail "[rust-bins] 无法从 $cargo 生成运行时清单"
    ssh "$PORTAL" "mkdir -p '$PORTAL_DEV/live-server/scripts'"
    rsync -az --delete --exclude='__tests__/' \
        "$ROIS_AI/live-server/scripts/" \
        "$PORTAL:$PORTAL_DEV/live-server/scripts/" >>"$DEPLOY_LOG" 2>&1
    ok "[live-server scripts] 推送完成 → $PORTAL_DEV/live-server/scripts"
}

# 前端：nginx 在 WebServer(10.15.12.2) 本地磁盘服务静态产物，直接本机拷贝
push_frontend() {
    local src="$1" dst="$2" label="$3"
    rm -rf "/home/rois/uat/$dst"
    cp -a "$src" "/home/rois/uat/$dst"
    ok "[$label] 本地部署完成 → /home/rois/uat/$dst"
}

push_contracts() {
    ssh "$PORTAL" "mkdir -p '$PORTAL_DEV/packages/contracts' '$PORTAL_DEV/packages/saml'"
    rsync -az --delete "$ROIS_AI/packages/contracts/" "$PORTAL:$PORTAL_DEV/packages/contracts/" >>"$DEPLOY_LOG" 2>&1
    rsync -az --delete "$ROIS_AI/packages/saml/" "$PORTAL:$PORTAL_DEV/packages/saml/" >>"$DEPLOY_LOG" 2>&1
    ssh "$PORTAL" "cd '$PORTAL_DEV/packages' && { [ -f package.json ] || printf '%s\n' '{\"name\":\"uat-packages\",\"private\":true}' > package.json; } && npm install @node-saml/node-saml@5.1.0 --no-save --legacy-peer-deps --prefer-offline" >>"$DEPLOY_LOG" 2>&1
    # packages/legality-messages + shared-rules: scenario-legality / legality-recheck-core
    # resolve via file:../packages/* — missing → Recheck spins forever (ERR_MODULE_NOT_FOUND).
    ssh "$PORTAL" "mkdir -p '$PORTAL_DEV/packages/legality-messages'"
    rsync -az --delete \
        "$ROIS_AI/packages/legality-messages/" \
        "$PORTAL:$PORTAL_DEV/packages/legality-messages/" \
        >>"$DEPLOY_LOG" 2>&1
    ok "[legality-messages] 已部署 → $PORTAL_DEV/packages/legality-messages"
    push_shared_rules
    ok "[packages] contracts + saml + @node-saml 就绪"
}

build_shared_rules() {
    local package_dir="$ROIS_AI/packages/shared-rules"
    local tsc="$ROIS_AI/live-server/node_modules/.bin/tsc"

    if [ "${SHARED_RULES_BUILT:-0}" -eq 1 ]; then
        return
    fi

    if [ ! -x "$tsc" ]; then
        ensure_build_deps "live-server" "tsc"
    fi
    log "[shared-rules] 构建共享规则包..."
    "$tsc" -p "$package_dir/tsconfig.json" >>"$DEPLOY_LOG" 2>&1
    if [ ! -f "$package_dir/dist/index.js" ] || [ ! -f "$package_dir/dist/index.d.ts" ]; then
        fail "[shared-rules] 构建后缺少 dist/index.js 或 dist/index.d.ts"
    fi
    SHARED_RULES_BUILT=1
    ok "[shared-rules] 构建完成"
}

push_shared_rules() {
    build_shared_rules
    ssh "$PORTAL" "mkdir -p '$PORTAL_DEV/packages/shared-rules'"
    rsync -az --delete \
        "$ROIS_AI/packages/shared-rules/" \
        "$PORTAL:$PORTAL_DEV/packages/shared-rules/" \
        >>"$DEPLOY_LOG" 2>&1
    ok "[shared-rules] 已部署 → $PORTAL_DEV/packages/shared-rules"
}

# ── version.tmp ───────────────────────────────────────────────────
# Runtime version is read from live-server/version.tmp on PortalServer.
# Build only bumps the webserver checkout; without this push UAT never moves.
# Merge max(local, remote) so a higher UAT-only counter never regresses.
sync_version_tmp() {
    local local_path="$ROIS_AI/live-server/version.tmp"
    local remote_path="$PORTAL_DEV/live-server/version.tmp"
    local remote_raw=""
    local git_commit=""
    local git_commit_short=""
    local deployed_at=""

    if [ ! -f "$local_path" ]; then
        warn "[version] 本机缺少 $local_path，跳过版本同步"
        return 0
    fi

    git_commit=$(cd "$ROIS_AI" && git rev-parse HEAD 2>/dev/null || true)
    git_commit_short=$(cd "$ROIS_AI" && git rev-parse --short HEAD 2>/dev/null || true)
    deployed_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    remote_raw=$(ssh "$PORTAL" "cat '$remote_path' 2>/dev/null" || true)
    python3 - "$local_path" "$remote_raw" "$git_commit" "$git_commit_short" "$deployed_at" <<'PY'
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
local = json.loads(path.read_text())
try:
    remote = json.loads(sys.argv[2]) if sys.argv[2].strip() else {}
except Exception:
    remote = {}
keys = ("backend", "frontend", "rule", "pbsBackend", "pbsFrontend")
merged = {k: max(int(local.get(k, 0) or 0), int(remote.get(k, 0) or 0)) for k in keys}
git_commit = sys.argv[3].strip()
git_commit_short = sys.argv[4].strip()
deployed_at = sys.argv[5].strip()
if git_commit:
    merged["gitCommit"] = git_commit
if git_commit_short:
    merged["gitCommitShort"] = git_commit_short
if deployed_at:
    merged["deployedAt"] = deployed_at
path.write_text(json.dumps(merged, indent=2) + "\n")
suffix = f" @{merged['gitCommitShort']}" if merged.get("gitCommitShort") else ""
print("Ver:B{backend}/F{frontend}/R{rule}{suffix} PBS:B{pbsBackend}/F{pbsFrontend}".format(**merged, suffix=suffix))
PY
    ssh "$PORTAL" "mkdir -p '$PORTAL_DEV/live-server'"
    scp "$local_path" "$PORTAL:$remote_path" >>"$DEPLOY_LOG" 2>&1
    ok "[version] 已同步 version.tmp → PortalServer ($(python3 -c "import json;print(json.load(open('$local_path')))" 2>/dev/null || cat "$local_path" | tr -d '\n'))"
}

push_rust_bins() {
    local rel_dir="$PORTAL_DEV/rule-engine-rs/target/release"
    ssh "$PORTAL" "mkdir -p '$rel_dir'"
    rsync -az "$ROIS_AI/rule-engine-rs/target/release/" "$PORTAL:$rel_dir/" >>"$DEPLOY_LOG" 2>&1
    ok "[rust-bins] 推送完成"
}

# engine-server is Python source, not a compiled Node artifact. Keep its source,
# virtualenv, logs, and task workspaces under the same UAT deployment root.
push_engine() {
    local dst="$PORTAL_DEV/engine-server"
    ssh "$PORTAL" "mkdir -p '$dst'"
    rsync -az --delete \
        --exclude='.env' \
        --exclude='.venv/' \
        --exclude='logs/' \
        --exclude='workspace/' \
        --exclude='finished/' \
        --exclude='completed/' \
        "$ROIS_AI/engine-server/" "$PORTAL:$dst/" >>"$DEPLOY_LOG" 2>&1
    ssh "$PORTAL" "if [ ! -x '$dst/.venv/bin/python' ]; then python3 -m venv '$dst/.venv'; fi; '$dst/.venv/bin/python' -m pip install -r '$dst/requirements.txt'" >>"$DEPLOY_LOG" 2>&1
    ok "[engine-server] 推送完成并已安装 Python 依赖 → $dst"
}

push_connector() {
    local dst="$PORTAL_DEV/connector-server"
    ssh "$PORTAL" "mkdir -p '$dst'"
    rsync -az --delete "$ROIS_AI/connector-server/dist/" "$PORTAL:$dst/dist/" >>"$DEPLOY_LOG" 2>&1
    scp "$ROIS_AI/connector-server/package.json" "$ROIS_AI/connector-server/package-lock.json" "$PORTAL:$dst/" >>"$DEPLOY_LOG" 2>&1
    ssh "$PORTAL" "cd '$dst' && npm ci --omit=dev --legacy-peer-deps --prefer-offline" >>"$DEPLOY_LOG" 2>&1
    ok "[connector-server] 推送完成并已安装生产依赖 → $dst"
}

# env：确保 UAT 主机上有 env 文件（缺则从本机推送初始配置）
ensure_env() {
    local name="$1"
    ssh "$PORTAL" "test -f '$PORTAL_DEV/env/${name}.env'" 2>/dev/null && return
    log "[env] $PORTAL_DEV/env/${name}.env 不存在，推送初始配置..."
    ssh "$PORTAL" "mkdir -p '$PORTAL_DEV/env'"
    scp "$ROIS_AI/$name/.env" "$PORTAL:$PORTAL_DEV/env/${name}.env" >>"$DEPLOY_LOG" 2>&1
    ok "[env] 已创建 ${name}.env（首次，后续请手工维护）"
}

# Migrate the existing engine-server runtime config once. It contains UAT-only
# credentials and must never be copied from a source checkout or overwritten.
ensure_engine_env() {
    local env_file="$PORTAL_DEV/env/engine-server.env"
    ssh "$PORTAL" "mkdir -p '$PORTAL_DEV/env'; if [ ! -f '$env_file' ]; then test -f '$LEGACY_ENGINE_DIR/.env' && cp '$LEGACY_ENGINE_DIR/.env' '$env_file' || { echo 'missing $env_file and legacy engine .env' >&2; exit 1; }; fi"
    ssh "$PORTAL" "grep -q '^RO_SOLVER_DIR=' '$env_file' || echo 'RO_SOLVER_DIR=/home/rois/PBS_column_based_algorithm-main' >> '$env_file'; grep -q '^RO_CONVERTER_PYTHON=' '$env_file' || echo 'RO_CONVERTER_PYTHON=/home/rois/uat/engine-server/.venv/bin/python' >> '$env_file'"
    ok "[env] engine-server 使用 $env_file（solver=/home/rois/PBS_column_based_algorithm-main）"
}

ensure_connector_env() {
    local env_file="$PORTAL_DEV/env/connector-server.env"
    ssh "$PORTAL" "mkdir -p '$PORTAL_DEV/env'; if [ ! -f '$env_file' ]; then test -f '/home/yuan.z/rois/rois-ai/connector-server/.env' && cp '/home/yuan.z/rois/rois-ai/connector-server/.env' '$env_file' || { echo 'missing $env_file and legacy connector .env' >&2; exit 1; }; fi"
    ok "[env] connector-server 使用 $env_file"
}

# service.sh 同步到 UAT 主机
sync_service_sh() {
    # NOTE: do not redirect scp stdout/stderr — scp uses sftp protocol over
    # its stdin/stdout, and `>>$DEPLOY_LOG 2>&1` breaks the sftp control
    # channel, hanging the transfer until the internal timeout (observed:
    # 1+ minute for a 3 KiB file). Service.sh is tiny; let it print to the
    # terminal so failures are visible.
    scp "$SCRIPT_DIR/service.sh" "$PORTAL:$PORTAL_DEV/service.sh"
    ssh "$PORTAL" "chmod +x '$PORTAL_DEV/service.sh'"
}

# ── 重启（远程）───────────────────────────────────────────────────
restart_live() {
    log "[live-server] 远程重启..."
    ssh "$PORTAL" "bash '$PORTAL_DEV/service.sh' restart live-server" >>"$DEPLOY_LOG" 2>&1 || fail "live-server 重启失败"
    ok "[live-server] 重启完成"
}
restart_pbs_srv() {
    log "[pbs-server] 远程重启..."
    ssh "$PORTAL" "bash '$PORTAL_DEV/service.sh' restart pbs-server" >>"$DEPLOY_LOG" 2>&1 || fail "pbs-server 重启失败"
    ok "[pbs-server] 重启完成"
}
restart_engine() {
    log "[engine-server] 远程重启..."
    ssh "$PORTAL" "bash '$PORTAL_DEV/service.sh' restart engine-server" >>"$DEPLOY_LOG" 2>&1 || fail "engine-server 重启失败"
    ok "[engine-server] 重启完成"
}
restart_connector() {
    log "[connector-server] 远程重启..."
    ssh "$PORTAL" "bash '$PORTAL_DEV/service.sh' restart connector-server" >>"$DEPLOY_LOG" 2>&1 || fail "connector-server 重启失败"
    ok "[connector-server] 重启完成"
}

# ── main 打 UAT-Date tag ───────────────────────────────────────────
tag_uat() {
    local tag="UAT-$(date +%F)"
    if git -C "$ROIS_AI" rev-parse "$tag" >/dev/null 2>&1; then
        ok "[tag] $tag 已存在，跳过打标"
        return
    fi
    git -C "$ROIS_AI" tag "$tag" origin/main
    git -C "$ROIS_AI" push origin "$tag" >>"$DEPLOY_LOG" 2>&1
    ok "[tag] 已打并推送 $tag @ $(git -C "$ROIS_AI" rev-parse --short origin/main)"
}

# ── 参数解析 ───────────────────────────────────────────────────────
DO_LIVE=0 DO_PBS_SRV=0 DO_ENGINE=0 DO_CONNECTOR=0 DO_GANTT=0 DO_PBS_UI=0
[ $# -eq 0 ] && set -- --all
for arg in "$@"; do
    case "$arg" in
        --live)    DO_LIVE=1 ;;
        --pbs-srv) DO_PBS_SRV=1 ;;
        --engine)  DO_ENGINE=1 ;;
        --connector) DO_CONNECTOR=1 ;;
        --gantt)   DO_GANTT=1 ;;
        --pbs-ui)  DO_PBS_UI=1 ;;
        --all)     DO_LIVE=1; DO_PBS_SRV=1; DO_ENGINE=1; DO_CONNECTOR=1; DO_GANTT=1; DO_PBS_UI=1 ;;
        *) echo "未知参数: $arg"; exit 1 ;;
    esac
done

# ── 执行 ───────────────────────────────────────────────────────────
check_sit_not_deploying
sync_service_sh
ensure_env "live-server"
ensure_env "pbs-server"
ensure_engine_env
ensure_connector_env

ok "构建镜像 @ $(git -C "$ROIS_AI" rev-parse --short origin/main)"

if [ $DO_LIVE -eq 1 ]; then build_live; push_backend "live-server" "live-server/dist"; push_live_scripts; build_rust_bins; push_rust_bins; push_contracts; sync_version_tmp; fi
if [ $DO_PBS_SRV -eq 1 ]; then build_pbs_srv; push_backend "pbs-server" "pbs-server/dist"; push_contracts; sync_version_tmp; fi
if [ $DO_ENGINE -eq 1 ]; then push_engine; fi
if [ $DO_CONNECTOR -eq 1 ]; then build_connector; push_connector; sync_version_tmp; fi
if [ $DO_GANTT -eq 1 ]; then build_gantt; push_frontend "$ROIS_AI/gantt/dist" "gantt" "gantt"; sync_version_tmp; fi
if [ $DO_PBS_UI -eq 1 ]; then build_pbs_ui; push_frontend "$ROIS_AI/pbs-portal/dist" "pbs" "pbs-portal"; sync_version_tmp; fi

if [ $DO_LIVE -eq 1 ]; then restart_live; fi
if [ $DO_PBS_SRV -eq 1 ]; then restart_pbs_srv; fi
if [ $DO_ENGINE -eq 1 ]; then restart_engine; fi
if [ $DO_CONNECTOR -eq 1 ]; then restart_connector; fi

if [ $((DO_LIVE + DO_PBS_SRV + DO_ENGINE + DO_CONNECTOR + DO_GANTT + DO_PBS_UI)) -gt 0 ]; then
    tag_uat
fi

ok "UAT 部署完成"
