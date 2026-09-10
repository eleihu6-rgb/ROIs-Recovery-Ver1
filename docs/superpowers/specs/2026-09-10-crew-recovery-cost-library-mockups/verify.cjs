const { chromium, expect } = require('../../../../e2e/node_modules/@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const screenshots = path.resolve(__dirname, '../../../assets/screenshots/crew-recovery');
const results = [];
const check = async (label, task) => { await task(); results.push({ label, status: 'PASS' }); console.log(`PASS ${label}`); };
const shot = async (page, name) => {
  fs.mkdirSync(screenshots, { recursive: true });
  let version = 1;
  while (fs.existsSync(path.join(screenshots, `${name}-Ver${version}.png`))) version++;
  const filename = path.join(screenshots, `${name}-Ver${version}.png`);
  await page.screenshot({ path: filename, fullPage: true });
  results.push({ screenshot: filename });
};
const go = (page, name) => page.goto(pathToFileURL(path.join(__dirname, `${name}.html`)).href);
const change = async (page, label, value) => {
  const input = page.getByLabel(label, { exact: true }).first();
  await input.fill(String(value)); await input.press('Tab');
};
(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('requestfailed', r => errors.push(`${r.url()}: ${r.failure()?.errorText}`));
    await go(page, 'catalogue');
    await check('Catalogue opens with 17 costs and GH preview', async () => {
      await expect(page.locator('.cost-table tbody tr')).toHaveCount(17);
      await expect(page.getByTestId('sample-result')).toHaveText('$712.50');
    });
    await shot(page, 'cost-catalogue-desktop');
    await check('Search and empty state', async () => {
      await page.getByLabel('Search costs').fill('missing-cost');
      await expect(page.getByText('No matching cost types.')).toBeVisible();
      await page.getByLabel('Search costs').fill('hotel');
      await expect(page.locator('.cost-table tbody tr')).toHaveCount(2);
      await page.getByLabel('Search costs').fill('');
    });
    await check('Category filter', async () => {
      await page.locator('[data-category="Accommodation"]').click();
      await expect(page.locator('.cost-table tbody tr')).toHaveCount(4);
      await page.locator('[data-category="All costs"]').click();
    });
    await check('Hotel quantity, price editing and minimum logic', async () => {
      await page.locator('[data-select="L01"]').click();
      await expect(page.getByTestId('sample-result')).toHaveText('$1,680.00');
      await change(page, 'Unit price (USD)', 180);
      await expect(page.getByTestId('sample-result')).toHaveText('$2,160.00');
      await page.getByLabel('Calculation logic', {exact:true}).selectOption('minimum');
      await change(page, 'Minimum billable quantity', 4);
      await change(page, 'Test quantity', 2);
      await expect(page.getByTestId('sample-result')).toHaveText('$720.00');
      await page.getByLabel('Calculation logic', {exact:true}).selectOption('quantity');
      await expect(page.getByTestId('sample-result')).toHaveText('$360.00');
    });
    await check('Save and reload retains the rate', async () => {
      await page.getByRole('button', {name:'Save draft',exact:true}).click();
      await page.reload();await page.locator('[data-select="L01"]').click();
      await expect(page.getByLabel('Unit price (USD)', {exact:true})).toHaveValue('180');
    });
    await check('Fixed event and disabled/unpriced states', async () => {
      await page.getByLabel('Calculation logic', {exact:true}).selectOption('fixed');
      await expect(page.getByTestId('sample-result')).toHaveText('$180.00');
      await page.getByLabel('Enabled in calculations').uncheck();
      await expect(page.getByTestId('sample-result')).toHaveText('Unpriced');
      await page.getByLabel('Enabled in calculations').check();
      await page.locator('[data-select="P12"]').click();
      await expect(page.getByTestId('sample-result')).toHaveText('Unpriced');
    });
    await check('Duplicate and rename a cost', async () => {
      await page.locator('[data-select="L06"]').click();
      await page.getByRole('button',{name:'Duplicate cost',exact:true}).click();
      await change(page,'Cost name','Late-night transfer');
      await expect(page.locator('.cost-table tbody tr')).toHaveCount(18);
      await expect(page.locator('.editor-title h2')).toHaveText('Late-night transfer');
    });
    await check('Export and validated import round trip', async () => {
      const downloadPromise=page.waitForEvent('download');
      await page.getByRole('button',{name:'Export configuration',exact:true}).click();
      const download=await downloadPromise, file=await download.path();
      await page.getByRole('button',{name:'Reset demo',exact:true}).click();
      await page.locator('#import-file').setInputFiles(file);
      await expect(page.locator('.cost-table tbody tr')).toHaveCount(18);
      await expect(page.locator('#status')).toContainText('Configuration imported');
      await page.locator('#import-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"version":9}')});
      await expect(page.locator('#status')).toContainText('Import rejected');
      await expect(page.locator('.cost-table tbody tr')).toHaveCount(18);
    });
    await page.getByRole('button',{name:'Reset demo',exact:true}).click();
    await page.getByRole('button',{name:'Save draft',exact:true}).click();
    await go(page,'workbench');
    await check('GH 85 with 1.2/1.5 tiers produces A 712.50 and B zero', async () => {
      await expect(page.getByLabel('Guaranteed hours',{exact:true})).toHaveValue('85');
      await expect(page.getByLabel('Tier 1 upper hours')).toHaveValue('90');
      await expect(page.getByLabel('Tier 1 multiplier')).toHaveValue('1.2');
      await expect(page.getByLabel('Tier 2 multiplier')).toHaveValue('1.5');
      await expect(page.getByTestId('crew-a-total')).toHaveText('$712.50');
      await expect(page.getByTestId('crew-b-total')).toHaveText('$0.00');
      await expect(page.getByTestId('crew-difference')).toHaveText('$712.50');
      await expect(page.getByTestId('standby-credit')).toHaveText('1:00');
      await expect(page.getByTestId('assignment-credit')).toHaveText('6:45');
    });
    await shot(page,'cost-workbench-desktop');
    await check('Already above guarantee, combined duties and boundary', async () => {
      await change(page,'Baseline credit A (h)',91);
      await expect(page.getByTestId('crew-a-total')).toHaveText('$1,012.50');
      await change(page,'Baseline credit A (h)',84);
      await change(page,'Pairing credit (h)',5);
      await expect(page.getByTestId('crew-a-total')).toHaveText('$600.00');
      await change(page,'Pairing credit (h)',0);
      await expect(page.getByTestId('crew-a-total')).toHaveText('$0.00');
      await change(page,'Pairing credit (h)',5.75);
      await change(page,'Removed future credit (h)',5.75);
      await expect(page.getByTestId('crew-a-total')).toHaveText('$0.00');
      await change(page,'Removed future credit (h)',0);
    });
    await check('Multiplier change and invalid guarantee rejection', async () => {
      await change(page,'Tier 1 multiplier',2);
      await expect(page.getByTestId('crew-a-total')).toHaveText('$1,112.50');
      await change(page,'Guaranteed hours',95);
      await expect(page.locator('.editor-error')).toContainText('Tier boundaries');
      await change(page,'Guaranteed hours',85);
      await change(page,'Tier 1 multiplier',1.2);
    });
    await check('Tier rows can be added, edited, deleted and saved', async () => {
      await page.getByRole('button',{name:'Add tier',exact:true}).click();
      await expect(page.locator('.tier-row')).toHaveCount(3);
      await change(page,'Tier 2 multiplier',1.4);
      await expect(page.getByTestId('crew-a-total')).toHaveText('$705.00');
      await page.getByRole('button',{name:'Delete tier 2',exact:true}).click();
      await expect(page.locator('.tier-row')).toHaveCount(2);
      await expect(page.getByTestId('crew-a-total')).toHaveText('$712.50');
      await change(page,'Tier 1 upper hours',88);
      await expect(page.getByTestId('crew-a-total')).toHaveText('$772.50');
      await page.getByRole('button',{name:'Save rule',exact:true}).click();
      await page.reload();
      await expect(page.getByLabel('Tier 1 upper hours')).toHaveValue('88');
      await change(page,'Tier 1 upper hours',90);
      await page.getByRole('button',{name:'Delete tier 2',exact:true}).click();
      await expect(page.getByLabel('Tier 1 upper hours')).toBeDisabled();
      await expect(page.getByRole('button',{name:'Delete tier 1',exact:true})).toBeDisabled();
      await page.getByRole('button',{name:'Reset demo',exact:true}).click();
    });
    await check('Standby X/Y are configurable and pay uses credit, not a fee', async () => {
      await page.getByLabel('Cost type',{exact:true}).selectOption('P03');
      await expect(page.getByLabel('X - standby credit factor')).toHaveValue('0.5');
      await expect(page.getByLabel('Y - hours before departure')).toHaveValue('1');
      await shot(page,'cost-standby-desktop');
      await page.setViewportSize({width:390,height:844});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
      await shot(page,'cost-standby-mobile');
      await page.setViewportSize({width:1440,height:1000});
      await change(page,'X - standby credit factor',0.75);
      await expect(page.getByTestId('standby-credit')).toHaveText('1:30');
      await expect(page.getByTestId('assignment-credit')).toHaveText('7:15');
      await expect(page.getByTestId('crew-a-total')).toHaveText('$787.50');
      await change(page,'Y - hours before departure',2);
      await expect(page.getByTestId('standby-credit')).toHaveText('0:45');
      await page.getByRole('button',{name:'Save rule',exact:true}).click();
      await page.reload();await page.getByLabel('Cost type',{exact:true}).selectOption('P03');
      await expect(page.getByLabel('X - standby credit factor')).toHaveValue('0.75');
      await page.getByRole('button',{name:'Reset demo',exact:true}).click();
      await change(page,'Standby credit already in baseline (h)',1);
      await expect(page.getByTestId('crew-a-total')).toHaveText('$570.00');
      await change(page,'Standby credit already in baseline (h)',0);
      await change(page,'Pairing departure (UTC)','2026-09-10T07:30');
      await expect(page.getByTestId('standby-credit')).toHaveText('0:00');
      await change(page,'Pairing departure (UTC)','2026-09-11T02:00');
      await change(page,'Standby report (UTC)','2026-09-10T23:00');
      await expect(page.getByTestId('assignment-credit')).toHaveText('6:45');
      await page.getByRole('button',{name:'Reset demo',exact:true}).click();
      await page.getByRole('button',{name:'Save draft',exact:true}).click();
    });
    await check('Delay band crossing uses baseline difference', async () => {
      await page.getByLabel('Cost type',{exact:true}).selectOption('X01');
      await expect(page.getByTestId('sample-result')).toHaveText('$500.00');
      await change(page,'Rate after first band',30);
      await expect(page.getByTestId('sample-result')).toHaveText('$600.00');
    });
    await check('Booking refunds and shared vehicle quantity', async () => {
      await page.getByLabel('Cost type',{exact:true}).selectOption('L08');
      await expect(page.getByTestId('sample-result')).toHaveText('$20.00');
      await change(page,'Refund available (USD)',0);
      await expect(page.getByTestId('sample-result')).toHaveText('$160.00');
      await change(page,'Refund available (USD)',141);
      await expect(page.locator('.editor-error')).toContainText('Refund cannot exceed');
      await change(page,'Refund available (USD)',140);
      await page.getByLabel('Cost type',{exact:true}).selectOption('L06');
      await change(page,'Test quantity',2);
      await expect(page.getByTestId('sample-result')).toHaveText('$160.00');
    });
    await page.getByRole('button',{name:'Reset demo',exact:true}).click();
    await go(page,'comparison');
    await check('Lowest crew cash selects B; total cash selects A', async () => {
      await page.getByRole('button',{name:'Run automatic selection',exact:true}).click();
      await expect(page.locator('.decision-status')).toContainText('Crew B');
      await page.getByLabel('Lowest-cost objective').selectOption('total');
      await expect(page.locator('.decision-status')).toContainText('re-evaluation');
      await page.getByRole('button',{name:'Run automatic selection',exact:true}).click();
      await expect(page.locator('.decision-status')).toContainText('Crew A');
      await expect(page.locator('[data-pick="recall"]')).toBeDisabled();
    });
    await shot(page,'cost-comparison-desktop');
    await check('Selection cap and manual decision with reason', async () => {
      await change(page,'Automatic selection cap (USD)',100);
      await page.getByRole('button',{name:'Run automatic selection',exact:true}).click();
      await expect(page.locator('.decision-status')).toContainText('Manual review required');
      await page.locator('[data-pick="b"]').click();
      await expect(page.locator('#status')).toContainText('Enter a manual decision reason');
      await page.getByLabel('Manual decision reason').fill('Preserve crew A for the next wave');
      await page.locator('[data-pick="b"]').click();
      await expect(page.locator('.decision-status')).toContainText('Selected by user');
    });
    await check('Daily cases have specific options and warning/violation states', async () => {
      await page.locator('[data-case="retiming"]').click();
      await expect(page.locator('.case-banner')).toContainText('Advance warning');
      await expect(page.locator('.option-table')).toContainText('Swap with shorter rotation');
      await page.locator('[data-case="outstation"]').click();
      await expect(page.locator('.case-banner')).toContainText('Actual violation');
      await expect(page.locator('.option-table')).toContainText('Position team / own airline');
      await expect(page.locator('.option-table')).toContainText('$6,255.00');
      await page.locator('[data-case="aircraft"]').click();
      await expect(page.locator('[data-pick="illegal"]')).toBeDisabled();
      await expect(page.locator('.option-table')).toContainText('TYPE-L consumption stays at two');
    });
    await check('Changing a recovery cost invalidates selection and recalculates', async () => {
      await page.locator('[data-case="absence"]').click();
      await page.getByLabel('Cost type',{exact:true}).selectOption('P03');
      await change(page,'X - standby credit factor',1);
      await expect(page.locator('.option-table')).toContainText('$862.50');
      await expect(page.locator('.decision-status')).toContainText('re-evaluation');
      await page.getByLabel('Enabled in calculations').uncheck();
      await expect(page.locator('[data-pick="a"]')).toBeDisabled();
      await expect(page.locator('[data-pick="b"]')).toBeDisabled();
    });
    for(const name of ['catalogue','workbench','comparison']){
      await go(page,name);await page.getByRole('button',{name:'Reset demo',exact:true}).click();
      await page.setViewportSize({width:390,height:844});
      await check(`${name} mobile page has no horizontal overflow`,async()=>{
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
        await expect(page.getByRole('heading',{level:1})).toBeVisible();
        await expect(page.locator('.brand-symbol svg')).toHaveCount(1);
      });
      await shot(page,`cost-${name}-mobile`);
      await check(`${name} mobile editor accepts changes`,async()=>{
        await change(page,'Unit price (USD)',110);
        await expect(page.getByLabel('Unit price (USD)',{exact:true})).toHaveValue('110');
        await page.getByRole('button',{name:'Save rule',exact:true}).click();
        await expect(page.locator('#status')).toContainText('Draft saved');
      });
      await page.setViewportSize({width:1440,height:1000});
    }
    await check('No browser runtime or failed asset requests',async()=>assert.deepEqual(errors,[]));
    await context.close();
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(__dirname,'verification.json'),JSON.stringify({timestamp:new Date().toISOString(),command:'node docs/superpowers/specs/2026-09-10-crew-recovery-cost-library-mockups/verify.cjs',results},null,2));
  console.log(`PASS ${results.filter(r=>r.status==='PASS').length} checks`);
})().catch(e=>{console.error(e);process.exitCode=1;});
