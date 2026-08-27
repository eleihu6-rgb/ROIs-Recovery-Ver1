/**
 * Regression: Roles → Menus & Buttons cascade save bug
 *
 * Root cause (pre-fix): toggleMenu used `!selMenus.has(code)` to decide
 * whether to add or remove descendants. When a parent was in indeterminate
 * state (e.g. only SCENARIO_ALL granted under SCENARIO), `selMenus.has(
 * 'SCENARIO')` was still true because the parent's own code is in the
 * permissions list. So clicking the indeterminate parent computed
 * `willCheck = false` and the cascade REMOVED every descendant — including
 * any leaves the user wanted. Save persisted an empty subtree; reload
 * showed the leaves unchecked.
 *
 * Fix: use the visual `allSelected` (every descendant in selMenus + every
 * descendant ctrl in selCtrls) instead of `selMenus.has(code)`. With this:
 *  - fully checked → click unchecks all (intuitive)
 *  - indeterminate  → click checks all  (intuitive — matches VS Code,
 *                                            Finder, Windows Explorer)
 *  - unchecked      → click checks all
 *
 * Test scope:
 *  1. Reset Admin role to a state where SCENARIO parent is indeterminate
 *     (SCENARIO+SCENARIO_LIST+SCENARIO_ALL granted; PO/RO/CREW_BIDS not).
 *  2. Navigate to System → Roles → Administrator.
 *  3. Click SCENARIO parent — must add PO/RO/CREW_BIDS (the bug made it
 *     REMOVE everything; after fix it must ADD the missing leaves).
 *  4. Click Save. Toast "Role \"Administrator\" saved" appears.
 *  5. Reload page + reopen role. SCENARIO parent and every leaf must
 *     still be checked.
 *  6. Click SCENARIO parent again — fully checked state must flip to
 *     fully UNCHECKED (cascade remove), save persists empty subtree.
 */
import { test, expect } from '@playwright/test'

