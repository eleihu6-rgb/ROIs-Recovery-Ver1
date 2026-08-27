/**
 * Data Tab — Data Integrity & Validation API tests.
 *
 * Covers:
 *  - Dead draft toolbar actions are absent in immediate-save mode
 *  - Validation panel absence on initial load
 *  - POST /api/data/validate: empty batch → 200, empty issues
 *  - POST /api/data/validate: crew_base with missing parent → missing_parent issue
 *  - POST /api/data/table: unknown entity → non-200 body code
 *
 * §No-Illusion: API tests assert both the HTTP status and the response payload shape.
 *
 * Note: live-server's fail() always returns HTTP 200 with {code: N, data: null, message}.
 * Tests for rejected entities check body.code, not res.status().
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'

test.describe('Data Tab — Integrity & Validation', () => {
  let authToken: string

  test.beforeEach(async ({ page, request }) => {
    authToken = await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.getByTestId('module-nav-data').click()
    await page.getByTestId('data-view').waitFor({ state: 'visible', timeout: 10_000 })
  })

  test('Live-1015 — Toolbar save and discard are absent in immediate-save mode', async ({ page }) => {
    // Basic root defaults to expanded — click child directly
    await page.getByTestId('data-tree-item-basic.composition').click()
    await page.getByTestId('data-section-composition').waitFor({ state: 'visible', timeout: 10_000 })

    await expect(page.getByTestId('data-save')).toHaveCount(0)
    await expect(page.getByTestId('data-discard')).toHaveCount(0)
  })

  test('Live-1021 — Metadata entries are hidden from the Data sidebar', async ({ page }) => {
    await expect(page.locator('[data-testid^="data-tree-item-metadata."]')).toHaveCount(0)
    await expect(page.locator('[data-testid^="metadata-table-"]')).toHaveCount(0)
  })

  test('Live-1016 — Validation panel shows no issues initially', async ({ page }) => {
    // Basic root defaults to expanded — click child directly
    await page.getByTestId('data-tree-item-basic.composition').click()
    await page.getByTestId('data-section-composition').waitFor({ state: 'visible', timeout: 10_000 })

    // Validation panel should show zero issues on initial load
    const issueLocator = page.locator('[data-testid="data-validation-issue"]')
    const count = await issueLocator.count()
    expect(count, 'No validation issues should be shown on initial load').toBe(0)
  })

  test('Live-1017 — POST /api/data/validate returns 200 with empty issues for empty changes batch', async ({ request }) => {
    const res = await request.post(`${GANTT_API}/api/data/validate`, {
      data: { changes: [] },
      headers: { Authorization: `Bearer ${authToken}` },
    })

    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.code).toBe(200)
    expect(Array.isArray(body.data)).toBeTruthy()
    expect(body.data).toHaveLength(0)
  })

  test('Live-1018 — POST /api/data/validate rejects crew_base with missing parent crew_id', async ({ request }) => {
    const res = await request.post(`${GANTT_API}/api/data/validate`, {
      data: {
        changes: [
          {
            clientChangeId: 'test-integrity-001',
            entityId: 'crew_base',
            action: 'create',
            after: {
              crew_id: 'NONEXISTENT_CREW_XYZ_99999',
              base: 'HGH',
              eff_dt: '2025-01-01',
            },
          },
        ],
      },
      headers: { Authorization: `Bearer ${authToken}` },
    })

    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.code).toBe(200)

    // The returned issues array must contain at least one entry
    expect(Array.isArray(body.data)).toBeTruthy()
    expect(body.data.length, 'Expected at least one validation issue for missing parent').toBeGreaterThan(0)

    // At least one issue must identify the missing parent on crew_base
    const missingParentIssue = (body.data as Array<{ code: string; entityId: string }>).find(
      (issue) => issue.code === 'missing_parent' && issue.entityId === 'crew_base',
    )
    expect(
      missingParentIssue,
      'Expected a missing_parent issue for entityId crew_base',
    ).toBeDefined()
  })

  test('Live-1019 — POST /api/data/table rejects unknown entity — body.code is not 200', async ({ request }) => {
    // live-server's fail() always returns HTTP 200 with {code: N} envelope.
    // Check body.code, not HTTP status.
    const res = await request.post(`${GANTT_API}/api/data/table`, {
      data: {
        pageId: 'basic.org-base',
        entityId: 'users',
        page: 1,
        pageSize: 10,
      },
      headers: { Authorization: `Bearer ${authToken}` },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    // body.code must be a non-success code (e.g., 400)
    expect(body.code, 'Unknown entity must be rejected with non-200 body code').not.toBe(200)
    expect(body.code).toBeGreaterThanOrEqual(400)
  })
})
