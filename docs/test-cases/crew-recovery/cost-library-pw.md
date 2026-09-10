# Cost Library Playwright Receipt

Date: 2026-09-10

Command:

```bash
./e2e/node_modules/.bin/playwright test --config e2e/config/cost-library.config.ts
```

Result: PASS — 3 passed in 13.4s.

Covered workflows:

- Real UI login with `TEST_ACCOUNTS.admin`, then Legality > Cost Sets / Cost Templates navigation.
- Template protection: template rows render and template delete action is not exposed.
- Calculator workbench coverage for quantity, fixed, minimum, guarantee hours, standby, bands, booking, unpriced, disabled, and invalid fixed input.
- Set lifecycle: create, edit metadata, copy shared, copy independent, delete, reload persistence.
- Cost instance lifecycle: sequential copies, scratch-only revision edits, explicit membership revision update.
- Revision behavior: selected set revision stays pinned; View latest revision toggle uses the latest catalog revision.
- GH tier edit path: New tier boundary input before Add tier, tier values saved as a new revision.
- Standby parameter edit and GH policy remapping in an independent set copy.

Screenshots captured:

- `docs/assets/screenshots/crew-recovery/cost-library-calculator-mobile-Ver1.png`
- `docs/assets/screenshots/crew-recovery/cost-library-calculator-mobile-Ver2.png`
- `docs/assets/screenshots/crew-recovery/cost-library-policy-desktop-Ver1.png`
- `docs/assets/screenshots/crew-recovery/cost-library-sets-desktop-Ver1.png`
- `docs/assets/screenshots/crew-recovery/cost-library-sets-mobile-Ver1.png`
- `docs/assets/screenshots/crew-recovery/cost-library-standby-desktop-Ver1.png`
- `docs/assets/screenshots/crew-recovery/cost-library-standby-desktop-Ver2.png`

Visual notes:

- Desktop screenshots show the Cost Library shell, catalog, set list, and detail/workbench areas without overlap.
- Mobile screenshots are usable but constrained: the persistent shell/sidebar consumes much of the 390px viewport, leaving a narrow working area for Cost Library controls.

Cleanup:

- Test-owned scratch sets and copied instances were deleted after the run.
- Post-run catalog check reported `leftoverSets: 0` and `leftoverInstances: 0` for the `cost-pw-*` test marker.
- Seed sanity check confirmed `2001/001` remained at revision 1 with unit price 140.
