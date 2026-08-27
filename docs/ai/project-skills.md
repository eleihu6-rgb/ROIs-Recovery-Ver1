# Project Skills

Project-wide team skills live in `.agents/skills/`.

Use this repository path as the formal source of truth for ROIS-AI team skills. Local personal skill folders such as `/Users/kimi/.claude/skills` may still exist, but they are not the shared project source.

## Numbering Policy

Every project skill folder must start with a three-digit number:

- `001-099`: foundational team skills and cross-cutting project workflows.
- `100-999`: domain, feature, debugging, reporting, integration, and implementation skills.

Rules:

- Keep the folder name and the `name:` field in `SKILL.md` identical.
- Use lowercase kebab-case after the number, for example `108-npbs-bids-portal-simulation`.
- Never create a new unnumbered skill under `.agents/skills`.
- Never reuse a number after a skill has been shared with the team.
- Preserve existing numbers during edits so Ryan and the team can keep referring to skills by number.

Create future skills with:

```bash
node scripts/create-project-skill.mjs "Skill Title" "Use when ..."
```

The script scans `.agents/skills`, assigns the next free number from `100-999`, creates `SKILL.md`, and writes `agents/openai.yaml`.

Use `--number NNN` only when Ryan explicitly assigns a number:

```bash
node scripts/create-project-skill.mjs "New Core Workflow" "Use when ..." --number 007
```

## Foundational Team Skills

- `001-frontend-design`
- `002-ui-ux-pro-max`
- `003-online-help-writing`
- `004-scenario-run-debug`
- `005-routing-debug`
- `006-rbot-feature-development`

## Numbered Domain Skills

- `100-plane-ops`
- `101-enrich-plane-desc`
- `102-plane-cycle-backdate`
- `103-capture-ro-solver-baseline`
- `104-run-pbs-solver-local`
- `105-compare-ruleset-params`
- `106-build-run-rust-solver-connector`
- `107-pbs-portal-pairing-search-debug`
- `108-npbs-bids-portal-simulation`
- `109-ui-kickoff-local-rust-solver`
- `110-rule-param-recheck-alert-center-count`
- `111-pbs-solver-roster-deassign`
- `112-dora-report`
- `113-scenario-roster-quality-analyzer`
- `114-scenario-rust-solver-run-report`
- `115-gantt-playbook`
- `116-scenario-division-scoping`
- `117-playwright-live-stream`
- `118-live-server-perf-observability`
- `119-pbs-overseas-speed-latency`
- `120-pbs-pairing-search-perf`
- `121-pbs-perf-enhancement`
- `122-release-note-maker`
- `123-live-mcred-draft-recompute`
- `124-crew-manday-rule-tool`
- `125-pbs-result-analyzer`
- `126-noc-integration`
- `127-pairing-open-credit-badge`
- `128-res-pairing-management`
- `129-bring-crew-to-top-gesture`
- `130-crew-bell-click-popup`
- `131-assignment-group-mapping`
- `132-pairing-id-filter`
- `133-ro-solver-algorithm`

## Migration Notes

- The original unnumbered project skills were promoted to `001-006`.
- The `100-133` numbered skills were migrated from local `/Users/kimi/.claude/skills`.
- `107-pbs-portal-pairing-search-debug` was a standalone local markdown file and is now a formal skill folder with `SKILL.md`.
- `130-crew-bell-click-popup` had a duplicate lowercase `skill.md`; the project skill keeps canonical `SKILL.md`.
- Bundled scripts from the local skills are preserved in their project skill folders.
