/**
 * Duplicated RO scenario must open CLEAN (save button disabled).
 *
 * Regression for: a freshly duplicated RO scenario whose source carried a
 * ruleset whose division mismatched the scenario division showed the Save
 * button lit ("Save changes") without any user edit. Root cause: the
 * ruleset-seeding effect in scenario-basic-info fired on mount for DRAFT
 * scenarios and silently rewrote the ruleset + marked the copy dirty.
 *
 * Strategy: seed a DRAFT RO scenario via API whose ruleset (103 = division P)
 * does not match its own division (C) — the exact shape that used to reproduce
 * the bug — then duplicate it through the REAL UI and assert the copy's Save
 * button stays disabled.
 */
import { test, expect } from '@playwright/test'
import { gotoScenarioList } from '../../../pages/gantt/scenario-nav'
import { ganttApiUrl, seedGanttAuth } from '../../../utils/gantt-hook'

const unique = `E2E DupClean ${Date.now()}`

test('duplicated RO scenario opens clean (save disabled) even when source ruleset mismatches division', async ({ page, request }) => {
  const token = await seedGanttAuth(page, request)

  // Precondition seed (allowed: read-only setup for the scenario under test).
  // A Cabin (C) draft carrying the Pilot (P) ruleset 103 is the data shape that
  // used to make the copy dirty.
  const createRes = await request.post(`${ganttApiUrl}/api/scenario`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: unique,
      fileType: 'RO',
      division: 'C',
      rulesetId: 103,
      strDtLoc: '2026-07-01',
      endDtLoc: '2026-07-31',
    },
  })
  expect(createRes.ok(), `seed create failed: ${createRes.status()}`).toBeTruthy()
  const sourceId = ((await createRes.json()) as { data: { id: number } }).data.id

  let copyId: number | null = null
  try {
    await page.goto('/altair/')
    await gotoScenarioList(page)
    await page.getByTestId('scenario-nav-ro').click()
    await expect(page.getByTestId('scenario-new-btn')).toBeVisible()

    // Surface the seeded scenario in the list, then duplicate via the three-dot menu.
    await page.getByPlaceholder('Search scenarios…').fill(unique)
    const item = page.getByTestId('scenario-list-item').filter({ hasText: unique })
    await expect(item).toBeVisible({ timeout: 40_000 })
    await item.hover()
    await item.locator('button').first().click()
    await page.getByText('Duplicate', { exact: true }).click()

    // The copy is auto-selected; detail panel shows "Copy of <name>".
    await expect(page.getByTestId('scenario-name-input')).toHaveValue(`Copy of ${unique}`, { timeout: 30_000 })
    const badge = await page.getByTestId('scenario-id-badge').textContent()
    copyId = badge ? Number(badge.trim()) : null

    // Let the async rulesets/rank-options lists settle. A freshly duplicated
    // scenario must stay clean — its Save button stays disabled (no unsaved change).
    await page.waitForTimeout(2_000)
    await expect(page.getByTestId('scenario-save-btn')).toBeDisabled()
  } finally {
    // Best-effort cleanup of the seeded source and its copy.
    for (const id of [sourceId, copyId]) {
      if (!id) continue
      await request.delete(`${ganttApiUrl}/api/scenario/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined)
    }
  }
})
