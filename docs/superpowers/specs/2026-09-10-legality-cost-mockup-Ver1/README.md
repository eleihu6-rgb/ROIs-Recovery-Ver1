# Legality Cost Mockup - Ver1

Open `index.html` directly in a browser. No development server is required.
This is an isolated interactive design prototype, not a production integration.
Changes last for the current browser session and reset on reload.

## Included

- Legality-style navigation, categorized instance tree, cost sets and templates.
- All 17 current cost entries in the initial Daily Recovery set.
- Numeric type/instance IDs, protected 001 templates and sequential copies.
- Set creation, editing, shared/independent copying, deletion and membership.
- Editable cost metadata and parameters; individual calculation workbenches.
- GH 85 hours, 85-90 at 1.2x and above 90 at 1.5x; editable tier rows.
- Airport standby X=0.5 and Y=1 hour, paired with a selectable GH instance.
- Independent set copies retain the corresponding copied GH policy reference.
- Costs outside a selected set remain accessible through the instance tree.

Rule navigation is only a context placeholder. No real rule screens, Rust
checks, remote data, permissions service or database writes are included.
Costs and tariffs are illustrative; coverage is the prior 17-entry prototype,
not a claim that every reference-document cost has been implemented.

The shared calculation model and Lucide assets are loaded from the adjacent
`2026-09-10-crew-recovery-cost-library-mockups` directory; keep it alongside this
version. Earlier mockups are unchanged. Future review iterations should use a
new `Ver2`, `Ver3`, etc. directory, preserving this one.

## Verification

From repository root:

```sh
node docs/superpowers/specs/2026-09-10-crew-recovery-cost-library-mockups/model.test.cjs
node docs/superpowers/specs/2026-09-10-legality-cost-mockup-Ver1/verify.cjs
npm run check:ui
git diff --check
```

Playwright opens the HTML directly, exercises the real DOM controls and saves
non-overwriting desktop/mobile screenshots to
`docs/assets/screenshots/crew-recovery/legality-cost-*-Ver<N>.png`.
The UI standard command checks production UI; it does not lint this static CSS.
