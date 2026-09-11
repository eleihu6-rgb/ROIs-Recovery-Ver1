const { chromium } = require('../../../../e2e/node_modules/@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const receipts = [];
  const screenshotDir = path.resolve(__dirname, '../../../assets/screenshots/gantt');
  fs.mkdirSync(screenshotDir, { recursive: true });
  const screenshotPath = (name) => {
    let version = 1;
    while (fs.existsSync(path.join(screenshotDir, name + '-Ver' + version + '.png'))) version++;
    return path.join(screenshotDir, name + '-Ver' + version + '.png');
  };
  try {
    for (const option of ['a', 'b', 'c']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(pathToFileURL(path.join(__dirname, 'option-' + option + '.html')).href);
      await page.getByRole('dialog').waitFor();
      assert.equal(await page.locator('#from').inputValue(), '2026-09-09');
      await page.screenshot({ path: screenshotPath('pairing-builder-option-' + option + '-desktop'), fullPage: true });
      await page.locator('#from').fill('2026-08-30');
      await page.locator(option === 'b' ? '#next' : '#build').click();
      assert.match(await page.locator('#error').innerText(), /within the open Gantt/);
      await page.locator('#from').fill('2026-09-09');
      await page.locator('#base').selectOption('ADD');
      await page.locator('#fleet').selectOption('B737');
      assert.equal(await page.locator('#ca').inputValue(), '1');
      await page.locator('#ca').fill('2');
      if (option === 'b') await page.locator('#next').click();
      await page.locator('#rest').fill('780');
      await page.locator('#block').fill('450');
      await page.locator('#checkin').fill('100');
      await page.locator('#debrief').fill('20');
      if (option === 'b') await page.locator('#next').click();
      assert.match(await page.locator('#summary').innerText(), /ADD.*B737.*CA 2/);
      await page.locator('#build').click();
      await page.locator('#overlay').waitFor({ state: 'hidden' });
      assert.deepEqual(await page.locator('#pairing-rows > .gridrow').evaluateAll(els => els.slice(0,3).map(e=>e.dataset.pairing)), ['DEMO-003','DEMO-002','DEMO-001']);
      await page.screenshot({ path: screenshotPath('pairing-builder-option-' + option + '-results'), fullPage: true });
      await page.getByRole('button',{name:'Build round-trip pairings',exact:true}).click();
      assert.equal(await page.locator('#base').inputValue(),'ADD');
      await page.locator('#reset').click();
      assert.equal(await page.locator('#base').inputValue(),'DXB');
      if (option === 'b') { await page.locator('#next').click(); await page.locator('#next').click(); }
      await page.locator('#build').click();
      await page.locator('#overlay').waitFor({ state: 'hidden' });
      assert.deepEqual(await page.locator('#pairing-rows > .gridrow').evaluateAll(els => els.slice(0,4).map(e=>e.dataset.pairing)), ['DEMO-006','DEMO-005','DEMO-004','DEMO-003']);
      await page.getByRole('button',{name:'Build round-trip pairings',exact:true}).click();
      await page.setViewportSize({width:390,height:844});
      await page.screenshot({ path:screenshotPath('pairing-builder-option-'+option+'-mobile'),fullPage:true});
      const layout = await page.evaluate(() => {
        const d=document.querySelector('.dialog').getBoundingClientRect();
        return { left:d.left,right:d.right,bottom:d.bottom,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth };
      });
      assert.ok(layout.left>=0 && layout.right<=layout.width && layout.bottom<=layout.height && !layout.overflow,JSON.stringify(layout));
      await page.locator('#cancel').click();
      assert.equal(await page.locator('#overlay').isVisible(),false);
      assert.deepEqual(errors,[]);
      receipts.push({option,result:'PASS',checks:'date guard; edited scope/parameters; crew defaults; build order; repeat build; reset/reopen; narrow layout; close; no JS errors'});
      await page.close();
    }
    console.log(JSON.stringify(receipts,null,2));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});

