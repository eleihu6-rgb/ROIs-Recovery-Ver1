import { test, expect } from '@playwright/test'
import { seedGanttAuth, ganttApiUrl } from '../../utils/gantt-hook'

/**
 * Composition feature under the Legality module (moved here when the Rule tab was
 * dropped — the Legality menu hosts Composition + Composition Load):
 *  - CompositionCreateDialog (gantt/src/components/composition/composition-create-dialog.tsx)
 *  - CompositionLoadView + CompositionLoadDialog (composition-load-*.tsx)
 *
 * Creating a composition is a REAL backend write (not draft), so the create test
 * cleans up after itself by DELETEing the row it created (verified via the API).
 * The validation and Composition-Load tests perform no writes.
 *
 * Cleanup note: the live-server is reached directly at GANTT_API_URL; the app's
 * /altair/live prefix is a Vite proxy concern only, so server paths are /api/...
 */
test.describe('Composition (Legality module)', () => {
  let token: string

  test.beforeEach(async ({ page, request }) => {
    token = await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
    await page.getByTestId('module-nav-legality').click()
  })

  test('Comp-1 — create a composition (real write), confirm persisted, then clean up', async ({ page, request }) => {
    await page.getByRole('button', { name: 'Composition', exact: true }).click()

    const name = `E2E-COMP-${Date.now()}`
    await page.getByRole('button', { name: 'New Composition' }).click()
    // Dialog header (raw overlay, not a Radix dialog).
    await expect(page.getByText('New Composition', { exact: true })).toBeVisible({ timeout: 5_000 })

    await page.getByPlaceholder('e.g. Double').fill(name)
    await page.getByPlaceholder('P / C').fill('P')
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // UI success proof.
    await expect(page.getByText('Composition created')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('New Composition', { exact: true })).toHaveCount(0) // dialog closed

    // Persistence proof + capture id for cleanup.
    const listRes = await request.get(`${ganttApiUrl}/api/composition`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(listRes.ok(), 'composition list fetch').toBeTruthy()
    const body = await listRes.json()
    const items = (body.data ?? body) as Array<{ id: number; name: string }>
    const created = items.find((c) => c.name === name)
    expect(created, 'created composition is persisted in the backend').toBeTruthy()

    // Clean up: delete what we created and verify it's gone.
    const delRes = await request.delete(`${ganttApiUrl}/api/composition/${created!.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(delRes.ok(), 'cleanup delete succeeded').toBeTruthy()
    const afterRes = await request.get(`${ganttApiUrl}/api/composition`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const afterItems = ((await afterRes.json()).data ?? []) as Array<{ name: string }>
    expect(afterItems.some((c) => c.name === name), 'composition removed after cleanup').toBe(false)
  })

  test('Comp-2 — create dialog blocks submit when required fields are empty', async ({ page }) => {
    await page.getByRole('button', { name: 'Composition', exact: true }).click()
    await page.getByRole('button', { name: 'New Composition' }).click()
    await expect(page.getByText('New Composition', { exact: true })).toBeVisible({ timeout: 5_000 })

    // Submit with empty Name/Division → validation error, dialog stays open (no write).
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page.getByText('Name and Division are required')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('New Composition', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('New Composition', { exact: true })).toHaveCount(0)
  })

  test('Comp-3 — Composition Load view renders its table and the Add dialog opens', async ({ page }) => {
    await page.getByRole('button', { name: 'Composition Load', exact: true }).click()

    // View chrome: record count summary + key table columns (real content).
    await expect(page.getByText(/Total/)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('columnheader', { name: 'Division' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Priority' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Composition' })).toBeVisible()

    // Add dialog opens with its required-field labels.
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByText('Add Load Rule')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Division *')).toBeVisible()
    await expect(page.getByText('Priority (Sequence) *')).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('Add Load Rule')).toHaveCount(0)
  })
})
