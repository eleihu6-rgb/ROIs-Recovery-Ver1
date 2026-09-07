#!/usr/bin/env bash
# deploy/sit/deploy.sh
#
# SIT 环境部署脚本 — 在本机（= WebServer / dev 工作站）运行。
#
# 架构：
#   本机 (WebServer): git 仓库 ~/dev/recovery/ + 构建环境 + gantt 静态产物直写本地
#                     /home/recovery/sit/gantt/，由本地 nginx (1.26.2) 通过
#                     /etc/nginx/conf.d/recovery-sit.conf 提供 /altair/。
#   PortalServer (10.16.11.18, ecs-user + sudo NOPASSWD): 服务 + DB + Redis 同机。
#                     live-server(:3000) / engine-server(:3003) /
#                     postgres:17-alpine(:5432) / redis:7-alpine(:6379)
#                     全部跑在该机；无 SSH 隧道。
#
# 配置契约（详见 deploy/sit/CONFIG.md）：
#   - 可被本脚本覆盖：代码 / dist / 模板 config.yaml / service.sh
#   - 永不覆盖：PortalServer 上 $PORTAL_DEV/env/*.env（环境私有密钥与连接串）
#   - 密钥只写 env，config.yaml 只允许 ${ENV} 引用
#
# 部署范围（裁剪版）：
#   live-server / engine-server / rule-engine-rs / packages/* / gantt
#
# 用法:
#   ./deploy.sh --all                   # 全量
#   ./deploy.sh --live                  # build live-server + push dist + Rust 法规二进制 + 远程重启
#   ./deploy.sh --engine                # push engine-server 源码 + 远程重启 + JWT 探针
#   ./deploy.sh --gantt                 # build gantt + 写到本机 /home/recovery/sit/gantt/
#   ./deploy.sh --live --gantt          # 组合模式

set -euo pipefail

# ── 路径（本机）──────────────────────────────────────────────────
ROIS_AI="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_DIR="$SCRIPT_DIR/env"
HASH_DIR="$SCRIPT_DIR/.pkghash"   # 记录已推送的 package-lock 哈希

# ── 远端配置 ──────────────────────────────────────────────────────
PORTAL="ecs-user@10.16.11.18"
PORTAL_DEV="/home/ecs-user/sit"

# 本机 = WebServer，gantt 前端直接写本地路径，无需 SSH/SCP
LOCAL_WEB_DEV="/home/recovery/sit"

DEPLOY_LOG="${HASH_DIR}/../deploy.log"

mkdir -p "$HASH_DIR"
: > /dev/null  # 确保 HASH_DIR 存在后再记录 log 路径

ts()   { date '+%Y-%m-%d %H:%M:%S'; }
log()  { echo "[$(ts)] $*" | tee -a "$DEPLOY_LOG"; }
ok()   { echo "[$(ts)] ✓ $*" | tee -a "$DEPLOY_LOG"; }
warn() { echo "[$(ts)] ⚠ $*" | tee -a "$DEPLOY_LOG" >&2; }
fail() { echo "[$(ts)] ✗ $*" | tee -a "$DEPLOY_LOG" >&2; exit 1; }

# ── 工具函数 ──────────────────────────────────────────────────────

# 原子本地复制：先写 .new 再 mv，避免 nginx 读到不完整文件
atomic_local_copy() {
    local src="$1" dst="$2" label="$3"
    local tmp="${dst}.new"
    rm -rf "$tmp" && mkdir -p "$tmp"
    cp -r "$src/." "$tmp/"
    rm -rf "$dst" && mv "$tmp" "$dst"
    ok "[$label] 部署完成 → $dst"
}

