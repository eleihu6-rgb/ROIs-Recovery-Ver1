# Crew app · Duty Swap "Market" (Concept A Swap Board) + Matrix | Market switch

Date: 2026-10-08 · Module: `crew-app` · Status: implemented (APP_VERSION 153)

Builds on [2026-10-07-crew-app-duty-swap-concept-d-design.md](2026-10-07-crew-app-duty-swap-concept-d-design.md)
(the Matrix, Concept D) and the Concept A section of the duty-swap concepts page.

## 1. Scope

- A second way to swap, **Market**: the crew sees every unlocked duty other crews
  have published, narrowed to the duties that overlap one of their own unlocked
  duties ("swap out of"), and makes an offer for one.
- A **switch** between **Matrix** (Concept D, `DutySwapScreen`, unchanged) and
  **Market**, remembered per crew on the phone.
- Out of scope: R'Bot in the Market, server-side changes, records/accept/reject
  (shared `DutySwapRecordsScreen`), TG (no Duty Swap portal: Home still opens the
  info page).

## 2. Files

| File | Role |
|---|---|
| `src/features/dutySwap/market/marketModel.ts` | Pure rules: approach key/parse, out-of duties, board window + offers, composer choices/defaults, labels, fleet/rank pre-check |
| `src/features/dutySwap/market/ApproachSwitch.tsx` | `useSwapApproach` (AsyncStorage, try/catch) + the switch (`rail` / `header`) |
| `src/features/dutySwap/market/DutySwapHost.tsx` | `DutySwap` route: picks Matrix or Market, places the switch |
| `src/features/dutySwap/market/MarketScreen.tsx` | Board (FlatList) + composer placement + submit/result |
| `src/features/dutySwap/market/MarketComposer.tsx` | Give / take checklists, KPI delta, note, "Check legality & send" |
| `DutySwapScreen.tsx` | additive: optional `switcher` prop (shown via `PageShell titleNode`); `RuleList` exported |
| `PageShell.tsx` | additive: optional `titleNode` (a control in the title's place) |
| `icons.tsx` | additive: `grid` (Matrix), `market` (Market) |
| `V2Navigator.tsx` | `DutySwap` → `DutySwapHost` |

## 3. Behaviour

**Data.** The Market reuses the Duty Swap slice and API: one
`selectOtherCrewPublishTask` search over the window (filters left by the Matrix
are dropped — the market is every crew; window and mode kept). No per-card
network work on mount: `ensureDetails` (`selectTaskCompareList`) runs only for the
crews whose cards become visible (`onViewableItemsChanged`) and for crew B when an
offer is opened.

**Board.** "Out of" chips = my unlocked duties that are not days off
(`market-out-<yyyy-mm-dd>`). Offers = other crews' unlocked duties overlapping
`[start − 1 day, end + 12 h]` of that duty, by start time; days off hidden unless
the "Days off" chip is on; a crew on my own pairing never appears. Headline:
"N offers overlap 22–26 Oct". Card: date block, code + kind badge, time span
(end day only when different) + route, crew ID + name, and once details are in,
the pre-check chip (`FS · 350`, or `… · fleet differs` / `… · rank differs` in the
accent outline). A sent offer reads **Offered**.

**Composer.** "Offer to <crew>": YOU TAKE FROM (crew B's unlocked duties around
my duty; pre-ticked = the tapped offer + their duties during mine, since they
cannot fly mine while holding those), YOU GIVE (my unlocked duties around theirs;
pre-ticked = the out-of duty + mine during theirs), the FDP/BLH/CREDIT/DO delta,
an optional note, **Check legality & send** → `submitTaskSwap`. The result is the
same Status-Card `AppDialog` as the Matrix ("Request sent to <crew>" / "Swap not
allowed" + rule list / "Could not send").

**Nothing unlocked** ("Please publish task." or no unlocked non-off duty): card
"Unlock a duty to swap out of" → My duties; coming back re-runs the search.

## 4. Layouts

| Class | Board | Composer | Switch |
|---|---|---|---|
| compact (iPhone, Duo outer) | full width, one column | bottom sheet (`pageSheet` Modal; dialog inside it) | header, in place of the title (two-segment pill, 36 pt — header height unchanged) |
| tall (Duo inner portrait 669×951) | top half, two columns | lower pane | header |
| wide (Duo inner landscape 951×669) | left of the hinge (`width/2 − insets.left − 18`) | right pane, no sheet | glass rail of 44×44 icon buttons in the right-edge status strip under the clock (`railInStrip = wide && insets.right >= 56`, `top 116`, `width = insets.right`), as Schedule's roster-view rail |

The Matrix keeps its layout on every class; with the rail in the strip its title
stays "Duty Swap" / "New swap". The pages keep their `GradientScreen` side insets,
so the strip right of them is free for the rail (same result as Schedule's
`sideInsets={!railInStrip}` + own padding).

## 5. Risks / decisions

- Switching to Market drops Matrix search filters (window + mode kept). Chosen so
  the market always shows every offer; the Matrix re-opens on Search pairing anyway.
- Pre-check uses the compare detail (`actingRank`, segment `ac`); standby duties
  carry a fleet in that detail, so the fleet chip can flag them too.
- Legality is the portal's: the composer only pre-ticks a swap that is likely to
  pass; refused offers show the rule and stay editable.

## 6. Verification

- Jest: `__tests__/features/dutySwapMarket.test.tsx` (model, switch placement per
  layout class, persistence + storage failure, first paint without per-card
  calls, send / refuse / nothing-unlocked, wide and tall panes).
- Duo: `DuoFitUITests.testDuoDutySwapMarketPR487424` (landscape sends; portrait
  `DUO_MARKET_SENDS=0`, layout only).
- iPhone: `.maestro/pr_487424_duty_swap_market.yaml` (read-only; Matrix ↔ Market
  and the remembered choice).
