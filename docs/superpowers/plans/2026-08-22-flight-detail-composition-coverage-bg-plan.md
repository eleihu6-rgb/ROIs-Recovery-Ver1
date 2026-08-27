# Flight Detail Composition Coverage Backgrounds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tint each Flight Composition rank card light green / amber / red by per-rank fill using existing `--fdd-*-dim` tokens.

**Architecture:** Pure helper maps `(actual, plan)` → coverage class; dialog applies `comp-card ${coverage}`; CSS sets backgrounds from `--fdd-green-dim` / `--fdd-amber-dim` / `--fdd-red-dim`. Shared Live+Scenario dialog path unchanged.

**Tech Stack:** gantt React + Vitest + Playwright; dialog-local CSS tokens.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-22-flight-detail-composition-coverage-bg-design.md`
- Over-fill (`actual > plan`) → `full` (green), same as exact fill
- `plan === 0` → no modifier (default gray)
- Do not change rank colors or `comp-act` over/under text colors
- UI English; no hard-coded hex beyond existing `--fdd-*` tokens
- §No-Auto-Commit unless user asks

---

### Task 1: Coverage helper + Vitest

**Files:**
- Create: `gantt/src/components/flight/derive-composition-card-coverage.ts`
- Create: `gantt/src/components/flight/__tests__/derive-composition-card-coverage.test.ts`

**Interfaces:**
- Produces: `deriveCompositionCardCoverage(actual: number, plan: number): 'full' | 'partial' | 'empty' | null`

- [ ] **Step 1: Write failing tests** covering full (1/1, 2/1), partial (1/3), empty (0/3), plan 0 → null
- [ ] **Step 2: Run Vitest — expect FAIL (module missing)**
- [ ] **Step 3: Implement helper**
- [ ] **Step 4: Run Vitest — expect PASS**

### Task 2: Wire dialog + CSS

**Files:**
- Modify: `gantt/src/components/flight/flight-detail-dialog.tsx` (comp-card className)
- Modify: `gantt/src/components/flight/flight-detail-dialog.css` (`.comp-card.full|.partial|.empty`)

- [ ] **Step 1: Import helper; set `className={\`comp-card ${coverage ?? ''}\`.trim()}`**
- [ ] **Step 2: Add CSS backgrounds using `--fdd-*-dim`**
- [ ] **Step 3: `npm run check:ui` PASS**

### Task 3: Playwright regression

**Files:**
- Modify: `e2e/tests/gantt/scenario-detail-dialogs.spec.ts` (Scen-2020)

- [ ] **Step 1: Assert composition cards include `full` for filled cockpit ranks when mock Live composition has empty cabin (or fixture-equivalent)**
- [ ] **Step 2: Run focused Playwright; paste PASS receipt

---

**Self-review:** Spec table → Task 1+2; over-fill → Task 1; Playwright → Task 3; no placeholders.
