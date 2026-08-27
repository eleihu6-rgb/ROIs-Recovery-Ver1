# ROIS-AI Memory Platform P0 Dev Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repo-level MemPalace developer-memory workflow for `rois-ai` so engineers and agents can initialize a local palace, mine project knowledge, search decisions, and load bounded wake-up context across `gantt`, `live-server`, `pbs-server`, `pbs-portal`, `pbs-app`, and engine/docs directories.

**Architecture:** Keep P0 intentionally local-only and developer-facing. Add repo-owned scripts and docs that standardize MemPalace installation, palace initialization, mining scope, search helpers, and wake-up helpers without coupling any product runtime to MemPalace yet. The workflow should be safe to run on any developer machine and should default to a `dev`-scoped palace that never mixes with future product memory.

**Tech Stack:** Shell scripts, Markdown docs, MemPalace CLI, local Python runtime

**Spec:** `docs/superpowers/specs/2026-04-20-rois-ai-memory-platform-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `memory/README.md` | Create | Developer-facing quickstart for repo memory |
| `memory/config/dev/mempalace.template.yaml` | Create | Template wing/room conventions for `rois-ai` |
| `scripts/memory/install-mempalace.sh` | Create | Install and verify local MemPalace |
| `scripts/memory/init-rois-ai-palace.sh` | Create | Initialize the local `rois-ai` palace |
| `scripts/memory/mine-rois-ai.sh` | Create | Mine project docs/code into the palace |
| `scripts/memory/search-rois-ai.sh` | Create | Standardized search entrypoint |
| `scripts/memory/wakeup-rois-ai.sh` | Create | Generate bounded wake-up context for agents |
| `scripts/memory/doctor-rois-ai.sh` | Create | Verify install, config, and source directories |
| `AGENTS.md` | Modify | Point developers/agents to repo memory workflow |
| `.gitignore` | Modify | Ignore any repo-local memory artifacts if needed |

---

### Task 1: Add the repo memory quickstart and conventions

**Files:**
- Create: `memory/README.md`
- Create: `memory/config/dev/mempalace.template.yaml`
- Modify: `AGENTS.md`

- [ ] **Step 1: Write the failing documentation check**

Run: `test -f /Users/lei/Codehub/rois-ai/memory/README.md`

Expected: exit code `1` because the memory quickstart does not exist yet.

- [ ] **Step 2: Draft the memory quickstart**

```md
# ROIS-AI Developer Memory

## Purpose

This directory standardizes how developers use MemPalace with the `rois-ai` monorepo.

## Scope

- `docs/`
- `doc/`
- `sql/`
- `gantt/`
- `live-server/`
- `pbs-server/`
- `pbs-portal/`
- `pbs-app/`
- `rule-engine/`
- `po-engine/`
- `ro-engine/`

## Conventions

- Palace scope: local-only developer memory
- Default environment: `dev`
- Never mix with product/user memory
- Use wing names: `rois-ai`, `gantt`, `live-server`, `pbs`, `engines`
- Use room names: `architecture`, `auth`, `ui`, `pbs-domain`, `roster`, `pairing`, `sql-schema`, `decisions`

## Commands

    ./scripts/memory/install-mempalace.sh
    ./scripts/memory/init-rois-ai-palace.sh
    ./scripts/memory/mine-rois-ai.sh --dry-run
    ./scripts/memory/search-rois-ai.sh "why did we move to /login?token"
    ./scripts/memory/wakeup-rois-ai.sh pbs-portal
```

- [ ] **Step 3: Add the template config and AGENTS pointer**

```yaml
# memory/config/dev/mempalace.template.yaml
wing: rois-ai
rooms:
  - architecture
  - auth
  - ui
  - pbs-domain
  - roster
  - pairing
  - sql-schema
  - decisions
```

```md
<!-- AGENTS.md -->
## Developer Memory

- Repo-level developer memory uses MemPalace.
- Setup and usage live in `memory/README.md`.
- Do not write product/user memory through this workflow.
```

- [ ] **Step 4: Verify the docs exist and read cleanly**

Run: `sed -n '1,220p' /Users/lei/Codehub/rois-ai/memory/README.md && sed -n '1,120p' /Users/lei/Codehub/rois-ai/memory/config/dev/mempalace.template.yaml`

Expected: both files print with the conventions and command examples above.

- [ ] **Step 5: Commit**

```bash
git add /Users/lei/Codehub/rois-ai/memory/README.md \
  /Users/lei/Codehub/rois-ai/memory/config/dev/mempalace.template.yaml \
  /Users/lei/Codehub/rois-ai/AGENTS.md
git commit -m "docs: add rois-ai developer memory guide"
```

### Task 2: Add installation and doctor scripts

**Files:**
- Create: `scripts/memory/install-mempalace.sh`
- Create: `scripts/memory/doctor-rois-ai.sh`

- [ ] **Step 1: Write the failing shell validation**

Run: `bash -n /Users/lei/Codehub/rois-ai/scripts/memory/install-mempalace.sh`

Expected: shell reports `No such file or directory`.

- [ ] **Step 2: Add the installer script**

```bash
#!/usr/bin/env bash
set -euo pipefail

python3 -m pip install --upgrade pip
python3 -m pip install mempalace
mempalace --help >/dev/null
echo "MemPalace installed and reachable."
```

- [ ] **Step 3: Add the doctor script**

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

command -v mempalace >/dev/null
test -d "$ROOT_DIR/docs"
test -d "$ROOT_DIR/doc"
test -d "$ROOT_DIR/sql"
test -d "$ROOT_DIR/gantt"
test -d "$ROOT_DIR/live-server"
test -d "$ROOT_DIR/pbs-server"
test -d "$ROOT_DIR/pbs-portal"
test -d "$ROOT_DIR/pbs-app"
test -d "$ROOT_DIR/rule-engine"
test -d "$ROOT_DIR/po-engine"
test -d "$ROOT_DIR/ro-engine"

echo "rois-ai memory doctor: OK"
```

