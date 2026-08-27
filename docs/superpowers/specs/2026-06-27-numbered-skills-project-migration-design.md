# Numbered Skills Project Migration Design

Date: 2026-06-27

## Context

Ryan asked to find all local skills starting with the `100` number convention and make them formal project-wide skills so the team can benefit from them. The local source is `/Users/kimi/.claude/skills`; the project-wide source should be `.agents/skills`.

## Decision

Preserve the numeric naming convention exactly. Migrate local skills `100-*` through `133-*` into `.agents/skills` using the same folder names.

## Scope

In scope:

- Copy local numbered skill folders into `.agents/skills`.
- Convert standalone local `107-pbs-portal-pairing-search-debug` markdown file into a formal skill folder with `SKILL.md`.
- Preserve bundled skill scripts and resources.
- Add `agents/openai.yaml` metadata for each migrated numbered skill.
- Add `docs/ai/project-skills.md` as the team skill index.

Out of scope:

- Runtime product code changes.
- Refactoring skill contents beyond packaging validity.
- Deleting local `/Users/kimi/.claude/skills` copies.
- Renaming numbered skills to non-numbered names.

## Risks and Controls

- Risk: Team loses the easy number-based communication convention.
  Control: Keep folder and skill names numbered.
- Risk: A local malformed skill becomes formal without validation.
  Control: Verify every migrated skill has `SKILL.md`, frontmatter, name, description, and metadata.
- Risk: Case-insensitive filesystem drops `130/SKILL.md` when excluding duplicate lowercase `skill.md`.
  Control: Restore canonical `130/SKILL.md` explicitly and verify final count.
- Risk: Personal local skill folder remains confused with team source of truth.
  Control: Document `.agents/skills` as canonical in `docs/ai/project-skills.md`.

## Verification

The migration is documentation and skill-packaging only. Verification checks:

- Exactly 34 numbered project skill folders exist.
- Exactly 34 numbered `SKILL.md` files exist.
- Every numbered skill has `agents/openai.yaml`.
- Every numbered `SKILL.md` starts with YAML frontmatter and contains `name` and `description`.
- `git diff --check` passes for touched skill/docs paths.
