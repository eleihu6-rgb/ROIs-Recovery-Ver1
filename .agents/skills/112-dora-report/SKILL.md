---
name: 112-dora-report
description: >
  Generate a DORA developer performance analysis report for the ROIS-AI Ver4 project.
  Analyzes git history to compute Deployment Frequency, Lead Time, Change Failure Rate,
  MTTR proxies, module ownership, Playwright/doc contributions, weekly velocity trend,
  AI-assisted-development rate, and code hotspots — per developer. Always outputs BOTH a
  Chinese (CN) AND English (EN) .docx report to docs/dev-context/.
  Triggered when the user says "create DORA report", "生成 DORA 报告", "latest dora",
  "update DORA", or references a prior dora-developer-analysis .docx file.
---

# Skill 112 — DORA Developer Performance Report

## Purpose

Generate a DORA metrics report that matches the project's existing reports in
`docs/dev-context/*-dora-developer-analysis-*-Vx.docx`. The most recent baseline format
is **V6** (13 sections). A self-contained generator does all the work:
`gen_dora_report.py` (next to this file).

## When to invoke

- "create a new DORA report", "生成 DORA 报告", "get the latest dora", "update DORA"
- The user references an old DORA `.docx` and asks for a refreshed version.

## How to run (the fast path)

From the **repo root** (so `git log` and `gantt/src/version.ts` resolve):

```bash
python3 ~/.claude/skills/112-dora-report/gen_dora_report.py
```

This auto-increments the version (scans `docs/dev-context/` for the highest `-Vx`),
reads `Ver:B/F/R` from `gantt/src/version.ts`, collects all metrics from git, and writes
**both** language files:

```
docs/dev-context/YYYY-MM-DD HHMM-dora-developer-analysis-CN-Vx.docx
docs/dev-context/YYYY-MM-DD HHMM-dora-developer-analysis-EN-Vx.docx
```

Options:
- `--version V8` — force a version number (otherwise auto = highest existing + 1)
- `--since 2026-01-01` — analysis start date (default 2026-01-01)
- `--date 2026-06-22` — override the report date (default: today)
- `--repo /path/to/repo` — analyze a different checkout

Requires `python-docx` (already present in this environment; `pip install python-docx`
if missing).

## What the report contains (14 sections)

Quality-first ordering — testing, fix quality, and standards are pulled to the front so
non-technical readers see them first:

1. Team Members & Git Identity Map
2. **Test Coverage (Playwright Automated Tests)** — by area  *(moved to front)*
3. **Fix Quality: Point Fix vs. Systematic Fix**  *(moved up, right after testing)*
4. **Engineering Standards & Conventions** *(NEW)* — table of enforced standards (UI gate,
   Playwright-Required, No-Illusion, Conventional Commits, coding standard, AppDialog,
   version bumping) + per-developer commit-convention adherence
5. Commit Activity Summary (feat/fix/test/refactor/style-perf/docs/chore + active days)
6. DORA Four Key Metrics — 6.1 Deployment Frequency (5-week), 6.2 Lead Time,
   6.3 Change Failure Rate, 6.4 MTTR
7. DORA Scorecard
8. Module Ownership Analysis (file-touch count + bus-factor)
9. Standards & Documentation Contributions (by doc category)
10. Improvement Recommendations
11. Methodology & Limitations
12. Development Velocity Trend (W13 → current week)
13. AI-Assisted Development (Claude Code co-author rate)
14. Code Hotspot Analysis (most-touched files)

Every table is followed by a **plain-language "💡 In plain words / 💡 通俗解释"** explainer
that defines the jargon for non-technical readers (EN in the EN file, CN in the CN file).

The 5-week Deployment-Frequency window ends at the **last complete ISO week**; the current
(in-progress) week is shown only in the velocity-trend section, marked "in progress…".

## Developer identity mapping (canonical — lives in `dev_of()`)

| Real name (EN / CN) | Git aliases | Emails |
|---------------------|-------------|--------|
| Kimi (Ryan) | eleihu6-rgb, Ryan | eleihu6-rgb@users.noreply.github.com; eleihu6@gmail.com **only when name=Ryan** |
| Yuan Zhu / 朱园 | yuan.zhu-ai, yuanz-ai, yuan.zhu, yuanz-cc, Yuan Zhu | yuan.zhu@pi-solution.com; eleihu6@gmail.com (when name=yuan.zhu-ai) |
| Honglei / 洪磊 | honglei.Yu | 1711625601@qq.com |
| Qiang Gong / 龚强 | qiang.gong, Qiang Gong | qiang.gong@pi-solution.com |

> ⚠ The `eleihu6@gmail.com` email is shared: it is **Kimi** only when the git name is
> "Ryan", otherwise it belongs to Yuan Zhu (yuan.zhu-ai). This split is already encoded.
> If a new contributor appears, add them to `dev_of()` and `DEVS`.

## DORA level thresholds (encoded in the script)

| Metric | Elite | High | Medium | Low |
|--------|-------|------|--------|-----|
| Deployment Frequency (proxy: commits/wk) | Daily+ | Daily–Weekly | Weekly–Monthly | Monthly+ |
| Lead Time | <1 day | 1d–1wk | 1wk–1mo | >1mo |
| CFR (fix ÷ total) | <5% | 5–15% | 15–30% | >45% |
| MTTR | <1h | <1d | <1wk | >1wk |

## Systematic-fix keywords (§8)

`sweep, across, unify, all, cascade, enforce, parity, similar, 统一, 全部, 所有`

## Caveats / gotchas

- **Honglei mislabels features as `fix:`** → his raw CFR is ~70%. The report flags this and
  notes an estimated real CFR ~25%. Do not "fix" the number — it is honest raw data with a caveat.
- `gantt/src/version.ts` top-ranks in §13 hotspots — that is structural noise (bumped every
  frontend change), not a risk. The interpretation column says so.
- `.docx` files are **not** runtime code → no version bump required (CLAUDE.md exempts docs).
- The report is data-only; it does not require any servers/DB — pure `git log`.

## Verify after generating

```bash
python3 - <<'EOF'
from docx import Document
d = Document(sorted(__import__('glob').glob('docs/dev-context/*dora*EN-V*.docx'))[-1])
print("paras", len(d.paragraphs), "tables", len(d.tables))
EOF
```
Expect ~15 tables and the 13 section headings. Paste the totals line from the generator
(commits / specs / version) into your completion message (§No-Illusion).
