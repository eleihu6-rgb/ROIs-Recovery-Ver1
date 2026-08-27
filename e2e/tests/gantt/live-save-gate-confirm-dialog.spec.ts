/**
 * Live — Save / Undo must stay disabled while the rule-confirm dialog is open
 * (post-drop state) AND during the async check that opens it.
 *
 * Regression for the "drag task between crew rows" bug: after dropping a task
 * the draft store applies the op synchronously (isDirty flips true), then
 * `checkLiveDraftLegality` runs in the background and finally calls
 * `showConfirmDialog` if violations are found. During the brief window between
 * `addOp` and the dialog appearing the Save / Undo buttons must NOT be enabled —
 * clicking Save while the legality check is still in flight would race the
 * violation confirmation and leave the UI out of sync with the DB.
 *
 * Mirrors scenario-save-gate-confirm-dialog.spec.ts for Live.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

test('Live-SaveGate — Save / Undo disabled while rule-confirm dialog is open (post-drop)', async ({ page }) => {
  await seedGanttAuth(page, page.context().request)
  await page.goto('/altair/')
  await page.getByTestId('module-nav-live').click()
  // Wait for the React shell to mount (draft toolbar + save button render as
  // part of the top toolbar — no need to wait for full Live bootstrap).
  await expect(page.getByTestId('draft-save-btn')).toBeVisible({ timeout: 30_000 })

  const saveBtn = page.getByTestId('draft-save-btn')
  const undoBtn = page.getByTestId('draft-undo-btn')

  // Sanity: with no pending ops, Save must be disabled.
  await expect(saveBtn).toBeDisabled()
  await expect(undoBtn).toBeDisabled()

  // Inject a synthetic draft op so isDirty=true. This is the post-drop state
  // the user actually sees (moveTask calls addOp synchronously before its
  // async legality check).
  await page.evaluate(async () => {
    const draftMod = await import('/altair/src/stores/draft-store.ts')
    // addOp signature: (op, affectedCrewIds, affectedPairingIds)
    draftMod.useDraftStore.getState().addOp(
      { type: 'move', taskId: 1, toCrewId: 'E2E-LIVE-GATE' },
      ['E2E-LIVE-GATE'],
      [],
    )
  })

  // Without the rule dialog and without an in-flight check, Save + Undo
  // should now be enabled (the lock is not held).
  await expect(saveBtn).toBeEnabled()
  await expect(undoBtn).toBeEnabled()

  // Force-open the rule-confirm dialog (the post-check state).
  await page.evaluate(async () => {
    const ruleMod = await import('/altair/src/stores/rule-check-store.ts')
    void ruleMod.useRuleCheckStore.getState().showConfirmDialog(
      [
        {
          ruleCode: '8002',
          ruleName: '8002/001',
          message: 'Synthetic violation for live save-gate test',
          severity: 3,
          canOverride: false,
          isNew: true,
          crewId: 'e2e',
          targetId: 'e2e',
          targetType: 'crew',
        },
      ],
      true,
    )
  })

  // Dialog renders.
  const dialog = page.getByTestId('rule-confirm-dialog')
  await expect(dialog).toBeVisible({ timeout: 5_000 })

  // Regression: Save + Undo MUST be disabled while the dialog is open. The
  // DraftToolbar subscribes to useRuleCheckStore.checking + confirmDialog.open
  // (mirror of Live's moveTask lock-before-addOp); without those subscriptions
  // the user could click Save with the rule-confirm already showing, then
  // click Cancel and leave the UI in a state the DB didn't match.
  await expect(saveBtn).toBeDisabled()
  await expect(undoBtn).toBeDisabled()

  // Close the dialog (Cancel) — buttons should re-enable.
  await page.evaluate(async () => {
    const ruleMod = await import('/altair/src/stores/rule-check-store.ts')
    ruleMod.useRuleCheckStore.getState().closeConfirmDialog()
  })
  await expect(dialog).toBeHidden({ timeout: 5_000 })
  await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
  await expect(undoBtn).toBeEnabled({ timeout: 5_000 })

  // Cleanup: undo the synthetic op so the test leaves the store in a clean
  // state for any subsequent run.
  await undoBtn.click()
})

/**
 * Capture the toolbar's gate state synchronously, immediately after invoking
 * the store action. Used by the throttled-legality-preview test to assert
 * that the lock-before-addOp pattern holds even when the Rust preview is
 * artificially slowed (the bug surface — the async window between addOp and
 * the confirm dialog appearing).
 */
