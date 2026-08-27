#!/usr/bin/env bash
# deploy/sit/deploy.sh
#
# SIT 环境部署脚本 — 在本机（= WebServer 10.15.12.2）运行。
#
# 架构：
#   本机 = WebServer (10.15.12.2): git 仓库 + 构建环境 + 前端静态文件直接写本地
#   PortalServer    (10.15.12.4): 只运行已编译的产物，无需 git/build 工具
#
# 配置契约（详见 deploy/sit/CONFIG.md）：
#   - 可被本脚本覆盖：代码 / dist / 模板 config.yaml / service.sh
#   - 永不覆盖：PortalServer 上 $PORTAL_DEV/env/*.env（环境私有密钥与连接串）
#   - 密钥只写 env，config.yaml 只允许 ${ENV} 引用
#
# 用法:
#   ./deploy.sh --all                   # 全量
#   ./deploy.sh --live                  # build live-server + push + 远程重启
#   ./deploy.sh --pbs-srv               # build pbs-server  + push + 远程重启
#   ./deploy.sh --connector             # build connector-server + push + 远程重启
#   ./deploy.sh --engine                # push engine-server 源码 + 远程重启
#   ./deploy.sh --ui-lib                # build @rois/ui（前端构建依赖，不推送）
#   ./deploy.sh --gantt                 # build gantt + push 到 WebServer
#   ./deploy.sh --pbs-ui                # build pbs-portal + push 到 WebServer
#   ./deploy.sh --live --gantt          # 组合模式

set -euo pipefail

# ── 路径（本机）──────────────────────────────────────────────────
ROIS_AI="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_DIR="$SCRIPT_DIR/env"
HASH_DIR="$SCRIPT_DIR/.pkghash"   # 记录已推送的 package-lock 哈希

# ── 远端配置 ──────────────────────────────────────────────────────
PORTAL="yuan.z@10.15.12.4"
PORTAL_DEV="/home/rois/sit"

# 本机 = WebServer，前端直接写本地路径，无需 SSH/SCP
LOCAL_WEB_DEV="/home/rois/sit"

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
# package.json 哈希 → 本机构建依赖跳过检测（ensure_local_node_build_deps）。
# lock 哈希 → PortalServer 生产依赖推送检测（push_pbs_srv），与前者分开记录，
# 否则 ensure 记录 lock 会让 push_pbs_srv 误判「lock 未变」而跳过 portal 安装。
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
    # package.json can grow a dep the deploy never reinstalls (@tanstack/react-virtual
    # incident on gantt). Reinstall whenever package.json changed. lock 哈希归
    # push_pbs_srv 管理（portal 生产依赖），本函数只检测 package.json 变更。
    if [ -x "$module_dir/node_modules/.bin/$tool" ] \
        && ! pkgjson_changed "$module"; then
        return
    fi

    log "[$module] 同步本机构建依赖..."
    # 用 npm install 而非 npm ci：package.json 新增依赖时陈旧 lock 会导致 npm ci EUSAGE，
    # npm install 会同步 lock。安装成功后 record_pkgjson_hash 才记录哈希（失败则下次重试）。
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

# PBS solver（源码部分）变化检测 — 基于本地 pyproject.toml 哈希。
# 注意：只有推送成功后才写 hash，避免失败后下次误判为“未变化”。
solver_hash() {
    local pyproject="$ROIS_AI/pbs-engine/pyproject.toml"
    sha256sum "$pyproject" 2>/dev/null | cut -d' ' -f1
}

solver_changed() {
    local cur_hash
    cur_hash=$(solver_hash)
    local last_hash
    last_hash=$(cat "$HASH_DIR/ro-solver.pkghash" 2>/dev/null || echo "")
    [ -z "$cur_hash" ] || [ "$cur_hash" != "$last_hash" ]
}

mark_solver_synced() {
    local cur_hash
    cur_hash=$(solver_hash)
    [ -n "$cur_hash" ] && echo "$cur_hash" > "$HASH_DIR/ro-solver.pkghash"
}

