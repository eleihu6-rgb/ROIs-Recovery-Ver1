# Recovery UI — Request Crew FDP discretion (delivery record)

Delivered 2026-09-13, America/Vancouver. Design:
[2026-09-13-recovery-fdp-discretion-request-design.md](../../superpowers/specs/2026-09-13-recovery-fdp-discretion-request-design.md).
No commit or push.

## What shipped

The FDP-extension agreement can now be driven from the **Recovery** dialog, not only from the
Edit Duty Node dialog:

| Requirement | Implementation |
|---|---|
| Request action in the Recovery option row, before the Preview icon | `FdpDiscretionActionButton` rendered in the FDP Discretion option's ACTIONS cell, ahead of `Preview`/`Detail` |
| Offered only for a crew who can extend | the action is enabled only after `GET /crew-app/v1/discretion-duty/:pairingId/:dutySeq` resolves; a 409 keeps it disabled and shows the server reason as the tooltip |
| Communication status | row chip with `Not sent yet`, `Sent · waiting for crew`, `Sent · n of m replied`, `Crew accepted`, `Crew rejected`, `Expired · no reply`, `Duty changed · request again`; the button reads `Request FDP discretion` / `Resend` / `Send again` |
| Feedback aligned with the caveat | every chip tooltip and the request dialog carry "Crew agreement communication only; Apply remains disabled until independent FDP legality execution is implemented." |
| Rejection ⇒ next best solution | a rejected (or expired) outcome shows the inline hint "…Standby Crew callout is the next best solution", a one-click switch, and a **Recommended next** badge on the Standby group |

Server: `prepareConsent` now derives the operated FDP from the authoritative duty window when
`pairing_segment.duty_act_fdp_min` is empty, so an app-built pairing with a published delay can be
proposed instead of failing with a hard 409.

## Files

- `gantt/src/components/recovery/fdp-discretion-action.tsx` (new): status derivation, chip, button, request dialog, `useFdpDiscretionConsent` hook.
- `gantt/src/components/recovery/recovery-violation-dialog.tsx`: hook wiring, row chip + action + fallback hint, Standby "Recommended next" badge, lifted `fdpConsentStatus`.
- `live-server/src/services/crew-notify/discretion-consent-service.ts`: derived operated-FDP fallback.
- Tests: `gantt/src/components/recovery/__tests__/fdp-discretion-action.test.ts`,
  `live-server/.../discretion-consent-service.test.ts` (new fallback case),
  `e2e/tests/gantt/recovery-case-002-fdp-discretion.spec.ts` (new real-UI spec).
- Help (skill 003): `recovery-case-002.tsx` steps 5–6 + `help-data.ts` overview + two refreshed screenshots.
- `gantt/src/version.ts`: `FRONTEND_VERSION` 455 → 456, `BACKEND_VERSION` 231 → 232.

## Fixture used

Pairing **152675** duty **1** needed an operated FDP before any request could be prepared;
`.local/s2-et-consent/prepare-consent-duty.cjs` (reversible via `restore-consent-duty.cjs`) stamped
`duty_act_fdp_min = 855`. T2001's rejected proposals from the same day give the row a real
**Crew rejected** state.

## Verification

| Command | Result |
|---|---|
| `gantt: npx vitest run src/components/recovery/__tests__/` | **PASS** 6/6 (2 files) |
| `live-server: npx vitest run src/services/crew-notify/__tests__/discretion-consent-service.test.ts` | **PASS** 8/8 |
| `e2e: npx playwright test --project=gantt tests/gantt/recovery-case-002-fdp-discretion.spec.ts` | **PASS** 1/1 — asserts the action precedes Preview (`boundingBox().x`), the `Crew rejected` chip, the Standby fallback hint and the `Recommended next` badge |
| `e2e: npx playwright test --project=gantt tests/gantt/help/` | **PASS** 75/75 |
| `e2e: npx playwright test --config=config/case3.config.ts tests/gantt/recovery-case-003-options.spec.ts` | **PASS** 1/1 (no recovery-dialog regression) |
| `npm run check:ui` | **PASS** 0 hard violations |
| `gantt: npx tsc --noEmit` | only the pre-existing `service-status-pill` errors |
| `git diff --check` | **PASS** |

Screenshots (`docs/assets/screenshots/crew-recovery/`), reviewed with
`scripts/screenshot-review/review.mjs --vision`: `case2-fdp-discretion-rejected-Ver1.png` (rejected
chip + "Standby Crew callout is the next best solution"), `case2-fdp-standby-recommended-Ver1.png`
(Standby group marked "Recommended next"), `case2-fdp-request-dialog-Ver1.png`.

## Open finding — "move the delay to the last leg" is not a safe one-line fixture change

Making the ET delay genuinely exceed the FDP runs into the product's own column semantics:

- `check-3007` reads **`duty_sch_fdp_min`** (`live-server/scripts/legality-recheck-core.mjs`, `fdpMin: r.duty_sch_fdp_min`), and `flight-delay-propagation-service.ts` overwrites that same column with the post-delay duty period so 3007 fires.
- The consent proposal reads **`duty_sch_fdp_min` as `before`** and **`duty_act_fdp_min` as `after`**.

So if the delay overwrites the planned column, a genuine 3007 and a non-zero consent `before → after`
delta cannot both hold: `before` becomes the already-extended value and equals `after`. Delaying the
last leg of duty 1 (ET2682) would also push release to ~01:15Z and put the duty-1 → duty-2 rest gap
at ~9h45, which may add an unrelated rest finding. Delaying the pairing's last leg (ET2684) avoids
the rest issue but the Recovery option is built from the **first** duty (`firstDutySeq`), so the
extended duty would not be the one the FDP row proposes.

Two coherent options, both needing a product decision before touching the Case-2 data:

1. **Keep the current model** (delay overwrites `duty_sch_fdp_min`): the case gets a real 3007 but the
   consent `before`/`after` are equal — the crew is asked to agree to a duty that already breached
   the limit, which the caveat says consent cannot fix.
2. **Read the operated FDP in the legality recheck** (`coalesce(duty_act_fdp_min, duty_sch_fdp_min)`)
   and keep `duty_sch_fdp_min` as the pre-delay plan: real 3007 *and* a meaningful before → after
   delta. This changes legality-engine input semantics and must be agreed with the C++ parity owner
   (see `docs/dev-context/2026-09-13-live-server-rule-3007-fdp-delay.md`).

Recommended: option 2, because it is the only one that makes the FDP-discretion request meaningful;
until then Case 2 stays as documented (Partial, delay on ET2681, frontend published-delay 3007 rows).