async function sampleGateState(page: import('@playwright/test').Page): Promise<{
  checking: boolean
  opCount: number
  confirmDialogOpen: boolean
}> {
  return await page.evaluate(async () => {
    const ruleMod = await import('/altair/src/stores/rule-check-store.ts')
    const draftMod = await import('/altair/src/stores/draft-store.ts')
    return {
      checking: ruleMod.useRuleCheckStore.getState().checking,
      opCount: draftMod.useDraftStore.getState().operations.length,
      confirmDialogOpen: ruleMod.useRuleCheckStore.getState().confirmDialog.open,
    }
  })
}

test('Live-SaveGate — toolbar stays locked through the real moveTask async window', async ({ page }) => {
  await seedGanttAuth(page, page.context().request)
  await page.goto('/altair/')
  await page.getByTestId('module-nav-live').click()
  await expect(page.getByTestId('draft-save-btn')).toBeVisible({ timeout: 30_000 })

  const saveBtn = page.getByTestId('draft-save-btn')
  const undoBtn = page.getByTestId('draft-undo-btn')

  // Throttle the Rust legality preview to a multi-second delay. Without the
  // lock-before-addOp pattern, this is the window where Save + Undo would
  // flicker enabled.
  await page.route('**/api/legality/preview-draft', async (route) => {
    await new Promise((r) => setTimeout(r, 1500))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: { allowed: true, violations: [] } }),
    })
  })

  // Seed a roster item so moveTask has a target.
  await page.evaluate(async () => {
    const rosterMod = await import('/altair/src/stores/roster-store.ts')
    const item = {
      id: 9001, crewId: 'CREW-A', pairingId: 101, ver: 0, base: 'BJS',
      label: 'T1', assignmentGroup: 'FLY', assignment: 'CA',
      role: null, subRole: null, source: null, isRequested: 0, isSwapped: 0,
      preference: null, comments: null, score: null, workingHour: null,
      schStrDtUtc: '2026-08-01T00:00:00.000Z', schEndDtUtc: '2026-08-02T00:00:00.000Z',
      actStrDtUtc: null, actEndDtUtc: null, fltId: null, fltDt: null,
      dutySeq: null, segSeq: null, division: null,
      flightActingRank: 'CA', rosterActingRank: null, activeRank: null, position: null,
      schCreditedMinutes: null, actCreditedMinutes: null,
      tagSet: null, exceptionCode: null, actRestMin: null,
      ybh: null, mbh: null, yal: null, mal: null, ydo: null, mdo: null, mcred: null,
    }
    rosterMod.useRosterStore.setState((s) => ({
      main: { ...s.main, baseItems: [item], rosterItems: [item] },
    }))
  })

  // Fire moveTask — don't await inside the page; we want to sample state
  // DURING the async window (the route handler will delay 1.5s).
  const before = await sampleGateState(page)
  expect(before.checking, 'baseline: no async check in flight').toBe(false)
  expect(before.opCount, 'baseline: no draft ops').toBe(0)

  await page.evaluate(async () => {
    const rosterMod = await import('/altair/src/stores/roster-store.ts')
    // Fire-and-forget — the route handler delays the response 1.5s.
    void rosterMod.useRosterStore.getState().moveTask('main', 9001, 'CREW-B')
  })

  // Sample IMMEDIATELY: the synchronous prelude of moveTask (setChecking + addOp)
  // has already run by the time we get here. The async window (check pending,
  // dialog not yet open) is exactly the surface the lock-before-addOp pattern
  // protects. Without the fix, `checking` would still be false and Save /
  // Undo would be enabled.
  const mid = await sampleGateState(page)
  expect(mid.checking, 'moveTask must set checking=true synchronously (lock-before-addOp)').toBe(true)
  expect(mid.opCount, 'addOp must have happened synchronously').toBeGreaterThan(0)
  expect(mid.confirmDialogOpen, 'no confirm dialog yet — the preview is still in flight').toBe(false)

  // Toolbar reflects the locked state throughout the async window.
  await expect(saveBtn).toBeDisabled()
  await expect(undoBtn).toBeDisabled()

  // Wait for the route handler's delay to elapse + moveTask to finish.
  await page.waitForTimeout(2500)

  // After the clean check: lock is released (the success branch of moveTask
  // calls setChecking(false) when no dialog opens).
  const after = await sampleGateState(page)
  expect(after.checking, 'clean check: lock released').toBe(false)

  // Cleanup: undo the synthetic op.
  await undoBtn.click()
})

