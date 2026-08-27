# Numbered Skills Project Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` is recommended for larger migrations; inline execution is acceptable here because the work is a mechanical project packaging update.

**Goal:** Make the local numbered `100-*` through `133-*` ROIS skills formal project-wide skills under `.agents/skills`.

**Architecture:** Preserve the existing numeric naming convention so Ryan and the team can keep referring to skills by number. Copy valid local skill folders from `/Users/kimi/.claude/skills` into `.agents/skills`; convert the standalone `107-pbs-portal-pairing-search-debug` file into a proper skill folder with `SKILL.md`.

**Tech Stack:** Markdown skill files, optional bundled scripts, YAML UI metadata under `agents/openai.yaml`.

## Global Constraints

- Do not remove or modify the local `/Users/kimi/.claude/skills` source.
- Preserve numeric folder names exactly.
- Preserve bundled scripts and resources needed by skills.
- Skip duplicate lowercase `skill.md` inside `130-crew-bell-click-popup`; keep canonical `SKILL.md`.
- Do not change runtime product code or bump `gantt/src/version.ts`.
- Keep existing `.agents/skills` non-numbered skills untouched.

---

## Task 1: Inventory Numbered Skills

**Files:**

- Read: `/Users/kimi/.claude/skills/[0-9][0-9][0-9]-*/SKILL.md`
- Read: `/Users/kimi/.claude/skills/107-pbs-portal-pairing-search-debug`
- Create/modify later: `.agents/skills/100-*` through `.agents/skills/133-*`

**Steps:**

- [ ] List all local numbered entries.
- [ ] Confirm `107-pbs-portal-pairing-search-debug` is a standalone file, not a folder.
- [ ] Confirm `130-crew-bell-click-popup/SKILL.md` is canonical and `skill.md` is duplicate.

## Task 2: Migrate Skill Content

**Files:**

- Create: `.agents/skills/100-plane-ops/`
- Create: `.agents/skills/101-enrich-plane-desc/`
- Create: `.agents/skills/102-plane-cycle-backdate/`
- Create: `.agents/skills/103-capture-ro-solver-baseline/`
- Create: `.agents/skills/104-run-pbs-solver-local/`
- Create: `.agents/skills/105-compare-ruleset-params/`
- Create: `.agents/skills/106-build-run-rust-solver-connector/`
- Create: `.agents/skills/107-pbs-portal-pairing-search-debug/SKILL.md`
- Create: `.agents/skills/108-npbs-bids-portal-simulation/`
- Create: `.agents/skills/109-ui-kickoff-local-rust-solver/`
- Create: `.agents/skills/110-rule-param-recheck-alert-center-count/`
- Create: `.agents/skills/111-pbs-solver-roster-deassign/`
- Create: `.agents/skills/112-dora-report/`
- Create: `.agents/skills/113-scenario-roster-quality-analyzer/`
- Create: `.agents/skills/114-scenario-rust-solver-run-report/`
- Create: `.agents/skills/115-gantt-playbook/`
- Create: `.agents/skills/116-scenario-division-scoping/`
- Create: `.agents/skills/117-playwright-live-stream/`
- Create: `.agents/skills/118-live-server-perf-observability/`
- Create: `.agents/skills/119-pbs-overseas-speed-latency/`
- Create: `.agents/skills/120-pbs-pairing-search-perf/`
- Create: `.agents/skills/121-pbs-perf-enhancement/`
- Create: `.agents/skills/122-release-note-maker/`
- Create: `.agents/skills/123-live-mcred-draft-recompute/`
- Create: `.agents/skills/124-crew-manday-rule-tool/`
- Create: `.agents/skills/125-pbs-result-analyzer/`
- Create: `.agents/skills/126-noc-integration/`
- Create: `.agents/skills/127-pairing-open-credit-badge/`
- Create: `.agents/skills/128-res-pairing-management/`
- Create: `.agents/skills/129-bring-crew-to-top-gesture/`
- Create: `.agents/skills/130-crew-bell-click-popup/`
- Create: `.agents/skills/131-assignment-group-mapping/`
- Create: `.agents/skills/132-pairing-id-filter/`
- Create: `.agents/skills/133-ro-solver-algorithm/`

**Steps:**

- [ ] Copy each valid local numbered skill folder into `.agents/skills`.
- [ ] Convert local `107` markdown file into `.agents/skills/107-pbs-portal-pairing-search-debug/SKILL.md` with valid YAML frontmatter.
- [ ] Preserve bundled scripts such as `100/scripts/plane.mjs`, `112/gen_dora_report.py`, `114/scripts/gen_report.py`, and `125/diagnose_crew.py`.

## Task 3: Add Team Metadata

**Files:**

- Create: `.agents/skills/<numbered-skill>/agents/openai.yaml`

**Steps:**

- [ ] Add minimal `agents/openai.yaml` for every numbered skill.
- [ ] Use display names derived from folder names.
- [ ] Use default prompts that explicitly reference `$<skill-name>`.

## Task 4: Add Project Index

**Files:**

- Create: `docs/ai/project-skills.md`

**Steps:**

- [ ] Document `.agents/skills` as canonical project-wide skill location.
- [ ] List existing non-numbered team skills.
- [ ] List migrated numbered skills.
- [ ] Note that local `~/.claude/skills` is no longer the team source of truth.

## Task 5: Verify

**Commands:**

```bash
find .agents/skills -maxdepth 2 -name SKILL.md -print | sort
find .agents/skills -maxdepth 3 -path '*/agents/openai.yaml' -print | sort
python3 - <<'PY'
from pathlib import Path
for p in sorted(Path('.agents/skills').glob('*/SKILL.md')):
    text = p.read_text()
    assert text.startswith('---\n'), p
    assert '\nname:' in text[:500], p
    assert '\ndescription:' in text[:1000], p
print('skill frontmatter ok')
PY
git diff --check -- .agents/skills docs/ai/project-skills.md docs/superpowers/plans/2026-06-27-numbered-skills-project-migration.md
```

Expected result: all commands pass, all numbered skills appear under `.agents/skills`, and no runtime files are changed.
