/**
 * Scenario Notes tab — Q/A threaded messages stored in scenario_result.
 *
 * Runs against a scratch DRAFT scenario created by duplicating #595 (reliably
 * available on the remote live-server DB, same source scenario as the
 * nav-dropdown test), so CRUD leaves no residue on shared scenarios; the
 * duplicate is deleted in afterEach (which also drops its notes).
 *
 * Requires: live-server (SCENARIO_GANTT_SOURCE=db) + gantt dev.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'
const SOURCE_SCENARIO_ID = 595

interface Auth { token: string; userCode: string; userName: string; schema: string }

const login = async (request: APIRequestContext): Promise<Auth> => {
  const res = await request.post(`${GANTT_API}/api/auth/login`, { data: { userCode: GANTT_USER, password: GANTT_PASS } })
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
  return ((await res.json()) as { data: Auth }).data
}

const authHeaders = (auth: Auth): Record<string, string> => ({ Authorization: `Bearer ${auth.token}` })

const duplicateScenario = async (request: APIRequestContext, auth: Auth, sourceId: number): Promise<number> => {
  const res = await request.post(`${GANTT_API}/api/scenario/${sourceId}/duplicate`, { headers: authHeaders(auth) })
  expect(res.ok(), `duplicate failed: ${res.status()}`).toBeTruthy()
  return ((await res.json()) as { data: { id: number } }).data.id
}

const deleteScenario = async (request: APIRequestContext, auth: Auth, id: number): Promise<void> => {
  await request.delete(`${GANTT_API}/api/scenario/${id}`, { headers: authHeaders(auth) })
}

const clearNotes = async (request: APIRequestContext, auth: Auth, id: number): Promise<void> => {
  const res = await request.delete(`${GANTT_API}/api/scenario/${id}/notes`, { headers: authHeaders(auth) })
  expect(res.ok(), `clear notes failed: ${res.status()}`).toBeTruthy()
}

const seedAuth = async (page: Page, auth: Auth): Promise<void> => {
  await page.addInitScript((a) => {
    window.sessionStorage.setItem('rois-auth', JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }))
  }, auth)
}

async function openScenarioById(page: Page, id: number): Promise<void> {
  await page.goto('/altair/')
  await page.waitForLoadState('networkidle')
  await page.getByTestId('module-nav-scenario').click()
  await page.getByTestId('scenario-nav-list').click()
  await page.getByPlaceholder('Search scenarios…').fill(String(id))
  // scenario-item-id renders the bare id (e.g. "595"), not "#595"
  const item = page.getByTestId('scenario-list-item').filter({
    has: page.getByTestId('scenario-item-id').getByText(String(id), { exact: true }),
  })
  await expect(item).toBeVisible({ timeout: 15_000 })
  await item.click()
  await expect(page.getByTestId('scenario-detail-panel')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('scenario-result-tab-notes')).toBeVisible({ timeout: 15_000 })
}

test.describe('Scenario Notes tab', () => {
  let scratchId = 0

  test.beforeEach(async ({ request }) => {
    const auth = await login(request)
    scratchId = await duplicateScenario(request, auth, SOURCE_SCENARIO_ID)
    await clearNotes(request, auth, scratchId)
  })

  test.afterEach(async ({ request }) => {
    const auth = await login(request)
    if (scratchId) await deleteScenario(request, auth, scratchId)
  })

  test('Scen-Notes-1 — DRAFT scenario shows only Notes tab; composer prefills userCode; post works', async ({ page, request }) => {
    const auth = await login(request)
    await seedAuth(page, auth)
    await openScenarioById(page, scratchId)

    await expect(page.getByTestId('scenario-result-tab-kpi')).toHaveCount(0)
    await expect(page.getByTestId('scenario-result-tab-versions')).toHaveCount(0)

    await expect(page.getByTestId('scenario-notes-composer-author')).toHaveValue(auth.userCode)

    await page.getByTestId('scenario-notes-composer-text').fill('Is YVR coverage sufficient?')
    await page.getByTestId('scenario-notes-post').click()

    await expect(page.getByTestId('scenario-note-root')).toContainText('Is YVR coverage sufficient?')
    await expect(page.getByTestId('scenario-note-root')).toContainText(auth.userCode)
    await expect(page.getByTestId('scenario-notes-empty')).toHaveCount(0)
    await expect(page.getByTestId('scenario-notes-open-count')).toBeVisible()
    // red badge on the Notes tab shows the open count without opening the tab
    await expect(page.getByTestId('scenario-notes-tab-badge')).toHaveText('1')
    // full date + time (year, seconds) in the byline
    await expect(page.getByTestId('scenario-note-root')).toContainText('2026')
    await expect(page.getByTestId('scenario-note-root')).toContainText(/\d{2}:\d{2}:\d{2}/)
  })

  test('Scen-Notes-2 — reply nests under the question', async ({ page, request }) => {
    const auth = await login(request)
    await seedAuth(page, auth)
    await openScenarioById(page, scratchId)

    await page.getByTestId('scenario-notes-composer-text').fill('Question one')
    await page.getByTestId('scenario-notes-post').click()
    const root = page.getByTestId('scenario-note-root')
    await expect(root).toContainText('Question one')
    await expect(root.getByTestId('scenario-note-reply')).toHaveCount(0)

    await root.getByTestId('scenario-note-reply-btn').click()
    await page.getByTestId('scenario-notes-composer-text').fill('Reply one')
    await page.getByTestId('scenario-notes-post').click()

    await expect(root.getByTestId('scenario-note-reply')).toContainText('Reply one')
    await expect(page.getByTestId('scenario-notes-open-count')).toHaveCount(0)
    await expect(page.getByTestId('scenario-notes-tab-badge')).toHaveCount(0)
  })

  test('Scen-Notes-3 — edit updates text and preserves author', async ({ page, request }) => {
    const auth = await login(request)
    await seedAuth(page, auth)
    await openScenarioById(page, scratchId)

    await page.getByTestId('scenario-notes-composer-text').fill('Original text')
    await page.getByTestId('scenario-notes-post').click()
    const root = page.getByTestId('scenario-note-root')
    await expect(root).toContainText('Original text')

    await root.getByTestId('scenario-note-edit-btn').click()
    await page.getByTestId('scenario-note-edit-text').fill('Edited text')
    await page.getByTestId('scenario-note-edit-save').click()

    await expect(root).toContainText('Edited text')
    await expect(root).toContainText('edited')
    await expect(root).toContainText(auth.userCode)
  })

  test('Scen-Notes-4 — delete a single message with confirm', async ({ page, request }) => {
    const auth = await login(request)
    await seedAuth(page, auth)
    await openScenarioById(page, scratchId)

    await page.getByTestId('scenario-notes-composer-text').fill('To delete')
    await page.getByTestId('scenario-notes-post').click()
    const root = page.getByTestId('scenario-note-root')
    await expect(root).toContainText('To delete')

    await root.getByTestId('scenario-note-delete-btn').click()
    await expect(page.getByTestId('scenario-notes-delete-dialog')).toBeVisible()
    await page.getByTestId('scenario-notes-delete-dialog').getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(root).toHaveCount(0)
    await expect(page.getByTestId('scenario-notes-empty')).toBeVisible()
  })

  test('Scen-Notes-5 — clear all messages with confirm', async ({ page, request }) => {
    const auth = await login(request)
    await seedAuth(page, auth)
    await openScenarioById(page, scratchId)

    await page.getByTestId('scenario-notes-composer-text').fill('Message A')
    await page.getByTestId('scenario-notes-post').click()
    await page.getByTestId('scenario-notes-composer-text').fill('Message B')
    await page.getByTestId('scenario-notes-post').click()
    await expect(page.getByTestId('scenario-note-root')).toHaveCount(2)

    await page.getByTestId('scenario-notes-clear').click()
    await expect(page.getByTestId('scenario-notes-clear-dialog')).toBeVisible()
    await page.getByTestId('scenario-notes-clear-dialog').getByRole('button', { name: 'Clear All', exact: true }).click()

    await expect(page.getByTestId('scenario-note-root')).toHaveCount(0)
    await expect(page.getByTestId('scenario-notes-empty')).toBeVisible()
  })

  test('Scen-Notes-6 — notes persist across reload', async ({ page, request }) => {
    const auth = await login(request)
    await seedAuth(page, auth)
    await openScenarioById(page, scratchId)

    await page.getByTestId('scenario-notes-composer-text').fill('Persisted question')
    await page.getByTestId('scenario-notes-post').click()
    await expect(page.getByTestId('scenario-note-root')).toContainText('Persisted question')

    await page.reload()
    await openScenarioById(page, scratchId)
    await expect(page.getByTestId('scenario-note-root')).toContainText('Persisted question')
  })

  test('Scen-Notes-7 — non-DRAFT scenario shows Notes among the full tab rail', async ({ page, request }) => {
    const auth = await login(request)
    await seedAuth(page, auth)
    await openScenarioById(page, SOURCE_SCENARIO_ID)

    await expect(page.getByTestId('scenario-result-tab-kpi')).toBeVisible()
    await expect(page.getByTestId('scenario-result-tab-versions')).toBeVisible()
    await expect(page.getByTestId('scenario-result-tab-notes')).toBeVisible()
  })
})