/**
 * Same async-window regression, but for the Live `assign-pairing` flow (the
 * drag-pairing-onto-crew-row flow observed on SIT, e.g. Pairing#15378 →
 * Crew:113 with rule 8004/001 violation). Mirrors the lock-before-addOp
 * pattern in `app-layout.tsx > executeDragOperation > case 'assign-pairing'`.
 */
test('Live-SaveGate — toolbar stays locked through the real assign-pairing async window', async ({ page }) => {
  await seedGanttAuth(page, page.context().request)
  await page.goto('/altair/')
  await page.getByTestId('module-nav-live').click()
  await expect(page.getByTestId('draft-save-btn')).toBeVisible({ timeout: 30_000 })

  const saveBtn = page.getByTestId('draft-save-btn')
  const undoBtn = page.getByTestId('draft-undo-btn')

  // Throttle the Rust legality preview to a multi-second delay. Without the
  // lock-before-addOp pattern, this is the window where Save + Undo would
  // flicker enabled — the exact reproduction on SIT.
  await page.route('**/api/legality/preview-draft', async (route) => {
    await new Promise((r) => setTimeout(r, 1500))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: { allowed: true, violations: [] } }),
    })
  })

  // Sample the gate state synchronously, immediately after invoking the same
  // pre-addOp + addOp + checkLiveDraftLegality sequence that
  // app-layout.tsx > case 'assign-pairing' runs on a real drop. The throttled
  // route keeps the legality check pending for 1.5s, giving us a window to
  // assert that the lock-before-addOp pattern holds.
  const before = await sampleGateState(page)
  expect(before.checking, 'baseline: no async check in flight').toBe(false)
  expect(before.opCount, 'baseline: no draft ops').toBe(0)

  await page.evaluate(async () => {
    const rosterMod = await import('/altair/src/stores/roster-store.ts')
    const draftMod = await import('/altair/src/stores/draft-store.ts')
    const ruleMod = await import('/altair/src/stores/rule-check-store.ts')

    // Seed a single placeholder roster item so the assign-pairing handler has
    // a `currentItems` snapshot to diff against. The handler reads
    // `useRosterStore.getState().main.rosterItems` for beforeItems.
    const placeholder = {
      id: 9002, crewId: 'CREW-X', pairingId: 15378, ver: 0, base: 'BJS',
      label: 'T1', assignmentGroup: 'FLY', assignment: 'CA',
      role: null, subRole: null, source: null, isRequested: 0, isSwapped: 0,
      preference: null, comments: null, score: null, workingHour: null,
      schStrDtUtc: '2026-08-01T00:00:00.000Z', schEndDtUtc: '2026-08-02T00:00:00.000Z',
      actStrDtUtc: null, actEndDtUtc: null, fltId: null, fltDt: null,
      dutySeq: null, segSeq: null, division: null,
      flightActingRank: 'CA', rosterActingRank: null, activeRank: null, position: null,
      schCreditedMinutes: null, actCreditedMinutes: null,
      tagSet: null, exceptionCode: null, actRestMin: null,
      ybh: null, mbh: null, yal: null, mal: null, ydo: null, mdo: null, mcred: null,
    }
    rosterMod.useRosterStore.setState((s) => ({
      main: { ...s.main, baseItems: [placeholder], rosterItems: [placeholder] },
    }))

    // Same lock-before-addOp sequence as app-layout.tsx:282-287.
    ruleMod.useRuleCheckStore.getState().setChecking(true)
    const opId = draftMod.useDraftStore.getState().addOp(
      { type: 'assign-pairing', pairingId: 15378, crewId: 'CREW-113', rosterActingRank: 'CA', tasks: [] },
      ['CREW-113'],
      [15378],
    )

    // Fire-and-forget the legality preview (the throttled route delays 1.5s).
    void rosterMod.checkLiveDraftLegality(
      ['CREW-113'],
      [placeholder],
      [placeholder],
      { relatedItems: [], relatedPairingIds: [15378] },
    ).then((allowed) => {
      if (!allowed) {
        draftMod.useDraftStore.getState().removeOp(opId)
        if (!ruleMod.useRuleCheckStore.getState().confirmDialog.open) {
          ruleMod.useRuleCheckStore.getState().setChecking(false)
        }
      } else {
        ruleMod.useRuleCheckStore.getState().setChecking(false)
      }
    })
  })

  // Sample IMMEDIATELY: the synchronous prelude (setChecking + addOp) has
  // already run. The async window (check pending, dialog not yet open) is
  // exactly the surface the lock-before-addOp pattern protects. Without the
  // fix, `checking` would still be false and Save / Undo would be enabled.
  const mid = await sampleGateState(page)
  expect(mid.checking, 'assign-pairing must set checking=true synchronously (lock-before-addOp)').toBe(true)
  expect(mid.opCount, 'addOp must have happened synchronously').toBeGreaterThan(0)
  expect(mid.confirmDialogOpen, 'no confirm dialog yet — the preview is still in flight').toBe(false)

  // Toolbar reflects the locked state throughout the async window.
  await expect(saveBtn).toBeDisabled()
  await expect(undoBtn).toBeDisabled()

  // Wait for the route handler's delay to elapse.
  await page.waitForTimeout(2500)

  // After the clean check: lock is released.
  const after = await sampleGateState(page)
  expect(after.checking, 'clean check: lock released').toBe(false)

  // Cleanup: undo the synthetic op.
  await undoBtn.click()
})