# Rust wheel（rois_rule_engine_rs）变化检测 — 基于 rule-engine-rs/py/Cargo.toml 哈希
rust_wheel_changed() {
    local cargo="$ROIS_AI/rule-engine-rs/py/Cargo.toml"
    local hash_file="$HASH_DIR/rust-wheel.pkghash"
    local cur_hash
    cur_hash=$(sha256sum "$cargo" 2>/dev/null | cut -d' ' -f1)
    local last_hash
    last_hash=$(cat "$hash_file" 2>/dev/null || echo "")
    if [ "$cur_hash" != "$last_hash" ] || [ -z "$cur_hash" ]; then
        [ -n "$cur_hash" ] && echo "$cur_hash" > "$hash_file"
        return 0
    fi
    return 1
}

ensure_rule_engine_rs_submodule_ssh() {
    local rs_url="git@github.com:yuanzhu-ai/rois-rule-engine-rs.git"
    git -C "$ROIS_AI" config "submodule.rule-engine-rs.url" "$rs_url"
    if [ -d "$ROIS_AI/rule-engine-rs/.git" ] || [ -f "$ROIS_AI/rule-engine-rs/.git" ]; then
        git -C "$ROIS_AI/rule-engine-rs" remote set-url origin "$rs_url" 2>/dev/null || true
    fi
}

ensure_local_maturin() {
    if python3 -m maturin --version >/dev/null 2>&1; then
        return
    fi
    log "[ro-solver] 本机缺少 maturin，安装到 user site..."
    python3 -m pip install --user maturin -q >>"$DEPLOY_LOG" 2>&1
    if ! python3 -m maturin --version >/dev/null 2>&1; then
        fail "[ro-solver] maturin 安装后仍不可用"
    fi
    ok "[ro-solver] maturin 已就绪"
}

# Rust 法规二进制变化检测 — 基于 rule-engine-rs 当前源码/提交状态。
# 只有编译和推送成功后才写 hash，避免失败后下次误判为“未变化”。
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

# ── ro-engine PBS solver ──────────────────────────────────────────
# 流程：
#   1. solver 源码（不含 .venv）从本地 rsync → PortalServer
#   2. Rust wheel（rule-engine-rs/py）在本机编译 → scp → PortalServer 安装进 solver .venv
#   3. solver .venv 不存在时在 PortalServer 上用 requirements.txt 初始化
#
# 完整性门禁：SIT 曾出现远端只剩 .venv、无 run_solver.py / ColumnModelSolver_python，
# 导致 ro_rust 秒失败 ModuleNotFoundError 而部署仍标绿。push 后必须能 import。
remote_solver_source_ok() {
    local dest_dir="$PORTAL_DEV/pbs-engine"
    ssh "$PORTAL" "
        test -f '$dest_dir/run_solver.py' &&
        test -f '$dest_dir/pyproject.toml' &&
        test -d '$dest_dir/ColumnModelSolver_python'
    " 2>/dev/null
}

verify_remote_solver_imports() {
    local dest_dir="$PORTAL_DEV/pbs-engine"
    local solver_py="$dest_dir/.venv/bin/python3"
    log "[ro-solver] 远端 import 探针（ColumnModelSolver_python + rois_rule_engine_rs）..."
    # Avoid nested heredoc inside $(...) — bash treats that as unterminated.
    # Write a temp remote script, pipe it to ssh bash -s.
    local probe_script result
    probe_script=$(mktemp)
    cat > "$probe_script" <<'REMOTE'
set -euo pipefail
DEST="$1"
PY="$2"
if [ ! -x "$PY" ]; then
    if command -v python3 >/dev/null 2>&1; then
        PY=$(command -v python3)
    else
        echo 'FAIL:python:missing'
        exit 0
    fi
fi
cd "$DEST"
"$PY" -c '
import sys
sys.path.insert(0, ".")
try:
    from ColumnModelSolver_python.io.loader import load_from_ro_input  # noqa: F401
except Exception as e:
    print("FAIL:ColumnModelSolver_python:%s" % type(e).__name__)
    raise SystemExit(0)
try:
    import rois_rule_engine_rs  # noqa: F401
except Exception as e:
    print("FAIL:rois_rule_engine_rs:%s" % type(e).__name__)
    raise SystemExit(0)
print("OK")
'
REMOTE
    result=$(ssh "$PORTAL" bash -s -- "$dest_dir" "$solver_py" < "$probe_script" 2>&1) || true
    rm -f "$probe_script"
    # Keep only the last non-empty line (ignore ssh/banner noise).
    result=$(printf '%s\n' "$result" | awk 'NF { line=$0 } END { print line }')
    case "$result" in
        OK)
            ok "[ro-solver] 远端 import 探针通过"
            ;;
        FAIL:*)
            fail "[ro-solver] 远端 import 探针失败: $result — LegacyRO/ro_rust 会秒失败"
            ;;
        *)
            fail "[ro-solver] 远端 import 探针无结果: ${result:-empty}"
            ;;
    esac
}

