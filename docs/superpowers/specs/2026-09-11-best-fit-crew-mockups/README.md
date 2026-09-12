# Best-Fit Crew for an Open Pairing — UI mockups

## Current revision: batch Ver2

Open [batch-Ver2.html](batch-Ver2.html) for the revised one-screen workflow:
select multiple open pairings, click **Find best-fit crew**, review independent
results, choose crew and **Check combined selection**. Right-click entry preselects
one pairing. Both legality and cost are fixture demonstrations; no live engine is called.

The [Ver2 design](../2026-09-11-best-fit-crew-batch-design-Ver2.md) supersedes the
single-pairing restriction and engine-batching claims below. Real alternative
assignments require isolated previews; combined choices require a separate joint check.
Existing Option A/B files and their evidence below are retained as historical Ver1.

Ver2 verification command:

```sh
node docs/superpowers/specs/2026-09-11-best-fit-crew-mockups/batch-Ver2.verify.cjs
```

The checks exercise toolbar and right-click entry, three pairing searches in one
action, rank slots, hard/unknown exclusion, unchanged baseline findings, cost/fairness
sorting, retry with preserved choices, shared-crew overlap and an alternate selection,
combined credit-payroll recalculation, result invalidation and mobile controls.
The combined fixture prices once per crew and asserts CAD 1,697 for the tested selection.
The fixture policy is a simple 75-hour guarantee with a flat rate above the floor;
it is not an approved F8 tariff or a replacement for the production library's tiered calculator.
The combined legality fixture checks overlap only; the design requires all applicable
Rust rules, cumulative limits and co-crew checks in production.

The UI style gate scans production source and does not validate this standalone HTML.
Playwright and visual screenshot inspection provide the prototype's UI evidence.

Latest batch verification: **PASS**, including simultaneous per-slot recommendations
across the worklist and changes from fairness to cost. Primary review inspected
`docs/assets/screenshots/gantt/best-fit-batch-Ver4.png` and
`docs/assets/screenshots/gantt/best-fit-batch-mobile-candidates-Ver4.png`.
The mobile candidate table scrolls horizontally inside the dialog.
`npm run check:ui`: PASS, zero hard violations, 124 existing warnings.
`git diff --check`: PASS. Public Gantt/Rust acceptance remains an implementation check.

## Historical Ver1

Open any entry directly in a browser (no build step, no server):

- `option-a.html` — centered modal: pairing header, 3-stage funnel, ranked candidate table + detail panel.
- `option-b.html` — right-docked, step-driven workspace (Pairing → Filter → Legality → Rank) with cards and in-place expansion.

Both are static prototypes. Synthetic fixtures only — no Rust rule engine, no cost library, no roster
write. The on-screen banner says so.

Design: `../2026-09-11-best-fit-crew-open-pairing-design.md`.

## Both entry points are demonstrated

1. **Right-click one open pairing** in the Pairing pane → **"Find best-fit crew…"**. Enabled on an
   `open` / `partial` row, greyed out on a fully staffed row (right-click a row, or use the pane
   header `⋯` button to show the menu).
2. **Pairing pane toolbar → "Best-fit queue (N)"**. Opens the worklist of every open / partially
   open pairing in scope: departure (base-local), base, fleet, division, coverage, open slots by
   rank, uncovered credit, urgency and a "Find best-fit →" row action that opens the per-pairing
   panel.

## Pipeline shown in the panel

| Stage | Content |
|---|---|
| 1 — basic eligibility | base + fleet + rank + division + active + qualification. Hard, non-waivable; produces the funnel's "Basic match" count and a named exclusion breakdown. |
| 2 — legality simulation | one batched `preview-draft`-style simulation; per-row `Queued → Simulating → Pass / Soft warning / Hard block`. Severity ≥ 3 = hard gate (row disabled, rule codes shown); severity < 3 = soft warning (selectable, planner override). |
| 3 — rank | **Fairness** (lowest MBH, tie-break MCred then seniority) or **Cost** (lowest incremental cost from the cost library). Every row states why it sits where it does. |

The detail surfaces show the simulated-assignment strip ("Simulation only — nothing is assigned."),
the legality delta (rule code, title, severity, window, message), and the cost breakdown.

Funnel counts in the fixtures: 20 crew universe → 12 basic matches → 6 pass / 4 soft-warning /
2 hard-blocked → 10 selectable. Excluded at Stage 1: base 2, fleet 2, rank 1, division 1,
qualification 1, inactive 1.

## Cost library integration

The mockups model the **cost library's contract**, not the production calculator:

- the ranking basis "Cost" is the incremental cost of assigning this one pairing to that crew;
- each candidate carries a **cost set label with revision** (e.g. `Daily Recovery · rev 3`), the
  calculator **formula** string, the **breakdown** lines (`label → value`) and a
  `priced | unpriced | disabled` **status** — the same shape returned by
  `live-server/src/services/cost/cost-calculator.ts` (`CostCalculation`);
- unpriced candidates are ranked last and are explicitly labelled, so a partial cost can never look
  like a total;
- the amounts themselves are synthetic fixtures. The real endpoint is
  `POST /api/cost-library/calculate` per enabled `cost_set` member, summed with a completeness
  status. Which cost set and which costs are marginal for a single assignment is still an open
  product decision (design §6).

## Files

| File | Purpose |
|---|---|
| `model.js` | Deterministic fixtures + pipeline (basic filter, funnel, legality classification, fairness/cost ranking, queue rows). Loads in the browser as `window.bestFitMockup` and in node via `require`. |
| `mockup.css` | Shared house style (tokens, tables, funnel, dock, cards). |
| `option-a.html`, `option-b.html` | The two prototypes. |
| `verify.cjs` | Model assertions + Playwright browser assertions. |

## Verification

```sh
node docs/superpowers/specs/2026-09-11-best-fit-crew-mockups/verify.cjs
npm run check:ui
git diff --check
```

Result: **30 checks passed, 0 failed** (18 model checks + 12 browser checks), including: Stage-1
filter correctness, funnel arithmetic, hard/soft severity classification, fairness and cost
ordering, hard-blocked rows excluded and sorted last, the cost payload matching the cost-library
contract, queue coverage/slots/urgency, both entry points reachable in both options, no console
errors and no failed requests. Browser checks use the repo's installed Playwright (`e2e/node_modules`);
they self-skip if no browser is installed.

Screenshots (1440×1000 desktop, 390×844 mobile) are under
`docs/assets/screenshots/gantt/best-fit-crew-option-*`:

- `best-fit-crew-option-a-desktop.png`, `…-mobile.png` — ranked list + detail panel
- `best-fit-crew-option-a-queue-Ver1.png`, `…-backdrop-Ver1.png`
- `best-fit-crew-option-b-desktop.png`, `…-mobile.png` — Step 4 ranked cards with an expanded card
- `best-fit-crew-option-b-step1-Ver1.png` … `step3-Ver1.png`, `…-queue-Ver1.png`, `…-backdrop-Ver1.png`

## Not in v1

Multi-select several open pairings in the queue and solving them together — that is an assignment
optimizer and belongs with the PBS solver.
