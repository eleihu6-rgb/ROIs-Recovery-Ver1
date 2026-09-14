# S2 crew agreement — message-detail enhancement (validation receipt)

Companion to [2026-09-12 S2 discretion consent evidence](2026-09-12-S2-discretion-consent-evidence-Ver1.md)
and the design + addendum in
[`docs/superpowers/specs/2026-09-12-S2-discretion-consent-design.md`](../../superpowers/specs/2026-09-12-S2-discretion-consent-design.md).

## Scope and the three review points

Ryan's 2026-09-13 review of the first crew-app card asked for (1) duty-level detail
because **FDP is a duty property**, (2) a real FDP *difference* instead of the same
number twice plus the missing duty context, and (3) the affirmative on the left.
Point 3 also asked for a **Home quick action** so a crew can read pending and past
discretion themselves, like the Absence history entry.

| Review point | What changed | Where |
|---|---|---|
| Full duty-level detail | Immutable `payload.duty` snapshot: check-in/report, release, every flown leg (schedule vs published revised time + derived delay), FDP before → after | `live-server/src/services/crew-notify/discretion-consent-service.ts` (`ConsentDutyDetail`, `buildDutyDetail`, `createConsent`) |
| FDP actually differs | Card shows `FDP current → FDP proposed` +Δ and the recalculation note; the profile is driven by the authoritative duty period (`duty_act_fdp_min`), not a copy of the planned value | `crew-app/src/features/notifications/DiscretionCard.tsx` (`fdpExtension`) |
| Yes on the left | Yes pill first, No second, on both the Alerts card and the Home page | `DiscretionCard.tsx` actions row |
| Home entry | Home ▸ Quick actions ▸ **Discretion** → pending + history page | `crew-app/src/features/v2/HomeScreen.tsx`, `DiscretionScreen.tsx`, `nav.ts`, `V2Navigator.tsx`; route `POST /crew-app/v1/discretions` |

This is presentation of the existing consent, not a new approval path: no roster
write, no `duty_fdp_discretion_min` write, and the controller panel and
`consentComplete` behaviour are unchanged.

## Fixture

Isolated S2 pairing **152548**, duty **1**, **PI201/PI202 SIN–HKG–SIN**, 28 Sep 2026,
crew **S21001/S21014/S21015** (F8 / `f8_sit_live`). The published PI202 return leg was
delayed **+2h** (estimate `13:00Z → 17:00Z`) and the duty period re-stamped
`duty_act_fdp_min = 780` **before** agreement was requested, so the request is a
genuine proposal over a changed duty (no fingerprint churn after send):

- check-in 28 Sep **04:00Z**, release **15:15Z** (unchanged)
- PI201 SIN→HKG 06:00Z→10:00Z (on schedule)
- PI202 HKG→SIN scheduled 11:00Z→15:00Z, **revised 13:00Z→17:00Z, DELAYED +2h00**
- FDP current **660 min (11h00)** → recalculated **780 min (13h00)**; requested extension +60

Fixture scripts stay local (`.local/s2-msg/`, gitignored):
`delay-consent-duty.cjs` (apply), `restore-consent-duty.cjs` (revert),
`prepare-and-create.ts` (calls the real `prepareConsent` + `createConsent`),
`consent-duty-before.json` (original values). The write touches only flight 160989 and
segments 470001/470002 of this test pairing and is tagged `updated_by='s2_msg_prep'`.

## Observed operations

