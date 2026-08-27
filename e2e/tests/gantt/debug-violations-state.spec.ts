import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

test('debug violations state', async ({ page, request }) => {
  test.setTimeout(180_000)
  const msgs: string[] = []
  page.on('console', m => msgs.push(`[${m.type()}] ${m.text()}`))
  page.on('requestfailed', r => msgs.push(`[REQ-FAIL] ${r.method()} ${r.url()} ${r.failure()?.errorText}`))

  await seedGanttAuth(page, request)
  await page.goto('/altair/')
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })

  await page.getByTestId('module-nav-live').click()

  // Wait for empty state to appear
  const emptyState = page.getByTestId('live-empty-state')
  const isVisible = await emptyState.isVisible().catch(() => false)
  console.log('emptyState visible:', isVisible)

  if (isVisible) {
    await emptyState.click()
    await expect(page.getByTestId('filter-dialog')).toBeVisible({ timeout: 5_000 })
    await page.getByTestId('filter-apply').click()
    await expect(page.getByTestId('filter-dialog')).not.toBeVisible({ timeout: 10_000 })
    console.log('filter applied, now waiting for data...')
  }

  // Wait up to 2 minutes watching the state
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(10_000)
    const state = await page.evaluate(() => {
      const fs = (window as any).__filterStore?.getState?.()
      const cs = (window as any).__crewStore?.getState?.()
      const gs = window.__ganttTest
      return {
        appliedFilters: fs ? (fs.appliedFilters !== null ? 'set' : 'null') : 'no-store',
        crewCount: cs?.selectedCrewIds?.length ?? -1,
        violationsCount: gs?.liveViolations?.()?.length ?? -1,
        refreshing: (window as any).__ganttViewStore?.getState?.()?.refreshing ?? 'unknown',
      }
    })
    console.log(`[t=${(i+1)*10}s] state:`, JSON.stringify(state))
    if (state.appliedFilters === 'set') {
      console.log('appliedFilters set! exiting loop')
      break
    }
  }

  const finalMsgs = msgs.filter(m => m.includes('bootstrap') || m.includes('GanttView') || m.includes('FAIL') || m.includes('error') || m.includes('Error'))
  console.log('Key console messages:', finalMsgs.slice(0, 20).join('\n'))
})