# package-lock 变化检测（本机侧记录哈希，避免每次都在 PortalServer 上重跑 npm ci）。
# 注意：本函数只检测不记录——哈希在安装/推送成功后才由 record_pkglock_hash 写入，
# 否则安装失败会留下「已记录」的哈希，导致后续跳过重装（node_modules 永远陈旧）。
pkglock_changed() {
    local module="$1"   # 如 live-server
    local lock_file="$ROIS_AI/$module/package-lock.json"
    local hash_file="$HASH_DIR/${module}.pkghash"
    local cur_hash
    cur_hash=$(sha256sum "$lock_file" | cut -d' ' -f1)
    local last_hash
    last_hash=$(cat "$hash_file" 2>/dev/null || echo "")
    [ "$cur_hash" != "$last_hash" ]
}

pkgjson_changed() {
    local module="$1"
    local package_file="$ROIS_AI/$module/package.json"
    local hash_file="$HASH_DIR/${module}.package-json.pkghash"
    local cur_hash
    cur_hash=$(sha256sum "$package_file" | cut -d' ' -f1)
    local last_hash
    last_hash=$(cat "$hash_file" 2>/dev/null || echo "")
    [ "$cur_hash" != "$last_hash" ]
}

# 安装/推送成功后记录哈希，供下次跳过检测。
record_pkgjson_hash() {
    local module="$1"
    sha256sum "$ROIS_AI/$module/package.json" | cut -d' ' -f1 > "$HASH_DIR/${module}.package-json.pkghash"
}
record_pkglock_hash() {
    local module="$1"
    if [ -f "$ROIS_AI/$module/package-lock.json" ]; then
        sha256sum "$ROIS_AI/$module/package-lock.json" | cut -d' ' -f1 > "$HASH_DIR/${module}.pkghash"
    fi
}

ensure_local_node_build_deps() {
    local module="$1"
    local tool="$2"
    local module_dir="$ROIS_AI/$module"

    # A tool binary being present does NOT mean a newly added dependency is installed —
    # package.json can grow a dep the deploy never reinstalls. Reinstall whenever
    # package.json changed. lock 哈希归 push_live 管理（portal 生产依赖），
    # 本函数只检测 package.json 变更。
    if [ -x "$module_dir/node_modules/.bin/$tool" ] \
        && ! pkgjson_changed "$module"; then
        return
    fi

    log "[$module] 同步本机构建依赖..."
    (cd "$module_dir" && npm install --include=dev --legacy-peer-deps --prefer-offline) >>"$DEPLOY_LOG" 2>&1

    if [ ! -x "$module_dir/node_modules/.bin/$tool" ]; then
        fail "[$module] 安装构建依赖后仍缺 node_modules/.bin/$tool"
    fi
    record_pkgjson_hash "$module"
    ok "[$module] 本机构建依赖已就绪"
}

# requirements.txt 变化检测（engine-server）
requirements_changed() {
    local req_file="$ROIS_AI/engine-server/requirements.txt"
    local hash_file="$HASH_DIR/engine-server-req.pkghash"
    local cur_hash
    cur_hash=$(sha256sum "$req_file" | cut -d' ' -f1)
    local last_hash
    last_hash=$(cat "$hash_file" 2>/dev/null || echo "")
    if [ "$cur_hash" != "$last_hash" ]; then
        echo "$cur_hash" > "$hash_file"
        return 0
    fi
    return 1
}

ENGINE_RSYNC_EXCLUDES=(
    --exclude='venv/'
    --exclude='__pycache__/'
    --exclude='*.pyc'
    --exclude='.pytest_cache/'
    --exclude='complete/'
    --exclude='workspace/'
    --exclude='finished/'
    --exclude='archive/'
    --exclude='temp/'
    --exclude='logs/'
    --exclude='config.local.yaml'
    --exclude='*.local.yaml'
    --exclude='*.bak'
    --exclude='*.bak-*'
    --exclude='config.yaml.bak*'
)

