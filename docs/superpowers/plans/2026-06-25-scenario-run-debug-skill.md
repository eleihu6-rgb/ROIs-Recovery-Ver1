# Scenario Run Debug Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repo-local `scenario-run-debug` skill that guides agents through root-cause debugging of failed scenario runs.

**Architecture:** `.agents/skills/scenario-run-debug/` is the source of truth. The main `SKILL.md` stays concise and links to two focused reference files. `.claude/skills/scenario-run-debug` is a compatibility symlink to avoid content drift.

**Tech Stack:** Codex/Claude compatible skill files, Markdown references, skill-creator validation scripts.

## Global Constraints

- Do not store DB passwords, JWTs, SSH passwords, or production tokens in the skill.
- Treat remote PostgreSQL/CoreServer as authoritative for scenario, PBS, and solver-material debugging unless the user explicitly says local.
- Do not add executable scripts in the first version.
- Source of truth is `.agents/skills/scenario-run-debug/`.

---

### Task 1: Create The Skill Skeleton

**Files:**
- Create: `.agents/skills/scenario-run-debug/SKILL.md`
- Create: `.agents/skills/scenario-run-debug/references/scenario-run-map.md`
- Create: `.agents/skills/scenario-run-debug/references/failure-signatures.md`
- Create: `.agents/skills/scenario-run-debug/agents/openai.yaml`

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-06-25-scenario-run-debug-skill-design.md`
- Produces: repo-local skill folder for validation and Claude compatibility.

- [ ] **Step 1: Initialize the skill**

Run:

```bash
python /Users/kimi/.codex/skills/.system/skill-creator/scripts/init_skill.py scenario-run-debug --path .agents/skills --resources references --interface display_name="Scenario Run Debug" --interface short_description="Trace failed RO scenario runs across live-server, engine-server, pbs-server, and solver boundaries." --interface default_prompt="Debug this failed scenario run by tracing the run pipeline boundary by boundary."
```

Expected: `.agents/skills/scenario-run-debug/` exists with `SKILL.md`, `references/`, and `agents/openai.yaml`.

- [ ] **Step 2: Replace generated placeholder content**

Write `SKILL.md` with:

- Frontmatter name `scenario-run-debug`.
- Description containing `scenario run`, `scen run`, `fetch failed`, `engine-server /optimize/start`, `LegacyRO`, `ro_input`, `pbs scenario-package`, `ro_output`, `task_id`, and `scenario result callback`.
- Required use of `superpowers:systematic-debugging`.
- Boundary-by-boundary checklist.
- Red flags and common mistakes.

- [ ] **Step 3: Add reference files**

Write:

- `references/scenario-run-map.md`: pipeline, files, authoritative data source.
- `references/failure-signatures.md`: symptom table and first evidence to gather.

- [ ] **Step 4: Validate**

Run:

```bash
python /Users/kimi/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/scenario-run-debug
```

Expected: validation passes.

### Task 2: Add Claude Compatibility

**Files:**
- Create: `.claude/skills/scenario-run-debug` symlink, or duplicate folder if symlink fails.

**Interfaces:**
- Consumes: `.agents/skills/scenario-run-debug/`
- Produces: Claude-discoverable skill path for the same project skill.

- [ ] **Step 1: Link Claude skill path**

Run:

```bash
ln -s ../../.agents/skills/scenario-run-debug .claude/skills/scenario-run-debug
```

Expected: `.claude/skills/scenario-run-debug/SKILL.md` resolves.

- [ ] **Step 2: Validate resolved skill path**

Run:

```bash
test -f .claude/skills/scenario-run-debug/SKILL.md
python /Users/kimi/.codex/skills/.system/skill-creator/scripts/quick_validate.py .claude/skills/scenario-run-debug
```

Expected: both commands pass. If validation rejects the symlink, remove the symlink, copy the folder, and validate the copy.

### Task 3: Final Review

**Files:**
- Read: `.agents/skills/scenario-run-debug/SKILL.md`
- Read: `.agents/skills/scenario-run-debug/references/scenario-run-map.md`
- Read: `.agents/skills/scenario-run-debug/references/failure-signatures.md`

**Interfaces:**
- Consumes: completed skill.
- Produces: final verification report.

- [ ] **Step 1: Check pressure scenarios manually**

Confirm the skill tells an agent what to do for:

- `scen 577 return fetch failed`
- `engine-server /optimize/start 500`
- scenario `DONE` but Gantt has no rows

- [ ] **Step 2: Check no secrets**

Run:

```bash
rg -n "password|token|Bearer|JWT|postgresql://|Pier2026|47\\.89\\.181\\.217.*password" .agents/skills/scenario-run-debug .claude/skills/scenario-run-debug
```

Expected: no secret values; generic words like `token` or `JWT` are allowed only as warnings, not actual credentials.

- [ ] **Step 3: Check git status**

Run:

```bash
git status --short .agents/skills/scenario-run-debug .claude/skills/scenario-run-debug docs/superpowers/specs/2026-06-25-scenario-run-debug-skill-design.md docs/superpowers/plans/2026-06-25-scenario-run-debug-skill.md
```

Expected: only intended new skill/spec/plan files.
