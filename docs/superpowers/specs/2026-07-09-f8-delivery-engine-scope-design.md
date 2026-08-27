# F8 Delivery Engine Scope Design

Date: 2026-07-09

## Goal

Make the repository documentation and product surface clear about the current F8 delivery scope:

- Optimization engine work uses the `pbs-engine` submodule.
- Legality/rule-engine work uses `rule-engine-rs`.
- `ro-engine` and `po-engine` are temporarily retained legacy modules and are not active F8 development targets.
- `rust-ro-engine` is obsolete because the solver source now lives in `pbs-engine`; remove it if no active references remain.
- `crewrule-dev` is a legacy C++ rule reference project. It remains useful only as the oracle/source material when implementing new Rust legality rules in `rule-engine-rs`.
- `ai-server` is retained for future projects, but it is outside the current F8 delivery scope. In the F8 UI, hide only the floating R'Bot chat panel. Keep the Regression tab visible.

The purpose is to keep future developers and AI agents from following stale engine paths.

## Current Findings

The repository currently contains these engine-adjacent directories:

- `pbs-engine/`: active PBS optimization engine submodule.
- `rule-engine-rs/`: active Rust legality engine.
- `ro-engine/`: retained legacy Python RO module and baseline artifacts.
- `po-engine/`: retained legacy Python PO module.
- `rust-ro-engine/`: tracked old `_python_reference` solver copy.
- `crewrule-dev/`: legacy C++ rule engine and rule tests.
- `ai-server/`: FastAPI AI/chat/regression service.

Read-only checks found `rust-ro-engine` references only inside its own directory, so it has no active parent-repo consumers. The new solver source is `pbs-engine`.

The Gantt app mounts the floating chat panel in `gantt/src/components/shell/app-shell.tsx` via `AiChatPanel`. The Regression tab is separate and should remain available.

## Target Documentation Contract

Root and architecture documentation should state this current contract:

| Area | Current F8 status | Canonical path |
| --- | --- | --- |
| PBS optimization solver | Active | `pbs-engine/` |
| Legality / rule engine | Active | `rule-engine-rs/` |
| Legacy RO Python engine | Temporarily retained, not active F8 development | `ro-engine/` |
| Legacy PO Python engine | Temporarily retained, not active F8 development | `po-engine/` |
| Legacy C++ rule source | Reference only for Rust rule ports | `crewrule-dev/` |
| AI service | Retained for future work, outside F8 delivery | `ai-server/` |
| Old Rust RO workspace | Obsolete | `rust-ro-engine/` removed |

Avoid adding compatibility breadcrumbs that present retained legacy modules as current implementation choices.

## Implementation Scope

### Documentation

Update project-wide and architecture docs that currently present `ro-engine`, `po-engine`, `ai-server`, or old engine paths as active F8 delivery modules. At minimum inspect and update:

- Root `AGENTS.md` and `CLAUDE.md`.
- `docs/architecture/codebase-index.md`.
- `docs/architecture/rule-migration-playbook.md`.
- `docs/modules/dev/local-start-playbook.md`.
- `docs/modules/ro-engine/solver-playbook.md`.
- `docs/deployment/deployment-guide.md`.
- AI-facing skill metadata and source skill files that still describe `ro-engine` / `po-engine` as active solver targets.

Historical specs under `docs/superpowers/specs/` and completed plans should only be edited when they are active AI reference material or currently misleading project guidance.

### Code And UI

- Remove the tracked `rust-ro-engine/` directory.
- Hide only the floating R'Bot chat panel by no longer mounting `AiChatPanel` in the shell.
- Keep the Regression top-nav item, Regression view, and `ai-server` regression APIs unchanged.
- Do not remove or disable `ai-server`.
- Do not remove `ro-engine`, `po-engine`, or `crewrule-dev`.

### Tests

Because the UI changes, add or update focused frontend coverage proving:

- The floating R'Bot trigger (`data-testid="ai-chat-toggle"`) is not rendered in the normal authenticated shell.
- The Regression nav item remains visible and navigable.

Run the smallest relevant checks:

- Old-reference search for `rust-ro-engine`.
- `git ls-files rust-ro-engine` should return no tracked files after deletion.
- Focused Gantt test for the shell visibility contract.
- `npm run check:ui` if any touched frontend file affects styling or shell UI.

## Non-Goals

- Do not delete `ro-engine` or `po-engine`.
- Do not delete `crewrule-dev`.
- Do not delete `ai-server`.
- Do not hide the Regression tab.
- Do not change solver runtime behavior beyond documentation/path cleanup.
- Do not rewrite historical audit/spec files that are not active guidance.

## Risks

- Some AI-facing skill files may intentionally describe old investigations. Updating only active guidance prevents unnecessary churn while still reducing stale-path risk.
- Hiding R'Bot without removing its code leaves unused imports/tests; implementation should remove the shell import and update only tests that directly assert global chat availability.
- Deleting `rust-ro-engine` removes a large old reference copy. The active replacement is `pbs-engine`; if a hidden consumer exists, the old-reference search should catch it before deletion.

## Acceptance Criteria

- Current architecture docs identify `pbs-engine` and `rule-engine-rs` as the active F8 optimization/rule engines.
- `ro-engine` and `po-engine` are clearly marked as temporarily retained and out of current F8 development scope.
- `crewrule-dev` is clearly marked as old C++ reference material for Rust legality ports.
- `ai-server` is clearly marked as retained but outside current F8 delivery scope.
- The Gantt UI no longer renders the floating R'Bot panel/trigger.
- The Regression tab remains available.
- `rust-ro-engine` is removed from tracked files.
- Verification commands and results are reported before completion.