test('roles menus cascade: indeterminate parent click adds missing leaves, save+reload preserves them', async ({ page }) => {
  const api = process.env.GANTT_API_URL ?? 'http://localhost:3200'
  const login = await (await page.request.post(`${api}/api/auth/login`, {
    data: { userCode: 'admin', password: '123456' },
  })).json() as { data: { token: string } }
  const token = login.data.token

  // Reset Admin role (id 17) to a known partial state under SCENARIO so the
  // SCENARIO parent is indeterminate (some children granted, some not).
  const menus = await (await page.request.get(`${api}/api/admin/menus`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json() as { data: { menuCode: string }[] }
  const resetCodes = menus.data.map(m => m.menuCode).filter(c =>
    !c.startsWith('SCENARIO_PO') && !c.startsWith('SCENARIO_RO') && c !== 'SCENARIO_CREW_BIDS'
      && c !== 'PBS_SIMULATED_CREW_PORTAL' && c !== 'PBS_PERIOD' && c !== 'PBS_BID_DEFINITIONS'
      && c !== 'PBS_BUSINESS_TIME' && c !== 'PBS_ADMIN_TOOLS'
  )
  await page.request.put(`${api}/api/admin/profiles/17/menus`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { menuCodes: resetCodes },
  })

  await page.goto('/')
  const signIn = page.getByTestId('login-sign-in')
  if (await signIn.isVisible().catch(() => false)) {
    await page.getByTestId('login-user-code').fill('admin')
    await page.getByTestId('login-password').fill('123456')
    await signIn.click()
    await page.waitForTimeout(4000)
  }
  await page.getByTestId('module-nav-system').click()
  await page.waitForTimeout(1500)
  await page.getByTestId('system-nav-profile-mgmt').click()
  await page.waitForTimeout(1500)
  await page.locator('[data-testid^="role-list-"]').filter({ hasText: 'Administrator' }).click()
  await page.waitForTimeout(2000)

  // Pre-flight: SCENARIO parent should be indeterminate (some leaves granted).
  const scenarioParent = page.locator('label').filter({ hasText: /^Scenario$/ }).first()
  await expect(scenarioParent).toBeVisible({ timeout: 10_000 })
  const scenarioBox = scenarioParent.locator('input[type="checkbox"]')
  expect(
    await scenarioBox.evaluate((el: HTMLInputElement) => el.indeterminate),
    'precondition: SCENARIO must be indeterminate before the click',
  ).toBe(true)
  expect(await scenarioBox.isChecked(), 'precondition: indeterminate means visually unchecked').toBe(false)

  // The bug click: SCENARIO parent is indeterminate; clicking must ADD the
  // missing leaves, not REMOVE the existing ones.
  await scenarioBox.click()
  await page.waitForTimeout(400)
  expect(
    await scenarioBox.isChecked(),
    'after click on indeterminate parent, SCENARIO must be fully checked (was: cascade removed everything)',
  ).toBe(true)
  expect(
    await scenarioBox.evaluate((el: HTMLInputElement) => el.indeterminate),
    'after click on indeterminate parent, SCENARIO must NOT be indeterminate',
  ).toBe(false)

  // The leaves we expect now checked: SCENARIO_PO, SCENARIO_RO, SCENARIO_CREW_BIDS.
  // The rendered leaf label is "{menuName}{ctrls.length} btn" — e.g. "Pairing1 btn"
  // for SCENARIO_PO (per sql/seed/05-system-menu.sql). We must scope the leaf
  // lookup to the SCENARIO subtree: the SCENARIO label's immediate parent <div>
  // contains all of its descendants. Going higher in the ancestor chain picks
  // up siblings (LIVE, etc.) where "Roster22 btn" also exists, which would
  // .first() to the wrong element.
  const scenarioSubtree = scenarioParent.locator('xpath=..')
  for (const re of [/^Pairing\d+ btn$/, /^Roster\d+ btn$/, /^Crew Bids\d+ btn$/]) {
    const leaf = scenarioSubtree.locator('label').filter({ hasText: re }).first()
    await expect(leaf, `leaf ${re} must be visible in SCENARIO subtree`).toBeVisible()
    expect(
      await leaf.locator('input[type="checkbox"]').isChecked(),
      `leaf ${re} must be checked after parent cascade (was: cascade deleted it)`,
    ).toBe(true)
  }

  // Save. Toast confirmation must appear (mirrors Live Gantt's save toast).
  await page.getByRole('button', { name: /^Save$/ }).click()
  await expect(page.locator('text=/Role "Administrator" saved/')).toBeVisible({ timeout: 5000 })
  await page.waitForTimeout(500)

  // API defense-in-depth: the saved menu list contains every SCENARIO leaf.
  const afterSave = await (await page.request.get(`${api}/api/admin/profiles/17/permissions`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json() as { data: { menuCodes: string[] } }
  for (const c of ['SCENARIO', 'SCENARIO_LIST', 'SCENARIO_ALL', 'SCENARIO_PO', 'SCENARIO_RO', 'SCENARIO_CREW_BIDS']) {
    expect(afterSave.data.menuCodes, `API must persist ${c}`).toContain(c)
  }

  // Reload + reopen role — leaves must still be checked.
  await page.reload()
  await page.waitForTimeout(2000)
  await page.getByTestId('module-nav-system').click()
  await page.waitForTimeout(1000)
  await page.getByTestId('system-nav-profile-mgmt').click()
  await page.waitForTimeout(1000)
  await page.locator('[data-testid^="role-list-"]').filter({ hasText: 'Administrator' }).click()
  await page.waitForTimeout(2000)

  const scenarioParent2 = page.locator('label').filter({ hasText: /^Scenario$/ }).first()
  const scenarioBox2 = scenarioParent2.locator('input[type="checkbox"]')
  expect(await scenarioBox2.isChecked(), 'after reload, SCENARIO parent must be fully checked').toBe(true)
  const scenarioSubtree2 = scenarioParent2.locator('xpath=..')
  for (const re of [/^Pairing\d+ btn$/, /^Roster\d+ btn$/, /^Crew Bids\d+ btn$/]) {
    const leaf = scenarioSubtree2.locator('label').filter({ hasText: re }).first()
    expect(
      await leaf.locator('input[type="checkbox"]').isChecked(),
      `after reload, leaf ${re} must remain checked`,
    ).toBe(true)
  }

  // Symmetric check: clicking fully-checked SCENARIO must cascade-UNCHECK
  // everything (toggle behavior). Save + reload must show no SCENARIO leaves.
  await scenarioBox2.click()
  await page.waitForTimeout(400)
  expect(
    await scenarioBox2.isChecked(),
    'fully-checked SCENARIO parent click must uncheck it',
  ).toBe(false)

  await page.getByRole('button', { name: /^Save$/ }).click()
  await expect(page.locator('text=/Role "Administrator" saved/')).toBeVisible({ timeout: 5000 })
  await page.waitForTimeout(500)

  const afterUncheck = await (await page.request.get(`${api}/api/admin/profiles/17/permissions`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json() as { data: { menuCodes: string[] } }
  expect(afterUncheck.data.menuCodes, 'after cascade-uncheck, no SCENARIO leaf must remain').not.toContain('SCENARIO_CREW_BIDS')
  expect(afterUncheck.data.menuCodes, 'after cascade-uncheck, SCENARIO_PO must be gone').not.toContain('SCENARIO_PO')
})
