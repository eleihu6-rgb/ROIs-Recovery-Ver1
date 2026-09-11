import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('./altair-logo-options.html', import.meta.url).href);
  assert.equal(await page.locator('.card').count(), 10);
  assert.equal(await page.locator('.download').count(), 10);
  const directory = new URL('../assets/screenshots/brand/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('altair-logo-gallery-Ver1.png', directory)), fullPage: true });
  await page.getByRole('button', { name: 'Monochrome' }).click();
  assert.equal(await page.getByRole('button', { name: 'Monochrome' }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.stage').first().evaluate(el => getComputedStyle(el).color), 'rgb(23, 43, 59)');
  await page.getByRole('button', { name: 'Dark preview' }).click();
  assert.equal(await page.locator('.stage').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(20, 39, 53)');
  await page.screenshot({ path: fileURLToPath(new URL('altair-logo-dark-Ver1.png', directory)), fullPage: true });
  const downloaded = page.waitForEvent('download');
  await page.locator('.download').first().click();
  assert.equal((await downloaded).suggestedFilename(), 'altair-01-endless-flight.svg');
  await page.getByRole('button', { name: 'Monochrome' }).click();
  await page.getByRole('button', { name: 'Dark preview' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: fileURLToPath(new URL('altair-logo-mobile-Ver1.png', directory)), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: 10 concepts, SVG download, monochrome and dark toggles, mobile overflow, no page errors; 3 screenshots.');
} finally {
  await browser.close();
}
