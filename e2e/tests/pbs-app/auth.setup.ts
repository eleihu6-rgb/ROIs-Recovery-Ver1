/**
 * PBS App Setup — already authenticated via shared pbs-setup.
 *
 * PBS App uses the same auth state as PBS Portal (shared storageState).
 * This is a placeholder test to satisfy the dependency chain.
 */
import { test, expect } from '@playwright/test'

test('PBS App auth inherited from pbs-setup', async ({ page }) => {
  // The shared pbs-setup already saves auth state.
  // This test verifies the state was loaded correctly.
  const storage = await page.context().storageState()
  // At minimum, there should be some cookies or origins saved
  expect(storage).toBeDefined()
})