- [ ] **Step 4: Run shell validation**

Run: `bash -n /Users/lei/Codehub/rois-ai/scripts/memory/install-mempalace.sh && bash -n /Users/lei/Codehub/rois-ai/scripts/memory/doctor-rois-ai.sh`

Expected: no output, exit code `0`.

- [ ] **Step 5: Run the doctor script**

Run: `/Users/lei/Codehub/rois-ai/scripts/memory/doctor-rois-ai.sh`

Expected: `rois-ai memory doctor: OK`

- [ ] **Step 6: Commit**

```bash
git add /Users/lei/Codehub/rois-ai/scripts/memory/install-mempalace.sh \
  /Users/lei/Codehub/rois-ai/scripts/memory/doctor-rois-ai.sh
git commit -m "chore: add rois-ai memory install scripts"
```

### Task 3: Add init, mine, search, and wake-up helpers

**Files:**
- Create: `scripts/memory/init-rois-ai-palace.sh`
- Create: `scripts/memory/mine-rois-ai.sh`
- Create: `scripts/memory/search-rois-ai.sh`
- Create: `scripts/memory/wakeup-rois-ai.sh`
- Modify: `.gitignore`

- [ ] **Step 1: Write the failing dry-run command**

Run: `test -f /Users/lei/Codehub/rois-ai/scripts/memory/mine-rois-ai.sh`

Expected: exit code `1`.

- [ ] **Step 2: Add the init helper**

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

mempalace init "$ROOT_DIR" --yes
echo "Initialized rois-ai palace metadata from $ROOT_DIR"
```

- [ ] **Step 3: Add the mining helper**

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DRY_RUN="${1:-}"

mine_dir() {
  local target="$1"
  local wing="$2"
  if [[ "$DRY_RUN" == "--dry-run" ]]; then
    echo "mempalace mine $ROOT_DIR/$target --wing $wing"
  else
    mempalace mine "$ROOT_DIR/$target" --wing "$wing"
  fi
}

mine_dir docs rois-ai
mine_dir doc rois-ai
mine_dir sql rois-ai
mine_dir gantt gantt
mine_dir live-server live-server
mine_dir pbs-server pbs
mine_dir pbs-portal pbs
mine_dir pbs-app pbs
mine_dir rule-engine engines
mine_dir po-engine engines
mine_dir ro-engine engines
```

- [ ] **Step 4: Add search and wake-up helpers**

```bash
#!/usr/bin/env bash
# scripts/memory/search-rois-ai.sh
set -euo pipefail
mempalace search "$1"
```

```bash
#!/usr/bin/env bash
# scripts/memory/wakeup-rois-ai.sh
set -euo pipefail
WING="${1:-rois-ai}"
mempalace wake-up --wing "$WING"
```

```gitignore
# Local memory scratch files
memory/.tmp/
```

- [ ] **Step 5: Validate shell syntax and dry-run output**

Run: `bash -n /Users/lei/Codehub/rois-ai/scripts/memory/init-rois-ai-palace.sh && bash -n /Users/lei/Codehub/rois-ai/scripts/memory/mine-rois-ai.sh && bash -n /Users/lei/Codehub/rois-ai/scripts/memory/search-rois-ai.sh && bash -n /Users/lei/Codehub/rois-ai/scripts/memory/wakeup-rois-ai.sh && /Users/lei/Codehub/rois-ai/scripts/memory/mine-rois-ai.sh --dry-run`

Expected: the dry-run prints one `mempalace mine ... --wing ...` line for each repo scope.

- [ ] **Step 6: Commit**

```bash
git add /Users/lei/Codehub/rois-ai/scripts/memory/init-rois-ai-palace.sh \
  /Users/lei/Codehub/rois-ai/scripts/memory/mine-rois-ai.sh \
  /Users/lei/Codehub/rois-ai/scripts/memory/search-rois-ai.sh \
  /Users/lei/Codehub/rois-ai/scripts/memory/wakeup-rois-ai.sh \
  /Users/lei/Codehub/rois-ai/.gitignore
git commit -m "feat: add rois-ai developer memory helpers"
```

### Task 4: Validate the end-to-end developer workflow

**Files:**
- Modify: `memory/README.md`

- [ ] **Step 1: Run the end-to-end local workflow**

Run:

```bash
cd /Users/lei/Codehub/rois-ai
./scripts/memory/install-mempalace.sh
./scripts/memory/doctor-rois-ai.sh
./scripts/memory/init-rois-ai-palace.sh
./scripts/memory/mine-rois-ai.sh --dry-run
```

Expected:

- MemPalace is installed
- doctor prints `OK`
- init completes
- dry-run prints all repo scopes

- [ ] **Step 2: Update README with troubleshooting notes**

```md
## Troubleshooting

- If `mempalace` is not found, rerun `./scripts/memory/install-mempalace.sh`
- If a source directory is missing, rerun `./scripts/memory/doctor-rois-ai.sh`
- Use `./scripts/memory/mine-rois-ai.sh --dry-run` before the first real mining pass
```

- [ ] **Step 3: Commit**

```bash
git add /Users/lei/Codehub/rois-ai/memory/README.md
git commit -m "docs: finalize rois-ai developer memory workflow"
```

---

## Self-Review

- Spec coverage: P0 developer memory scope, wing/room conventions, local-only boundary, and repo-wide mining workflow are all covered.
- Placeholder scan: no `TODO`/`TBD` placeholders remain.
- Type consistency: shell script names, repo scopes, and wing names stay consistent across all tasks.