# 确保本机 pbs-engine submodule 已 checkout。SIT 上 .gitmodules 默认 https URL
# 无法非交互拉取；强制用 SSH（与 auto-deploy.sh 一致）。
ensure_local_pbs_engine() {
    local solver_src="$ROIS_AI/pbs-engine"
    if [ -f "$solver_src/run_solver.py" ] && [ -d "$solver_src/ColumnModelSolver_python" ]; then
        return 0
    fi

    log "[ro-solver] 本机 pbs-engine 不完整，尝试 submodule 初始化（SSH）..."
    local pbs_ssh="git@github.com:yuapply/PBS_column_based_algorithm.git"
    # sync copies .gitmodules https URL into .git/config — re-pin SSH after sync.
    git -C "$ROIS_AI" submodule sync --quiet pbs-engine || true
    git -C "$ROIS_AI" config submodule.pbs-engine.url "$pbs_ssh"
    if ! git -C "$ROIS_AI" submodule update --init --recursive pbs-engine >>"$DEPLOY_LOG" 2>&1; then
        fail "[ro-solver] pbs-engine submodule 初始化失败（检查 10.15.12.2 对 $pbs_ssh 的 SSH 权限）"
    fi
    if [ ! -f "$solver_src/run_solver.py" ] || [ ! -d "$solver_src/ColumnModelSolver_python" ]; then
        fail "[ro-solver] submodule 初始化后仍缺 run_solver.py / ColumnModelSolver_python"
    fi
    ok "[ro-solver] pbs-engine submodule 已就绪"
}