| Actor | Operation | Observed result | Evidence |
|---|---|---|---|
| Server (real service path) | `prepareConsent` + `createConsent(152548, 1)` | One group, three server-derived recipients, each Pending with `duty` (2 legs, delay 120min, 660→780) | stdout receipt in this session; `crew_notification` seq 27–29 |
| Crew S21001 (iOS Simulator) | sign in F8 → Home → Quick actions → Discretion | Pending card: `CHECK-IN (REPORT) 28 Sep 04:00z`, `RELEASE 28 Sep 15:15z`, PI201 on schedule, PI202 `DELAYED +2h00 13:00z → 17:00z`, `FDP CURRENT 11h00` → `FDP PROPOSED 14h00` +60m, recalc note, **Yes · +60m** left of **No** | `s2-msg-home-quick-action-Ver2.png`, `s2-msg-discretion-details-Ver2.png`, `s2-msg-discretion-history-Ver2.png` |
| Crew S21001 | same request via **Alerts** | Same rich card at the top of the feed (`ACTION REQUIRED`) | `s2-msg-alerts-details-Ver2.png` |
| Crew S21001/S21014/S21015 | tap **Yes**, confirm, **Got it** | `Decision sent · FDP discretion accepted`; card moves to `HISTORY` as `Agreed`; DB row `state=accepted` | `s2-msg-decision-sent-Ver2.png`; seq 21–23 accepted 22:16/22:20:56/22:23:02Z |
| Crew / server | pre-enhancement row (no `duty`) still renders | Falls back to the flat snapshot — no empty/broken card | `s2-msg-discretion-history-Ver2.png` (history rows from the earlier round) |

All screenshots are in `docs/assets/screenshots/crew-app/`: Maestro wrote them during
the same run as the assertions, and each was inspected with
`scripts/screenshot-review/review.mjs <png> --expect ... --vision` (OCR + a real
multimodal read; this runtime has no image input).

## Commands and results

- `cd live-server && npx vitest run src/services/crew-notify src/__tests__/unit/crew-notify-route.test.ts src/__tests__/unit/crew-absence-history-route.test.ts` — **PASS**, 33 tests.
- `cd gantt && npx vitest run src/components/recovery/__tests__/discretion-consent-panel.test.tsx` — **PASS**, 2 tests.
- `cd crew-app && npx jest __tests__/features/discretionScreen.test.tsx __tests__/features/HomeDiscretionQuickAction.test.tsx __tests__/features/notificationsApi.test.ts __tests__/features/notificationsSlice.test.ts` — **PASS**, 22 tests (the page test asserts the duty leg, the Yes/No pills and the decision round-trip).
- `cd crew-app && npx tsc --noEmit` — **PASS**.
- `git diff --check` — **PASS**.
- `./live-server/node_modules/.bin/tsx .local/s2-msg/prepare-and-create.ts` — **PASS**, real `prepareConsent`/`createConsent`.
- `maestro test -e S2_CREW_ID=… .local/s2-msg/f8-discretion-details.yaml` (read-only) — **PASS**, 5 assertions on the duty detail + FDP pair.
- `maestro test -e S2_CREW_ID=… .local/s2-msg/f8-discretion-decide.yaml` (Alerts + Yes) — **PASS**.
- `cd live-server && npx tsc --noEmit` — **FAIL**, unchanged pre-existing `src/services/rule/legality-preview.ts:288` dimension union mismatch, plus `src/services/recovery/transfer-gh-cost.test.ts:168` from a separate in-flight workstream. No discretion file errors.

## Risks, gaps and boundaries

- Only the **live-server (F8/ET)** contract changed. EK continues on the EVACC crew-app
  gateway (separate repo); EK requests carry no `duty`, so EK cards keep the flat
  fallback until that backend is updated. F8/ET are the crew-recovery carriers.
- The delayed estimate is **fixture data** written to SIT for the demo, not a rule-engine
  or legality result. In production the estimate arrives through the normal
  flight-delay publication path; the consent flow only reads the authoritative rows.
- Signature change of the duty **supersedes** an outstanding request by design
  (`sourceHash`); the crew must be asked again. Confirmed here: each new group marked the
  prior group `supersededBy`, replies retained (seq 24–26).
- Rollback: `node .local/s2-msg/restore-consent-duty.cjs` restores the original
  flight/segment values. Restoring while a request is pending will supersede it (same
  fingerprint rule) — expected, not a bug.
- One-shot idempotency, rejection, expiry and the previous round's controller/feedback
  evidence are unchanged and were not re-run.
- The final fixture state is armed for a live demo: proposal **b0b8796f-17bc-4d5e-9d82-0a85f7db986c**,
  S21001/S21014/S21015 Pending with the full duty detail (crew-app password in the
  gitignored `.local/s2-consent/mobile-credentials.json`).