# ── shared packages（live-server 运行时共享依赖）──────────────────────
build_shared_rules() {
    local package_dir="$ROIS_AI/packages/shared-rules"
    local tsc="$ROIS_AI/live-server/node_modules/.bin/tsc"

    if [ "${SHARED_RULES_BUILT:-0}" -eq 1 ]; then
        return
    fi

    if [ ! -x "$tsc" ]; then
        ensure_local_node_build_deps "live-server" "tsc"
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

# ── packages/contracts + packages/saml + shared-rules + legality-messages ──
push_contracts() {
    ssh "$PORTAL" "mkdir -p '$PORTAL_DEV/packages/contracts'"
    rsync -az --delete \
        "$ROIS_AI/packages/contracts/" \
        "$PORTAL:$PORTAL_DEV/packages/contracts/" \
        >>"$DEPLOY_LOG" 2>&1
    # packages/saml: Azure SSO 共享 helper，live dist 通过相对路径 require
    ssh "$PORTAL" "mkdir -p '$PORTAL_DEV/packages/saml'"
    rsync -az --delete \
        "$ROIS_AI/packages/saml/" \
        "$PORTAL:$PORTAL_DEV/packages/saml/" \
        >>"$DEPLOY_LOG" 2>&1
    # packages/saml 运行时依赖 @node-saml/node-saml：在 SIT packages 层装一次，
    # 使其能被 packages/saml/dist 的相对路径 require 解析到
    ssh "$PORTAL" "cd '$PORTAL_DEV/packages' && { [ -f package.json ] || printf '%s\n' '{\"name\":\"sit-packages\",\"private\":true}' > package.json; } && npm install @node-saml/node-saml@5.1.0 --no-save --legacy-peer-deps --prefer-offline" >>"$DEPLOY_LOG" 2>&1
    # packages/legality-messages: live-server scripts (scenario-legality / legality-recheck-core)
    # resolve via file:../packages/legality-messages symlink — must exist on Portal or
    # Recheck Legality exits 1 with ERR_MODULE_NOT_FOUND.
    ssh "$PORTAL" "mkdir -p '$PORTAL_DEV/packages/legality-messages'"
    rsync -az --delete \
        "$ROIS_AI/packages/legality-messages/" \
        "$PORTAL:$PORTAL_DEV/packages/legality-messages/" \
        >>"$DEPLOY_LOG" 2>&1
    ok "[legality-messages] 已部署 → $PORTAL_DEV/packages/legality-messages"
    push_shared_rules
}

# ── version.tmp ───────────────────────────────────────────────────
# Runtime version is read from live-server/version.tmp on PortalServer.
# Build only bumps the webserver checkout; without this push SIT never moves.
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
print("Ver:B{backend}/F{frontend}/R{rule}{suffix}".format(**merged, suffix=suffix))
PY
    ssh "$PORTAL" "mkdir -p '$PORTAL_DEV/live-server'"
    scp "$local_path" "$PORTAL:$remote_path" >>"$DEPLOY_LOG" 2>&1
    ok "[version] 已同步 version.tmp → PortalServer"
}

# ── live-server ───────────────────────────────────────────────────
build_live() {
    log "[live-server] 本机构建..."
    ensure_local_node_build_deps "live-server" "tsc"
    build_shared_rules
    cd "$ROIS_AI/live-server" && npm run build >>"$DEPLOY_LOG" 2>&1
    ok "[live-server] 构建完成"
}