push_ro_solver() {
    local solver_src="$ROIS_AI/pbs-engine"
    local dest_dir="$PORTAL_DEV/pbs-engine"
    local solver_py="$dest_dir/.venv/bin/python3"

    ensure_local_pbs_engine

    if [ ! -f "$solver_src/run_solver.py" ] || [ ! -d "$solver_src/ColumnModelSolver_python" ]; then
        fail "[ro-solver] 本机 pbs-engine 源码不完整（缺 run_solver.py 或 ColumnModelSolver_python）"
    fi
    if [ ! -f "$solver_src/requirements.txt" ] && [ ! -f "$solver_src/pyproject.toml" ]; then
        fail "[ro-solver] 本机 pbs-engine 缺少 requirements.txt / pyproject.toml"
    fi

    # ── 1. 推送 solver 源码（排除 .venv，避免覆盖已安装环境）──────
    # 远端缺关键文件时强制重推，即使本地 pyproject 哈希未变（防“只剩 .venv”）。
    if solver_changed || ! remote_solver_source_ok; then
        log "[ro-solver] 推送 solver 源码 → PortalServer..."
        ssh "$PORTAL" "mkdir -p '$dest_dir'"
        rsync -az --delete \
            --exclude='.venv/' \
            --exclude='__pycache__/' \
            --exclude='*.pyc' \
            --exclude='.pytest_cache/' \
            --exclude='.git/' \
            --exclude='rois-rule-engine-rs/' \
            "$solver_src/" \
            "$PORTAL:$dest_dir/" >>"$DEPLOY_LOG" 2>&1
        if ! remote_solver_source_ok; then
            fail "[ro-solver] 推送后远端仍缺 run_solver.py / ColumnModelSolver_python"
        fi
        mark_solver_synced
        ok "[ro-solver] solver 源码推送完成"
    else
        ok "[ro-solver] solver 源码未变化且远端完整，跳过"
    fi

    # ── 2. 初始化 solver .venv（首次或 .venv 缺失时）─────────────
    local has_venv
    has_venv=$(ssh "$PORTAL" "[ -f '$solver_py' ] && echo yes || echo no" 2>/dev/null)
    if [ "$has_venv" = "no" ]; then
        log "[ro-solver] 初始化 solver .venv..."
        ssh "$PORTAL" "
            cd '$dest_dir'
            python3 -m venv .venv
            if [ -f requirements.txt ]; then
                .venv/bin/pip install -r requirements.txt -q
            elif [ -f pyproject.toml ]; then
                .venv/bin/pip install -e . -q
            else
                echo 'missing pbs-engine requirements.txt or pyproject.toml' >&2
                exit 1
            fi
        " >>"$DEPLOY_LOG" 2>&1
        ok "[ro-solver] solver .venv 初始化完成"
    fi

    # ── 3. 编译并安装 Rust wheel（rule-engine-rs 变化或 wheel 未安装时）──
    local wheel_installed
    wheel_installed=$(ssh "$PORTAL" "'$solver_py' -c 'import rois_rule_engine_rs' 2>/dev/null && echo yes || echo no")
    if rust_wheel_changed || [ "$wheel_installed" = "no" ]; then
        log "[ro-solver] 本机编译 Rust wheel（rois_rule_engine_rs）..."
        ensure_local_maturin
        local wheel_dir="$HASH_DIR/wheel"
        mkdir -p "$wheel_dir"
        # 清旧 wheel，避免版本混淆
        rm -f "$wheel_dir"/*.whl
        (
            source "$HOME/.cargo/env"
            cd "$ROIS_AI/rule-engine-rs/py"
            python3 -m maturin build --release --out "$wheel_dir" --quiet
        ) >>"$DEPLOY_LOG" 2>&1
        local wheel_file
        wheel_file=$(ls "$wheel_dir"/*.whl 2>/dev/null | head -1)
        if [ -z "$wheel_file" ]; then
            fail "[ro-solver] Rust wheel 编译失败，查看日志: $DEPLOY_LOG"
        fi
        ok "[ro-solver] Rust wheel 编译完成: $(basename "$wheel_file")"
        log "[ro-solver] 推送 wheel → PortalServer 并安装..."
        scp "$wheel_file" "$PORTAL:/tmp/" >>"$DEPLOY_LOG" 2>&1
        # Install into the SOLVER env explicitly — NEVER `pip install --user`. A
        # user-site copy (~/.local/lib/pythonX.Y/site-packages) shadows the solver env
        # on the next run (Python prefers user site) and breaks rust-hybrid in
        # load_scenario with an obscure:
        #   TypeError: Engine.__new__() got an unexpected keyword argument '...'
        # Purge any stray user-site wheel left from earlier --user installs first.
        ssh "$PORTAL" "rm -rf \$HOME/.local/lib/python3.*/site-packages/rois_rule_engine_rs*" \
            >>"$DEPLOY_LOG" 2>&1 || true
        ssh "$PORTAL" "'$solver_py' -m pip install --force-reinstall '/tmp/$(basename "$wheel_file")' -q" \
            >>"$DEPLOY_LOG" 2>&1
        ok "[ro-solver] Rust wheel 安装完成"
        # 更新哈希，避免下次无谓重编
        local cargo="$ROIS_AI/rule-engine-rs/py/Cargo.toml"
        sha256sum "$cargo" | cut -d' ' -f1 > "$HASH_DIR/rust-wheel.pkghash"
    else
        ok "[ro-solver] Rust wheel 未变化，跳过"
    fi

    verify_remote_solver_imports
}

