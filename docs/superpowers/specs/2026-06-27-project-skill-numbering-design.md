# Project Skill Numbering Design

Date: 2026-06-27

## Context

Ryan noted that some project skills still had no number. The team uses numbers to communicate quickly about skills, so every formal project skill should follow the same numeric convention.

## Decision

All project-wide skills under `.agents/skills` must use a three-digit prefix.

- `001-099`: foundational team skills and cross-cutting project workflows.
- `100-999`: domain, feature, debugging, reporting, integration, and implementation skills.

The current unnumbered team skills become:

- `frontend-design` → `001-frontend-design`
- `ui-ux-pro-max` → `002-ui-ux-pro-max`
- `online-help-writing` → `003-online-help-writing`
- `scenario-run-debug` → `004-scenario-run-debug`
- `routing-debug` → `005-routing-debug`
- `rbot-feature-development` → `006-rbot-feature-development`

Existing `100-133` skill numbers remain unchanged.

## Future Skill Creation

Future skills must be created with:

```bash
node scripts/create-project-skill.mjs "Skill Title" "Use when ..."
```

The script scans `.agents/skills`, assigns the next free number from `100-999`, creates `SKILL.md`, and creates `agents/openai.yaml`.

Use `--number NNN` only when Ryan explicitly assigns a specific number.

## Verification

- No unnumbered directories remain under `.agents/skills`.
- Every project skill has `SKILL.md`.
- Every `SKILL.md` `name:` matches its folder name.
- `gantt` Dev skill data regenerates and still shows all project skills.
