# Full Crew App review details

The Air comparison screenshot has unused vertical space while aircraft/block-time text is ellipsized. CompareSheet forces one-line flight and duty headings and omits task FDP on phones. Twin Review additionally lacks composition/rank, aircraft and leg block hours.

Use shared wrapping duty/flight detail components across CompareSheet and both Twin Review tabs. Show assignment/composition/rank, complete report/end timestamps, BLH/CRD/FDP, layover, flight route, times, aircraft and leg BLH. Render optional segment FDP/layover only when supplied. Separate times and aircraft metadata into readable lines. No fixed card height or ellipsis in review; retain scrolling and existing send readiness/keyboard handling.

Keep date-aligned give/take columns, KPI values, note/send workflow and iPad review folding. Do not change legality, Gantt puck size or selection logic. No new dependencies, new business fields or invented missing details. Native theme tokens drive shared text styles.

Persist simulator policy in crew-app/CLAUDE.md: Air → Duo → iPad; maximum two booted, preferably one. Native UI runs are read-only up to review; no actual swap sent. Validate complete text, accessible note/send, both tabs, and TG isolation, with screenshot inspection on all three devices. Jest uses existing multi-leg roundtrip portal fixtures; tsc, UI gate and diff checks also required. No equivalent browser UI exists for Playwright.
