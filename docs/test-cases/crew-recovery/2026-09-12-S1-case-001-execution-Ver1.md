# Case 001 — J4002 unavailable at ADD: execution record

**Executed:** 12 September 2026. **Result:** Partial; absence persisted, mobile confirmation failed, all three requested recovery methods blocked at entry. **Client-demo readiness:** suitable for demonstrating the observed absence workflow and gaps, **not** a successful three-option recovery demonstration.

This is an actual-data test, not the illustrative SIN–LHR narrative. J4002 is an ADD-based crew member. No unrelated crew/base regression is part of this incident.

## 1. Fixture, actors and time conventions

| Field | Verified value |
|---|---|
| Crew actor | J4002 — Getnet Kifle; ET; ADD base; CA; fleet 7M8 |
| Crew-control actor | Test operator in the authenticated controller UI, acting in Ryan's requested controller role; do not infer audit username from the business narrative |
| Source pairing | 152056; six legs, home-base round trip ADD → DAR → ADD → MGQ → ADD → DAR → ADD |
| Original flying rows | 1354282–1354287 |
| Baseline composition | CA plan 2 / fill 2; FO plan 2 / fill 2 |
| Absence submitted | Sick leave, 25–26 September 2026, note `S1-20260912-J4002-ADD case study` |
| Resulting identifiers | Absence 9; ILL roster rows 1354950 and 1354951 |
| Preserved prior incident | Absence 3, September 11; previously removed pairing 151529; older ILL row 1354921 |
| Neighbouring duties checked | Pairings 151839 and 151991, two rows each |
| Controller route | https://cr.rois.one/altair/ — served by verified Vite 5567, Live API 3000 |
| Mobile | React Native Crew App, iPhone Air simulator; Maestro drives actual UI |
| Model/engine | Absence API and roster persistence; existing Recovery UI eligibility checked. No recovery solver or AI model was invoked successfully for this incident |

Flight times below are **UTC**, read without machine-local timestamp conversion. Absence calendar dates use ADD local time (UTC+3). The two ILL windows returned to the browser were September 24 21:00Z–September 25 20:59:59Z and September 25 21:00Z–September 26 20:59:59Z. Mac test clock was America/Vancouver. The absence UI's Submitted time was inconsistent with the actual test clock; it is not a valid latency measurement.

| Date (2026, UTC) | Flight | Route | Departure–arrival |
|---|---|---|---|
| Sep 24 | ET805 | ADD–DAR | 05:10–08:00 |
| Sep 24 | ET802 | DAR–ADD | 08:50–11:30 |
| Sep 24 | ET378 | ADD–MGQ | 11:55–14:10 |
| Sep 25 | ET377 | MGQ–ADD | 08:55–10:55 |
| Sep 25 | ET803 | ADD–DAR | 12:05–14:55 |
| Sep 25 | ET804 | DAR–ADD | 15:45–18:25 |

## 2. Detailed action log

Screenshot links are original UI captures, not mockups. “Blocked” means the requested method could not be entered; it does not mean a solver searched and found no feasible candidate.

