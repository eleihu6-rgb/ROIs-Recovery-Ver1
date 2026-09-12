# Agent context optimization — Ver1 (2026-09-12)

Source: [OpenAI Developers, “Rethinking skills and prompts for GPT-6 Astra”](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) (2026-09-11).

## Findings and changes

- Root `CLAUDE.md` was 5,239 words and required a full read before every task. `AGENTS.md` and `CLAUDE.md` now route agents through always-applicable rules and the sections relevant to the current task. The rules themselves remain in place.
- The 47 project skills had 21,053 frontmatter characters at HEAD. Fourteen descriptions were shortened or given narrower triggers; current frontmatter is 16,171 characters, a 23.2% reduction. Detailed workflows remain in the skill bodies.
- Gantt layout design (`001`) and product-wide UX (`002`) now have distinct discovery triggers. The Gantt playbook (`115`) is selected for architecture or cross-pane context instead of every Gantt edit. PBS performance skills now separate unknown bottlenecks (`121`), transfer/round-trip latency (`119`), and pairing-search SQL (`120`).
- Mandatory delegation checkpoints were replaced with one decision boundary for substantial, independent supporting work. Primary ownership, review, authorization, and verification remain unchanged.

## Follow-up measurement

Compare a small documentation change, a Gantt bug fix, and a PBS performance investigation before claiming speed or quality gains. Track instructions and skills loaded, elapsed time, and missed requirements. The character reduction is measured; runtime improvement is not yet measured.

## Known limitation

The skill-creator `quick_validate.py` helper requires `PyYAML`, which is absent from the active Python environment. Validate frontmatter with Ruby's installed YAML parser and inspect the edited descriptions against their skill bodies.
