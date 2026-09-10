# Roundtrip builder merge verification

2026-09-10: integrated feature commit ec46357 with origin/main 5753240 in an
isolated worktree. Resolved pairing-pane ordering by keeping Recovery preview
overlays and prepending newly built pairings. Local unrelated changes remain in
the original worktree.

Commands run against merged sources:

- live-server: `npx tsc --noEmit` - PASS.
- gantt: `npx tsc -b` - PASS.
- root: `npm run check:ui` - PASS, zero hard violations, 124 warnings.
- live-server: `npx vitest run src/__tests__/services/pairing/roundtrip-chooser.test.ts src/__tests__/services/pairing/roundtrip-build.test.ts src/__tests__/services/pairing/roundtrip-routes.test.ts src/__tests__/services/pairing/pairing-build-service.test.ts` - PASS, 37 tests after providing the existing compute-fdp executable to the isolated worktree.
- gantt: `npx vitest run src/utils/__tests__/pairing-build-focus.test.ts src/stores/__tests__/recovery-preview-store.test.ts` - PASS, 12 tests.
- e2e: `GANTT_BASE_URL=http://127.0.0.1:5189 npx playwright test --config=config/roundtrip-builder.config.ts --grep 'RT-fleet-scope|RT-read-only'` - read-only builder controls/retained-pairings test PASS; fleet-scope test FAIL because the shared data now returns zero complete rotations.

The public fleet-scope regression passed before integration (601 open flights,
116 rotations, every rotation one exact fleet). Screenshot:
`docs/assets/screenshots/gantt/roundtrip-builder-add-sep28-30-all-fleets-Ver2.png`.
The subsequent merged-frontend run returned 231 open flights and zero complete
rotations for the same ADD September 28-30 scope. No pairings were created by
these tests. The nonempty-candidate assertion remains strict; the earlier PASS
does not establish a new PASS after the shared data changed. The merged frontend
used the existing local backend; merged backend code was typechecked and tested
separately. No production deployment or tunnel changes were performed.

Local Vite serves the app entry at `/altair/`; its `/altair/live` path is an API
proxy without the public routing layer. Tests now open the app entry and navigate
to Live through the UI, so the same tests run on both local and public targets.