push_live() {
    generate_rust_bins_manifest
    log "[live-server] 推送 dist → PortalServer..."
    ssh "$PORTAL" "mkdir -p '$PORTAL_DEV/live-server/dist' '$PORTAL_DEV/packages'"
    # 推送编译产物
    rsync -az --delete \
        "$ROIS_AI/live-server/dist/" \
        "$PORTAL:$PORTAL_DEV/live-server/dist/" \
        >>"$DEPLOY_LOG" 2>&1
    # 推送 scripts/（scenario-legality.mjs / live-legality.mjs / legality-recheck-core.mjs 等独立
    # .mjs 脚本，由 spawnCompute()/spawnLiveRecheck() 以 cwd 相对路径 spawn 调用，不经过 tsc 编译，
    # dist/ 里没有它们 —— 曾经因为这里遗漏同步导致 SIT 上 scenario legality 永远卡在 COMPUTING。
    ssh "$PORTAL" "mkdir -p '$PORTAL_DEV/live-server/scripts'"
    rsync -az --delete --exclude='__tests__/' \
        "$ROIS_AI/live-server/scripts/" \
        "$PORTAL:$PORTAL_DEV/live-server/scripts/" \
        >>"$DEPLOY_LOG" 2>&1
    sync_version_tmp
    push_contracts
    # 推送 package 文件（npm ci 需要）并在 PortalServer 上安装生产依赖
    if pkglock_changed "live-server"; then
        log "[live-server] package-lock 有变化，推送并在 PortalServer 上安装生产依赖..."
        scp "$ROIS_AI/live-server/package.json" \
            "$ROIS_AI/live-server/package-lock.json" \
            "$PORTAL:$PORTAL_DEV/live-server/" >>"$DEPLOY_LOG" 2>&1
        ssh "$PORTAL" "cd '$PORTAL_DEV/live-server' && npm ci --omit=dev --legacy-peer-deps --prefer-offline" \
            >>"$DEPLOY_LOG" 2>&1
        record_pkglock_hash "live-server"
        ok "[live-server] 生产依赖安装完成"
    fi
    ok "[live-server] 推送完成"
}

restart_live() {
    log "[live-server] 远程重启..."
    ssh "$PORTAL" "bash '$PORTAL_DEV/service.sh' restart live-server"
    ok "[live-server] 重启完成"
}

# ── rule-engine-rs（Rust 法规二进制）──────────────────────────────
# ruletool + check-* 来自 rule-engine-rs/Cargo.toml [[bin]]（单一来源：
# deploy/common/list-rule-engine-bins.mjs）。一次 `cargo build --release` 编译全部目标，
# 本机编译后逐个推送到 PortalServer 同名路径。

# Populate RUST_BINS from rule-engine-rs/Cargo.toml [[bin]] (single source of truth).
generate_rust_bins_manifest() {
    local cargo="$ROIS_AI/rule-engine-rs/Cargo.toml"
    local manifest="$ROIS_AI/live-server/scripts/rust-bins.json"
    node "$ROIS_AI/deploy/common/generate-rust-bins-manifest.mjs" "$cargo" "$manifest" \
        || fail "[rust-bins] failed to generate runtime manifest from $cargo"
}

load_rust_bins() {
    local cargo="$ROIS_AI/rule-engine-rs/Cargo.toml"
    local list
    list=$(node "$ROIS_AI/deploy/common/list-rule-engine-bins.mjs" "$cargo") \
        || fail "[rust-bins] failed to list [[bin]] from $cargo"
    mapfile -t RUST_BINS <<<"$list"
    if [ "${#RUST_BINS[@]}" -eq 0 ]; then
        fail "[rust-bins] empty [[bin]] list from $cargo"
    fi
}

# Rust 法规二进制变化检测 — 基于 rule-engine-rs 当前源码/提交状态。
rust_bins_hash() {
    (
        cd "$ROIS_AI/rule-engine-rs"
        git rev-parse HEAD 2>/dev/null || true
        git status --short --untracked-files=no 2>/dev/null || true
        git ls-files -z 2>/dev/null | xargs -0 sha256sum 2>/dev/null || true
    ) | sha256sum | cut -d' ' -f1
}

rust_bins_changed() {
    local cur_hash
    cur_hash=$(rust_bins_hash)
    local last_hash
    last_hash=$(cat "$HASH_DIR/ruletool.pkghash" 2>/dev/null || echo "")
    [ -z "$cur_hash" ] || [ "$cur_hash" != "$last_hash" ]
}