# ── shared packages（live-server 和 pbs-server 运行时共享依赖）──────────────
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
    # packages/saml: Azure SSO 共享 helper，live/pbs dist 通过相对路径 require
    ssh "$PORTAL" "mkdir -p '$PORTAL_DEV/packages/saml'"
    rsync -az --delete \
        "$ROIS_AI/packages/saml/" \
        "$PORTAL:$PORTAL_DEV/packages/saml/" \
        >>"$DEPLOY_LOG" 2>&1
    # packages/saml 运行时依赖 @node-saml/node-saml：在 SIT packages 层装一次，
    # 使其能被 packages/saml/dist 的相对路径 require 解析到（否则 live/pbs 启动 MODULE_NOT_FOUND）
    ssh "$PORTAL" "cd '$PORTAL_DEV/packages' && { [ -f package.json ] || printf '%s\n' '{\"name\":\"sit-packages\",\"private\":true}' > package.json; } && npm install @node-saml/node-saml@5.1.0 --no-save --legacy-peer-deps --prefer-offline" >>"$DEPLOY_LOG" 2>&1
    # packages/legality-messages: live-server scripts (scenario-legality / legality-recheck-core)
    # resolve via file:../packages/legality-messages symlink — must exist on Portal or
    # Recheck Legality exits 1 with ERR_MODULE_NOT_FOUND and the UI spins forever.
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
# Merge max(local, remote) so a higher SIT-only counter never regresses.
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
    ssh "$PORTAL" "mkdir -p '$PORTAL_DEV/live-server/dist' '/home/yuan.z/rois/packages'"
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
        ok "[live-server] 生产依赖安装完成"
    fi
    ok "[live-server] 推送完成"
}

restart_live() {
    log "[live-server] 远程重启..."
    ssh "$PORTAL" "bash '$PORTAL_DEV/service.sh' restart live-server"
    ok "[live-server] 重启完成"
}

# Rust 法规引擎二进制 — ruletool + check-* 来自 rule-engine-rs/Cargo.toml [[bin]]（单一来源：
# deploy/common/list-rule-engine-bins.mjs）。一次 `cargo build --release` 编译全部目标，本机编译后
# 逐个推送到 PortalServer 同名路径。

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

