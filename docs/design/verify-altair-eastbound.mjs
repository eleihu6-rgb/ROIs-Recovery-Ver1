import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(new URL('./altair-eastbound-10.html', import.meta.url).href);
  assert.equal(await page.locator('.card').count(), 10);
  const directory = new URL('../assets/screenshots/brand/', import.meta.url);
  await mkdir(directory, { recursive: true });
  const capture = async name => page.screenshot({ path: fileURLToPath(new URL(`altair-eastbound-${name}-Ver1.png`, directory)), fullPage: true });
  await capture('gallery');
  for (const [category, first] of [['Aircraft', 'Eastbound classic'], ['Spacecraft', 'Stellar shuttle']]) {
    await page.getByRole('button', { name: category, exact: true }).click();
    assert.equal(await page.locator('.card:visible').count(), 5);
    assert.equal(await page.locator('.card:visible h2').first().textContent(), first);
  }
  await page.getByRole('button', { name: 'All 10', exact: true }).click();
  for (const [name, colour] of [['Copper & cream', '#985d45'], ['Ocean teal', '#176d73'], ['Midnight & gold', '#c3d9e9'], ['Cosmic violet', '#d4c9f2'], ['Graphite & ice', '#374d60'], ['Designer mix', '#985d45']]) {
    await page.getByRole('button', { name, exact: true }).click();
    assert.equal(await page.locator('.card').first().evaluate(el => el.style.getPropertyValue('--primary')), colour);
    const exports = await page.locator('.download').evaluateAll(links => links.map(link => decodeURIComponent(link.href.split(',')[1])));
    assert.ok(exports[0].includes(`color:${colour}`));
    assert.equal(await page.evaluate(xmls => xmls.filter(xml => new DOMParser().parseFromString(xml, 'image/svg+xml').querySelector('parsererror')).length, exports), 0);
  }
  await page.getByRole('button', { name: 'Midnight & gold', exact: true }).click();
  await capture('midnight');
  const event = page.waitForEvent('download');
  await page.locator('.download').first().click();
  assert.equal((await event).suggestedFilename(), 'altair-51-eastbound-classic-night.svg');
  await page.getByRole('button', { name: 'Monochrome', exact: true }).click();
  assert.equal(await page.locator('.visual').first().evaluate(el => getComputedStyle(el).color), 'rgb(36, 41, 35)');
  assert.ok(decodeURIComponent(await page.locator('.download').first().getAttribute('href')).includes('color:#242923'));
  await capture('mono');
  await page.getByRole('button', { name: 'Monochrome', exact: true }).click();
  await page.getByRole('button', { name: 'Ocean teal', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('button', { name: 'Aircraft', exact: true }).click();
  await capture('mobile');
  assert.deepEqual(errors, []);
  console.log('PASS: 10 concepts, both filters, all 6 palettes, matching valid SVG exports, actual midnight download, monochrome, mobile overflow, no page errors; 4 screenshots.');
} finally { await browser.close(); }
