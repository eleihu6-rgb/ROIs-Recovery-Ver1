# Crew App · Duty Swap "Match" mode + saved wants

Authorized by Ryan's 19 Oct 2026 request (three changes). Supersedes only the
naming and step-1/2 behavior described here; `2026-10-19-crew-app-ticket-polish-Ver1.md`
still governs the four-stage flow, multi-duty selection, review and submit.

## Decisions

- **Mode name: Match.** The internal approach id stays `ticket` so the remembered
  choice in AsyncStorage needs no migration. Stage 3 is renamed from **Match** to
  **Pick** so the mode and a stage never share a label. Stages: Give · Want · Pick · Send.
- **Saved want: per give duty.** A want belongs to each selected duty, keyed by
  `SwapDuty.key`. Saving with several duties selected writes the same want to each.
  When several selected duties carry wants, the most recently selected duty wins
  for prefilling step 2; each duty still shows its own brief chip in step 1.

## Behavior

1. Step 2's star is the save control in Match mode:
   - disabled until the crew expresses a want: any optional filter, a non-default
     swap mode, or a changed start/end date (the untouched portal window is not a want);
   - highlighted when the current form equals the saved want;
   - writes the want for the selected give duties to this phone, keyed by airline +
     crew ID so PR and TG never mix.
2. Step 1 shows each saved want under its duty as one brief line:
   `★ 19–31 Oct · SBY · A320` — date range, then at most three criteria, then `+N`
   for the rest. It is visible whether or not the duty is currently selected.
3. Selecting a duty that has a saved want and pressing Next applies that want in
   step 2 (the form opens on the saved criteria). Changing the give selection clears
   the local draft so the saved want can apply; unchanged selection keeps unsaved edits.
4. Step 2 puts the used criteria on top, above the form: **Start** and **End**
   first (mandatory, always shown), then every other selected criterion as compact
   chips. The chips update live as the crew edits the form.

## Modules

`market/marketModel.ts` (pure helpers), `market/TicketScreen.tsx` (load/save/apply,
step-1 chip, labels), `components/SearchForm.tsx` (optional `onSaveWant`/`savedWant`
props; Matrix behavior unchanged). No backend or portal contract changes.

## Verification

- Jest: model helpers + a screen test for disabled star, save, step-1 chip, reapply,
  per-duty isolation and persistence across remount (PR/TG key isolation).
- `npx tsc --noEmit`; UI gate; simulator pass on Air → Duo → iPad with PR and TG
  (report any runtime/auth blocker instead of claiming a pass).

## Validation receipt (19 Oct 2026)

- `cd crew-app && npx tsc --noEmit` → **PASS**.
- `cd crew-app && npx jest __tests__/features/dutySwap --runInBand` → **11 suites / 137 tests PASS**
  (includes `dutySwapMatchWant.test.tsx`: 9 model + screen tests).
- `npm run check:ui` (repo root) → **PASS**, 0 hard violations (124 pre-existing warnings,
  crew-app is not in the gate's scan set).
- `git diff --check` on the touched files → **PASS**.
- Simulator, iPhone 17, PR 421983, real portal (Maestro):
  - Match / Pick labels render; step 2 shows **Your want** with Start/End first.
  - Star is disabled before any change, enables after Start changes to 20 Oct,
    and highlights after saving.
  - Back to step 1 shows `★ 20–31 Oct` under 1HB.
  - Deselecting and reselecting 1HB, then Next, re-applies the saved want:
    step 2 opens on **20 Oct 2026**. **PASS**
- Simulator, TG 35459: `.maestro/tg_duty_swap_gate.yaml` → **PASS**; TG sees its
  own Duty Swap preview, no PR crew IDs. Duty Swap itself is PR-only.
- Not run: the full Air → Duo → iPad matrix. The Air was owned by another active
  session and both booted simulators were contended, repeatedly killing the
  Maestro XCUITest driver mid-flow. Air partial capture confirms Match/Pick
  rendering. Residual risk: Duo inner-screen and iPad large-layout rendering of
  the new step-2 summary/chips (Jest covers all six reference viewports).
- Screenshots: `docs/assets/screenshots/crew-app/match-mode-want-Ver1-01-give.png`
  through `-06-reapplied.png`; TG gate `duty-swap-tg-preview-Ver2.png`.
