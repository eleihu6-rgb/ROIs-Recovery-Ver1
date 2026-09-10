const { chromium, expect } = require('../../../../e2e/node_modules/@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let checks = 0;
  const check = async (name, fn) => { await fn(); checks++; console.log(`PASS ${name}`); };
  const record = id => page.locator(`[data-record="${id}"]`);
  const action = (name, key) => page.locator(`[data-action="${name}"]${key ? `[data-key="${key}"]` : ''}`);
  const saveDialog = () => page.locator('#dialog button[type="submit"]').click();
  const screenshots = path.resolve(__dirname, '../../../assets/screenshots/crew-recovery');
  const screenshot = async name => {
    fs.mkdirSync(screenshots, { recursive: true });
    let version = 1;
    while (fs.existsSync(path.join(screenshots, `${name}-Ver${version}.png`))) version++;
    const target = path.join(screenshots, `${name}-Ver${version}.png`);
    await page.screenshot({ path: target, fullPage: true });
    console.log(`SCREENSHOT ${target}`);
  };
  try {
    await page.goto(pathToFileURL(path.join(__dirname, 'index.html')).href);
    await check('default set contains all 17 costs', () => expect(page.locator('article[data-record]')).toHaveCount(17));
    await check('GH defaults to 85 hours and incremental $712.50', async () => {
      await expect(record('1002/001').locator('[data-field="guarantee"]')).toHaveValue('85');
      await expect(record('1002/001').locator('.calculation')).toContainText('$712.50');
    });
    await screenshot('legality-cost-desktop');
    await check('templates navigation shows protected 001 catalogue', async () => {
      await action('nav', 'Cost Templates').click();
      await expect(page.locator('.sets')).toBeHidden();
      await expect(page.locator('article[data-record]')).toHaveCount(17);
    });
    await check('copies receive sequential 002 and 003 IDs', async () => {
      await action('copy', '1002/001').click();
      await action('copy', '1002/001').click();
      await action('nav', 'Cost Sets').click();
      await expect(record('1002/002')).toBeVisible();
      await expect(record('1002/003')).toBeVisible();
      await expect(page.locator('article[data-record]')).toHaveCount(19);
    });
    await check('create set defaults to all costs', async () => {
      await action('new-set').click();
      await page.locator('#dialog [name="name"]').fill('Verification set');
      await saveDialog();
      await expect(page.locator('h1')).toContainText('Verification set');
      await expect(page.locator('article[data-record]')).toHaveCount(19);
    });
    await check('membership can remove a cost', async () => {
      await action('members').click();
      await page.locator('#dialog [name="member"][value="1002/003"]').uncheck();
      await saveDialog();
      await expect(record('1002/003')).toHaveCount(0);
      await expect(page.locator('article[data-record]')).toHaveCount(18);
    });
    await check('set edit, shared copy and delete retain original costs', async () => {
      await action('edit-set').click();
      await page.locator('#dialog [name="name"]').fill('Edited verification set');
      await saveDialog();
      await action('copy-set').click();
      await saveDialog();
      await expect(page.locator('h1')).toContainText('Edited verification set copy');
      await expect(page.locator('article[data-record]')).toHaveCount(18);
      await action('delete-set').click();
      await saveDialog();
      await expect(page.locator('h1')).toContainText('Daily Recovery');
      await expect(page.locator('article[data-record]')).toHaveCount(19);
    });
    await check('standby workbench returns 6:45 assignment and $712.50 cash', async () => {
      await action('filter', '1003/001').click();
      await record('1003/001').getByRole('button', { name: 'Calculate', exact: true }).click();
      await expect(record('1003/001').locator('.calculation')).toContainText('6:45');
      await expect(record('1003/001').locator('.calculation')).toContainText('$712.50');
    });
    await screenshot('legality-cost-standby-desktop');
    await check('GH user can add, edit and delete tiers', async () => {
      await action('filter', '1002/001').click();
      await action('add-tier', '1002/001').click();
      await expect(record('1002/001').locator('[data-part="multiplier"]')).toHaveCount(3);
      await record('1002/001').getByLabel('Tier 1 multiplier').fill('1.3');
      await action('calculate', '1002/001').click();
      await expect(record('1002/001').locator('.calculation')).toContainText('$762.50');
      await action('delete-tier', '1002/001:2').click();
      await expect(record('1002/001').locator('[data-part="multiplier"]')).toHaveCount(2);
    });
    await check('hotel has its own quantity and price calculation', async () => {
      await action('filter', '2001/001').click();
      await record('2001/001').locator('[data-field="quantity"]').fill('2');
      await action('calculate', '2001/001').click();
      await expect(record('2001/001').locator('.calculation')).toContainText('$280.00');
      await record('2001/001').locator('[data-field="rate"]').fill('160');
      await action('calculate', '2001/001').click();
      await expect(record('2001/001').locator('.calculation')).toContainText('$320.00');
    });
    await check('GH rejects removed credit greater than baseline', async () => {
      await action('filter', '1002/001').click();
      await record('1002/001').locator('[data-field="removed"]').fill('85');
      await action('calculate', '1002/001').click();
      await expect(record('1002/001').locator('.calculation')).toContainText('Removed credit cannot exceed baseline');
    });
    await page.reload();
    await check('independent set copy remaps standby to copied GH policy', async () => {
      await action('copy-set').click();
      await page.locator('#dialog [name="mode"]').selectOption('new');
      await saveDialog();
      await action('filter', '1003/002').click();
      await expect(record('1003/002').locator('[data-field="ghPolicy"]')).toHaveValue('1002/002');
      await expect(record('1003/002').locator('.calculation')).toContainText('$712.50');
      await record('1003/002').locator('[data-field="ghPolicy"]').selectOption('1002/001');
      await action('calculate', '1003/002').click();
      await expect(record('1003/002').locator('.calculation')).toContainText('GH 1002/001');
    });
    await check('disabled standby excludes calculation without runtime error', async () => {
      await action('meta', '1003/002').click();
      await page.locator('#dialog [name="enabled"]').uncheck();
      await saveDialog();
      await expect(record('1003/002').locator('.calculation')).toContainText('Disabled cost');
    });
    await page.reload();
    await check('orphan copy remains discoverable and can be deleted', async () => {
      await action('copy', '2001/001').click();
      await action('members').click();
      await page.locator('#dialog [name="member"][value="2001/002"]').uncheck();
      await saveDialog();
      await expect(record('2001/002')).toHaveCount(0);
      await action('filter', '2001/002').click();
      await expect(record('2001/002')).toBeVisible();
      await action('meta', '2001/002').click();
      await action('delete-instance', '2001/002').click();
      await expect(action('filter', '2001/002')).toHaveCount(0);
    });
    await action('expand-all').click();
    await check('category badges do not overlap unit price column', async () => {
      const overlap = await page.locator('.rowhead').evaluateAll(rows => rows.some(row => {
        const badge = row.children[1].querySelector('.badge').getBoundingClientRect();
        const price = row.children[2].getBoundingClientRect();
        return badge.right > price.left;
      }));
      expect(overlap).toBe(false);
    });
    await record('3005/001').scrollIntoViewIfNeeded();
    await screenshot('legality-cost-operating-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await check('mobile navigation and standby calculation work', async () => {
      await action('nav', 'Cost Templates').click();
      await action('filter', '1003/001').click();
      await action('calculate', '1003/001').click();
      await expect(record('1003/001').locator('.calculation')).toContainText('$712.50');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      expect(overflow).toBe(false);
    });
    await screenshot('legality-cost-mobile');
    await check('no browser runtime errors', async () => expect(errors).toEqual([]));
    console.log(`PASS ${checks} Playwright checks`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