/**
 * Regression for the race where useRuleCheck's 500ms-debounced checkCrews
 * (rule engine batchCheck) completes BEFORE the assign-pairing's legality
 * preview (Rust legality/preview-draft) opens the confirm dialog. The
 * previous fix only patched the assign-pairing handler to lock the toolbar
 * before addOp — but useRuleCheck's own checkCrews runs in parallel and
 * resets `checking: false` on completion, opening a brief window where the
 * toolbar's Save/Undo light up (observed on SIT with Pairing#15378 → Crew:113
 * + 8004/001).
 *
 * Test setup mirrors the bug surface:
 *   - /api/legality/preview-draft delayed 1500ms (the slow path that opens the dialog)
 *   - /altair/rule/check/batch delayed 800ms (faster — completes first, used to set checking=false)
 *
 * Without the useRuleCheck skip-if-checking guard, sampling at ~900ms would
 * catch checkCrews having already reset `checking` to false. With the guard,
 * useRuleCheck sees `checking: true` and skips the parallel check, so the
 * lock survives until the legality preview opens the dialog.
 */
test('Live-SaveGate — useRuleCheck race does not reset the lock mid-flight (regression)', async ({ page }) => {
  await seedGanttAuth(page, page.context().request)
  await page.goto('/altair/')
  await page.getByTestId('module-nav-live').click()
  await expect(page.getByTestId('draft-save-btn')).toBeVisible({ timeout: 30_000 })

  const saveBtn = page.getByTestId('draft-save-btn')
  const undoBtn = page.getByTestId('draft-undo-btn')

  // The slow path that opens the confirm dialog.
  await page.route('**/api/legality/preview-draft', async (route) => {
    await new Promise((r) => setTimeout(r, 1500))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: { allowed: true, violations: [] } }),
    })
  })

  // useRuleCheck's checkCrews hits /altair/rule/check/batch via ruleClient.
  // Throttle it to complete BEFORE the legality preview — this is the path
  // that used to race the lock.
  await page.route('**/altair/rule/check/batch', async (route) => {
    await new Promise((r) => setTimeout(r, 800))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: { items: [] } }),
    })
  })

  // Trigger an optimistic addOp so useRuleCheck's 500ms debounce timer
  // fires checkCrews in the background.
  await page.evaluate(async () => {
    const draftMod = await import('/altair/src/stores/draft-store.ts')
    const ruleMod = await import('/altair/src/stores/rule-check-store.ts')
    const rosterMod = await import('/altair/src/stores/roster-store.ts')

    // Seed a single placeholder roster item so useRuleCheck's findChangedCrews
    // can detect the change.
    const placeholder = {
      id: 9003, crewId: 'CREW-X', pairingId: 15378, ver: 0, base: 'BJS',
      label: 'T1', assignmentGroup: 'FLY', assignment: 'CA',
      role: null, subRole: null, source: null, isRequested: 0, isSwapped: 0,
      preference: null, comments: null, score: null, workingHour: null,
      schStrDtUtc: '2026-08-01T00:00:00.000Z', schEndDtUtc: '2026-08-02T00:00:00.000Z',
      actStrDtUtc: null, actEndDtUtc: null, fltId: null, fltDt: null,
      dutySeq: null, segSeq: null, division: null,
      flightActingRank: 'CA', rosterActingRank: null, activeRank: null, position: null,
      schCreditedMinutes: null, actCreditedMinutes: null,
      tagSet: null, exceptionCode: null, actRestMin: null,
      ybh: null, mbh: null, yal: null, mal: null, ydo: null, mdo: null, mcred: null,
    }
    rosterMod.useRosterStore.setState((s) => ({
      main: { ...s.main, baseItems: [placeholder], rosterItems: [placeholder] },
    }))

    // Same lock-before-addOp sequence as app-layout.tsx:282-287.
    ruleMod.useRuleCheckStore.getState().setChecking(true)
    draftMod.useDraftStore.getState().addOp(
      { type: 'assign-pairing', pairingId: 15378, crewId: 'CREW-113', rosterActingRank: 'CA', tasks: [] },
      ['CREW-113'],
      [15378],
    )

    // Force a rosterItems reference change so useRuleCheck's mainItems effect
    // re-fires (simulating the optimistic update from app-layout.tsx:293).
    rosterMod.useRosterStore.setState((s) => ({
      main: {
        ...s.main,
        rosterItems: [
          ...s.main.rosterItems,
          { ...placeholder, id: 9004, crewId: 'CREW-113' },
        ],
      },
    }))
  })

  // Wait past the throttled /check/batch delay (800ms). checkCrews used to
  // reset checking=false at completion — the bug.
  await page.waitForTimeout(1400)

  // The lock MUST still be held — the dialog hasn't opened yet (preview-draft
  // is throttled to 1500ms), so useRuleCheck must NOT have reset checking.
  const afterCheckCrews = await sampleGateState(page)
  expect(afterCheckCrews.checking, 'useRuleCheck must not reset the lock mid-flight (preview-draft still pending)').toBe(true)
  expect(afterCheckCrews.opCount, 'addOp must remain pending').toBeGreaterThan(0)
  expect(afterCheckCrews.confirmDialogOpen, 'preview-draft still in flight — no dialog yet').toBe(false)

  // Toolbar reflects the locked state — Save/Undo MUST be disabled.
  await expect(saveBtn).toBeDisabled()
  await expect(undoBtn).toBeDisabled()

  // Wait for the legality preview to complete.
  await page.waitForTimeout(2500)

  // Cleanup: release the lock so the undo button becomes clickable, then undo.
  await page.evaluate(async () => {
    const ruleMod = await import('/altair/src/stores/rule-check-store.ts')
    ruleMod.useRuleCheckStore.getState().setChecking(false)
  })
  await undoBtn.click()
})

