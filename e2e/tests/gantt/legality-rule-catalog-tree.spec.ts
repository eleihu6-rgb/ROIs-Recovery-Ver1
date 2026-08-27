/**
 * Legality Rule Catalog Tree — E2E tests.
 *
 * Covers: tree panel renders with instance nodes and template badge, inline cell
 * editing (Category column) — save on Enter, cancel on Escape, and Add to Set
 * action from the catalog tree.
 *
 * Key adaptations from the spec brief:
 * - The rule table only shows rows AFTER a rule set is selected. The store
 *   auto-selects the first set on init, so inline-edit tests wait for that.
 * - The catalog tree only shows instance nodes (and their action buttons) after
 *   the user expands a category then a function node. We expand those in tests
 *   that need instance visibility.
 * - The Add to Set test creates a fresh empty set so every catalog-add button
 *   is enabled, then deletes the set at the end.
 * - Action buttons in the tree are hover-revealed (opacity-0 → opacity-100 via
 *   group-hover). We hover the instance node's div before asserting / clicking.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://127.0.0.1:3000'

interface Auth {
  token: string
  userCode: string
  userName: string
  schema: string
  isAdmin: number
}

const adminLogin = async (request: APIRequestContext): Promise<Auth> => {
  const res = await request.post(`${GANTT_API}/api/auth/login`, {
    data: { userCode: 'admin', password: '123456' },
  })
  expect(res.ok()).toBeTruthy()
  const a = ((await res.json()) as { data: Auth }).data
  expect(a.isAdmin).toBe(1)
  return a
}

const seedAdmin = async (page: Page, a: Auth) => {
  await page.addInitScript((x) => {
    window.sessionStorage.setItem(
      'rois-auth',
      JSON.stringify({
        user: { userCode: x.userCode, userName: x.userName, schema: x.schema, isAdmin: x.isAdmin },
        token: x.token,
      }),
    )
  }, a)
}

/**
 * Navigate to the Legality → Rule Sets view and wait for it to be visible.
 * The store auto-selects the first ruleset on init, so by the time you await
 * `legality-nav-rule-sets` the init() call is already in flight.
 */
const goToLegalityRuleSets = async (page: Page) => {
  await page.goto('/')
  await page.getByTestId('module-nav-legality').click()
  await page.getByTestId('legality-nav-rule-sets').waitFor({ state: 'visible' })
  await expect(page.getByTestId('legality-rule-sets-view')).toBeVisible()
}

/**
 * Expand the first category node and first function node inside the Rule Catalog
 * Tree so that Level-4 instance nodes become visible.
 *
 * The tree auto-expands Level-1 reference nodes on load. Category and function
 * nodes require a click to open.
 *
 * DOM order of buttons in the scrollable area (after initial load):
 *   nth(0) → L1 reference button (already expanded)
 *   nth(1) → L2 first category button (collapsed — click to expand)
 *   nth(2) → L3 first function button (appears after category expands — click to expand)
 * After both clicks the L4 instance divs are rendered.
 */
const expandTreeToInstances = async (page: Page) => {
  const treeScroll = page.getByTestId('rule-catalog-tree').locator('.overflow-y-auto')

  // Wait for at least the first L2 category button to be visible (tree loaded and
  // L1 reference node auto-expanded so L2 buttons are in the DOM).
  // nth(1) = first button after the already-expanded L1 reference button at nth(0);
  // tree expand toggles have no testids — position is reliable because L1 is always
  // auto-expanded on load, placing the first L2 category button at index 1.
  await treeScroll.locator('button').nth(1).waitFor({ state: 'visible', timeout: 15000 })

  // click first L2 category button (nth(1) = first button after the already-expanded L1 reference button)
  await treeScroll.locator('button').nth(1).click()

  // click first L3 function button (nth(2) = next button after category expansion;
  // it appears at index 2 because index 0 is the L1 reference button and index 1 is
  // the now-expanded L2 category button)
  await treeScroll.locator('button').nth(2).waitFor({ state: 'visible', timeout: 5000 })
  await treeScroll.locator('button').nth(2).click()
}

