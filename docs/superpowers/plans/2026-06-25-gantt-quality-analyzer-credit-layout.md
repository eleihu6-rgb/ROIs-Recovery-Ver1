# Gantt Quality Analyzer Credit Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Quality Analyzer lead-in column, give finding details more width, and make `After opt` count newly added CR pairing plus RES/SBY ground credit.

**Architecture:** Keep Quality Analyzer computation as a pure frontend transform over already-loaded `ScenarioGanttData`. Update the dialog table layout without adding backend fields. Preserve existing quality rule logic and only adjust awarded-credit aggregation and presentation.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Tailwind CSS v4 utility classes, existing `@rois/ui` dialog components.

## Global Constraints

- Do not add backend API fields.
- Do not change the quality rule definitions or affected-crew counts.
- Do not add airline-specific hardcoded logic.
- Do not change the left-side rule navigation behavior.
- Do not introduce new dependencies.
- Do not touch unrelated dirty worktree files.

---

### Task 1: Credit Semantics Test

**Files:**
- Modify: `gantt/src/components/scenario-gantt/__tests__/quality-analysis.test.ts`

**Interfaces:**
- Consumes: `computeRosterQuality(data: ScenarioGanttData): CrewQualityRow[]`
- Produces: failing coverage for `solverCreditMin` including only `source='CR'` RES/SBY ground credit.

- [ ] **Step 1: Update the existing credit test fixture**

In `gantt/src/components/scenario-gantt/__tests__/quality-analysis.test.ts`, replace the test named `credit: lead-in ground vs pre-assignment (before opt) vs solver (after opt)` with:

```typescript
  it('credit: before opt counts live pre-assignment; after opt counts CR pairing plus credited RES/SBY ground only', () => {
    const d = data({
      crew: [crew('C1')],
      pairings: [pairing(100), pairing(200)],
      pairingSegments: [seg(100, 1, 3600), seg(200, 1, 1200)],
      assignments: [
        { crewId: 'C1', pairingId: 100, source: 'leadin' },
        { crewId: 'C1', pairingId: 200, source: 'CR' },
      ] satisfies ScenarioGanttAssignment[],
      groundItems: [
        ground('C1', 'TRN', '2026-05-30', 'leadin', 1200, 'GRD'),
        ground('C1', 'RES', '2026-06-03', 'CR', 480, 'SBY'),
        ground('C1', 'DO', '2026-06-04', 'CR', 999, 'OFF'),
        ground('C1', 'SIM', '2026-06-05', 'CR', 777, 'SIM'),
        ground('C1', 'TRN', '2026-06-06', 'CR', 666, 'GRD'),
      ],
    })
    const [row] = computeRosterQuality(d)
    expect(row.leadInCreditMin).toBe(1200)
    expect(row.preAssignCreditMin).toBe(3600)
    expect(row.solverCreditMin).toBe(1680)
  })
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm --prefix gantt test -- quality-analysis
```

Expected before implementation: one assertion fails because `solverCreditMin` is still `1200`, not `1680`.

- [ ] **Step 3: Commit the failing test if working in a TDD branch**

Do not commit this failing state on `main`. Keep it as an intermediate local state for the next task.

### Task 2: Credit Computation

**Files:**
- Modify: `gantt/src/components/scenario-gantt/quality-analysis.ts`
- Test: `gantt/src/components/scenario-gantt/__tests__/quality-analysis.test.ts`

**Interfaces:**
- Consumes: `isReserveStandby(assignmentGroup: string, assignment: string): boolean`
- Produces: `CrewQualityRow.solverCreditMin` that includes `source='CR'` RES/SBY ground credit with `actCreditedMinutes > 0`.

- [ ] **Step 1: Update comments for awarded-credit fields**

In `CrewQualityRow`, change the comments to:

```typescript
  /** "Before optimization" — credited minutes of live pre-assigned pairings carried into the scenario. */
  preAssignCreditMin: number
  /** "After optimization" — newly added CR credit from solver pairings and credited RES/SBY ground duties. */
  solverCreditMin: number
```

- [ ] **Step 2: Add CR reserve ground credit to `solverCreditMin`**

In the `for (const g of groundByCrew.get(c.crewId) ?? [])` loop, replace:

```typescript
      if (g.source === 'leadin') leadInCreditMin += g.actCreditedMinutes ?? 0
      const reserve = isReserveStandby(g.assignmentGroup, g.assignment)
```

with:

```typescript
      const groundCredit = Math.max(0, Math.round(Number(g.actCreditedMinutes ?? 0)))
      if (g.source === 'leadin') leadInCreditMin += groundCredit
      const reserve = isReserveStandby(g.assignmentGroup, g.assignment)
      if (g.source === 'CR' && reserve && groundCredit > 0) solverCreditMin += groundCredit
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
npm --prefix gantt test -- quality-analysis
```

Expected: all `quality-analysis` tests pass.

### Task 3: Dialog Layout

**Files:**
- Modify: `gantt/src/components/panes/quality-analysis-dialog.tsx`

**Interfaces:**
- Consumes: `CrewQualityRow.preAssignCreditMin`, `CrewQualityRow.solverCreditMin`, `fmtCredit(min: number): string`
- Produces: Quality Analyzer table with no visible lead-in column and a wider finding detail column.

