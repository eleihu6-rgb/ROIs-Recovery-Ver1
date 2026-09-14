# S2 (ET / ADD) — FDP discretion send, reject, resend, reject

Tested 2026-09-13, America/Vancouver. Live stack: live-server `:3000`, schema `f8_sit_live`.
Prepared fixture: pairing **152675** duty **1**, crew **T2001 / T2021 / T2022**. No commit or push.

## Objective

Exercise the crew-agreement communication loop for the ET case end to end through the real
HTTP services: **send → T2001 says No → send again → T2001 says No**, confirming the first
proposal is superseded by the resend and that consent never completes.

## Blocker found and fixture preparation

`GET /api/crew-app/v1/discretion-duty/152675/1` returned

```
409 Authoritative duty report, release and FDP values must be calculated before requesting agreement.
```

`pairing_segment.duty_act_fdp_min` is **null** for this pairing: the app-built ET pairing was never
given an operated FDP, and the exchange-rate `/flight` delay path only refreshes
`duty_sch_fdp_min` (`flight-delay-propagation-service.ts`), never `duty_act_fdp_min`. Without an
authoritative operated FDP no FDP-discretion request can be prepared for the ET case at all.

Reversible preparation (`.local/s2-et-consent/prepare-consent-duty.cjs`, `updated_by =
's2_et_consent_prep'`) set `duty_act_fdp_min = 855` on the two duty-1 segments of 152675
(check-in 02:00Z → release 16:15Z as the services read the window). Undo with
`.local/s2-et-consent/restore-consent-duty.cjs`.

Note: the fixture's delay (ET2681 +2h) does **not** change the duty's FDP — the turnaround absorbs
it and the duty still ends at the same time. The prepared `after` FDP therefore differs from the
scheduled FDP only through the operated-FDP stamp; this test validates the **communication state
machine**, not a genuine FDP exceedance. A real FDP-extension case needs the delay to move the last
leg of a duty.

## Observed results

`GET /discretion-duty/152675/1` → `airline F8`, crew `T2001, T2021, T2022`,
label `ET2681/ET2682/ET2683/ET2684`, before FDP **840**, after FDP **855**.

| Step | Call | Observed |
|---|---|---|
| Send #1 | `POST /crew-app/v1/discretion-requests` | proposal `0798d7fd-2da9-49b9-986c-c779cc70d99b`; three recipients pending |
| T2001 No #1 | `POST /crew-app/v1/discretion/<id>/decision {decision: reject}` | `state=rejected`, `decidedBy=T2001`, reason recorded |
| Feedback #1 | `GET /crew-app/v1/discretion-requests/<p1>` | `consentComplete=false`; `T2001:rejected, T2021:pending, T2022:pending` |
| Send #2 | `POST /crew-app/v1/discretion-requests` | proposal `787741c7-915e-4cb4-a2db-4a71bd92e821`; three recipients pending |
| Feedback #1 after resend | `GET /crew-app/v1/discretion-requests/<p1>` | all three rows `superseded`, `supersededBy=<p2>` |
| T2001 No #2 | `POST /crew-app/v1/discretion/<id>/decision {decision: reject}` | `state=rejected`, reason recorded |
| Feedback #2 | `GET /crew-app/v1/discretion-requests/<p2>` | `consentComplete=false`; `T2001:rejected, T2021:pending, T2022:pending`; proceed reason "All required crew must agree to the unchanged proposal." |
| T2001 history | `POST /crew-app/v1/discretions` | newest first: `787741c7 rejected`, `0798d7fd superseded` |

Persisted rows (`f8_sit_live.crew_notification`, `notif_type='fdp_discretion'`,
`related_pairing_id=152675`), newest first:

| seq | crew | proposal | state | supersededBy | decision reason |
|---|---|---|---|---|---|
| 36 | T2022 | 787741c7 | pending | — | — |
| 35 | T2021 | 787741c7 | pending | — | — |
| 34 | T2001 | 787741c7 | rejected | — | Crew still cannot extend the duty |
| 33 | T2022 | 0798d7fd | pending | 787741c7 | — |
| 32 | T2021 | 0798d7fd | pending | 787741c7 | — |
| 31 | T2001 | 0798d7fd | rejected | 787741c7 | Crew cannot extend the duty |

`consentComplete` stayed false and `proceedAllowed` stayed false in both rounds, so consent never
authorised execution — consistent with the recovery message "Crew agreement communication only;
Apply remains disabled until independent FDP legality execution is implemented".

## Findings for the Recovery-UI feature

1. **`duty_act_fdp_min` is required but not produced for app-built pairings.** The recovery-UI
   "Request Crew FDP discretion" action (and the existing Edit Duty Node composer) will 409 for the
   ET case until either the operated FDP is stamped or `prepareConsent` derives it from the
   authoritative duty window when the column is null.
2. **This fixture is not a genuine FDP extension.** Delaying the first leg only increases waiting
   time; the duty period is unchanged. For a defensible discretion case the delay must move the
   last leg of a duty (or the operated FDP must genuinely exceed the limit).
3. **Resend semantics are already correct.** A second send supersedes the whole first recipient
   group atomically; a rejected row keeps its decision reason and gains `supersededBy`.
4. **Timezone caveat.** The consent window is built from the `to_jsonb` path, which renders the
   timestamp-without-timezone columns as `02:00Z / 16:15Z`, while a direct `pg` select of the same
   column returns `09:00Z / 23:15Z`. The proposal is internally consistent, but the two read paths
   disagree by the session offset. Worth confirming before the controller and crew screens are
   compared side by side.

The two rejected proposals are intentionally left in SIT so the recovery UI can be built against a
real "Crew rejected" state (requirement: after a rejection, Standby Crew callout becomes the best
available answer).
