#!/usr/bin/env bash
#
# weekly-help-release.sh — automated gantt Help + Release maintenance. Runs a
# headless Claude Code session that curates Release notes and/or refreshes stale
# Help topics, runs tests, then commits, pushes, and deploys the gantt frontend
# to UAT.
#
# Two decoupled jobs (this host is UTC; Beijing = UTC+8):
#   --mode help    — help refresh, daily 15:00 UTC (23:00 Beijing)
#   --mode release — release notes, Fri 13:00 UTC (Fri 21:00 Beijing)
#
# Crontab (lives on coreserver-01, 10.15.12.3 — NOT on webserver-01):
#   0 15 * * * /home/yuan.z/rois/rois-ai/scripts/weekly-help-release/weekly-help-release.sh --mode help \
#     >> /home/yuan.z/rois/rois-ai/logs/weekly-help-release.log 2>&1
#   0 13 * * 5 /home/yuan.z/rois/rois-ai/scripts/weekly-help-release/weekly-help-release.sh --mode release \
#     >> /home/yuan.z/rois/rois-ai/logs/weekly-help-release.log 2>&1
#
# The repo lives on this host, as do the `claude` CLI, git credentials, and the
# SSH key for github + the UAT webserver.
#
# Usage:
#   weekly-help-release.sh --mode help|release|full
#   weekly-help-release.sh            # default: full job (release + help, manual)
#   weekly-help-release.sh --check    # verify prerequisites, no Claude run
set -uo pipefail

# ── mode ──────────────────────────────────────────────────────────────────────
# help (daily) | release (Wed/Fri) | full (both, manual default).
MODE="full"
if [[ "${1:-}" == "--mode" ]]; then
  MODE="${2:-full}"
fi
case "$MODE" in
  help|release|full) : ;;
  *) echo "unknown --mode: $MODE (expected help|release|full)" >&2; exit 2 ;;
esac

ROOT="/home/yuan.z/rois/rois-ai"
LOG_DIR="$ROOT/logs"
LOG="$LOG_DIR/weekly-help-release.log"
mkdir -p "$LOG_DIR"

# cron runs with a minimal env; make sure PATH reaches claude, node, npx, etc.
export PATH="/home/yuan.z/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

log() { echo "[$(date '+%F %T %Z')] $*" >> "$LOG"; }

is_listening() { (exec 3<>/dev/tcp/127.0.0.1/"$1") 2>/dev/null; }

# ── --check: verify prerequisites without running Claude ────────────────────
if [[ "${1:-}" == "--check" ]]; then
  ok=1
  command -v claude >/dev/null 2>&1 || { echo "MISSING: claude CLI"; ok=0; }
  command -v npx    >/dev/null 2>&1 || { echo "MISSING: npx"; ok=0; }
  GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=8" \
    git -C "$ROOT" ls-remote origin HEAD >/dev/null 2>&1 \
    || { echo "FAIL: git@github.com not reachable (push/auth)"; ok=0; }
  echo "claude:      $(command -v claude || echo MISSING)"
  echo "npx:         $(command -v npx || echo MISSING)"
  echo "git@github:  $(GIT_SSH_COMMAND='ssh -o BatchMode=yes' git -C "$ROOT" ls-remote origin HEAD >/dev/null 2>&1 && echo reachable || echo FAIL)"
  echo "live-server: $([[ -d "$ROOT" ]] && (is_listening 3000 && echo up || echo down))"
  echo "gantt:5173:  $([[ -d "$ROOT" ]] && (is_listening 5173 && echo up || echo down))"
  [[ $ok -eq 1 ]] && echo "CHECK OK" || echo "CHECK FAILED"
  exit $((1 - ok))
fi

log "===== weekly-help-release[$MODE] start ====="

# 0. Repo pre-flight: the job curates from <cursor>..HEAD and pushes/deploys
#    main, so the tree must be ON main and fast-forwardable. Fail fast with a
#    non-zero exit here instead of relying on the model's process exit code
#    (claude -p always exits 0 when the session completes, even if the job
#    aborts inside — see step 2 below).
BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)"
if [[ "$BRANCH" != "main" ]]; then
  log "FAIL: working tree on branch '$BRANCH', not 'main' — aborting (no edits/deploy)"
  log "===== weekly-help-release[$MODE] end (exit=1) ====="
  exit 1
fi
if ! git -C "$ROOT" fetch origin >/dev/null 2>&1 \
   || ! git -C "$ROOT" pull --ff-only origin main >/dev/null 2>&1; then
  log "FAIL: git pull --ff-only origin main failed (diverged or dirty tree blocks FF) — aborting"
  log "===== weekly-help-release[$MODE] end (exit=1) ====="
  exit 1
fi

# 1. Help specs need gantt :5173 + live-server :3000 up.
if ! is_listening 3000; then
  log "live-server not on :3000 — starting via rois.sh"
  ~/rois/rois.sh start live-server >> "$LOG" 2>&1 || log "WARN: rois.sh start live-server failed"
fi
for _ in $(seq 1 30); do is_listening 3000 && break; sleep 1; done
is_listening 3000 || log "WARN: live-server still not on :3000 (help tests may fail)"

if ! is_listening 5173; then
  log "gantt dev server not on :5173 — starting detached vite"
  ( cd "$ROOT/gantt" && nohup npx vite --port 5173 --strictPort >> "$LOG" 2>&1 & )
fi
for _ in $(seq 1 30); do is_listening 5173 && break; sleep 1; done
is_listening 5173 || log "WARN: gantt still not on :5173 (help tests may fail)"

# 2. Run the headless Claude session with the scoped permissions whitelist.
#    Capture into a per-run buffer so the wrapper can check JOB_RESULT scoped
#    to THIS run, then append to the shared log.
cd "$ROOT"
if [[ "$MODE" == "full" ]]; then
  PROMPT_FILE="$ROOT/scripts/weekly-help-release/prompt.md"
else
  PROMPT_FILE="$ROOT/scripts/weekly-help-release/prompt-$MODE.md"
fi
RUNLOG="$(mktemp)"
claude -p "$(cat "$PROMPT_FILE")" \
  --settings "$ROOT/scripts/weekly-help-release/settings.json" \
  >> "$RUNLOG" 2>&1
status=$?

# The model prompt requires this too, but make the coverage contract a real
# delivery gate so a premature JOB_RESULT cannot publish missing Help topics.
if [[ $status -eq 0 && "$MODE" != "release" ]] \
   && ! node "$ROOT/scripts/check-help-menu-coverage.mjs" >> "$RUNLOG" 2>&1; then
  status=1
  log "Help menu coverage check failed after Claude session"
fi

# claude -p exits 0 on session completion even if the job aborted internally;
# promote "session OK but job did NOT report success" to a non-zero exit.
if [[ $status -eq 0 ]] && ! grep -q 'JOB_RESULT: SUCCESS' "$RUNLOG"; then
  status=1
  log "claude exit=0 but JOB_RESULT: SUCCESS missing from output — treating as FAILURE"
fi

cat "$RUNLOG" >> "$LOG"
rm -f "$RUNLOG"
log "claude exit=$status"
log "===== weekly-help-release[$MODE] end (exit=$status) ====="
exit $status
