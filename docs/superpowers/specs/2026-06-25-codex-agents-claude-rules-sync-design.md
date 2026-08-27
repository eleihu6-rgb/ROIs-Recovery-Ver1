# Codex AGENTS / Claude Rules Sync Design

## Goal

Make Codex cold-start behavior in this repository honor the rules already maintained in `CLAUDE.md` and module-level `CLAUDE.md` files, while preserving Codex-specific workflow guardrails in `AGENTS.md`.

Make the shared rule contract visible to all team members through tracked project files, not only through a local machine memo.

## Findings

- Root `CLAUDE.md` is newer and more complete than root `AGENTS.md`.
- Root `AGENTS.md` duplicated some Claude guidance but drifted in high-risk areas: project topology, database authority, engine ports, mandatory UI testing, version bumping, first-paint performance, style gates, and Live/Scenario Gantt unification.
- Module-specific guidance lives mostly in `*/CLAUDE.md`; Codex does not automatically read those unless `AGENTS.md` instructs it to.

## Design

Update root `AGENTS.md` as the Codex entrypoint:

- Require Codex to read root `CLAUDE.md` before project work.
- Require Codex to read relevant module `CLAUDE.md` and nested `AGENTS.md` before module work.
- Keep Codex-only workflow rules, including mandatory brainstorming for behavior/workflow/multi-file edits.
- Treat `CLAUDE.md` as the canonical shared project guide when duplicated rules conflict.
- Add a compact critical-rules index in `AGENTS.md` so cold-start sessions see the most important Claude-only rules immediately.
- Replace stale local-DB guidance with a remote-DB-only rule that points to `CLAUDE.md` for exact connection details.
- Add local port memo discovery for routing/tunnel work without committing the memo.

Update root `CLAUDE.md` as the Claude entrypoint:

- State that root `CLAUDE.md` is the canonical shared project guide.
- State that Codex-specific startup/workflow rules live in root `AGENTS.md`.
- Require module-level `CLAUDE.md` / `AGENTS.md` to be read before module work.
- Keep the root files synchronized when project-wide rules change.

## Non-Goals

- Do not copy all `CLAUDE.md` content verbatim into `AGENTS.md`.
- Do not add secrets or runtime credentials to new docs.
- Do not alter module code or tests.
- Do not make the local non-git memo the project-wide source of truth.

## Verification

- Read `AGENTS.md` after edit and confirm it references `CLAUDE.md`, module `CLAUDE.md`, `NEXT_CONTEXT.md`, and the local port memo.
- Read `CLAUDE.md` after edit and confirm it references `AGENTS.md` and the shared Claude/Codex rule contract.
- Search for stale localhost DB guidance in `AGENTS.md`.
- Check markdown diff for unintended unrelated changes.
