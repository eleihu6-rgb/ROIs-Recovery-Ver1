---
name: 143-ek-et-roundtrip-pairing-build
description: Build valid EK/ET crew pairings as home-base round trips (EK→DXB, ET→ADD) and repair invalid ones. A pairing MUST start and end at its home base; a rotation that never connects from base (e.g. #150497) is invalid and must be deleted and rebuilt. Use when asked to "build EK/ET pairings", "fix invalid pairings", "re-segment stranded pairings", or when a pairing's legs don't loop back to base.
---

# 143 EK/ET Round-trip Pairing Build

Builds and repairs EK/ET crew pairings against the data model in
`docs/architecture/data-model.md`. A pairing is a crew **rotation**: it must depart the
airline's home base and eventually return to it. Anything else is invalid.

## The base-loop invariant (the one rule that matters)

**A valid pairing's ordered segments start at its home base AND end at its home base.**

- EK home base = **DXB**
- ET home base = **ADD**

Concretely, for a pairing's segments ordered by `(duty_seq, seg_seq)`:
`firstSeg.dep_arp === base` **and** `lastSeg.arv_arp === base`.

A pairing that violates this is a **stranded fragment**, not a rotation — the crew would
never get home. Example cautionary case (2026-08-30): **pairing #150497 was invalid — its
legs connected from neither base.** It, plus 89 other stranded fragments, were deleted and
rebuilt into real base→base loops. After the fix: **191 DXB/ADD pairings, 0 invalid.**

## Data-model traps (read before touching pairings)

From root `CLAUDE.md` §核心数据模型陷阱:

- `pairing` does **not** link to `flight` directly. The chain is
  `pairing → pairing_segment.flt_id → flight.id` (N:M, **by value, no FK**). There is no
  `pairing.flight_id`.
- **`pairing.base` is NOT derived from the legs.** The build service sets it from the
  airline home base (`AIRLINE_HOME_BASE`) regardless of where the legs actually go. So a
  pairing can be based "DXB" yet have legs that never touch DXB — that is exactly the
  #150497 defect. **Never trust `pairing.base` as proof of a base loop; check the legs.**
- `pairing_segment` itself stores `dep_arp` / `arv_arp` (and `duty_str_arp` / `duty_end_arp`),
  so the loop check needs no join back to `flight`.
- PostgreSQL `bigint` ids come back from `pg` as **strings**. When intersecting flight-id /
  pairing-id sets in a script, coerce every id the same way (`Number(x)`) or the Sets
  silently never match.

## The build service builds "as-is" — the BUILDER must guarantee the loop

`POST /api/pairing/build { flightIds: number[] }`
(`live-server/src/services/pairing/pairing-build-service.ts`) splits the selected legs into
duties **purely by the 12h rest floor** — but it does **not** gate on legality or on the
base-loop invariant (intentional: "build as-is, surface violations").

## Duty boundaries are rest-driven — the block cap must NOT fabricate rest

**A new duty begins ONLY after a real ground gap >= `REST_FLOOR_MIN` (720 min / 12h).** The 8h
block cap and station continuity are duty *constraints* (legality violations surfaced
downstream), **not** duty splitters. A continuous same-flight multi-sector trip whose turns are
quick (e.g. 60 min) is **one duty**, even if its total block exceeds 8h.

Cautionary case (2026-08-30): pairing **#150707** was ET861 ADD-BZV-PNR-ADD — one continuous
trip with 60-min turns at BZV and PNR. The old block-cap split forced a 2nd duty and stamped a
fictitious **720-min rest over PNR's 60-min turn** — a rest the crew never got. Ryan: *"rest
after duty 1 didn't meet our defined mini rest; fix the logic and rebuild these invalid
pairings."* Fix: `planDuties` opens a new duty only when `gapMin >= REST_FLOOR_MIN`; the 53
invalid MANUAL pairings were deleted and rebuilt → **0 fabricated-rest boundaries**. Note the
repair scoped to `source='MANUAL'` only — the 19k imported `source='F8'` pairings use a
different rest model (rest_min 600, multi-day) and must **not** be recut.

## The 8h block cap governs the LEG-CHOOSER — over-cap chains become layover pairings

**A duty with more than one segment must not exceed `MAX_DUTY_BLOCK_MIN` (480 min / 8h) of
total block.** Single-segment long-haul duties are exempt (augmented-crew ops). Since the duty
planner welds as-is and must never fabricate rest, this rule lands on the **chooser**: when a
same-day chain would bust the cap, do NOT weld it into one pairing — split at the outstation
and chain to a **later occurrence** (next day) of the continuation leg, creating a REAL >= 12h
layover. The daily-repeating schedule makes this work: outbound duty day N, rest at the
outstation, return duty day N+1.

Cautionary case (2026-08-31): pairing **#150717** was ET823 ADD-VFA-GBE-ADD welded same-day —
3 legs, **680 min block in one duty**. Ryan: *"more than 1 seg, total flight time > 8 hours,
also not respect our rule."* 53 such pairings (45 route-groups: ADD-JFK, ADD-LGW, ADD-TFU,
ADD-DEL, …) were deleted and **63 rule-clean layover pairings** built from their legs plus
free same-route legs (e.g. `ET823 ADD-VFA-GBE day N |REST| GBE-ADD day N+1`). Legs that
cannot close a base loop within the window under the cap stay uncovered — never weld an
over-cap duty just to cover them.

**Therefore the caller that chooses which legs to weld together is responsible for the base
loop.** If you hand it a stranded chain, you get a stranded pairing. The canonical builder
that gets this right is the round-trip cover in
`e2e/tests/gantt/ek-et-roundtrip-pairing-build.spec.ts` → `buildRotations()`:

