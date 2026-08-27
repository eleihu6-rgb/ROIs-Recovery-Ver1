# AI Code Reading Tools Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install and verify `codebase-memory-mcp` and Headroom for Claude Code and Codex on this machine.

**Architecture:** `codebase-memory-mcp` is installed as a local MCP binary and configured through its installer for both agents. Headroom is installed as an isolated Python CLI and used as an explicit wrapper for future Claude/Codex sessions.

**Tech Stack:** Shell, Git, Python 3.13 or available Python 3.10+, `pipx`/`pip`, local Claude/Codex configuration files, MCP stdio tools.

## Global Constraints

- Keep ROIS application source code untouched.
- Do not commit generated graph artifacts or Headroom cache files.
- Treat code graph output as navigation hints; exact source files, tests, and remote DB checks remain authoritative.
- Do not globally wrap the already-running Codex session.
- Bypass Headroom compression for exact SQL output, stack traces, failing test receipts, and source files before editing.

---

### Task 1: Install codebase-memory-mcp

**Files:**
- External: user-level binary/config files managed by the installer.
- Verify: `docs/ai/ai-tools-setup.md`

**Interfaces:**
- Produces: `codebase-memory-mcp` command available on `PATH`.
- Produces: Claude Code and Codex MCP/config entries from upstream installer.

- [ ] **Step 1: Check existing install**

Run:

```bash
command -v codebase-memory-mcp || true
codebase-memory-mcp --version || true
```

Expected: either an existing version or a command-not-found result.

- [ ] **Step 2: Run documented installer**

Run:

```bash
curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash
```

Expected: installer downloads the correct macOS binary and configures detected agents.

- [ ] **Step 3: Verify command**

Run:

```bash
command -v codebase-memory-mcp
codebase-memory-mcp --version
```

Expected: command path and version print successfully.

### Task 2: Install Headroom

**Files:**
- External: Python tool environment managed by `pipx` or user-level `pip`.

**Interfaces:**
- Produces: `headroom` command available on `PATH`.
- Produces: future wrapper commands `headroom wrap claude` and `headroom wrap codex`.

- [ ] **Step 1: Inspect Python tool availability**

Run:

```bash
command -v pipx || true
command -v python3.13 || true
python3 --version || true
headroom --version || true
```

Expected: identify whether `pipx` and Python 3.13 are available.

- [ ] **Step 2: Install Headroom**

Preferred run:

```bash
pipx install --python python3.13 "headroom-ai[all]"
```

Fallback if `pipx` or Python 3.13 is unavailable:

```bash
python3 -m pip install --user "headroom-ai[all]"
```

Expected: `headroom` CLI installs successfully.

- [ ] **Step 3: Verify Headroom**

Run:

```bash
command -v headroom
headroom --version
headroom perf || true
```

Expected: CLI version prints. `headroom perf` may report no data before wrapped sessions exist.

### Task 3: Index ROIS and Verify Tooling

**Files:**
- External/cache: `codebase-memory-mcp` local SQLite cache.
- Do not create committed repo artifacts.

**Interfaces:**
- Consumes: installed `codebase-memory-mcp` command.
- Produces: indexed ROIS project for graph queries.

- [ ] **Step 1: Index this repository**

Run:

```bash
codebase-memory-mcp cli index_repository '{"repo_path":"/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS"}'
```

Expected: status reports indexed or already indexed.

- [ ] **Step 2: Verify graph query**

Run:

```bash
codebase-memory-mcp cli list_projects
codebase-memory-mcp cli search_graph '{"name_pattern":"recompute.*Manday|manday.*recompute","limit":10}'
```

Expected: project appears and graph query returns structured results or an empty but valid response.

- [ ] **Step 3: Confirm no generated repo artifacts are staged**

Run:

```bash
git status --short docs/superpowers/specs/2026-06-27-ai-code-reading-tools-setup-design.md docs/superpowers/plans/2026-06-27-ai-code-reading-tools-setup.md .codebase-memory
```

Expected: only intentional spec/plan files are tracked; `.codebase-memory` is absent or untracked and not staged.

### Task 4: Report Future Session Commands

**Files:**
- None.

**Interfaces:**
- Produces: user-facing commands to launch compressed future sessions.

- [ ] **Step 1: Report Claude/Codex wrapper commands**

Report:

```bash
HEADROOM_OUTPUT_SHAPER=1 headroom wrap claude
HEADROOM_OUTPUT_SHAPER=1 headroom wrap codex
```

Expected: user knows these launch future wrapped sessions and do not affect the already-running Codex session.