push_rust_bins() {
    local remote_dir="$PORTAL_DEV/rule-engine-rs/target/release"
    load_rust_bins
    ensure_rule_engine_rs_submodule_ssh
    git -C "$ROIS_AI" submodule update --init --recursive rule-engine-rs >>"$DEPLOY_LOG" 2>&1
    local missing=0
    for bin in "${RUST_BINS[@]}"; do
        if ! ssh "$PORTAL" "[ -f '$remote_dir/$bin' ]" 2>/dev/null; then missing=1; break; fi
    done
    if rust_bins_changed || [ "$missing" -eq 1 ]; then
        log "[rust-bins] 本机编译全部法规引擎二进制 (ruletool + check-*)..."
        (
            source "$HOME/.cargo/env"
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

# ── pbs-server ────────────────────────────────────────────────────
build_pbs_srv() {
    log "[pbs-server] 本机构建..."
    ensure_local_node_build_deps "pbs-server" "tsc"
    cd "$ROIS_AI/pbs-server" && npm run build >>"$DEPLOY_LOG" 2>&1
    ok "[pbs-server] 构建完成"
}

# pbs-server 的 rust-rule-runner 会动态 import live-server 的合法性 core
# (legality-recheck-core.mjs / live-legality.mjs / legality-rp-window.mjs) 并 spawn
# rule-engine-rs 的 check-* 二进制。若远程缺失这些（例如只部署 pbs-server 而未部署
# live-server），Bid Feedback 的 eligibility 会静默降级 unknown。校验存在性，缺失则
# fail 并提示先部署 live-server。
ensure_pbs_rust_deps() {
    local core_scripts=(legality-recheck-core.mjs live-legality.mjs legality-rp-window.mjs)
    local missing_scripts=""
    for f in "${core_scripts[@]}"; do
        if ! ssh "$PORTAL" "[ -f '$PORTAL_DEV/live-server/scripts/$f' ]" 2>/dev/null; then
            missing_scripts="$missing_scripts $f"
        fi
    done
    if [ -n "$missing_scripts" ]; then
        fail "[pbs-server] RUST 依赖缺失：远程 live-server/scripts 缺少:$missing_scripts。请先执行 live-server 部署（推送 scripts + RUST 二进制）后再部署 pbs-server。"
    fi
    local remote_dir="$PORTAL_DEV/rule-engine-rs/target/release"
    load_rust_bins
    local missing=0
    for bin in "${RUST_BINS[@]}"; do
        if ! ssh "$PORTAL" "[ -f '$remote_dir/$bin' ]" 2>/dev/null; then missing=1; break; fi
    done
    if [ "$missing" -eq 1 ]; then
        fail "[pbs-server] RUST 二进制缺失于 $remote_dir。请先执行 live-server 部署或 rust-bins 推送。"
    fi
    ok "[pbs-server] RUST 法规依赖校验通过（live core scripts + check-* 二进制就位）"
}

push_pbs_srv() {
    log "[pbs-server] 推送 dist → PortalServer..."
    ensure_pbs_rust_deps
    ssh "$PORTAL" "mkdir -p '$PORTAL_DEV/pbs-server/dist'"
    rsync -az --delete \
        "$ROIS_AI/pbs-server/dist/" \
        "$PORTAL:$PORTAL_DEV/pbs-server/dist/" \
        >>"$DEPLOY_LOG" 2>&1
    # PBS backend/frontend counters live in the same live-server/version.tmp file.
    sync_version_tmp
    push_contracts
    if pkglock_changed "pbs-server"; then
        log "[pbs-server] package-lock 有变化，推送并安装生产依赖..."
        scp "$ROIS_AI/pbs-server/package.json" \
            "$ROIS_AI/pbs-server/package-lock.json" \
            "$PORTAL:$PORTAL_DEV/pbs-server/" >>"$DEPLOY_LOG" 2>&1
        ssh "$PORTAL" "cd '$PORTAL_DEV/pbs-server' && npm ci --omit=dev --legacy-peer-deps --prefer-offline" \
            >>"$DEPLOY_LOG" 2>&1
        ok "[pbs-server] 生产依赖安装完成"
        record_pkglock_hash "pbs-server"
    fi
    ok "[pbs-server] 推送完成"
}

restart_pbs_srv() {
    log "[pbs-server] 远程重启..."
    ssh "$PORTAL" "bash '$PORTAL_DEV/service.sh' restart pbs-server"
    ok "[pbs-server] 重启完成"
}

# ── connector-server ──────────────────────────────────────────────
build_connector() {
    log "[connector-server] 本机构建..."
    ensure_local_node_build_deps "connector-server" "tsc"
    cd "$ROIS_AI/connector-server" && npm run build >>"$DEPLOY_LOG" 2>&1
    ok "[connector-server] 构建完成"
}

push_connector() {
    log "[connector-server] 推送 dist → PortalServer..."
    ssh "$PORTAL" "mkdir -p '$PORTAL_DEV/connector-server/dist'"
    rsync -az --delete \
        "$ROIS_AI/connector-server/dist/" \
        "$PORTAL:$PORTAL_DEV/connector-server/dist/" \
        >>"$DEPLOY_LOG" 2>&1
    if [ -f "$ROIS_AI/connector-server/package-lock.json" ] && pkglock_changed "connector-server"; then
        log "[connector-server] package-lock 有变化，推送并安装生产依赖..."
        scp "$ROIS_AI/connector-server/package.json" \
            "$ROIS_AI/connector-server/package-lock.json" \
            "$PORTAL:$PORTAL_DEV/connector-server/" >>"$DEPLOY_LOG" 2>&1
        ssh "$PORTAL" "cd '$PORTAL_DEV/connector-server' && npm ci --omit=dev --legacy-peer-deps --prefer-offline" \
            >>"$DEPLOY_LOG" 2>&1
        ok "[connector-server] 生产依赖安装完成"
    elif [ ! -f "$ROIS_AI/connector-server/package-lock.json" ] && pkgjson_changed "connector-server"; then
        log "[connector-server] package.json 有变化（无 package-lock），推送并安装生产依赖..."
        scp "$ROIS_AI/connector-server/package.json" \
            "$PORTAL:$PORTAL_DEV/connector-server/" >>"$DEPLOY_LOG" 2>&1
        ssh "$PORTAL" "cd '$PORTAL_DEV/connector-server' && npm install --omit=dev --legacy-peer-deps --prefer-offline" \
            >>"$DEPLOY_LOG" 2>&1
        ok "[connector-server] 生产依赖安装完成"
    fi
    ok "[connector-server] 推送完成"
}

restart_connector() {
    log "[connector-server] 远程重启..."
    ssh "$PORTAL" "bash '$PORTAL_DEV/service.sh' restart connector-server"
    ok "[connector-server] 重启完成"
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
    # 保证所有 shell 脚本可执行（无论推送者是 yuan.z 还是 root）
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
    rsync -az \
        "$ROIS_AI/engine-server/F8/tzdata/" \
        "$PORTAL:$PORTAL_DEV/engine-server/F8/tzdata/" >>"$DEPLOY_LOG" 2>&1
    rsync -az \
        "$ROIS_AI/engine-server/F8/Database_connection.txt" \
        "$PORTAL:$PORTAL_DEV/engine-server/F8/Database_connection.txt" >>"$DEPLOY_LOG" 2>&1
    log "[engine-server] 校验远端源码已与本机同步..."
    local drift
    # 过滤 metadata-only 行（以 '.' 开头，如目录/文件 mtime 变化 `.d..t......`）——
    # 这些不是内容差异（venv 在远端创建会改父目录 mtime，误报会导致部署中止）
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
ENV_DIR=/home/rois/sit/env
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

# Prefer engine venv (PyJWT); fall back to system python3.
PY=/home/rois/sit/engine-server/venv/bin/python3
[ -x "$PY" ] || PY=python3

"$PY" - <<'PY'
import json, time, urllib.error, urllib.request
from pathlib import Path

def read_secret(path: str) -> str:
    for line in Path(path).read_text().splitlines():
        if line.startswith("JWT_SECRET="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("FAIL:JWT_SECRET not found")

secret = read_secret("/home/rois/sit/env/live-server.env")
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
    # 401 = auth still broken; any other HTTP status means JWT was accepted.
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

# ── PBS 列生成优化引擎验证 ────────────────────────────────────────
# run_pipeline.sh 预装于 PortalServer /home/rois/，无需从本机推送。
# 部署时仅验证可执行性；缺失时尝试 chmod，仍失败则警告（不阻断部署）。
verify_pbs_pipeline() {
    local script="/home/rois/PBS_column_based_algorithm-main/run_pipeline.sh"
    log "[pbs-pipeline] 验证 run_pipeline.sh..."
    local status
    status=$(ssh "$PORTAL" "[ -x '$script' ] && echo ok || ([ -f '$script' ] && echo noexec || echo missing)" 2>/dev/null)
    case "$status" in
        ok)
            ok "[pbs-pipeline] run_pipeline.sh 已就绪"
            ;;
        noexec)
            log "[pbs-pipeline] 文件存在但不可执行，尝试 chmod +x..."
            ssh "$PORTAL" "chmod +x '$script'" >>"$DEPLOY_LOG" 2>&1 || true
            if ssh "$PORTAL" "[ -x '$script' ]" 2>/dev/null; then
                ok "[pbs-pipeline] chmod 成功，run_pipeline.sh 已就绪"
            else
                warn "[pbs-pipeline] chmod 失败（权限不足），engine-server 调用时将报错"
            fi
            ;;
        *)
            warn "[pbs-pipeline] $script 不存在于 PortalServer — engine-server 调用 PBS 优化时将失败"
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
    atomic_local_copy "$ROIS_AI/gantt/dist" "$LOCAL_WEB_DEV/gantt" "gantt"
    # Frontend counter is bumped on gantt build; UI reads it from live-server version API.
    sync_version_tmp
}

# ── pbs-portal 前端 ──────────────────────────────────────────────
build_pbs_ui() {
    log "[pbs-portal] 本机构建（base=/pbs/ api=/pbs/api）..."
    cd "$ROIS_AI/pbs-portal"
    # Use vite build directly — tsc type-check includes test files with missing peer deps
    env $(grep -v '^#' "$ENV_DIR/pbs-portal.build.env" | grep -v '^$' | xargs) \
        npx vite build >>"$DEPLOY_LOG" 2>&1
    ok "[pbs-portal] 构建完成"
}

push_pbs_ui() {
    atomic_local_copy "$ROIS_AI/pbs-portal/dist" "$LOCAL_WEB_DEV/pbs" "pbs-portal"
    # PBS frontend counter is bumped on portal build; shared version.tmp still lives under live-server.
    sync_version_tmp
}

# ── service.sh 同步到 PortalServer（每次部署前确保最新版）──────────
sync_service_sh() {
    scp "$SCRIPT_DIR/service.sh" "$PORTAL:$PORTAL_DEV/service.sh" >>"$DEPLOY_LOG" 2>&1
    ssh "$PORTAL" "chmod +x '$PORTAL_DEV/service.sh'"
}

# ── 解析参数 & 执行 ───────────────────────────────────────────────
DO_LIVE=0 DO_PBS_SRV=0 DO_CONNECTOR=0 DO_ENGINE=0
DO_GANTT=0 DO_PBS_UI=0
DO_ALL=0

if [ $# -eq 0 ]; then DO_ALL=1; fi

for arg in "$@"; do
    case "$arg" in
        --live)    DO_LIVE=1 ;;
        --pbs-srv) DO_PBS_SRV=1 ;;
        --connector) DO_CONNECTOR=1 ;;
        --engine)  DO_ENGINE=1 ;;
        --gantt)   DO_GANTT=1 ;;
        --pbs-ui)  DO_PBS_UI=1 ;;
        --all)     DO_ALL=1 ;;
        *) echo "未知参数: $arg"; exit 1 ;;
    esac