| Step | Crew control | Crew | Module/model | Exact action and expected result | Actual result/status | Snapshot / remarks |
|---|---|---|---|---|---|---|
| 1 | — | J4002 | Crew App home | Open the logged-in crew schedule and establish identity before editing. Expect the intended ADD captain, not another fixture. | PASS: J4002 / Getnet Kifle established. | [Crew home](../../assets/screenshots/crew-recovery/s1-01-crew-home-Ver3.png). Base/rank/fleet also checked against data. |
| 2 | Test operator | — | Live → Filter | Select pilot division, ADD base, Crew ID J4002; Pairing tab → ID 152056. Include Full coverage for baseline. Apply. | PASS: coherent ADD source fixture loaded. | [ADD filter](../../assets/screenshots/crew-recovery/s1-04-add-filter-Ver1.png). Capture baseline before the mutation. |
| 3 | Test operator | — | Crew Absence | Search J4002, From Sep25, To Sep26. Expect no incident in this test window. | PASS: empty before submission. Prior September11 absence is outside the search window and must remain. | [Empty baseline](../../assets/screenshots/crew-recovery/s1-05-no-absence-before-Ver1.png). |
| 4 | — | J4002 | Crew App absence form | Open absence request; choose Sick Leave; set Sep25–26; enter unique case note. Review Affects preview before submit. | PASS with scope caveat: preview listed last three flights, but the request cancels the whole pairing. | [Dates](../../assets/screenshots/crew-recovery/s1-02-absence-dates-Ver3.png), [submit-ready preview](../../assets/screenshots/crew-recovery/s1-03-submit-ready-Ver4.png). Do not describe the preview as the full cancellation footprint. |
| 5 | — | J4002 | Crew App → absence API | Submit once. Expect successful confirmation, committed absence and notification. | FAIL confirmation: “Unable to submit”. Subsequent persistence checks proved absence 9 committed. | [Mobile error](../../assets/screenshots/crew-recovery/s1-06-mobile-error-Ver1.png). Do not retry blindly: a UI failure is not proof of rollback. A prior click intercepted by development LogBox did not establish submission. |
| 6 | Test operator | — | Crew Absence | Repeat exact crew/date search; inspect request row and affected pairing. | PASS persistence: absence 9 references crew J4002 and pairing 152056. | [Absence record](../../assets/screenshots/crew-recovery/s1-07-absence-record-Ver1.png). No separate approval gate was observed. Submitted timestamp is unreliable in this run. |
| 7 | Test operator | J4002 affected | Live roster + pairing pane | Refresh roster, inspect Sep24–26. Verify every original leg and both ILL days, not just the form preview. | PASS stand-down: all six original rows soft-deleted; two ILL rows created; captain fill reduced to 1 of 2. FO remains 2 of 2. Neighbouring duties unchanged. | [Stand-down](../../assets/screenshots/crew-recovery/s1-08-stand-down-Ver4.png), [automated receipt](../../assets/screenshots/crew-recovery/s1-verified-stand-down-Ver1.png). |
| 8 | Test operator | No replacement selected | Option 1: airport standby entry | Right-click J4002 roster row and look for Recovery; expected standby candidate search, then eligibility, legality and cost preview. | BLOCKED: no Recovery action on this row after absence deassignment. No candidate generated or selected. | [Option 1 menu](../../assets/screenshots/crew-recovery/s1-09-option1-roster-menu-Ver1.png). This is not evidence of reserve-pool depletion. |
| 9 | Test operator | No donor selected | Option 2: swap/move-up entry | Inspect pairing context and Alert Center; select applicable recoverable alert before attempting swap preview. | BLOCKED: J4002 alerts 7505, 7305, 7508 all exposed `data-recoverable=false`; Recovery selected disabled. | [Option 2 Alert Center](../../assets/screenshots/crew-recovery/s1-11-option2-alert-center-Ver1.png). No donor pairing, swap or cascade evaluated. |
| 10 | Test operator | J4002 remains unavailable | Option 3: flight-delay entry | Right-click September25 ILL duty; look for Recovery/delay preview. | BLOCKED: ground-task context menu has no Recovery entry. No delay created. | [Option 3 ILL menu](../../assets/screenshots/crew-recovery/s1-12-option3-ill-menu-Ver1.png). No reserve shift-refresh time or passenger cost was generated. |
| 11 | — | J4002 | Crew App Alerts / notifications | Open Alerts and verify request-related delivery. Expect authenticated notifications. | FAIL/UNVERIFIED delivery: “Sign in to view notifications”; no DB notification `absence-9`. | [Crew Alerts](../../assets/screenshots/crew-recovery/s1-13-crew-alerts-Ver1.png). Keychain warning was observed; causation of the post-commit error is not established. No crew-notification, hotel/transport, manifest or APIS success claimed. |
| 12 | Test operator | J4002 | Scoped database restoration + cache refresh + Live UI | Restore only this request's changes; then fresh-login UI checks of assignments, ILL removal, full coverage and absence search. | Business baseline restored; see reset receipt and final verification below. | Keep audit history honest; do not reset earlier absence 3 or unrelated rosters. |

## 3. Individual option comparison

| Requested option | Entry test | Candidates / legality | Cost / score / reserve consumption | Apply / Save / execution |
|---|---|---|---|---|
| 1 Airport standby call-out | BLOCKED, roster menu lacks Recovery | Not generated / not evaluated | Not generated, **not zero** | Not performed |
| 2 Swap / move-up | BLOCKED, alerts non-recoverable | Not generated / not evaluated | Not generated, **not zero** | Not performed |
| 3 Flight delay | BLOCKED, ILL menu lacks Recovery | Not generated / not evaluated | Not generated, **not zero** | Not performed |

The existing Recovery entrance depends on an assigned pairing with supported 1001 overlap or 8004 qualification context. Absence removed that assignment and did not provide an open-seat recovery handoff. Current swap semantics return duty to the source crew; current delay keeps the source crew after the ground-task end plus 61 minutes. These must not be relabelled as unavailable-captain move-up or reserve-refresh delay without implementation and new tests.

There was no selected winning option. Three named recovery methods are not three feasible, ranked options. Seniority compliance, reserve-hour minimization, legal replacement, composite score and zero downstream impact remain unproved.

