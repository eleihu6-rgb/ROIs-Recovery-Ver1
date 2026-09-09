#!/usr/bin/env bash
# deploy/sit/esm2cjs.sh
#
# 把 packages/contracts/*.js 从 ESM (`export const X = ...`) 转成 CJS
# (`const X = ...; module.exports = { X, ... }`)，供部署时使用。
#
# 原因：live-server 是 CommonJS，dist 通过 `require('../../../../packages/contracts/<file>.js')`
# 加载；Node CJS loader 遇到 `export` 关键字直接 SyntaxError。
#
# 源码保持 ESM 不动（packages/contracts/*.test.mjs 是 .mjs、import 语法，不能动），
# 转换在 deploy/sit/deploy.sh 的 push_contracts() 里 rsync 之前完成。
#
# 幂等：跳过已转换（已含 `module.exports = {` 的）文件。

set -euo pipefail

CONTRACTS_DIR="${1:-$ROIS_AI/packages/contracts}"

if [ ! -d "$CONTRACTS_DIR" ]; then
    echo "✗ 目录不存在: $CONTRACTS_DIR" >&2
    exit 1
fi

cd "$CONTRACTS_DIR"

shopt -s nullglob
CONVERTED=0
SKIPPED=0
TOTAL=0
for f in *.js; do
    TOTAL=$((TOTAL+1))
    # 已经转换过：跳过
    if grep -q '^module\.exports = {' "$f" 2>/dev/null; then
        SKIPPED=$((SKIPPED+1))
        continue
    fi
    # 不含 export 关键字：原文件就是 CJS（或空），跳过
    if ! grep -qE '^export ' "$f" 2>/dev/null; then
        SKIPPED=$((SKIPPED+1))
        continue
    fi

    # 收集所有 `export const X = ...` 中的 X（按行首的 export const 取）
    # 只识别同一行 `export const NAME = ...` 形式（contracts 全是这种）。
    # 加 || true：空匹配时 grep/sed 各自非零 + pipefail 会让 $(...) 失败触发 set -e，
    # 这里失败应视作「无 export const 可转」并继续走下面跳过分支。
    names=$(grep -oE '^export const [A-Za-z_$][A-Za-z0-9_$]*' "$f" | sed -E 's/^export const //' | sort -u || true)

    if [ -z "$names" ]; then
        echo "⚠ 跳过 $f：发现 export 但未匹配到 export const NAME 形式（脚本不覆盖 export function/class/default/{} 块）；live-server 当前未 require 该文件" >&2
        SKIPPED=$((SKIPPED+1))
        continue
    fi

    # 去掉行首的 `export `（只剥 `export const`，不剥其它位置意外出现的 "export"）
    tmp=$(mktemp)
    sed -E 's/^export (const )/\1/' "$f" > "$tmp"

    # 追加 module.exports 块
    {
        cat "$tmp"
        echo ""
        echo "module.exports = {"
        first=1
        for n in $names; do
            if [ $first -eq 1 ]; then
                first=0
            else
                echo ","
            fi
            printf "  %s" "$n"
        done
        echo ""
        echo "};"
    } > "$f"

    rm -f "$tmp"
    CONVERTED=$((CONVERTED+1))
done

echo "[esm2cjs] 扫描 $TOTAL 个文件：转换 $CONVERTED，跳过 $SKIPPED"
