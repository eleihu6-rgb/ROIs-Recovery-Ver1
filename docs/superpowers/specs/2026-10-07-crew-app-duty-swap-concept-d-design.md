# crew-app Duty Swap — Concept D (Crew Matrix + R'Bot) — Design

Status: APPROVED 2026-10-07 (native portal client · core first, then R'Bot · TST submit+withdraw allowed) · Date: 2026-10-07 · Owner: Ryan
Mockups: `docs/assets/mockups/crew-app/duty-swap-mockups-Ver1.html` (Concept D, D-Search, D-R'Bot rows)
Web reference walkthrough (crew 392923, PR TST, 07 Oct 2026): `docs/assets/mockups/crew-app/duty-swap-web/`

## 1. Goal and scope

Crew (PR first) can find a target crew, compare duties, check legality and send a duty-swap request from the
phone, using the Crew Matrix layout (dates down, Mine + Date frozen, crews across, scroll sideways). R'Bot
helps find the target crew. Concepts A/C may follow later as alternative layouts on the same data layer
(the user will choose among 2–3 implemented concepts), so the data layer and R'Bot contract are
layout-independent.

In scope (Phase 1, "D core"):
1. Duty Swap entry (Home quick action "Duty Swap" — today a `Spec{id:'swap'}` placeholder).
2. Disclaimer (dictionary `DUTY_SWAP_DISCLAIMER_INFO`, shown when `getDisclaimerFlag` is true).
3. Search pairing sheet — every web field (§4).
4. Crew Matrix — my duties + result crews, compact cells with progressive detail (§5.2).
5. Crew-B compare detail — the web's Pairing Info + Duty Info, aligned by date, plus KPI delta (§5.3).
6. Review + Submit (`submitTaskSwap`) — legality runs server-side on submit; Illegal message mapped to plain
   language (§5.4).
7. Records list + withdraw (A) + accept/reject (B) with the web's verify → soft-rule confirm → approve sequence.

Phase 2, "D + R'Bot" (§6): R'Bot shares the screen; finds target crew, sees the screen, takes input.

Later (not in this spec): privacy/friend-list editor, My Duty lock editor, Concepts A/C layouts, TG enablement.

## 2. Portal API contract (captured live, PR TST `…/pefg/apiPortal`)

All calls: header `Authorization: Bearer <token>` + `userId: <crewId>`. Response envelope
`{requestId, code, message, data}`; `code 0` = OK, `code 1` = business error in `message`.

| Use | Method + path | Params / body → data |
|---|---|---|
| Disclaimer flag | GET `/api/portal/taskSwap/getDisclaimerFlag` | → bool |
| Disclaimer text | GET `/api/system/dictionary/getByParentCode?parentCode=DUTY_SWAP_DISCLAIMER_INFO` | → `[{code}]` (text in `code`) |
| Default window | GET `/api/portal/taskSwap/getTaskDefaultStartDate` / `getMyLatestTaskDate` | → `{startDt,endDt}` / `{startDate,endDate}` |
| Search modes | GET `/api/portal/taskSwap/selectSearchModeList` | → `['NS','FS']` (NS=Target, FS=Handshake, AS=General) |
| Type options | GET `/api/portal/taskSwap/selectTaskTypeList` | → `['FLY','ARD','MVP','MVO','XXX','NO_DUTY_DAY','SBY','DO','RDO']` |
| Rank options | GET `/api/portal/taskSwap/getCrewRankList` | → `['CP']` |
| Crew picker | GET `/api/portal/taskSwap/selectCrewList` | → `[{crewId,crewName}]` |
| Port options | GET `/api/airport/findAirportListByPairingDt?startDateTime&endDateTime&isRoster=false` | → `['BKK',…]` |
| Flt No options | GET `/api/flight/findFltNumListByDt?startDateTime&endDateTime` | → `['100',…]` |
| Fleet options | GET `/api/crew/findFleetListByDt?startDateTime&endDateTime` | → `['333','350']` |
| **Search** | GET `/api/portal/taskSwap/selectOtherCrewPublishTask` | `swapMode,startDate,endDate,filterEmptyDutyCrew,durationStart/End,crdStart/End,blhStart/End,briefStart/End` (report time)`,debriefStart/End` (flight end)`,taskTypeList,layoverPortList,layoverTimeStart/End,fltNumList,fltArrList,fltFleetList,crewIdList,activeRankList` → `[{crewId,crewName,cellVoList:[{taskDate,startDt,endDt,taskType,assignment,taskDetail,pairingId,rosterGroundPublishId,status,hasSwap,publishStatus}]}]` — first row is me. FS with no friends → `code 1 "No friends were found."` |
| **Compare detail** | GET `/api/portal/taskSwap/selectTaskCompareList` | same params + `crewIdList=<B>` (repeat-array serializer) → `{mineCrewId,othersCrewId,mineTaskDetailList[],othersTaskDetailList[]}`; each task: `comp,actingRank,startDateTime(Local),endDateTime(Local),layoverPort,layoverTime,fdp,blh,crd,duration,assignment,segmentDetailVoList:[{fltDt,fltNo,ac,dep,arr,std,sta,brief,debrief,blh,fdp}]` |
| **Submit** | POST `/api/portal/taskSwap/submitTaskSwap` | `{mineCrewId,minePairingIdList,mineRosterGroundPublishIdList,othersCrewId,othersPairingIdList,othersRosterGroundPublishIdList,swapMode,comments}`; Illegal → `code 1`, message e.g. `[RuleCheck]Others\r\n08-Oct-2026~12-Oct-2026,Rule ID:8004036,Basic Competency` |
| Records | GET `/api/portal/taskSwap/selectRequestRecordList` | paged `{records,total,size,current}`; statuses Pending(OTH/ME/ADM), Withdrawn(OTH/ME), Unsuccess, Approved, Chanced, Canceled |
| Record detail | GET `/api/portal/taskSwap/selectRecordDetail?recordId=` | → `{remark, comments, …}` |
| Withdraw (A) | PUT `/api/portal/taskSwap/withdrawnRequest?recordId=` | |
| Pre-check accept (B) | GET `/api/portal/taskSwap/verifyTaskStatus?recordId=` | `code 1` + `[RuleCheck]…` = hard rule → web auto-rejects with `remark`; `[CBA][RuleCheck]…` = soft rule → crew confirms, then accepts with `violationComments` |
| Soft-rule flag (B) | GET `getSoftCrewViolationFlag` (path from bundle) | true → confirm dialog before accepting |
| Accept / reject (B) | PUT `/api/portal/taskSwap/respondentApproval` | `{recordId, approveState:true, violationComments?}` / `{recordId, approveState:false, remark?}` |
| My duties | GET `/api/portal/taskSwap/selectMyTaskList` | publish status per duty |

KPI delta (FDP/BLH/Credit/DO) is computed client-side by the web (no call while selecting); the app does the
same from `fdp/blh/crd` of the selected tasks.

## 3. Architecture

### 3.1 Portal access (DECISION NEEDED)
Today native code never holds a portal token: login runs in the visible capture WebView
(`portalInjectedJs.ts` `directAuth`: RSA(JSEncrypt from CDN) → POST `/login` → `data.token`), the token lives
in `window.__royce.token`, and the WebView unmounts after capture. Duty Swap needs live calls.

- **Option N (recommended): native `portalClient`.** `src/features/portal/portalClient.ts`: `login()` =
  GET `/system/getPublicKey` → RSA-PKCS#1 v1.5 encrypt password → POST `/login`; token kept **in memory only**;
  re-login once on 401/expired using the Keychain password (`sessionStore.loadSession`). Needs an RSA
  encrypt implementation in the bundle: vendor `jsencrypt` (MIT, ~6.7k★, same lib + version 3.3.2 the
  WebView already loads from jsDelivr) or add `node-forge` (BSD-3, already in the lockfile transitively).
  Fast (no WebView), unit-testable with mocked `fetch`, and also lets the capture path drop its CDN fetch later.
- **Option W: hidden WebView bridge.** Mount a 1×1 WebView with `source={{html, baseUrl: portal origin}}`,
  reuse `directAuth`, expose a `postMessage` RPC `{id, method, path, params, body}` → `{id, status, json}`.
  No new npm dependency, but keeps the runtime CDN script, adds WebView lifecycle/latency to first paint,
  and is hard to unit-test.

### 3.2 Modules (crew-app)
```
src/features/portal/portalClient.ts        auth + request<T>() envelope unwrap (Option N)
src/features/dutySwap/dutySwapApi.ts       typed wrappers for §2 endpoints, params builder
src/features/dutySwap/dutySwapModel.ts     pure: cell levels, row layout, delta calc, illegal-message parse,
                                           record-status labels, search→params mapping
src/features/dutySwap/dutySwapSlice.ts     filters, results, selected crewB, selected duties, records, status
src/features/dutySwap/DutySwapScreen.tsx   matrix screen (+ R'Bot panel slot in Phase 2)
src/features/dutySwap/components/          CrewMatrix, MatrixCell, SearchSheet, CompareDetail, SwapTray,
                                           ReviewSheet, RecordsScreen
```
Route: `DutySwap` + `DutySwapRecords` in `V2StackParamList`/`V2Navigator`; Home quick action points there.
Shown only when the carrier's portal supports it (PR now; capability flag on `Airline.portalConfig`), so TG
does not get a dead entry. Pop-ups use `components/v2/AppDialog.tsx`; colours from `useCarrier()`/`theme.ts`;
icons from the shared outline set; every `Modal` gets `supportedOrientations`.

## 4. Search pairing (all web fields)
Mode (Target/Handshake, from `selectSearchModeList`), Start* / End* (default from `getTaskDefaultStartDate`),
Duration, CRD, BLH, Report Time, Flight End, Type (`selectTaskTypeList`), Layover Port + Hours, Flt No., ARR,
Fleet, Crew ID (`selectCrewList`), Rank (`getCrewRankList`), Hide crew without duties; Reset / Search.
Saved searches (web folder/star) are stored locally per crew (AsyncStorage) in Phase 1. Option lists load
lazily when the sheet opens, never before first paint. Layout per device class as in the mockups (compact
sheet; Duo inner = form one side of the hinge, live matrix preview the other).

## 5. Crew Matrix

### 5.1 Grid
Rows = local dates of the window; frozen columns Mine (+ my rank·fleet) and Date; crew columns scroll
horizontally (sync vertical scroll between frozen and scrolling parts). Column counts: Air portrait 3 + peek,
Air landscape 6, Duo outer portrait 3 + peek, outer landscape 5, inner landscape 6 (+ summary rail, a column
edge on the hinge), inner portrait 4. Multi-day duties are one vertical block spanning their rows. Rows of the
duty being given are tinted across all columns. Locked/`Hide` duties render greyed with a lock and are not
selectable.

### 5.2 Cell detail is progressive (user rule: compact, but add info when the cell has room)
The level is chosen from the block's rendered height × width, never fixed:
| Level | When | Shows (flight) | Shows (standby/ground) |
|---|---|---|---|
| 0 | < 22 pt high | code only (`PR124/PR125`, `1HB`) | code |
| 1 | ≥ 22 pt | + route `MNL–SEA–MNL` | + time `00:00–11:59` |
| 2 | ≥ 48 pt | + report/release `20:50L → 04:30L`, layover `SEA 25:35` | + location |
| 3 | ≥ 80 pt and ≥ 100 pt wide | + BLH / CRD, fleet | — |
Route data is not in `cellVoList`; it comes from `selectTaskCompareList`/pairing detail, fetched lazily for the
**visible** crews only (after first paint) and cached per pairingId. Until loaded the cell shows level 0.
Crew header: id + rank·fleet; a fleet that differs from mine is flagged (pre-warning for Basic Competency).

### 5.3 Crew-B compare detail (the web's detailed page, adapted)
Selecting a crew (tap header or one of its duties) opens the compare detail fed by `selectTaskCompareList`:
date-aligned rows, Mine | Crew B, each with the pairing summary (Type, Comp, Acting, RPT, End, BLH, CRD,
LO port, LO time) and the legs (Fleet, FLT, DEP, ARR, STD, STA, BLH). Compact: a two-column date-aligned card
list in a sheet, legs collapsible per duty. Duo inner: full tables side by side (as on the web). KPI delta bar
(FDP, BLH, Credit, DO) updates as duties are toggled.

### 5.4 Review, submit, results
Review = give/take summary + delta + comment → `submitTaskSwap`. Pass → AppDialog "Request sent" with the
3-stage track. Illegal → AppDialog listing side (Mine/Others), date range, rule id + name, plus a derived hint
when the cause is visible client-side (e.g. fleet differs). Submit timeout 120 s like the web.

## 6. R'Bot in Concept D (Phase 2)
R'Bot's three jobs here: (1) help the crew find the target crew, (2) see what's on the screen, (3) take the
crew's input and change the search/crews accordingly. It never submits.

- **Shares the screen**: compact = bottom panel (resizable), landscape = side pane, Duo inner = other side of
  the hinge. Same thread store (`rbotSlice`), screen-scoped entries.
- **Sees the screen**: `RbotContext` gains `swap` (sent only from this screen), a compact snapshot:
  `{window, mode, filters, myDuties:[{date,code,kind,swappable,route?}], crews:[{id,rankFleet,duties:[…]}],
  selectedCrew, give:[…], take:[…], delta}` capped to the visible window and ≤ 8 crews.
- **New tools** (ai-server `crew_tools.py` + app `types.ts`/`parseRbotAction`/`dispatchCrewAction`, whitelisted):
  `set_swap_search{fields…}` (any §4 field; resolves "my trip on 08 Oct" → that duty's dates from context),
  `set_swap_crews{add[],remove[],only[]}` (ids must exist in context or a search result),
  `select_swap_duties{give[],take[]}` (by date+code from context). The app runs the search itself after
  `set_swap_search`, then shows the applied filters as removable chips.
- Prompt rules: never invent crew ids/duties; ask when ambiguous; explain conflicts it can see in context.

## 7. First paint and performance (§First-Paint)
First paint = my duties + the first page of crews from one `selectOtherCrewPublishTask` call. Option lists,
route/leg detail and compare detail are lazy and limited to visible crews. Matrix renders with virtualised
rows/columns (FlatList horizontal for crew columns).

## 8. Testing and verification
- Jest (`__tests__/features/dutySwap*.test.ts`): params builder (every field), cell level choice, row/block
  layout, delta calc from real fixture (392923 ↔ 447841: FDP −06:35, BLH −05:40, CRD −06:35, DO 0),
  illegal-message parse (real string), record status labels, portalClient auth/401 re-login with mocked fetch,
  R'Bot action parsing (Phase 2). Fixtures from the captured TST responses (real multi-leg pairings).
- ai-server pytest for the new tools (Phase 2).
- `npx tsc --noEmit`; simulator on iPhone Air + Duo outer + Duo inner (portrait/landscape) with PR; TG login
  confirms the entry is hidden and no PR data leaks (crew-app/CLAUDE.md two-account rule); versioned
  screenshots under `docs/assets/screenshots/crew-app/duty-swap-*-VerN.png`; `APP_VERSION` bump.
- Submit on TST creates a real request to another crew: only with the user's go-ahead, then withdrawn.

## 9. Risks / open items
- Token lifetime and re-login behaviour of `/login` (captcha `202604` on TST only — production PR may need a
  real email code; Option N must surface that).
- "Chanced" status label → show "Changed" (confirm meaning).


## 10. Implementation notes and live findings (2026-10-08)

Built: native portal client (`src/features/portal/`), Duty Swap model/API/slice/actions, Crew Matrix,
Search sheet, Compare & send, Swap requests (withdraw / accept / reject), My duties (unlock/lock),
R'Bot panel + `swapRbot.ts` (local-first) and ai-server swap tools (`crew_tools.py` SWAP_TOOLS,
`crew_routes.py` screen-gated, snapshot in the prompt).

Learned on the PR TEST tenant (each is now handled and covered by a test):
- **The Type filter (`taskTypeList`) also filters the searching crew's OWN duties.** With no own
  duty of that type in the window the portal answers `code 1 "Please publish task."`. So "for a
  standby" is R'Bot's `wantKind`, applied on the phone after a date search, never `taskTypeList`.
- **"Please publish task." also means "you have no unlocked duties"** — 7 of 9 sampled crews had
  none. The app explains it and links to My duties (web "My Duty": `selectMyTaskList`,
  `batchUpdateTaskPublishStatus {pairingIdList, rosterGroundPublishIdList, publishPairingIdList,
  publishRosterGroundPublishIdList}`, `updateUnlockedDutyPref?unlockedDutyPref=`).
- Legality on submit also enforces a **swap-hour (credit) difference of ±10:00** (server parameter;
  shown verbatim, not hard-coded in the app).
- `hasSwap: true` marks a swappable duty (not "already swapped").
- Some pairings return an empty leg (`fltNo/dep/arr: null`) — skipped by `realLegs`.
- A wrong password is `code 0` with `data.loginSuccess false, failMessage ERROR_WRONG_PASSWORD`.
- CRD/BLH/Layover-hours filters are whole hours; report/flight-end are HH:mm; lists are comma-joined
  and match any value.
- Crew B sees a request as source "Apply to me", status `Pending(ME)`; record detail lists only the
  swapped duties with "mine" = the viewer.

Verification (iPhone Air sim, PR TEST): illegal path (no request created), send → Swap requests →
withdraw (request `2167266962121984`, now `Withdrawn(ME)`), landscape matrix, R'Bot conversation,
crew 421983 unlock → search → R'Bot → re-lock (restored), TG gate (preview page, no PR data),
Duo outer portrait. Maestro flows: `crew-app/.maestro/pr_392923_duty_swap*.yaml`,
`pr_421983_duty_swap_unlock.yaml`, `tg_duty_swap_gate.yaml`. Screenshots:
`docs/assets/screenshots/crew-app/duty-swap-*-Ver1.png`.

Open: Duo inner screen captures (needs duoctl on the shared "Duo — Test" sim); ai-server deploy to
`cr.rois.one` (until then free-form R'Bot requests outside the local phrasings reach the old
tools); overlapping duties in one crew column draw on top of each other.