mark_rust_bins_synced() {
    local cur_hash
    cur_hash=$(rust_bins_hash)
    [ -n "$cur_hash" ] && echo "$cur_hash" > "$HASH_DIR/ruletool.pkghash"
}

push_rust_bins() {
    local remote_dir="$PORTAL_DEV/rule-engine-rs/target/release"
    load_rust_bins
    local missing=0
    for bin in "${RUST_BINS[@]}"; do
        if ! ssh "$PORTAL" "[ -f '$remote_dir/$bin' ]" 2>/dev/null; then missing=1; break; fi
    done
    if rust_bins_changed || [ "$missing" -eq 1 ]; then
        log "[rust-bins] 本机编译全部法规引擎二进制 (ruletool + check-*)..."
        (
            cd "$ROIS_AI/rule-engine-rs"
            cargo build --release --quiet
        ) >>"$DEPLOY_LOG" 2>&1
        for bin in "${RUST_BINS[@]}"; do
            if [ ! -x "$ROIS_AI/rule-engine-rs/target/release/$bin" ]; then
                fail "[rust-bins] 构建后缺少 $bin；请检查 rule-engine-rs submodule 是否包含对应 [[bin]] 目标"
            fi
        done
        log "[rust-bins] 推送二进制 → PortalServer..."
        ssh "$PORTAL" "mkdir -p '$remote_dir'"
        for bin in "${RUST_BINS[@]}"; do
            scp "$ROIS_AI/rule-engine-rs/target/release/$bin" "$PORTAL:$remote_dir/$bin" \
                >>"$DEPLOY_LOG" 2>&1
        done
        mark_rust_bins_synced
        ok "[rust-bins] 全部二进制部署完成 (${#RUST_BINS[@]} 个)"
    else
        ok "[rust-bins] 二进制未变化，跳过"
    fi
}

# ── engine-server（Python，无 TS 构建，推送源码）─────────────────
# 推送边界：
#   - 推：源码、模板 config.yaml（仅 ${ENV} 引用，不含真密钥）
#   - 不推 / 永不覆盖：$PORTAL_DEV/env/*（本函数根本不碰该目录）
#   - 保留远端：venv、运行产物目录、本地覆盖文件与备份
push_engine() {
    log "[engine-server] 推送源码 → PortalServer..."
    log "[engine-server] 配置契约: 不触碰 $PORTAL_DEV/env/；config.yaml 仅为模板"
    ssh "$PORTAL" "mkdir -p '$PORTAL_DEV/engine-server'"
    rsync -az --delete \
        "${ENGINE_RSYNC_EXCLUDES[@]}" \
        "$ROIS_AI/engine-server/" \
        "$PORTAL:$PORTAL_DEV/engine-server/" \
        >>"$DEPLOY_LOG" 2>&1
    # 保证所有 shell 脚本可执行
    ssh "$PORTAL" "find '$PORTAL_DEV/engine-server' -name '*.sh' | xargs chmod +x" >>"$DEPLOY_LOG" 2>&1
    local has_venv
    has_venv=$(ssh "$PORTAL" "[ -d '$PORTAL_DEV/engine-server/venv' ] && echo yes || echo no" 2>/dev/null)
    if requirements_changed || [ "$has_venv" = "no" ]; then
        log "[engine-server] 在 PortalServer 上安装/更新 venv..."
        ssh "$PORTAL" "
            set -e
            cd '$PORTAL_DEV/engine-server'
            [ -d venv ] || python3 -m venv venv
            venv/bin/python3 -m pip install -r requirements.txt -q
        " >>"$DEPLOY_LOG" 2>&1
        ok "[engine-server] venv 更新完成"
    fi
    # F8 运行时资产（gitignore 排除，从本机直接推送）
    log "[engine-server] 同步 F8 aux 文件（tzdata / Database_connection.txt）..."
    ssh "$PORTAL" "mkdir -p '$PORTAL_DEV/engine-server/F8/tzdata'"
    rsync -az \
        "$ROIS_AI/engine-server/F8/tzdata/" \
        "$PORTAL:$PORTAL_DEV/engine-server/F8/tzdata/" >>"$DEPLOY_LOG" 2>&1 || true
    if [ -f "$ROIS_AI/engine-server/F8/Database_connection.txt" ]; then
        rsync -az \
            "$ROIS_AI/engine-server/F8/Database_connection.txt" \
            "$PORTAL:$PORTAL_DEV/engine-server/F8/Database_connection.txt" >>"$DEPLOY_LOG" 2>&1 || true
    fi
    log "[engine-server] 校验远端源码已与本机同步..."
    local drift
    drift=$(rsync -azcni --no-perms --delete \
        "${ENGINE_RSYNC_EXCLUDES[@]}" \
        "$ROIS_AI/engine-server/" \
        "$PORTAL:$PORTAL_DEV/engine-server/" 2>&1 || true | grep -v '^\.' || true)
    if [ -n "$drift" ]; then
        printf '%s\n' "$drift" >>"$DEPLOY_LOG"
        fail "[engine-server] 远端源码校验失败，rsync dry-run 仍发现差异；为避免旧代码继续运行，已中止部署"
    fi
    ok "[engine-server] 远端源码校验通过"
    ok "[engine-server] 推送完成"
}

