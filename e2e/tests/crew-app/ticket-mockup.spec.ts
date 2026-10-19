import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
for (const [width,height] of [[420,912],[912,420],[669,951],[951,669],[834,1210],[1210,834]]) {
  test(`Ticket multi-duty flow ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({width,height});
    await page.goto(`file://${root}/docs/assets/mockups/crew-app/duty-swap-mockups-Ver2.html`);
    for (const [i,name] of ['Give','Want','Match','Send'].entries()) await expect(page.locator('.step').nth(i)).toHaveText(`${i+1}${name}`);
    await expect(page.locator('#next')).toBeDisabled();
    await expect(page.getByRole('checkbox').last()).toBeDisabled();
    await page.locator('[data-give="585"]').click();
    await page.locator('[data-give="181"]').click();
    await expect(page.getByRole('heading',{name:'What will you give?'})).toBeVisible();
    await page.locator('#next').click();
    await expect(page.locator('#selected-give')).toContainText('PR585/PR586');
    await expect(page.locator('#selected-give')).toContainText('PR181/PR182');
    await page.locator('#crew').fill('481903');
    await page.locator('#next').click();
    await expect(page.locator('[data-match]')).toHaveCount(1);
    await expect(page.locator('[data-match]')).toContainText('481903');
    await page.locator('[data-match]').click();
    await expect(page.getByRole('heading',{name:'You take',exact:true})).toBeVisible();
    await page.locator('#next').click();
    await expect(page.locator('#review')).toHaveCount(1);
    await expect(page.locator('#review')).toContainText('PR223/PR224');
    await page.locator('#note').fill('Can swap both trips');
    await page.locator('#back').click();
    await page.locator('#next').click();
    await expect(page.locator('#note')).toHaveValue('Can swap both trips');
    if (height>550) await page.locator('#theme').click();
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth',width);
    await expect(page.locator('body')).toHaveJSProperty('scrollHeight',height);
    await page.screenshot({path:`${root}/docs/assets/screenshots/crew-app/ticket-mockup-${width}x${height}-Ver2.png`,fullPage:true});
    await page.locator('#next').click();
    await expect(page.getByRole('dialog')).toContainText('does not contact the crew portal');
  });
}