test.describe('Legality — Rule Catalog Tree', () => {
  test('tree panel renders with template badge and instance nodes', async ({ page, request }) => {
    const auth = await adminLogin(request)
    await seedAdmin(page, auth)

    await goToLegalityRuleSets(page)

    // The left panel must be present.
    await expect(page.getByTestId('rule-catalog-tree')).toBeVisible()

    // Expand tree so Level-4 instance nodes appear.
    await expandTreeToInstances(page)

    // At least one instance node must be rendered with non-empty text content.
    const instances = page.locator('[data-testid^="catalog-instance-"]')
    await expect(instances).not.toHaveCount(0)
    await expect(instances.first()).toContainText(/\S+/)

    // At least one template (instance 001) must show the gold "Template" badge.
    await expect(
      page.getByTestId('rule-catalog-tree').getByText('Template').first(),
    ).toBeVisible()
  })

  test('inline Description cell editing — admin can update and save', async ({ page, request }) => {
    const auth = await adminLogin(request)
    await seedAdmin(page, auth)

    await goToLegalityRuleSets(page)

    const firstRow = page.locator('[data-testid^="legality-rule-row-"]').first()
    await firstRow.waitFor({ state: 'visible', timeout: 15_000 })

    // Description is Col 2 (td index 1): Rule | Description | Reference | Category | …
    const descCell = firstRow.locator('[data-testid^="legality-rule-description-"]')
    const origText = ((await descCell.textContent()) ?? '').trim()

    await descCell.locator('span').first().click()
    const input = descCell.locator('input')
    await expect(input).toBeVisible()
    await input.fill('QA-Desc-Test')
    await input.press('Enter')
    await expect(descCell).toContainText('QA-Desc-Test', { timeout: 10_000 })

    await descCell.locator('span').first().click()
    const restoreInput = descCell.locator('input')
    await expect(restoreInput).toBeVisible()
    const restoreVal = origText === '—' ? '' : origText
    await restoreInput.fill(restoreVal)
    await restoreInput.press('Enter')
    await expect(descCell).toContainText(origText === '—' ? '—' : origText, { timeout: 10_000 })
  })

  test('catalog instance header Description is editable for admin', async ({ page, request }) => {
    const auth = await adminLogin(request)
    await seedAdmin(page, auth)

    await goToLegalityRuleSets(page)
    await expandTreeToInstances(page)

    const template = page.locator('[data-testid^="catalog-instance-"]').filter({ hasText: '001' }).first()
    await expect(template).toBeVisible({ timeout: 15_000 })
    await template.click()

    const desc = page.getByTestId('legality-catalog-description')
    await expect(desc).toBeVisible({ timeout: 10_000 })
    const origText = ((await desc.textContent()) ?? '').trim()

    await desc.locator('span').first().click()
    const input = desc.locator('input')
    await expect(input).toBeVisible()
    await input.fill('QA-Catalog-Desc')
    await input.press('Enter')
    await expect(desc).toContainText('QA-Catalog-Desc', { timeout: 10_000 })

    await desc.locator('span').first().click()
    const restoreInput = desc.locator('input')
    await expect(restoreInput).toBeVisible()
    const restoreVal = origText === '—' ? '' : origText
    await restoreInput.fill(restoreVal)
    await restoreInput.press('Enter')
    await expect(desc).toContainText(origText === '—' ? '—' : origText, { timeout: 10_000 })
  })

  test('inline Category cell editing — admin can update and save', async ({ page, request }) => {
    const auth = await adminLogin(request)
    await seedAdmin(page, auth)

    await goToLegalityRuleSets(page)

    // The store auto-selects the first ruleset on init.  Wait for the first rule
    // row to appear (up to 15 s to allow the async init + selectSet to finish).
    const firstRow = page.locator('[data-testid^="legality-rule-row-"]').first()
    await firstRow.waitFor({ state: 'visible', timeout: 15000 })

    // Category is Col 4 (td index 3): Rule | Description | Reference | Category | …
    const catCell = firstRow.locator('td').nth(3)
    const origText = ((await catCell.textContent()) ?? '').trim()

    // Click the outer span to enter edit mode.
    await catCell.locator('span').first().click()

    // An <input> replaces the span.
    const input = catCell.locator('input')
    await expect(input).toBeVisible()

    // Type a new value and confirm with Enter.
    await input.fill('QA-Cat-Test')
    await input.press('Enter')

    // After the async save + store update the cell must display the new value.
    await expect(catCell).toContainText('QA-Cat-Test', { timeout: 10000 })

    // Restore the original value so the test leaves no side effects.
    await catCell.locator('span').first().click()
    const restoreInput = catCell.locator('input')
    await expect(restoreInput).toBeVisible()
    // '—' is the placeholder for a null category; restore by clearing the input.
    const restoreVal = origText === '—' ? '' : origText
    await restoreInput.fill(restoreVal)
    await restoreInput.press('Enter')

    // Assert the cell shows the restored value.
    await expect(firstRow.locator('td').nth(3)).toContainText(origText === '—' ? '—' : origText, { timeout: 10000 })
  })

  test('Escape key cancels edit and reverts value', async ({ page, request }) => {
    const auth = await adminLogin(request)
    await seedAdmin(page, auth)

    await goToLegalityRuleSets(page)

    const firstRow = page.locator('[data-testid^="legality-rule-row-"]').first()
    await firstRow.waitFor({ state: 'visible', timeout: 15000 })

    const catCell = firstRow.locator('td').nth(3)
    const origText = ((await catCell.textContent()) ?? '').trim()

    // Enter edit mode.
    await catCell.locator('span').first().click()
    const input = catCell.locator('input')
    await expect(input).toBeVisible()

    // Type something, then press Escape — must NOT save.
    await input.fill('SHOULD-NOT-SAVE')
    await input.press('Escape')

    // The abandoned value must not appear.
    await expect(catCell).not.toContainText('SHOULD-NOT-SAVE')

    // The displayed text must still be the original (or the placeholder '—').
    const expected = origText || '—'
    await expect(catCell).toContainText(expected)
  })

  test('Add to Set — adds a catalog rule to an empty rule set', async ({ page, request }) => {
    const auth = await adminLogin(request)
    await seedAdmin(page, auth)
    const token = auth.token
    const SET_NAME = `QA-CatalogAdd-${Date.now()}`

    await goToLegalityRuleSets(page)

    // ── 1. Create a fresh empty rule set ────────────────────────────────────
    // An empty set guarantees every catalog-add button is enabled (no rule is
    // already in the set).
    await page.getByTestId('rule-set-new-btn').click()
    await page.getByTestId('rule-set-name-input').fill(SET_NAME)
    await page.getByTestId('rule-set-new-confirm').click()

    // The new set is now selected — header shows its name.
    await expect(page.getByTestId('legality-set-name')).toContainText(SET_NAME, { timeout: 10000 })

    // ── 2. Expand the catalog tree to reveal instance nodes ─────────────────
    await expandTreeToInstances(page)

    // ── 3. Hover the first instance node to reveal the action buttons ────────
    // The buttons start at opacity-0 and become opacity-100 on group-hover.
    const firstInstance = page.locator('[data-testid^="catalog-instance-"]').first()
    await firstInstance.waitFor({ state: 'visible', timeout: 5000 })
    await firstInstance.hover()

    // ── 4. Click the Add-to-Set button ──────────────────────────────────────
    // Because the set is empty, the first add button must be enabled.
    const addBtn = page.locator('[data-testid^="catalog-add-"]').first()
    await expect(addBtn).toBeVisible({ timeout: 5000 })
    await expect(addBtn).not.toBeDisabled()
    await addBtn.click()

    // ── 5. Assert the rule table now contains exactly one row ────────────────
    // addRule → API POST → selectSet (re-fetch) → store.rules = [newRule] → re-render
    await expect(page.locator('[data-testid^="legality-rule-row-"]')).toHaveCount(1, {
      timeout: 15000,
    })

    // ── 6. Cleanup: delete the test set ─────────────────────────────────────
    await page.getByTestId('rule-set-delete-btn').click()
    await page.getByTestId('rule-set-delete-confirm').click()

    // Poll API until the set is gone.
    await expect
      .poll(
        async () => {
          const res = await request.get(`${GANTT_API}/api/legality/rulesets`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          const body = (await res.json()) as { data: Array<{ name: string }> }
          return body.data.find((s) => s.name === SET_NAME)
        },
        { timeout: 10000 },
      )
      .toBeUndefined()
  })

  test('Rule Instances view — Add to Set button adds template to selected set', async ({ page, request }) => {
    const auth = await adminLogin(request)
    await seedAdmin(page, auth)
    const token = auth.token
    const SET_NAME = `QA-InstAddToSet-${Date.now()}`

    await goToLegalityRuleSets(page)

    // ── 1. Create a fresh empty rule set so the template is not yet in it ─────
    await page.getByTestId('rule-set-new-btn').click()
    await page.getByTestId('rule-set-name-input').fill(SET_NAME)
    await page.getByTestId('rule-set-new-confirm').click()
    await expect(page.getByTestId('legality-set-name')).toContainText(SET_NAME, { timeout: 10000 })

    // ── 2. Switch to Rule Instances tab (store retains selectedId) ────────────
    await page.getByTestId('legality-nav-rule-instances').click()
    await expect(page.getByTestId('rule-instances-view')).toBeVisible()

    // Wait for at least one template row to appear
    const templateBadge = page.locator('[data-testid^="rule-instance-template-"]').first()
    await templateBadge.waitFor({ state: 'visible', timeout: 10000 })

    // ── 3. Find the Add to Set button for the first template row ─────────────
    // data-testid pattern: rule-instance-add-to-set-{function}-{instance}
    // Since the set is empty, the button must be enabled for all instances.
    const templateKey = await templateBadge.getAttribute('data-testid')
    // e.g. "rule-instance-template-8002-001" → "8002-001"
    const suffix = templateKey?.replace('rule-instance-template-', '') ?? ''
    const addBtn = page.getByTestId(`rule-instance-add-to-set-${suffix}`)
    await expect(addBtn).toBeVisible()
    await expect(addBtn).not.toBeDisabled()
    await addBtn.click()

    // ── 4. After add, the button becomes disabled (rule is now in the set) ────
    await expect(addBtn).toBeDisabled({ timeout: 10000 })

    // ── 5. Navigate back to Rule Sets and verify the set has 1 rule ──────────
    await page.getByTestId('legality-nav-rule-sets').click()
    await expect(page.getByTestId('legality-set-name')).toContainText(SET_NAME, { timeout: 10000 })
    await expect(page.locator('[data-testid^="legality-rule-row-"]')).toHaveCount(1, { timeout: 10000 })

    // ── 6. Cleanup: delete the test set ──────────────────────────────────────
    await page.getByTestId('rule-set-delete-btn').click()
    await page.getByTestId('rule-set-delete-confirm').click()
    await expect
      .poll(
        async () => {
          const res = await request.get(`${GANTT_API}/api/legality/rulesets`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          const body = (await res.json()) as { data: Array<{ name: string }> }
          return body.data.find((s) => s.name === SET_NAME)
        },
        { timeout: 10000 },
      )
      .toBeUndefined()
  })

  test('Division cell — dropdown loads dictionary DIVISION options and saves', async ({ page, request }) => {
    const auth = await adminLogin(request)
    await seedAdmin(page, auth)

    await goToLegalityRuleSets(page)

    // The store auto-selects the first ruleset on init. Wait for the first rule row.
    const firstRow = page.locator('[data-testid^="legality-rule-row-"]').first()
    await firstRow.waitFor({ state: 'visible', timeout: 15000 })

    // Division is Col 5 (td index 4): Rule | Description | Reference | Category | Division | Severity
    const divCell = firstRow.locator('td').nth(4)
    const origText = ((await divCell.textContent()) ?? '').trim()

    // Click the outer span to enter edit mode — must open a <select> (not a text input)
    await divCell.locator('span').first().click()
    const sel = divCell.locator('select')
    await expect(sel).toBeVisible()

    // Dictionary DIVISION has at least 'Pilot' (P) and 'Cabin' (C) options loaded from the API
    await expect(sel.locator('option[value="P"]')).toHaveCount(1)
    await expect(sel.locator('option[value="C"]')).toHaveCount(1)

    // Pick whichever option is not currently selected; fall back to 'P' if value is empty
    const currentVal = await sel.inputValue()
    const targetVal = currentVal === 'P' ? 'C' : 'P'
    const targetLabel = targetVal === 'P' ? 'Pilot' : 'Cabin'
    await sel.selectOption(targetVal)
    await sel.press('Enter')

    // The cell must now display the label (not the code) from the dictionary
    await expect(divCell).toContainText(targetLabel, { timeout: 10000 })

    // Restore original value
    await divCell.locator('span').first().click()
    const restoreSel = divCell.locator('select')
    await expect(restoreSel).toBeVisible()
    if (currentVal) {
      await restoreSel.selectOption(currentVal)
    } else {
      await restoreSel.selectOption('')
    }
    await restoreSel.press('Enter')
    await expect(divCell).toContainText(origText || '—', { timeout: 10000 })
  })

  test('Severity cell — select Hard saves and displays Hard chip', async ({ page, request }) => {
    const auth = await adminLogin(request)
    await seedAdmin(page, auth)

    await goToLegalityRuleSets(page)

    // The store auto-selects the first ruleset on init. Wait for the first rule row.
    const firstRow = page.locator('[data-testid^="legality-rule-row-"]').first()
    await firstRow.waitFor({ state: 'visible', timeout: 15000 })

    // Severity is the 6th td (index 5): Rule | Description | Reference | Category | Division | Severity
    const sevCell = firstRow.locator('td').nth(5)

    // Record original severity display text for restore
    const origText = ((await sevCell.textContent()) ?? '').trim()

    // Click the outer span to enter edit mode
    await sevCell.locator('span').first().click()
    const sel = sevCell.locator('select')
    await expect(sel).toBeVisible()

    // Choose 'Hard' (3) if not already Hard; otherwise pick 'Soft' (1)
    const currentVal = await sel.inputValue()
    const targetVal = currentVal === '3' ? '1' : '3'
    const targetLabel = targetVal === '3' ? 'Hard' : 'Soft'
    await sel.selectOption(targetVal)
    // Commit via Enter key — component handles onKeyDown Enter → commit()
    await sel.press('Enter')

    // Assert the cell now shows the target label chip
    await expect(sevCell).toContainText(targetLabel, { timeout: 10000 })

    // Restore original severity
    await sevCell.locator('span').first().click()
    const restoreSel = sevCell.locator('select')
    await expect(restoreSel).toBeVisible()
    await restoreSel.selectOption(currentVal)
    await restoreSel.press('Enter')
    await expect(sevCell).toContainText(origText || '—', { timeout: 10000 })
  })

  test('clicking a catalog instance shows its params on the right', async ({ page, request }) => {
    const auth = await adminLogin(request)
    await seedAdmin(page, auth)
    await goToLegalityRuleSets(page)

    await expect(page.getByTestId('rule-catalog-tree')).toBeVisible()

    // Search for 8056 so only that function's instances remain expanded/visible
    const tree = page.getByTestId('rule-catalog-tree')
    await tree.locator('input').fill('8056')
    const instance001 = page.getByTestId('catalog-instance-8056-001')
    await expect(instance001).toBeVisible({ timeout: 15000 })

    await instance001.click()

    const paramsPanel = page.getByTestId('legality-catalog-instance-params')
    await expect(paramsPanel).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('legality-catalog-instance-title')).toContainText('8056/001')

    // Params content: editor (admin) or read-only table — must remount per instance
    const editor = page.getByTestId('legality-params-editor-8056-001')
    const readonly = page.getByTestId('legality-params-8056-001')
    await expect(editor.or(readonly)).toBeVisible()

    // Switch to 002 — header and param panel must both reflect 002 (not stale 001 editor state)
    const instance002 = page.getByTestId('catalog-instance-8056-002')
    await expect(instance002).toBeVisible({ timeout: 5000 })
    await instance002.click()
    await expect(page.getByTestId('legality-catalog-instance-title')).toContainText('8056/002')
    const editor002 = page.getByTestId('legality-params-editor-8056-002')
    const readonly002 = page.getByTestId('legality-params-8056-002')
    await expect(editor002.or(readonly002)).toBeVisible()
    await expect(page.getByTestId('legality-params-editor-8056-001')).toHaveCount(0)
    await expect(page.getByTestId('legality-params-8056-001')).toHaveCount(0)

    // Selecting a rule set clears catalog view and restores the set table
    const setCard = page.locator('[data-testid^="legality-ruleset-card-"]').first()
    await setCard.click()
    await expect(paramsPanel).toHaveCount(0)
    await expect(page.locator('[data-testid^="legality-rule-row-"]').first()).toBeVisible({ timeout: 15000 })
  })
})