- anchors each 01-Sep base outbound, extends forward to base (earliest return) and backward
  to base, packs sub-8h same-day base turns;
- **§Base-Loop guard (the fix):** before returning, it drops any rotation whose first
  `dep_arp` / last `arv_arp` isn't the home base, frees those legs, and logs how many legs
  were left uncovered. An uncovered leg is acceptable; an invalid pairing is not.
- the build loop asserts, per pairing, `rot[0].depArp === base && rotLast.arvArp === base`
  (the regression guard that stops a #150497-style pairing from ever being rebuilt).

Service constants (mirror in any builder): `CHECKIN_MIN=60`, `DEBRIEF_MIN=15`,
`REST_FLOOR_MIN=720` (12h — the duty boundary AND the post-duty rest floor). The old
`MAX_DUTY_BLOCK_MIN=480` was **removed as a duty splitter** — the 8h block cap is a downstream
legality check, never a reason to cut a duty. Narrow body (`/^73/`, `/7M/`) → CA1/FO1; wide
(A380/788/789) → CA2/FO2.

## Repair procedure: delete the invalid, then rebuild them

When invalid pairings already exist (Ryan's instruction: *"delete the invalid, then rebuild
them"*), the surgical repair keeps already-valid pairings untouched:

1. **Classify** every DXB/ADD pairing valid vs invalid by the base-loop invariant above
   (order its segments, check first dep / last arv === base).
2. **Free universe** = EK/ET legs in the window that are NOT in a valid pairing.
3. **Rebuild** greedy per airline+fleet base→base loops from the freed legs (seed from base
   departures, chain earliest rest-legal connection back to base; drop any chain that can't
   close the loop — leave those legs uncovered rather than strand them).
4. **Commit** (auth `admin`/`123456` at `localhost:3000`): delete every invalid pairing via
   `POST /api/pairing/:id/delete`, then `POST /api/pairing/build` for each rebuilt loop.
5. Keep the already-valid pairings as-is (surgical: don't re-cut what's already a clean loop).

Legs whose only partners are locked inside kept-valid pairings (or multi-day 5th-freedom
tags) stay uncovered — the accepted cost of the surgical choice. A **full** rebuild (delete
all DXB/ADD, recut the whole schedule) closes them but discards the valid pairings; only do
that when explicitly asked.

### Shared-DB coordination (§Remote-DB-Only)

`f8_sit_live` is shared. Batch delete + rebuild rewrites DXB/ADD pairings for the window —
get explicit sign-off (Ryan's "delete the invalid, then rebuild them" IS that sign-off for
this specific repair) before running, and never overwrite a date range another agent's tests
depend on. All access via the service `.env` `DATABASE_URL`; passwords never written to code
or docs.

## Validation (§No-Illusion / §Playwright-Required / §PW-Snapshot)

- **Data + integrity:** `e2e/tests/gantt/ek-et-base-loop-integrity.spec.ts` (`Live-1722i`) —
  filters the pairing pane to base DXB/ADD (Apply Filters → `pageSize=0`, so the store loads
  **every** matching pairing, making "0 invalid" a complete claim), asserts every pairing is a
  base→base loop from store truth, and that #150497 is gone. Screenshot →
  `docs/assets/screenshots/gantt/ek-et-base-loop-integrity-Ver<N>.png`.
- **Full rule audit (data level):** `live-server/scripts/audit-pairing-build-rules.mjs` — checks
  every MANUAL pairing against ALL build rules (A base-loop, B rest floor, C multi-seg block
  cap, D station continuity, E unique coverage, F no time overlap). Run from `live-server/`;
  exits non-zero on any violation. Run it after ANY pairing build/repair and before calling the
  work done.
- **Build-time warnings (Option A, 2026-08-31):** `POST /api/pairing/build` stays "build as-is"
  but its response carries `warnings: string[]` from `validateBuildRules` (block cap, base loop,
  continuity, overlap) and the gantt Create-Pairing flow toasts each one (`notify.warning`).
  Regression: `e2e/tests/gantt/pairing-build-rule-warning.spec.ts` (`Live-1716w` warning fires,
  `Live-1717w` clean build stays silent).
- **Duty-rest + block integrity (UI level):** `e2e/tests/gantt/ek-et-duty-rest-integrity.spec.ts`
  (`Live-1707d`) — asserts from store truth that no DXB/ADD duty boundary sits over a gap
  shorter than `REST_FLOOR_MIN`, that no multi-seg duty exceeds `MAX_DUTY_BLOCK_MIN`, and that
  ET823 is split across >= 2 duties by a real layover (fails on pre-fix data). Unit companion:
  `live-server/src/__tests__/services/pairing/pairing-build-service.test.ts` (`planDuties` — 4
  tests). Screenshot → `docs/assets/screenshots/gantt/ek-et-duty-rest-integrity-Ver<N>.png`.
- **Render level:** `e2e/tests/gantt/ek-et-pairing-render-anchors.spec.ts` (`Live-1722r`) —
  proves a rebuilt multi-duty pairing renders duty box + layover + REST pucks.
- **Build sweep (opt-in, full rebuild):** `ek-et-roundtrip-pairing-build.spec.ts` — run with
  `ROUNDTRIP_FLEETS=A380` for a smoke build, or unset for the full sweep. It DELETES all
  DXB/ADD pairings first, so do not run it when you mean to preserve a surgical repair.

Run gantt e2e from `e2e/`:
`npx playwright test tests/gantt/<file>.spec.ts -c config/playwright.config.ts --project=gantt --reporter=list`
(needs live-server :3000 and gantt :5173 up). Screenshot paths in specs are cwd-relative to
`e2e/`, so write to `../docs/assets/screenshots/gantt/…`.
