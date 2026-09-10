# Agent Setup Audit

Reviewed 2026-09-10 for the requested Fable / GPT-6 workflow refresh. Scope: root instructions, exposed MCP tools, skill catalog, and targeted skill-reference searches. This is not a runtime certification of every skill or an MCP package-version audit.

## Changes Applied

- Reduced AGENTS.md to startup, communication, workflow, delivery, and memory instructions. Shared engineering and business rules remain in CLAUDE.md.
- Added model-independent operating defaults: progressive context loading, current capability discovery, preservation of concurrent work, and continuation of authorized tasks.
- Removed the mandatory dependency on an unavailable brainstorming skill. Material design decisions still need resolution; existing authorization is not requested again. Documentation maintenance does not require a separate spec approval.
- Removed fabricated/fixed model co-author trailers and references to absent root rule-engine/ and rois-rule-engine/ directories.
- Corrected Playwright locations to e2e/tests/ and explicit configuration selection. Separated UI verification, backend tests, and documentation checks.
- Removed the root guide's PBS portal port 5174 assumption. e2e/config/playwright.config.ts explicitly identifies that port as belonging to another project; runtime configuration must determine the actual target.

## MCP Findings

The current session exposes codebase-memory-mcp search_graph, trace_path, get_code_snippet, query_graph, search_code, get_architecture, list_projects, and index_repository. The earlier checkpoint's claim that trace_path was missing is superseded by current tool discovery. No basis was found to call this MCP obsolete or remove it.

Tool calls require the current schema, including the project argument. Use list_projects to resolve the indexed project and index only when needed. The project was confirmed indexed in the preceding investigation. Session tool availability does not establish the installed server version, update status, or identical availability in Claude/Fable.

MemPalace is a separate development-history workflow documented in memory/README.md. Retain it; its runtime health was not tested. Do not confuse it with the source knowledge graph.

## Skill Findings and Follow-up

| Finding | Evidence | Disposition |
| --- | --- | --- |
| Missing workflow skills | brainstorming and karpathy-guidelines are absent from the session catalog and searched project/user skill locations | Root instructions now support unavailable skills without pretending to invoke them. No installation performed. |
| Stale frontend endpoints | .agents/skills/001-frontend-design/SKILL.md:99-100 and .claude/skills/frontend-design/SKILL.md:99-100 prescribe ports 5566/8899; 005-routing-debug assigns 5566 to EVACC and 5173 to Altair | Refresh these skill examples separately; root entrypoint now requires current routing/config checks. |
| Machine-specific checkout paths | 122-release-note-maker and 126-noc-integration reference an iCloud ROIs-Crew-Ver4-PBS checkout | Resolve the current checkout before use. These references do not prove the entire skills are obsolete. |
| Stale memory/startup examples | NEXT_CONTEXT.md and memory/README.md contain /Users/lei/Codehub/rois-ai; memory coverage still lists rule-engine/ | Follow-up documentation cleanup needed; these files were outside the root-guide edit scope. |
| Claude/Codex skill copies can drift | Both .agents/skills/001-frontend-design and .claude/skills/frontend-design exist; Claude user skill locations also differ from the Codex catalog | Use the current catalog, read the selected file, and reconcile copies during a dedicated skill refresh. |
| Legacy and future-scope skills | Baseline capture/legacy RO and RBot/AI-stream skills remain available | Retain for explicit legacy/future-workflow tasks. Availability does not expand current F8 delivery scope. |

No skill was deleted, installed, or rewritten. Operational recipes and their credentials/data-write behavior were not executed. Local Claude settings already had unrelated changes and were left intact. Model selection and reasoning settings were not changed; no Fable-specific configuration contract was assumed.

## Verification

- Reviewed current tool schemas and the supplied skill catalog; searched project and user skill locations for the missing workflow skills.
- Inspected e2e/config/playwright.config.ts for testDir, projects, and documented port ownership.
- Reviewed root-guide diffs and checked whitespace, Markdown fences, and referenced files. Runtime tests are not applicable to these documentation-only changes.
- Official instruction-discovery guidance: https://developers.openai.com/codex/guides/agents-md/ (fetched 2026-09-10). It supports concise root instructions, nested module guidance, and checking overrides when instructions appear stale. New sessions should be used to verify automatic instruction loading after this refresh.
