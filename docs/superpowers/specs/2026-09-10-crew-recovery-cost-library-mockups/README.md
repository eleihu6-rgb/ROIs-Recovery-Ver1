# Crew Cost Library Mockups

Open any entry directly in a browser:

- `catalogue.html`: editable cost catalogue with pricing, template editor and test calculation.
- `workbench.html`: rule configuration and Crew A/B guarantee-hours comparison.
- `comparison.html`: daily recovery cases, costs/KPIs and user or automatic selection.

Seventeen starting cost types use seven calculation templates. Prices are illustrative USD values, not approved airline tariffs. Rates without source prices remain unpriced; airport standby is a credit rule, not an unpriced cash fee. Save draft retains settings locally; JSON export/import provides portable configuration. Saved settings are shared between views where the browser supports file-origin storage.

Version 2 defaults requested by Ryan:

- GH is one editable floor: 85 hours.
- Above 85 through 90 hours: 1.2x base hourly pay; above 90: 1.5x.
- Add, edit and delete tier rows; ranges remain contiguous with an unbounded final tier. Keep at least one tier.
- Airport standby who flies: `max(0, departure - Y hours - report) * X + pairing credit`, with X=0.5 and Y=1.
- Standby time is entered with dates in UTC. The default 07:00 report / 10:00 departure / 5:45 pairing yields 1:00 standby credit and 6:45 total credit.
- Already-owed standby credit is explicitly replaced in the baseline. Credit is valued via marginal GH payroll, without a fixed activation fee.
- With demonstration base pay USD 100/h and baseline A=84 / B=70, additional pay is USD 712.50 / USD 0.00.
- Version 2 has its own local-storage key. Old version 1 storage is preserved; old JSON must not be interpreted as the new credit model and is rejected explicitly.

Legality results and operational inputs are synthetic fixtures. No Rust service, payroll, supplier or roster data is changed. Automatic selection does not deploy a solution. The broader design's effective-dated tariff matching, premium stacking and multi-currency evaluation are future work.

## Verification

Executed from the repository root:

```sh
node docs/superpowers/specs/2026-09-10-crew-recovery-cost-library-mockups/model.test.cjs
node docs/superpowers/specs/2026-09-10-crew-recovery-cost-library-mockups/verify.cjs
npm run check:ui
git diff --check
```

Results for version 2: model tests PASS, 32 checks; Playwright PASS, 26 checks; UI gate PASS, 0 hard violations and 124 existing warnings; diff whitespace check PASS. The UI gate scans production UI paths, so the static mockups additionally have direct browser layout and interaction checks.

The first version's browser run found an ambiguous select label; explicit accessible labels corrected it. The latest passing run is recorded in `verification.json`. Eight screenshots cover all three views and the standby editor, at desktop 1440x1000 and mobile 390x844. Tables intentionally scroll within their containers on small screens. There were no browser runtime errors or failed asset requests.

The in-app browser was unavailable during bootstrap; verification used the installed Playwright Chromium runner. No development server is needed.
