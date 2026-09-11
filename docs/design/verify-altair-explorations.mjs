import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('./altair-logo-explorations-20.html', import.meta.url).href);
  assert.equal(await page.locator('.card').count(), 20);
  const directory = new URL('../assets/screenshots/brand/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('altair-explorations-20-Ver2.png', directory)), fullPage: true });
  for (const [name, count, first] of [
    ['High tech', 3, 'Vector intelligence'], ['Playful', 4, 'Pocket pilot'],
    ['Aviation', 3, 'Winglet'], ['Travel & views', 4, 'Boarding smile'],
    ['Crew', 3, 'Together aloft'], ['Little escapes', 3, 'Layover latte'],
  ]) {
    await page.getByRole('button', { name, exact: true }).click();
    assert.equal(await page.locator('.card:visible').count(), count);
    assert.equal(await page.locator('.card:visible h2').first().textContent(), first);
  }
  await page.getByRole('button', { name: 'All 20', exact: true }).click();
  const invalid = await page.locator('.download').evaluateAll(links => links.filter(link => {
    const xml = decodeURIComponent(link.href.split(',')[1]);
    return new DOMParser().parseFromString(xml, 'image/svg+xml').querySelector('parsererror');
  }).length);
  assert.equal(invalid, 0);
  const event = page.waitForEvent('download');
  await page.locator('.download').first().click();
  assert.equal((await event).suggestedFilename(), 'altair-11-vector-intelligence.svg');
  await page.getByRole('button', { name: 'Monochrome', exact: true }).click();
  assert.equal(await page.locator('.visual').first().evaluate(el => getComputedStyle(el).color), 'rgb(36, 41, 35)');
  await page.screenshot({ path: fileURLToPath(new URL('altair-explorations-20-mono-Ver2.png', directory)), fullPage: true });
  await page.getByRole('button', { name: 'Monochrome', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('button', { name: 'Playful', exact: true }).click();
  await page.screenshot({ path: fileURLToPath(new URL('altair-explorations-20-mobile-Ver2.png', directory)), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: 20 concepts, all 6 category filters, 20 valid SVG links, one actual download, monochrome, mobile overflow, no page errors; 3 screenshots.');
} finally {
  await browser.close();
}
