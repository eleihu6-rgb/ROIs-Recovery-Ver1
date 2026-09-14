# Recovery UI — Request Crew FDP discretion (design)

Date: 2026-09-13. Owner: recovery UI. Skill: 003 (Help follows the shipped UI).

## Why

The FDP extension agreement today can only be started from the **Edit Duty Node** dialog
(`DiscretionConsentComposer`). The Recovery dialog exposes the same composer only inside the
option's *Detail* panel, so a planner reviewing a published-delay incident has no direct action and
no view of whether the crew were already asked. Ryan's request:

1. keep the Edit Duty Node entry;
2. add a **Request Crew FDP discretion** action in the Recovery option row, in the ACTIONS cell
   **before the Preview icon**, offered only for a crew who can extend the FDP;
3. show the communication status (not sent / sent-waiting / partially replied / accepted /
   rejected / expired / superseded) with a **Resend** path, phrased consistently with
   "Crew agreement communication only; Apply remains disabled until independent FDP legality
   execution is implemented.";
4. when the crew reject, surface **Standby Crew callout** as the next best answer.

## Status model

Derived from the existing controller feedback (`GET /crew-app/v1/discretion-requests/:proposalId`),
which already returns one row per assigned crew:

| Derived status | Condition | Label | Action |
|---|---|---|---|
| `not-sent` | no proposal for this pairing/duty/requester | Not sent yet | Request FDP discretion |
| `sent` | every recipient `pending` | Sent · waiting for crew | Resend |
| `partial` | some replied, none rejected | Sent · n of m replied | Resend |
| `accepted` | every recipient `accepted` | Crew accepted | Send again |
| `rejected` | any recipient `rejected` | Crew rejected | Resend |
| `expired` | any `expired`, none rejected | Expired · no reply | Resend |
| `superseded` | any `superseded` | Duty changed · request again | Resend |

A second send supersedes the whole previous recipient group (server behaviour, verified
2026-09-13). `rejected` and `expired` never complete consent.

## Rules

- **Server unchanged** except one fallback: `prepareConsent` derives the operated FDP from the
  authoritative duty window when `pairing_segment.duty_act_fdp_min` is null, so an app-built ET
  pairing with a published delay can be proposed (previously a hard 409).
- **Eligibility.** The action appears on the `fdp-discretion` option only when the request can be
  prepared (authoritative report/release/FDP present and the crew share one supported airline).
  When the prepare call fails, the row shows the server reason instead of the button — a crew who
  cannot extend is never offered the action.
- **Messaging.** Every status chip carries the canonical sentence as its tooltip, and the request
  dialog repeats it. Consent is communication; Apply stays disabled.
- **Rejection ⇒ Standby.** A `rejected` (or `expired`) outcome marks the **Standby Crew callout**
  group "Recommended next", shows an inline hint on the FDP row and offers a one-click switch to
  that group. The recommendation is advisory — nothing is auto-applied.
- **No roster write.** This feature only creates/reads `crew_notification` consent rows; it never
  writes a roster draft or an FDP override.

## Verification

- Unit: `deriveFdpConsentStatus` for every status branch.
- Server: `prepareConsent` derived-FDP fallback unit test.
- Real UI (skill 003 / AGENTS.md): open Recovery on the ET published-delay case (pairing 152675),
  assert the action sits before Preview, the status chip reads the live consent state (T2001 has a
  rejected proposal from 2026-09-13), and the Standby group shows "Recommended next". Screenshot
  under `docs/assets/screenshots/crew-recovery/`.