- [ ] **Step 1: Remove the Lead-in CRD header and cell**

In the `<thead>`, replace:

```tsx
                    <th className="px-3 py-2 font-medium">Crew ID</th>
                    <th className="px-3 py-2 font-medium">Base/Rank</th>
                    <th className="px-3 py-2 text-right font-medium">Lead-in CRD</th>
                    <th className="px-3 py-2 font-medium">Awarded credit</th>
                    <th className="px-3 py-2 font-medium">Finding detail</th>
```

with:

```tsx
                    <th className="w-20 px-3 py-2 font-medium">Crew ID</th>
                    <th className="w-24 px-3 py-2 font-medium">Base/Rank</th>
                    <th className="w-40 px-3 py-2 font-medium">Awarded credit</th>
                    <th className="px-3 py-2 font-medium">Finding detail</th>
```

Remove this cell from the body:

```tsx
                        <td className="px-3 py-2 text-right font-mono tabular-nums" data-testid="quality-leadin">
                          {fmtCredit(r.leadInCreditMin)}
                        </td>
```

- [ ] **Step 2: Set stable table layout**

Change:

```tsx
              <table className="w-full border-collapse text-xs" data-testid="quality-analysis-table">
```

to:

```tsx
              <table className="w-full table-fixed border-collapse text-xs" data-testid="quality-analysis-table">
```

- [ ] **Step 3: Keep identity cells compact**

Change the crew ID cell:

```tsx
                        <td className="px-3 py-2">
```

to:

```tsx
                        <td className="w-20 px-3 py-2">
```

Change the base/rank cell:

```tsx
                        <td className="px-3 py-2 font-mono">{r.base}/{r.rank}</td>
```

to:

```tsx
                        <td className="w-24 px-3 py-2 font-mono whitespace-nowrap">{r.base}/{r.rank}</td>
```

Change the awarded credit cell:

```tsx
                        <td className="px-3 py-2">
```

for the awarded-credit cell only to:

```tsx
                        <td className="w-40 px-3 py-2">
```

- [ ] **Step 4: Confirm no lead-in test id remains in the dialog**

Run:

```bash
rg -n "Lead-in CRD|quality-leadin" gantt/src/components/panes/quality-analysis-dialog.tsx
```

Expected: no matches.

### Task 4: Help Text Sync

**Files:**
- Modify: `gantt/src/components/help/topics/scenario/scenario-quality.tsx`

**Interfaces:**
- Consumes: final UI wording from `QualityAnalysisDialog`
- Produces: Help text that no longer implies a visible Lead-in column or solver-pairing-only after-credit semantics.

- [ ] **Step 1: Inspect existing help text**

Run:

```bash
sed -n '1,120p' gantt/src/components/help/topics/scenario/scenario-quality.tsx
```

- [ ] **Step 2: Update awarded-credit description**

If the file contains:

```tsx
        { name: 'Awarded credit', description: 'Two rows per crew — credit Before opt (pre-assignment) over After opt (solver-assigned).' },
```

replace it with:

```tsx
        { name: 'Awarded credit', description: 'Two rows per crew — Before opt is live pre-assignment credit; After opt is newly added CR credit from pairings and credited reserve duties.' },
```

- [ ] **Step 3: Remove obsolete lead-in wording if present**

Run:

```bash
rg -n "Lead-in|lead-in|solver-assigned" gantt/src/components/help/topics/scenario/scenario-quality.tsx
```

Expected: no obsolete Quality Analyzer column wording remains. Existing scenario lead-in wording outside the analyzer column description can remain if it describes scenario loading rather than this dialog.

### Task 5: Verification

**Files:**
- Verify: `gantt/src/components/scenario-gantt/quality-analysis.ts`
- Verify: `gantt/src/components/panes/quality-analysis-dialog.tsx`
- Verify: `gantt/src/components/help/topics/scenario/scenario-quality.tsx`

**Interfaces:**
- Consumes: all implementation tasks
- Produces: passing tests and TypeScript check.

- [ ] **Step 1: Run focused unit test**

Run:

```bash
npm --prefix gantt test -- quality-analysis
```

Expected: pass.

- [ ] **Step 2: Run TypeScript verification**

Run:

```bash
npm --prefix gantt exec tsc -- --noEmit
```

Expected: pass with 0 TypeScript errors.

- [ ] **Step 3: Review final diff**

Run:

```bash
git diff -- gantt/src/components/scenario-gantt/quality-analysis.ts gantt/src/components/scenario-gantt/__tests__/quality-analysis.test.ts gantt/src/components/panes/quality-analysis-dialog.tsx gantt/src/components/help/topics/scenario/scenario-quality.tsx
```

Expected: diff is limited to credit semantics, table layout, tests, and help wording.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add gantt/src/components/scenario-gantt/quality-analysis.ts gantt/src/components/scenario-gantt/__tests__/quality-analysis.test.ts gantt/src/components/panes/quality-analysis-dialog.tsx gantt/src/components/help/topics/scenario/scenario-quality.tsx docs/superpowers/plans/2026-06-25-gantt-quality-analyzer-credit-layout.md
git commit -m "fix: update quality analyzer credit layout"
```