restart_engine() {
    log "[engine-server] 远程重启..."
    ssh "$PORTAL" "bash '$PORTAL_DEV/service.sh' restart engine-server"
    ok "[engine-server] 重启完成"
}

# After engine restart: prove live JWT is accepted (catches missing JWT_SECRET in env).
# Uses PortalServer-local secrets only; never prints token or secret values.
verify_engine_jwt_auth() {
    log "[engine-server] JWT 认证探针（live secret → /api/optimize/start）..."
    local result
    result=$(ssh "$PORTAL" "bash -s" <<'REMOTE'
set -euo pipefail
ENV_DIR=/home/ecs-user/sit/env
LIVE_ENV="$ENV_DIR/live-server.env"
ENG_ENV="$ENV_DIR/engine-server.env"

read_secret() {
    local f="$1"
    grep -E '^JWT_SECRET=' "$f" 2>/dev/null | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" || true
}

live=$(read_secret "$LIVE_ENV")
eng=$(read_secret "$ENG_ENV")
if [ -z "$live" ]; then
    echo "FAIL:live-server.env missing JWT_SECRET"
    exit 0
fi
if [ -z "$eng" ]; then
    echo "FAIL:engine-server.env missing JWT_SECRET"
    exit 0
fi
if [ "$live" != "$eng" ]; then
    echo "FAIL:JWT_SECRET mismatch between live-server.env and engine-server.env"
    exit 0
fi

PY=/home/ecs-user/sit/engine-server/venv/bin/python3
[ -x "$PY" ] || PY=python3

"$PY" - <<'PY'
import json, time, urllib.error, urllib.request
from pathlib import Path

def read_secret(path: str) -> str:
    for line in Path(path).read_text().splitlines():
        if line.startswith("JWT_SECRET="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("FAIL:JWT_SECRET not found")

secret = read_secret("/home/ecs-user/sit/env/live-server.env")
try:
    import jwt
except ImportError:
    print("FAIL:PyJWT not installed in engine venv")
    raise SystemExit(0)

token = jwt.encode(
    {"userName": "sit-deploy-jwt-probe", "exp": int(time.time()) + 120},
    secret,
    algorithm="HS256",
)
body = json.dumps({
    "airline": "F8",
    "type": "LegacyRO",
    "parameters": {"scenarioId": 1, "inputSource": "db"},
    "url": "http://127.0.0.1:3000",
    "token": token,
}).encode()
req = urllib.request.Request(
    "http://127.0.0.1:3003/api/optimize/start",
    data=body,
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "X-Airline": "F8",
    },
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=20) as resp:
        print(f"OK:{resp.status}")
except urllib.error.HTTPError as e:
    if e.code == 401:
        print("FAIL:401 Invalid authentication credentials")
    else:
        print(f"OK:{e.code}")
except Exception as exc:
    print(f"FAIL:{type(exc).__name__}")
PY
REMOTE
) || true

    case "$result" in
        OK:*)
            ok "[engine-server] JWT 探针通过 ($result)"
            ;;
        FAIL:*)
            fail "[engine-server] JWT 探针失败: $result — 检查 $PORTAL_DEV/env/engine-server.env 的 JWT_SECRET 是否与 live-server 一致（见 deploy/sit/CONFIG.md）"
            ;;
        *)
            fail "[engine-server] JWT 探针无结果（ssh/脚本异常）: ${result:-empty}"
            ;;
    esac
}

