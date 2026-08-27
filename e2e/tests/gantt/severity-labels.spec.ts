import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

/**
 * Severity vocabulary — user-facing labels are the business terms Hard / Overridable
 * / Soft (defined by enforcement), NOT the software log-levels ERROR / WARNING / INFO
 * (2026-06-11 request: "error is a system term, not a business term").
 *
 * Display-only: the STORED codes stay ERROR/WARNING/INFO (the <option> values), so the
 * rule engine and live violation data are untouched. This test pins both: the visible
 * label is relabeled, and the underlying value code is preserved.
 */
test.describe('Severity labels', () => {
  test('Live-1227 — rule severity dropdown shows Hard/Overridable/Soft, keeps ERROR/WARNING/INFO codes', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.getByTestId('module-nav-rule').click()
    await page.getByRole('button', { name: 'Rule Manager' }).click()

    const sel = page.getByTestId('rule-sev-select').first()
    await expect(sel).toBeVisible({ timeout: 15_000 })

    const pairs = await sel.evaluate((el) =>
      Array.from((el as HTMLSelectElement).options).map((o) => ({ value: o.value, label: (o.textContent ?? '').trim() })),
    )
    // Stored value codes preserved; display labels are the business vocabulary.
    expect(pairs).toEqual([
      { value: 'ERROR', label: 'Hard' },
      { value: 'WARNING', label: 'Overridable' },
      { value: 'INFO', label: 'Soft' },
    ])

    // The raw log-level words must not appear as visible severity text in the table.
    const sevTexts = await page.getByTestId('rule-sev-select').evaluateAll((els) =>
      els.map((el) => {
        const s = el as HTMLSelectElement
        return (s.options[s.selectedIndex]?.textContent ?? '').trim()
      }),
    )
    expect(sevTexts.length).toBeGreaterThan(3)
    for (const t of sevTexts) {
      expect(['Hard', 'Overridable', 'Soft']).toContain(t)
    }
  })
})
