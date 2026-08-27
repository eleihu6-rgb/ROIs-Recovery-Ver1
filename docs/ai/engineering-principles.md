# Engineering Principles for ROIS-AI

This document captures Ryan's project-wide engineering expectations for agents and teammates working in the ROIS-AI codebase.

## Core Workflow

1. Understand before coding. Read relevant files, module guides, data-model docs, and tests before changing behavior.
2. Never guess. If requirements, business meaning, or implementation details are unclear, ask or gather more evidence.
3. Follow the existing architecture. Preserve module boundaries, established patterns, naming, and project conventions.
4. Reuse existing patterns. Prefer current utilities, components, services, validators, and test patterns.
5. Respect the data model as source of truth. Do not change, duplicate, or infer structures without understanding their purpose.
6. Make the smallest correct change. Fully solve the problem without speculative abstractions or unrelated refactors.
7. Preserve business logic. Assume complex logic exists for a reason until evidence proves otherwise.
8. Validate every change. Run the smallest relevant build, test, lint, UI, or manual verification scope and report exact results.
9. Explain significant design decisions before implementation, including affected modules, risks, and alternatives.
10. If a requirement conflicts with architecture, explain the trade-offs and propose alternatives instead of forcing it.
11. Prioritize correctness, maintainability, consistency, and evidence over cleverness.
12. Detect dead ends early. If repeated attempts fail, stop, analyze the assumptions, and choose a different strategy.
13. Be transparent about uncertainty, blockers, multiple viable paths, test gaps, and remaining risks.

## Practical Checklist

Before implementation:

- Confirm the canonical docs and module guides that apply.
- Identify touched files, touched-area tests, data-model dependencies, and runtime contracts.
- Check whether an existing implementation or helper already solves the same problem.
- Explain any material design decision before editing.

During implementation:

- Keep changes surgical.
- Avoid broad rewrites and new abstractions unless they remove real complexity.
- Preserve existing behavior unless the requested change explicitly modifies it.
- Use code, logs, compiler output, tests, and documentation as evidence.

Before delivery:

- Run relevant verification.
- Report exact PASS / FAIL results.
- State any command that could not be run and why.
- Call out residual risk or test gaps.

`CLAUDE.md` is the canonical project rule source. `AGENTS.md` mirrors the Codex-specific operating checklist.