# ── gantt 前端 ────────────────────────────────────────────────────
build_gantt() {
    log "[gantt] 本机构建（base=/altair/ prefix=）..."
    ensure_local_node_build_deps "gantt" "tsc"
    cd "$ROIS_AI/gantt"
    env $(grep -v '^#' "$ENV_DIR/gantt.build.env" | grep -v '^$' | xargs) \
        npm run build >>"$DEPLOY_LOG" 2>&1
    ok "[gantt] 构建完成"
}

push_gantt() {
    # gantt dist 写到本机，由本地 nginx 提供 /altair/
    atomic_local_copy "$ROIS_AI/gantt/dist" "$LOCAL_WEB_DEV/gantt" "gantt"
    # Frontend counter is bumped on gantt build; UI reads it from live-server version API.
    sync_version_tmp
}

# ── service.sh 同步到 PortalServer（每次部署前确保最新版）──────────
sync_service_sh() {
    scp "$SCRIPT_DIR/service.sh" "$PORTAL:$PORTAL_DEV/service.sh" >>"$DEPLOY_LOG" 2>&1
    ssh "$PORTAL" "chmod +x '$PORTAL_DEV/service.sh'"
}

# ── 解析参数 & 执行 ───────────────────────────────────────────────
DO_LIVE=0 DO_ENGINE=0 DO_GANTT=0
DO_ALL=0

if [ $# -eq 0 ]; then DO_ALL=1; fi

for arg in "$@"; do
    case "$arg" in
        --live)    DO_LIVE=1 ;;
        --engine)  DO_ENGINE=1 ;;
        --gantt)   DO_GANTT=1 ;;
        --all)     DO_ALL=1 ;;
        *) echo "未知参数: $arg"; exit 1 ;;
    esac
done

if [ $DO_ALL -eq 1 ]; then
    DO_LIVE=1; DO_ENGINE=1; DO_GANTT=1
fi

# 每次推送前同步 service.sh（轻量，<1KB）
sync_service_sh

# 构建阶段（本机，串行以保持日志清晰）
if [ $DO_LIVE    -eq 1 ]; then build_live;    fi
if [ $DO_GANTT   -eq 1 ]; then build_gantt;   fi

# 推送 + 重启阶段（依赖构建结果）
# Publish local static frontends before backend post-deploy probes. The frontends
# only copy to this WebServer; they should not be blocked by later Portal/Rust
# steps such as rule-engine-rs binary sync.
if [ $DO_GANTT   -eq 1 ]; then push_gantt;   fi

if [ $DO_LIVE    -eq 1 ]; then push_live;    push_rust_bins;    restart_live; fi
if [ $DO_ENGINE  -eq 1 ]; then
    push_engine
    restart_engine
    verify_engine_jwt_auth
fi

# Any ai-rois module deployment should refresh the runtime git version shown by the UI.
if [ $((DO_LIVE + DO_ENGINE + DO_GANTT)) -gt 0 ]; then
    sync_version_tmp
fi
