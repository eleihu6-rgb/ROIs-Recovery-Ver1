# AI Code Reading Tools Setup Design

## Goal

Install and enable two local AI-assist tools for both Claude Code and Codex in this repository:

- `codebase-memory-mcp` for code graph indexing, symbol search, route/service tracing, and impact analysis.
- `headroom` for optional local compression of large tool outputs, logs, and long session context.

The goal is to reduce token burn and speed up code navigation during active ROIS feature development and bug fixing without weakening the existing source-of-truth workflow.

## Approach

Use a staged setup:

1. Install `codebase-memory-mcp` with its documented installer so it can auto-detect and configure Claude Code and Codex MCP entries/instructions.
2. Install Headroom through an isolated Python tool environment (`pipx` with Python 3.13 when available), falling back to a user-level Python install only if `pipx` is unavailable.
3. Index this repository with `codebase-memory-mcp`.
4. Verify binaries, MCP/config state, and basic project queries.
5. Do not launch long-running wrapped Claude/Codex sessions from the current Codex process. Wrappers such as `headroom wrap claude` and `headroom wrap codex` are future session entry commands.

## Safety Rules

- Keep project code untouched except this design document.
- Do not commit `.codebase-memory/graph.db.zst` or other generated graph artifacts unless the team separately approves.
- Treat `codebase-memory-mcp` graph results as navigation hints only; exact source files, tests, and remote DB checks remain authoritative.
- Treat Headroom as optional for noisy outputs. Bypass or avoid compression for exact SQL output, failing test receipts, stack traces, and source files immediately before editing.
- Avoid exposing the Headroom proxy outside localhost.

## Expected Outcome

After setup:

- Claude Code and Codex can use `codebase-memory-mcp` for graph-based code discovery.
- `codebase-memory-mcp` has an index for the ROIS repository.
- Headroom is installed and available for future wrapped sessions:
  - `HEADROOM_OUTPUT_SHAPER=1 headroom wrap claude`
  - `HEADROOM_OUTPUT_SHAPER=1 headroom wrap codex`
- Verification commands confirm tool availability and basic operation.

## Non-Goals

- No application runtime code changes.
- No dependency changes to ROIS packages.
- No automatic global wrapping of the currently running Codex session.
- No generated graph or compression cache committed to the repo.
