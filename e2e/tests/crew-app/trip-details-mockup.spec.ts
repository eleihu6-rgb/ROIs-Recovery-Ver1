import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const mockupUrl = pathToFileURL(
  path.join(root, 'docs/assets/mockups/crew-app/trip-details-redesign-Ver2.html'),
).href;
const viewports = [
  { width: 420, height: 912 },
  { width: 912, height: 420 },
  { width: 669, height: 951 },
  { width: 951, height: 669 },
  { width: 834, height: 1210 },
  { width: 1210, height: 834 },
];

const expectValues = async (locator: Locator, values: readonly string[]): Promise<void> => {
  for (const value of values) await expect(locator).toContainText(value);
};

const expectNoHorizontalOverflow = async (page: Page): Promise<void> => {
  await expect.poll(async (): Promise<number> => page.evaluate(() => (
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
      - document.documentElement.clientWidth
  ))).toBeLessThanOrEqual(0);
};

const captureTrip = async (
  page: Page,
  sample: 'tg' | 'pr',
  width: number,
  height: number,
): Promise<void> => {
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await expect.poll(async (): Promise<number> => page.evaluate(() => window.scrollY)).toBe(0);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: path.join(root, `docs/assets/screenshots/crew-app/trip-details-redesign-Ver2-${sample}-${width}x${height}.png`),
    fullPage: true,
  });
};

for (const { width, height } of viewports) {
  test(`Trip details TG and PR data, interactions and layout ${width}x${height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });

    await page.setViewportSize({ width, height });
    await page.goto(mockupUrl);

    const trip = page.locator('#trip');
    const duties = trip.locator('.duty');
    const flights = trip.locator('article.flight');
    const tg662 = trip.locator("article.flight[data-flight='TG662']");
    const tg663 = trip.locator("article.flight[data-flight='TG663']");
    const layover = page.locator('#layover');

    await expect(duties).toHaveCount(2);
    await expect(flights).toHaveCount(2);
    await expect(tg662).toHaveCount(1);
    await expect(tg663).toHaveCount(1);
    await expectValues(tg662, ['TG662', '00:30L', '05:45L', '00:37L', '05:49L', '5h 15m']);
    await expect(tg662).toContainText(/sched/i);
    await expect(tg662).toContainText(/actual/i);
    await expect(tg662).toContainText(/block/i);
    await expectValues(page.locator('#duty-1'), ['20:30L', '21:30L', '22:45L']);
    await expectValues(tg663, ['TG663', '17 Sep', 'A350']);
    await expectValues(page.locator('#duty-2'), ['22:30L', '23:50L']);
    await expect(page.locator('#duty-2')).toContainText(/hotel pick-up/i);
    await expect(page.locator('#duty-2')).toContainText(/report/i);
    await expectValues(layover, ['18h 01m', 'Crowne Plaza PVG', '07:00', '21:00']);
    await expect(layover).toContainText(/rest/i);
    await expect(layover).toContainText(/expected/i);
    await expect(layover).toContainText(/check[ -]?in/i);
    await expect(layover).toContainText(/check[ -]?out/i);

    const journeyNav = page.locator('#journey-nav');
    for (const target of ['#duty-1', '#layover', '#duty-2']) {
      await expect(journeyNav.locator(`a[href="${target}"]`)).toHaveCount(1);
    }
    await captureTrip(page, 'tg', width, height);

    await journeyNav.locator('a[href="#duty-2"]').click();
    await expect(page).toHaveURL(/#duty-2$/);
    await expect(page.locator('#duty-2')).toBeInViewport();
    await expect(tg663.getByText('TG663', { exact: true }).first()).toBeInViewport();
    await expectValues(page.locator('#duty-2'), ['TG663', '22:30L', '23:50L']);

    await page.locator('#calendar').click();
    const calendar = page.locator('#calendar-preview');
    await expect(calendar).toBeVisible();
    await expect(calendar.locator('.calendar-event').filter({ hasText: 'TG662' })).toHaveCount(1);
    await expect(calendar.locator('.calendar-event').filter({ hasText: /Hotel pick-up/i })).toHaveCount(1);
    await expectNoHorizontalOverflow(page);
    await page.locator('#close-calendar').click();
    await expect(calendar).toBeHidden();

    if (width === 420 && height === 912) {
      const sourceNotes = page.locator('details#source-notes, #source-notes details');
      await sourceNotes.locator('summary').click();
      await expect(sourceNotes).toHaveAttribute('open', '');
      const table = sourceNotes.locator('table');
      await expect(table).toBeVisible();
      await expect(table).toContainText(/source/i);
      const mappingRows = table.locator('tr').filter({ has: page.locator('td') });
      await expect.poll(async (): Promise<number> => mappingRows.count()).toBeGreaterThan(0);
      for (const row of await mappingRows.all()) {
        const cells = row.locator('td');
        expect(await cells.count()).toBeGreaterThanOrEqual(2);
        for (const cell of await cells.all()) await expect(cell).toContainText(/\S/);
      }
      await expectNoHorizontalOverflow(page);
      await sourceNotes.locator('summary').click();
      await expect(table).toBeHidden();
    }

    await page.locator('#sample-pr').click();
    await expect(duties).toHaveCount(1);
    await expect(flights).toHaveCount(2);
    await expect(trip.locator('article.flight[data-flight^="TG"]')).toHaveCount(0);
    await expect(trip).not.toContainText(/TG662|TG663/);
    await expectValues(trip.locator('article.flight[data-flight="PR501"]'), ['PR501', '15:32L', '18:56L']);
    await expectValues(trip.locator('article.flight[data-flight="PR512"]'), ['PR512', '20:08L', '23:40L']);
    await expectValues(duties, ['10:15', '10:45', '06:56', '14:00', '03:32L', '04:32L', '13:25L']);
    await expect(duties).toContainText(/wake/i);
    await expect(duties).toContainText(/leave/i);
    await expect(duties).toContainText(/report/i);
    await expect(layover).toBeHidden();
    await expect(trip).not.toContainText(/Crowne Plaza|Hotel pick-up/i);
    await captureTrip(page, 'pr', width, height);

    await page.locator('#sample-tg').click();
    await expect(duties).toHaveCount(2);
    await expect(flights).toHaveCount(2);
    await expectValues(tg662, ['TG662', '00:37L', '05:49L']);
    await expectValues(tg663, ['TG663', '17 Sep', 'A350']);
    await expect(trip.locator('article.flight[data-flight^="PR"]')).toHaveCount(0);
    await expect(layover).toContainText('Crowne Plaza PVG');

    await page.locator('#theme').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expectNoHorizontalOverflow(page);
    await page.locator('#theme').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expectNoHorizontalOverflow(page);
    expect(errors, 'No JavaScript exceptions or browser console errors').toEqual([]);
  });
}