## 4. Restoration and replay contract

The authorized restoration transaction preflight-checked and locked absence 9, its exact note/dates/crew, and the eight request-owned roster rows. It removed only ILL 1354950/1354951, restored original flying 1354282–1354287, cleared their request fields, deleted absence 9 and any exact notification absence-9, and recomputed pairing composition with the existing formula. It retained absence 3 and prior ILL. Audit `updated_by=S1_CASE_RESTORE` records the restoration rather than falsifying history.

Initial database reset passed, but visual inspection found stale CA(2:1) in the pairing list. The specific cached list containing pairing 152056 was invalidated; roster version and pairing detail/composition caches were also refreshed. The focused test now asserts pairing composition, not merely restored assignment IDs.

Replay starts with six assigned legs, CA 2/2 and FO 2/2, no September25–26 absence, and the older September11 incident intact. Open a fresh Crew App view and recheck identity/dates before a new submit; the mobile app's reset display was not independently revalidated after database reset. New submission IDs will differ. **Never rerun the old destructive reset script against a new request without rebuilding its ownership manifest.**

## 5. Evidence and verification receipts

Local harnesses under `.local/s1-case/` hold private baseline and transaction receipts; they are not portable fixtures and are not published with credentials.

| Command / check | Result |
|---|---|
| `maestro test .local/s1-case/mobile-open.yaml` | PASS, form navigation |
| `maestro test .local/s1-case/mobile-submit-resume.yaml` | FAIL expected success; actual request committed as 9 |
| `maestro test .local/s1-case/mobile-error-evidence.yaml` | PASS observed error assertion and snapshot |
| `maestro test .local/s1-case/mobile-alerts.yaml` | PASS navigation/capture; notification workflow itself failed authentication |
| `S1_STATE=stand-down … node /tmp/rois-s1-tools/node_modules/@playwright/test/cli.js test -c e2e/config/recovery-case-study.config.ts --grep 'verify recorded'` | PASS, 1 test, pre-reset stand-down |
| `node .local/s1-case/restore.cjs` | PASS exact transaction and initial cache reset; do not rerun after restoration |
| `node .local/s1-case/cache-reset.cjs` | PASS, one pairing-list cache containing 152056 invalidated |
| `S1_STATE=restored GANTT_TEST_USER=<secure-env> GANTT_TEST_PASS=<secure-env> node /tmp/rois-s1-tools/node_modules/@playwright/test/cli.js test -c e2e/config/recovery-case-study.config.ts` | PASS, 2/2 tests (47.2s), including refreshed CA/FO coverage assertion |
| `npm run check:ui -- gantt/src/components/help/topics/recovery/recovery-case-001.tsx` | PASS |
| `node scripts/check-help-menu-coverage.mjs` | FAIL existing unrelated Legality menu helpTopicSlug and System Interface topic gaps; not repaired in this case |
| `git diff --check` | PASS at delivery check |

Published Help: [Recovery → Case study 1 — J4002 unavailable at ADD (Partial)](https://cr.rois.one/altair/help), immediately after Comparing recovery costs (Partial). The focused browser test checks order, loaded images, honest failure wording, desktop/narrow layout and exclusion of unrelated base examples.

## 6. Next cases / engineering follow-up

1. Fix or diagnose post-commit error and notification authentication/delivery; distinguish retry-safe response from persisted business success.
2. Define absence-to-open-seat Recovery handoff and unavailable-crew exclusion before promising standby/swap/delay recovery.
3. Establish real reserve/donor fixtures and business-approved cost components/weights, rank/fleet/qualification/seniority and reserve limits.
4. For each option: capture preview, legality, costs, downstream changes, Apply draft, Save, execution status and independent reset. Validate external execution with genuine receipts, not an inferred CCX package.
5. Re-run Case 001 after fixes; preserve this version's failed/blocked evidence. Use the reusable [crew recovery skill](../../../.agents/skills/145-crew-recovery-case-study/SKILL.md) for later cases.

### Final reset evidence

Fresh-session Playwright passed both tests after list-cache invalidation. Visually inspected [restored roster and full CA(2)FO(2) badge](../../assets/screenshots/crew-recovery/s1-verified-restored-Ver2.png) and [empty test-window absence search](../../assets/screenshots/crew-recovery/s1-verified-restored-absence-Ver2.png). The UI header identifies the signed-in controller as **Ryan**. All nine optimized Help images were visually inspected; the option-2 embedded crop shows the J4002 alert rows, while the linked full original preserves wider dialog context.

Skill validation: `PYTHONPATH=/tmp/rois-s1-skill-validator python3 /Users/kimi/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/145-crew-recovery-case-study` — **PASS**. No commits or pushes performed.