done

if [ $DO_ALL -eq 1 ]; then
    DO_LIVE=1; DO_PBS_SRV=1; DO_CONNECTOR=1; DO_ENGINE=1
    DO_GANTT=1; DO_PBS_UI=1
fi

# 每次推送前同步 service.sh（轻量，<1KB）
sync_service_sh

# 构建阶段（本机，串行以保持日志清晰）
if [ $DO_LIVE    -eq 1 ]; then build_live;    fi
if [ $DO_PBS_SRV -eq 1 ]; then build_pbs_srv; fi
if [ $DO_CONNECTOR -eq 1 ]; then build_connector; fi
if [ $DO_GANTT   -eq 1 ]; then build_gantt;   fi
if [ $DO_PBS_UI  -eq 1 ]; then build_pbs_ui;  fi

# 推送 + 重启阶段（依赖构建结果）
# Publish local static frontends before backend post-deploy probes. The frontends
# only copy to this WebServer; they should not be blocked by later Portal/Rust
# steps such as rule-engine-rs binary sync.
if [ $DO_GANTT   -eq 1 ]; then push_gantt;   fi
if [ $DO_PBS_UI  -eq 1 ]; then push_pbs_ui;  fi

if [ $DO_LIVE    -eq 1 ]; then push_live;    push_rust_bins;    restart_live; fi
if [ $DO_PBS_SRV -eq 1 ]; then push_pbs_srv; restart_pbs_srv; fi
if [ $DO_CONNECTOR -eq 1 ]; then push_connector; restart_connector; fi
# solver 必须在 engine 重启前就绪，否则重启窗口内 Run 会秒失败 ModuleNotFoundError
if [ $DO_ENGINE  -eq 1 ]; then
    push_engine
    # push_ro_solver
    restart_engine
    verify_engine_jwt_auth
    verify_pbs_pipeline
fi

# Any ai-rois module deployment should refresh the runtime git version shown by the UI.
if [ $((DO_LIVE + DO_PBS_SRV + DO_CONNECTOR + DO_ENGINE + DO_GANTT + DO_PBS_UI)) -gt 0 ]; then
    sync_version_tmp
fi
