# Engineering Principles Project Update Design

Date: 2026-06-27

## Context

Ryan asked to absorb his coding experience and make the necessary project-wide update to share with the team. The principles emphasize understanding before coding, evidence-based decisions, architecture consistency, smallest correct changes, data-model respect, preserving business logic, validation, and transparency when uncertain or blocked.

## Recommended Approach

Use three documentation surfaces:

- `CLAUDE.md` as the canonical shared Claude/Codex project rule.
- `AGENTS.md` as the Codex entrypoint mirror so Codex behavior is explicit.
- `docs/ai/engineering-principles.md` as a concise team-shareable reference.

This keeps the rule enforceable for agents while giving the team a stable document to circulate. No runtime code, schema, module behavior, or version counter changes are required.

## Scope

In scope:

- Add a project-wide "Senior Engineering Workflow" section.
- Mirror the same operating principles in Codex guardrails.
- Add a standalone team-facing AI engineering principles document.

Out of scope:

- Runtime behavior changes.
- Test implementation changes.
- Database or schema changes.
- Module-specific rule rewrites.

## Risks and Controls

- Risk: Duplicated rules drift between `CLAUDE.md`, `AGENTS.md`, and docs.
  Control: Keep `CLAUDE.md` canonical and make `AGENTS.md` reference that canonical status.
- Risk: The guidance becomes too broad to act on.
  Control: Phrase it as a concrete workflow checklist, not abstract values only.
- Risk: The new rules conflict with existing brainstorming and verification gates.
  Control: Position them as complementary engineering discipline and preserve existing gates.

## Verification

Because this is a documentation-only workflow update, verification is limited to:

- Confirm changed files are only project documentation.
- Review inserted sections for placeholders, contradictions, and ambiguous requirements.
- Confirm no version bump is needed because runtime code is untouched.
