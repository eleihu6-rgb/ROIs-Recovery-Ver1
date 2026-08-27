#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PALACE_DIR="$ROOT_DIR/memory/.palace"
MEMPALACE_BIN="$ROOT_DIR/memory/.venv/bin/mempalace"
CONTEXT_DIR="$ROOT_DIR/docs/dev-context"

usage() {
  cat <<'USAGE'
Usage:
  ./save-context.sh <wing> <topic> [title] <<'EOF'
  本轮对话上下文、关键决定、代码改动逻辑、验证结果、不要重复推翻的结论。
  EOF

Examples:
  ./save-context.sh pbs pairing-stable-identity <<'EOF'
  本轮完成 PBS Pairing 稳定身份治理...
  EOF

  ./save-context.sh gantt pane-layout "Gantt Pane Layout 调整" <<'EOF'
  本轮调整 Gantt Pane 布局...
  EOF

Wings:
  rois-ai, pbs, gantt, live-server, engines
USAGE
}

slugify() {
  local input="$1"
  local slug
  slug="$(
    printf '%s' "$input" \
      | tr '[:upper:]' '[:lower:]' \
      | tr -cs 'a-z0-9._-' '-' \
      | sed -E 's/^-+//; s/-+$//; s/-+/-/g'
  )"
  if [[ -z "$slug" ]]; then
    slug="context"
  fi
  printf '%s' "$slug"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 2 ]]; then
  usage >&2
  exit 2
fi

WING="$1"
TOPIC="$2"
shift 2
TITLE="${*:-$TOPIC}"

CONVERSATION_CONTEXT="$(cat || true)"
if [[ -z "${CONVERSATION_CONTEXT//[[:space:]]/}" ]]; then
  echo "Error: no conversation context received on stdin." >&2
  echo "Pass the AI/user conversation summary with a heredoc. See --help." >&2
  exit 2
fi

DATE="$(date +%F)"
TIME="$(date '+%Y-%m-%d %H:%M:%S %Z')"
WING_SLUG="$(slugify "$WING")"
TOPIC_SLUG="$(slugify "$TOPIC")"
FILE_PATH="$CONTEXT_DIR/${DATE}-${WING_SLUG}-${TOPIC_SLUG}.md"
LATEST_PATH="$CONTEXT_DIR/LATEST.md"

mkdir -p "$CONTEXT_DIR"

BRANCH="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || printf 'unknown')"
STATUS="$(git -C "$ROOT_DIR" status --short 2>/dev/null || true)"
CHANGED_FILES="$(git -C "$ROOT_DIR" diff --name-only 2>/dev/null || true)"
STAGED_FILES="$(git -C "$ROOT_DIR" diff --cached --name-only 2>/dev/null || true)"

tmp_file="$(mktemp)"
{
  printf '# 开发上下文（%s）\n\n' "$DATE"
  printf '> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。\n'
  printf '> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。\n\n'
  printf '## 基本信息\n\n'
  printf '%s\n' "- 时间：$TIME"
  printf '%s\n' "- Wing：\`$WING\`"
  printf '%s\n' "- Topic：\`$TOPIC\`"
  printf '%s\n' "- Title：$TITLE"
  printf '%s\n\n' "- Git branch：\`$BRANCH\`"
  printf '## 本轮对话上下文\n\n'
  printf '%s\n\n' "$CONVERSATION_CONTEXT"
  printf '## 当前工作树快照\n\n'
  printf '### git status --short\n\n'
  printf '```text\n'
  if [[ -n "$STATUS" ]]; then
    printf '%s\n' "$STATUS"
  else
    printf '(clean)\n'
  fi
  printf '```\n\n'
  printf '### unstaged changed files\n\n'
  printf '```text\n'
  if [[ -n "$CHANGED_FILES" ]]; then
    printf '%s\n' "$CHANGED_FILES"
  else
    printf '(none)\n'
  fi
  printf '```\n\n'
  printf '### staged files\n\n'
  printf '```text\n'
  if [[ -n "$STAGED_FILES" ]]; then
    printf '%s\n' "$STAGED_FILES"
  else
    printf '(none)\n'
  fi
  printf '```\n\n'
  printf '## 新窗口恢复建议\n\n'
  printf '新窗口先阅读：\n\n'
  printf '1. `NEXT_CONTEXT.md`\n'
  printf '2. 本文件：`%s`\n' "${FILE_PATH#$ROOT_DIR/}"
  printf '3. `docs/dev-context/LATEST.md`\n\n'
  printf '然后运行：\n\n'
  printf '```bash\n'
  printf './scripts/memory/wakeup-rois-ai.sh %s\n' "$WING"
  printf 'git status --short\n'
  printf '```\n'
} > "$tmp_file"

mv "$tmp_file" "$FILE_PATH"
cp "$FILE_PATH" "$LATEST_PATH"
chmod 0644 "$FILE_PATH" "$LATEST_PATH"

if [[ -x "$MEMPALACE_BIN" ]]; then
  mine_log="$(mktemp)"
  if "$MEMPALACE_BIN" --palace "$PALACE_DIR" mine --wing "$WING" "$CONTEXT_DIR" >"$mine_log" 2>&1; then
    rm -f "$mine_log"
  else
    cat "$mine_log" >&2
    rm -f "$mine_log"
    exit 1
  fi
  mine_status="memory mined into wing '$WING'"
else
  mine_status="memory not mined: $MEMPALACE_BIN not found or not executable"
fi

cat <<EOF
Saved development context:
  $FILE_PATH

Updated latest pointer:
  $LATEST_PATH

Memory:
  $mine_status

Next window prompt:
  先读 /Users/lei/Codehub/rois-ai/NEXT_CONTEXT.md，恢复项目和上次对话上下文。先不要改代码。

Useful search:
  ./scripts/memory/search-rois-ai.sh "$TOPIC"
EOF
