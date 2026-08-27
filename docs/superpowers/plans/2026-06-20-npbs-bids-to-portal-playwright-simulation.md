# NPBS Bids → Portal Playwright Simulation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Convert the legacy NPBS-Legend bids export into a committed fixture and a data-driven Playwright spec that logs in as each of 24 crew and places their mapped, tiered bids through the real portal UI.

**Architecture:** Pure-function parser (`.mjs`) → committed JSON fixture + unmapped report → data-driven Playwright spec driven by a `bid-workbench` page object. A skill + playbook capture the mapping and the run/extend workflow.

**Tech Stack:** Node ESM (`.mjs`), `node --test` for parser unit tests, Playwright (`pbs-portal` project), existing `PbsLoginPage`.

## Global Constraints

- Never change product code to fit NPBS (rule #7). Unmappable predicates / UI blockers → recorded, not forced.
- Target month June 2026; shift every `Mar … 2026` → `Jun … 2026`.
- Buckets: `YVR-CA, YYZ-FO, YVR-IFD, YYZ-FA`; 6 crew each; crew qualifies only with ≥4 mapped props in its primary group.
- Context: Current beats Default. Tier source: primary bid group only, lines→T1..T7, drop >7.
- e2e base path `/fpqe/pbs/`, port 3030; ID scheme `PBS-33xx`; UI default language English.

---

### Task 1: Parser + mapping (pure functions) with unit tests

**Files:**
- Create: `e2e/utils/npbs/mapping.mjs` (predicate→property table + `mapPredicate`)
- Create: `e2e/utils/npbs/parse-npbs-bids.mjs` (`splitRecords`, `selectContext`, `splitGroups`, `shiftDates`, `buildCrewBids`, `selectCrew`)
- Test: `e2e/utils/npbs/parse-npbs-bids.test.mjs` (`node --test`)

**Interfaces — Produces:**
- `splitRecords(text) -> Record[]` where `Record = { category, base, fleet, rank, employeeId, seniority, context: 'Default'|'Current', lines: string[] }`
- `selectContext(records) -> Map<employeeId, Record>` (Current wins)
- `splitGroups(lines) -> { kind:'pairing'|'reserve', predicates:string[] }[]`
- `shiftDates(text) -> string`
- `mapPredicate(predicate) -> { page, propertyCode, name, action, bid } | { skipped:true, reason }`
- `buildCrewBids(record) -> { employeeId, category, base, rank, context, properties:[{tier,page,propertyCode,name,action,bid}], dropped:[{predicate,reason}] }`
- `selectCrew(records, config) -> CrewBids[]`

- [ ] Step 1: Write failing unit tests (context selection, group split, tier cutoff at 7, Mar→Jun incl `2026-03-05`, one pairing + one days-off predicate map, ≥4 filter).
- [ ] Step 2: `node --test e2e/utils/npbs/parse-npbs-bids.test.mjs` → FAIL.
- [ ] Step 3: Implement `mapping.mjs` + `parse-npbs-bids.mjs`.
- [ ] Step 4: `node --test …` → PASS.
- [ ] Step 5: Commit.

### Task 2: Fixture generator CLI + generate real fixture

**Files:**
- Create: `e2e/utils/npbs/generate-fixture.mjs` (reads txt, writes fixture + unmapped report)
- Output: `e2e/fixtures/pbs/npbs-bids-jun2026.json`, `e2e/results/npbs-issues/unmapped-report.json`

- [ ] Step 1: Implement CLI (`node generate-fixture.mjs <txt> <out>`), default paths baked.
- [ ] Step 2: Run against `docs/test-cases/CLASS-BidsReport_March2026.txt`.
- [ ] Step 3: Inspect fixture — 4 buckets present, 6 crew each (or log shortfall), each crew ≥4 props, dates in Jun.
- [ ] Step 4: Commit fixture + generator.

### Task 3: bid-workbench page object

**Files:**
- Create: `e2e/pages/pbs-portal/bid-workbench-page.ts`
- Read first (for real selectors): `pbs-portal/src/features/{pairing,days-off,line,reserve}/...` dialogs + add buttons + tier toggle + existing-row testids.

**Interfaces — Produces:**
- `class BidWorkbenchPage { goto(page); placeProperty(property): Promise<{placed:boolean, reason?}>; assertRow(property): Promise<void> }`

- [ ] Step 1: Read components, capture exact selectors (add-bid button, dialog, value inputs per bid type, tier toggle group, confirm/Add button, existing row testid).
- [ ] Step 2: Implement page object dispatching by `property.page` and `property.bid.type`.
- [ ] Step 3: Commit.

### Task 4: Data-driven simulation spec

**Files:**
- Create: `e2e/tests/pbs-portal/npbs-crew-bids-simulation.spec.ts`

- [ ] Step 1: Load fixture; `describe` per bucket, `test('PBS-33xx — <category> <employeeId>')` per crew.
- [ ] Step 2: Per crew: login as employeeId/`rois`; per property placeProperty + assertRow; catch blockers → write `e2e/results/npbs-issues/<employeeId>.json`, rethrow (honest red).
- [ ] Step 3: Run `npm run test:pbs-portal -- npbs-crew-bids-simulation.spec.ts --reporter=list`.
- [ ] Step 4: Record results: which crew pass; which blocked + why (login/UI). Do NOT change product code.
- [ ] Step 5: Tag the verified-green subset `@regression`; leave blocked crew documented.
- [ ] Step 6: Commit spec + issues report.

### Task 5: Skill + playbook + IDs + version bump

**Files:**
- Create: `~/.claude/skills/107-npbs-bids-to-portal-bids/SKILL.md`
- Create: `docs/modules/pbs/npbs-bids-simulation-playbook.md`
- Modify: `docs/test-cases/e2e/README.md` (add PBS-33xx IDs)
- Modify: `gantt/src/version.ts` (no runtime code changed → likely no bump; e2e-only)

- [ ] Step 1: Write skill (grammar, mapping table, 6 rules, file map, run/extend).
- [ ] Step 2: Write playbook (run, regenerate, read reports, extend crew/base/rank/month).
- [ ] Step 3: Add IDs to README; update memory MEMORY.md pointer.
- [ ] Step 4: Commit docs.

## Self-Review notes
- Parser tests cover every conversion rule (1–6).
- No product-code edits anywhere (rule #7).
- Green regression subset = only verified-passing crew (§No-Illusion); blockers recorded.
