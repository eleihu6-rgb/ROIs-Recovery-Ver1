import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts } from '../../utils/gantt-hook'

/**
 * Pairing pane delete — toolbar trash + Del key must remove selected pairings,
 * not only the context-menu "Delete Pairing" path (which worked before this fix).
 *
 * Draft-only: never clicks Save, so nothing is written to the backend.
 */

interface PairingProbe {
  segId: number
  pairingId: number
}

interface DraftOp {
  type?: string
  pairingId?: number
  pairingIds?: number[]
}

const removedPairingIds = (ops: DraftOp[]): number[] => {
  const ids: number[] = []
  for (const op of ops) {
    if (op.type !== 'remove-pairing') continue
    if (op.pairingIds && op.pairingIds.length > 0) ids.push(...op.pairingIds)
    else if (op.pairingId != null) ids.push(op.pairingId)
  }
  return ids
}

const setSelection = (page: Page, ids: number[]): Promise<void> =>
  page.evaluate((arg) => {
    (window.__ganttTest as unknown as { selectRosterTasks: (i: number[]) => void }).selectRosterTasks(arg)
  }, ids)

const pairings = (page: Page): Promise<Array<{ id?: number }>> =>
  readHook<Array<{ id?: number }>>(page, 'pairings')

const draftOps = (page: Page): Promise<DraftOp[]> =>
  readHook<DraftOp[]>(page, 'draftOps')

test.describe('Pairing pane delete', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect.poll(async () => (await counts(page)).pairing, {
      message: 'pairing objects loaded',
      timeout: 30_000,
    }).toBeGreaterThan(0)
  })

  test('Live-1420 — toolbar delete removes a selected pairing from the pane', async ({ page }) => {
    const probe = await readHook<PairingProbe | null>(page, 'pairingProbe')
    expect(probe, 'a visible pairing segment exists').not.toBeNull()

    const before = await pairings(page)
    expect(before.some((p) => p.id === probe!.pairingId)).toBe(true)

    await setSelection(page, [probe!.segId])
    await page.getByTestId('draft-delete-btn').click()

    await expect.poll(async () => {
      const ops = await draftOps(page)
      return ops.some((op) => op.type === 'remove-pairing' && op.pairingId === probe!.pairingId)
    }, { message: 'remove-pairing draft op queued' }).toBe(true)

    const after = await pairings(page)
    expect(after.some((p) => p.id === probe!.pairingId)).toBe(false)
  })

  test('Live-1421 — Del key removes a selected pairing from the pane', async ({ page }) => {
    const probe = await readHook<PairingProbe | null>(page, 'pairingProbe')
    expect(probe, 'a visible pairing segment exists').not.toBeNull()

    await setSelection(page, [probe!.segId])
    await page.keyboard.press('Delete')

    await expect.poll(async () => {
      const ops = await draftOps(page)
      return ops.some((op) => op.type === 'remove-pairing' && op.pairingId === probe!.pairingId)
    }, { message: 'remove-pairing draft op queued via Del' }).toBe(true)

    const after = await pairings(page)
    expect(after.some((p) => p.id === probe!.pairingId)).toBe(false)
  })

  test('Live-1422 — toolbar delete removes all box-selected pairings', async ({ page }) => {
    const probes = await page.evaluate(() =>
      (window.__ganttTest as unknown as { pairingProbes: (limit?: number) => PairingProbe[] }).pairingProbes(2),
    )
    test.skip(probes.length < 2, 'need two visible pairings for multi-delete')

    const pairingIds = probes.map((p) => p.pairingId)
    await setSelection(page, pairingIds)
    await page.getByTestId('draft-delete-btn').click()

    await expect.poll(async () => {
      const ops = await draftOps(page)
      return ops.filter((op) => op.type === 'remove-pairing').length === 1
        && pairingIds.every((id) => removedPairingIds(ops).includes(id))
    }, { message: 'one batched remove-pairing draft op for all selected pairings' }).toBe(true)

    const after = await pairings(page)
    for (const id of pairingIds) {
      expect(after.some((p) => p.id === id)).toBe(false)
    }
  })

  test('Live-1423 — context menu delete removes all box-selected pairings', async ({ page }) => {
    const probes = await page.evaluate(() =>
      (window.__ganttTest as unknown as { pairingProbes: (limit?: number) => PairingProbe[] }).pairingProbes(2),
    )
    test.skip(probes.length < 2, 'need two visible pairings for multi-delete')

    const pairingIds = probes.map((p) => p.pairingId)
    await setSelection(page, pairingIds)
    await page.evaluate((pairingId) => {
      (window.__ganttTest as unknown as { openLivePairingContextMenu: (id: number) => void }).openLivePairingContextMenu(pairingId)
    }, probes[0]!.pairingId)
    await page.getByRole('button', { name: 'Delete Pairing' }).click()

    await expect.poll(async () => {
      const ops = await draftOps(page)
      return ops.filter((op) => op.type === 'remove-pairing').length === 1
        && pairingIds.every((id) => removedPairingIds(ops).includes(id))
    }, { message: 'context menu queues one batched remove-pairing op' }).toBe(true)
  })

  test('Live-1424 — undo restores a deleted pairing in the pane without refresh', async ({ page }) => {
    const probe = await readHook<PairingProbe | null>(page, 'pairingProbe')
    expect(probe, 'a visible pairing segment exists').not.toBeNull()

    await setSelection(page, [probe!.segId])
    await page.getByTestId('draft-delete-btn').click()

    await expect.poll(async () => {
      const list = await pairings(page)
      return !list.some((p) => p.id === probe!.pairingId)
    }, { message: 'pairing removed from pane after delete' }).toBe(true)

    await page.getByTestId('draft-undo-btn').click()

    await expect.poll(async () => {
      const list = await pairings(page)
      return list.some((p) => p.id === probe!.pairingId)
    }, { message: 'pairing reappears in pane after undo without refresh', timeout: 30_000 }).toBe(true)

    await expect.poll(async () => (await draftOps(page)).length, {
      message: 'remove-pairing draft op cleared by undo',
    }).toBe(0)
  })

  test('Live-1425 — one Undo restores a multi-delete and greys out Undo', async ({ page }) => {
    const probes = await page.evaluate(() =>
      (window.__ganttTest as unknown as { pairingProbes: (limit?: number) => PairingProbe[] }).pairingProbes(2),
    )
    test.skip(probes.length < 2, 'need two visible pairings for multi-delete undo')

    const pairingIds = probes.map((p) => p.pairingId)
    await setSelection(page, pairingIds)
    await page.getByTestId('draft-delete-btn').click()

    await expect.poll(async () => (await draftOps(page)).length, {
      message: 'multi-delete is one draft op',
    }).toBe(1)

    await page.getByTestId('draft-undo-btn').click()

    await expect.poll(async () => {
      const list = await pairings(page)
      return pairingIds.every((id) => list.some((p) => p.id === id))
    }, { message: 'all deleted pairings reappear after one undo', timeout: 30_000 }).toBe(true)

    await expect.poll(async () => (await draftOps(page)).length, {
      message: 'draft stack empty after undoing the batch',
    }).toBe(0)

    await expect(page.getByTestId('draft-undo-btn')).toHaveClass(/pointer-events-none/)
  })
})
