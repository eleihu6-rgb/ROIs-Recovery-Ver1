---
name: 140-weekly-progress-report-updater
description: Update the F8 (Flair) weekly project status workbook (F8-CMS-CrewWeeklyReport <DD>Aug<YYYY>.xlsx) — add a new dated tab for the current Tuesday meeting (copied from the most recent week's tab, prior weeks left untouched), roll its Report Date / Report Period forward, and refresh the High-Level Review progress sections (Rule Engine, Data & Integration, AI Core, Crew Portal, Admin Portal) from the week's raw notes. Use when the user says "update the weekly report", "update weekly progress", "roll the weekly status to today/this Tuesday", or pastes a week's dev notes to fold into the report. Preserves existing content, colours this week's new/changed items in blue, keeps section titles bold.
---

# Weekly Progress Report Updater

## Overview

Maintains the customer-facing weekly status workbook as **one file with one tab per week**.
The project holds a status meeting **every Tuesday**; each update **adds a new tab** for this
Tuesday — copied from the most recent week's tab so all layout/formatting carries over — and
**leaves every prior week's tab untouched** (they are the historical record). Only the new
tab's reporting window and narrative progress cells are edited.

The new tab is named `<DD><Mon><YY> Rpt` (e.g. `25Aug26 Rpt`) and becomes the active sheet.
The workbook file name keeps its own date suffix; do not create a separate file per week.

**File location (iCloud):**
`~/Library/Mobile Documents/com~apple~CloudDocs/Projects/Flair/Project Meeting Notes/F8-CMS-CrewWeeklyReport <DD><Mon><YYYY>.xlsx`
(An older copy also lives under `.../Flair/Internal Report/`. Confirm the path the user means; locate with `find ~/Library/Mobile\ Documents/com~apple~CloudDocs -iname "F8-CMS-CrewWeeklyReport*"`.)

**Audience = client project meeting.** Plain, user-friendly English; no internal jargon,
table names, or code identifiers in the cell text. UI/report strings in English (project rule).

## Workbook structure (each weekly tab, named `<DD><Mon><YY> Rpt`)

Every weekly tab has the same layout. On the **new** tab (a copy of the latest week's), the
cells this skill touches:

| Cell | Meaning | Update rule |
|---|---|---|
| `C2` | Report Date | set to **this Tuesday** (`YYYY/MM/DD`) |
| `C3` | Report Period | `"<last Tue YYYY/MM/DD> - <this Tue YYYY/MM/DD>"` |
| `D8` (merged `D8:L8`) | **High-Level Review — Schedule**: narrative items **1 UAT / 2 Rule Engine / 3 Data & Integration** | rewrite as rich text |
| `D9` (merged `D9:L9`) | **High-Level Review — items 4 AI Core / 5 Crew Portal UI / 6 Admin Portal UI** | rewrite as rich text |
| sheet title | `<DD><Mon><YY> Rpt` (e.g. `25Aug26 Rpt`) | name of the **new** tab |

Everything else on the new tab (Project Plan `D7`, Issues/Risks, Milestones, Risk Register,
Iteration Trackers, CR Tracker, P&L, external notes in column `O`) is **carried over from the
copied tab** and left untouched unless the user gives explicit input for it. **Prior weeks'
tabs are never modified.**

The report has no images/charts (data only, ~95 merged ranges), so `wb.copy_worksheet` copies
it faithfully — values, styles, merged cells, column widths, and row heights all carry over.

Base font is **Arial 14**, cells wrap, vertical top, left-aligned. Row heights grow with
content (set `row 8 ≈ 300`, `row 9 ≈ 470`, or taller if items are added).

## Section mapping (raw notes → report section)

Fold the week's notes into the six numbered sections by **what the work is**, not by how the
notes were loosely grouped. Consistency with how the report already categorises matters:

- **2. Rule Engine** — legality/rule changes only (e.g. a new or expanded rule).
- **3. Data & Integration** — all interfaces: NAVBLUE roster push (outbound), RosterGround /
  DHD / ground-task import (inbound), S3 pairing, **SSO**. (SSO and interface work belong
  here even if the notes list them under "admin portal".)
- **4. AI Core** — solver/algorithm: coverage & metrics, reasoning report, stability, engine
  version integration. Include the `PBS-xxx` tracker id when the notes give one.
- **5. Crew Portal UI** — crew-facing pages: bidding, reserve/standing pages, mini-calendar,
  help, portal API/response time.
- **6. Admin Portal UI** — admin-facing app only (e.g. Gantt menu permission control, admin
  bugs). Backend interfaces triggered from admin go under section 3.

Translate Chinese dev notes to concise English. Keep tracker URLs as their `PBS-xxx` id.

## Colour convention (the core rule)

**Preserve existing content; make this week's changes obvious.**

- **New or changed this week → blue** (`FF0070C0`).
- **Carried over / unchanged → black** (`FF000000`). If you cannot map a piece of the user's
  input to a section, keep (reserve) the existing line rather than deleting it.
- **Section titles (`2. Rule Engine — on track`, …) → black bold**, regardless of new items
  under them.
- Roll the changed **Report Date / Report Period → blue** too, so the new window is visible.

Mixed colours inside one cell require **rich text** (`openpyxl.cell.rich_text.CellRichText`
with `TextBlock` + `InlineFont`); a per-cell `Font` cannot colour part of a cell. See the
script.

Items that were "finish new requirement" completions in a *prior* week may be dropped once
superseded, but when in doubt reserve them as black and tell the user what you kept/dropped.

## Workflow

1. **Locate the file** and confirm the target path (`Project Meeting Notes/`).
2. **Back it up** to the scratchpad before editing (`cp` the .xlsx).
3. **Identify the latest tab** (most recent `<DD><Mon><YY> Rpt`) and **read its `C2/C3/D8/D9`**
   verbatim so nothing is lost — this tab is the copy source.
4. **Copy that tab** with `wb.copy_worksheet(src)`, rename the copy to `<this-Tue> Rpt`, and
   make it the active sheet. **Do not touch the source tab.**
5. **Compute dates**: this Tuesday = today (the meeting day); last Tuesday = today − 7.
6. **Classify** each raw note into sections 2–6 per the mapping above; write concise English.
7. **Rewrite the new tab's `D8`/`D9`** as rich text — new=blue, carried=black, titles=bold.
   Update its `C2`, `C3`. Grow row heights.
8. **Verify (§No-Illusion)**: reload with `rich_text=True`; confirm (a) the old tab is
   unchanged (dates/text/merged-range count), (b) the new tab has the updated dates and the
   right blue-segment count (`part.font.color.rgb == "FF0070C0"`), and (c) the new tab kept
   the layout (merged-range count and column widths match the source). Paste the receipt.
9. **Do not commit** (§No-Auto-Commit) and never move/copy the file out of iCloud.

## Builder — `scripts/update_weekly_report.py`

`openpyxl`-based, rich-text mixed-colour writer. Needs a venv (OS python is PEP-668 managed):

```bash
python3 -m venv /tmp/uatvenv && /tmp/uatvenv/bin/pip install -q openpyxl
```

The script **copies the source tab to a new tab** (`SOURCE_TAB` → `NEW_TAB`), then edits only
the copy. It holds the D8/D9 item lists as `(text, is_new, is_bold)` tuples — edit those lists,
`SOURCE_TAB`, `NEW_TAB`, and the dates each week, then run it against the workbook path. It
sets fonts (Arial 14), alignment, row heights, and header dates on the new tab, then re-opens
the file to print a receipt (sheet list + per-cell blue-segment counts).

## Notes

- Documentation deliverable (no app change) → no Playwright test; the §No-Illusion proof is
  the reload-and-verify colour/date receipt.
- No secrets, credentials, or DB connection strings in the workbook or the notes.
- Keep the file name's date suffix in sync with the report date if the user renames it.