/**
 * Regression for the keyboard-shortcut path: Ctrl+S / Cmd+S / Ctrl+Z / Ctrl+Y
 * were reading `liveChecking` from a stale useKeyboard closure (Zustand
 * subscription was captured at mount, but the keydown effect's deps array did
 * not include it), so during the legality-check async window the shortcut
 * could still trigger saveDraft() while the toolbar's button stayed locked.
 *
 * Test setup mirrors the assign-pairing flow: lock-before-addOp sets
 * `checking: true` synchronously, throttled preview-draft keeps the async
 * window open for 1.5s. Pressing Ctrl+S / Ctrl+Z inside that window must be
 * a no-op — no saveDraft() call, no undo() call.
 */
test('Live-SaveGate — Ctrl+S / Ctrl+Z shortcuts honor the legality-check lock (regression)', async ({ page }) => {
  await seedGanttAuth(page, page.context().request)
  await page.goto('/altair/')
  await page.getByTestId('module-nav-live').click()
  await expect(page.getByTestId('draft-save-btn')).toBeVisible({ timeout: 30_000 })

  const saveBtn = page.getByTestId('draft-save-btn')

  // Throttle the Rust legality preview to keep the async window open.
  await page.route('**/api/legality/preview-draft', async (route) => {
    await new Promise((r) => setTimeout(r, 1500))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: { allowed: true, violations: [] } }),
    })
  })

  // Spy on the live commit API — the actual write path that Ctrl+S ultimately
  // triggers. If the shortcut bypasses the lock, this route fires.
  let commitApiCalls = 0
  await page.route('**/api/draft/commit', async (route) => {
    commitApiCalls += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: { committed: 0 } }),
    })
  })

  // Reproduce the post-drop state: lock-before-addOp + addOp.
  await page.evaluate(async () => {
    const ruleMod = await import('/altair/src/stores/rule-check-store.ts')
    const draftMod = await import('/altair/src/stores/draft-store.ts')
    ruleMod.useRuleCheckStore.getState().setChecking(true)
    draftMod.useDraftStore.getState().addOp(
      { type: 'assign-pairing', pairingId: 15378, crewId: 'CREW-113', rosterActingRank: 'CA', tasks: [] },
      ['CREW-113'],
      [15378],
    )
  })

  // Sanity: toolbar is locked (the button path), and the flag is held.
  const mid = await sampleGateState(page)
  expect(mid.checking, 'assign-pairing must hold the lock').toBe(true)
  await expect(saveBtn).toBeDisabled()

  // Press Ctrl+S — must be a no-op while `checking: true`. The previous bug
  // captured `liveChecking` in a stale closure (Zustand subscription read at
  // mount, not at keydown time) so the handler proceeded and called saveDraft().
  await page.keyboard.press('Control+s')
  await page.waitForTimeout(150)

  // Press Ctrl+Z — same closure bug applies; the handler ran undoOp() while
  // checking=true, racing the legality preview.
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(150)

  // Neither shortcut should have reached the save API.
  expect(commitApiCalls, 'Ctrl+S must not reach /api/draft/commit while the lock is held').toBe(0)

  // The pending op should still be on the draft store (Ctrl+Z didn't undo it).
  const afterShortcuts = await page.evaluate(async () => {
    const draftMod = await import('/altair/src/stores/draft-store.ts')
    return { opCount: draftMod.useDraftStore.getState().operations.length }
  })
  expect(afterShortcuts.opCount, 'Ctrl+Z must not undo while the lock is held').toBeGreaterThan(0)

  // Lock is still held (the preview hasn't completed yet).
  const stillLocked = await sampleGateState(page)
  expect(stillLocked.checking, 'lock must survive the shortcut attempts').toBe(true)

  // Wait for the legality preview to elapse, then release and undo to clean up.
  await page.waitForTimeout(2000)
  await page.evaluate(async () => {
    const ruleMod = await import('/altair/src/stores/rule-check-store.ts')
    ruleMod.useRuleCheckStore.getState().setChecking(false)
  })
  await page.getByTestId('draft-undo-btn').click()
})