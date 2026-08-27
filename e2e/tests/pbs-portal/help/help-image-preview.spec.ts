import { expect, test } from '@playwright/test'
import { gotoHelp, openHelpTopic } from './help-test-utils'

test.use({ storageState: { cookies: [], origins: [] } })

const dashboardPreviewName =
  'Open full-screen preview: Dashboard with bid information, bidding calendar, user information, and pre-assigned duties'
const dashboardImageAlt =
  'Dashboard with bid information, bidding calendar, user information, and pre-assigned duties'

test.describe('PBS Portal Help image preview', () => {
  test('PBS-3109 — screenshot preview supports zoom, pan, reset, keyboard, and focus recovery', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 640 })
    await gotoHelp(page)
    await openHelpTopic(page, 'dashboard-overview')

    const trigger = page.getByRole('button', { name: dashboardPreviewName })
    await expect(trigger).toBeEnabled()
    await trigger.focus()
    await trigger.press('Enter')

    const dialog = page.getByRole('dialog', {
      name: `Image preview — ${dashboardImageAlt}`,
    })
    const viewport = page.getByTestId('help-image-preview-viewport')
    const previewImage = page.getByTestId('help-image-preview-image')
    const scale = page.getByTestId('help-image-preview-scale')
    const floatingClose = page.getByRole('button', { name: 'Close image preview' })

    await expect(dialog).toBeVisible()
    await expect(dialog.locator('[data-app-dialog-header]')).toBeHidden()
    await expect(page.getByTestId('help-image-preview-toolbar')).toHaveCount(0)
    await expect(floatingClose).toBeVisible()
    await expect(floatingClose).toHaveClass(/focus-visible:ring-2/)
    await expect(viewport).toBeFocused()
    await expect(scale).toHaveText('100%')

    await page.locator('[data-state="open"].fixed.inset-0').click({
      force: true,
      position: { x: 4, y: 100 },
    })
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()

    await trigger.press('Enter')
    await expect(dialog).toBeVisible()
    await expect(viewport).toBeFocused()

    const zoomToMaximum = async () => {
      for (let index = 0; index < 20; index += 1) {
        if ((await scale.textContent()) === '400%') {
          return
        }
        await viewport.press('+')
      }
    }

    await zoomToMaximum()
    await expect(scale).toHaveText('400%')
    await viewport.press('+')
    await expect(scale).toHaveText('400%')

    for (let index = 0; index < 14; index += 1) {
      await viewport.press('-')
    }
    await expect(scale).toHaveText('50%')
    await viewport.press('-')
    await expect(scale).toHaveText('50%')

    await viewport.press('0')
    await expect(scale).toHaveText('100%')
    const viewportBoxAtReset = await viewport.boundingBox()
    expect(viewportBoxAtReset).not.toBeNull()
    await page.mouse.move(
      viewportBoxAtReset!.x + viewportBoxAtReset!.width / 2,
      viewportBoxAtReset!.y + viewportBoxAtReset!.height / 2,
    )
    await page.mouse.wheel(0, -100)
    await expect(scale).toHaveText('125%')
    await viewport.press('0')

    await viewport.press('+')
    await viewport.press('+')
    await viewport.press('+')
    await viewport.press('+')
    await expect(scale).toHaveText('200%')

    const transformBeforeDrag = await previewImage.getAttribute('style')
    const viewportBox = await viewport.boundingBox()
    expect(viewportBox).not.toBeNull()
    await page.mouse.move(viewportBox!.x + viewportBox!.width / 2, viewportBox!.y + viewportBox!.height / 2)
    await page.mouse.down()
    await page.mouse.move(
      viewportBox!.x + viewportBox!.width / 2 + 120,
      viewportBox!.y + viewportBox!.height / 2 + 80,
      { steps: 5 },
    )
    await page.mouse.up()
    await expect.poll(() => previewImage.getAttribute('style')).not.toBe(transformBeforeDrag)

    const transformBeforeKeyboardPan = await previewImage.getAttribute('style')
    await viewport.focus()
    await viewport.press('ArrowRight')
    await expect.poll(() => previewImage.getAttribute('style')).not.toBe(transformBeforeKeyboardPan)

    await viewport.press('0')
    await expect(scale).toHaveText('100%')
    await expect(previewImage).toHaveAttribute('style', /translate3d\(0px, 0px, 0(?:px)?\) scale\(1\)/)

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()

    await trigger.press('Space')
    await expect(dialog).toBeVisible()
    await floatingClose.focus()
    await expect(floatingClose).toBeFocused()
    await floatingClose.click()
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('PBS-3110 — image preview stays inside short and wide viewports', async ({ page }) => {
    for (const viewportSize of [
      { width: 1366, height: 640 },
      { width: 2048, height: 1024 },
    ]) {
      await page.setViewportSize(viewportSize)
      await gotoHelp(page)
      await openHelpTopic(page, 'dashboard-overview')
      await page.getByRole('button', { name: dashboardPreviewName }).click()

      const dialog = page.getByTestId('help-image-preview-dialog')
      const imageViewport = page.getByTestId('help-image-preview-viewport')
      const previewImage = page.getByTestId('help-image-preview-image')
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('[data-app-dialog-header]')).toBeHidden()
      await expect(page.getByTestId('help-image-preview-toolbar')).toHaveCount(0)
      await expect(page.getByTestId('help-image-preview-floating-close')).toBeVisible()

      const [dialogBox, imageViewportBox, previewBodyBox, previewImageBox] = await Promise.all([
        dialog.boundingBox(),
        imageViewport.boundingBox(),
        imageViewport.locator('..').boundingBox(),
        previewImage.boundingBox(),
      ])
      expect(dialogBox).not.toBeNull()
      expect(imageViewportBox).not.toBeNull()
      expect(previewBodyBox).not.toBeNull()
      expect(previewImageBox).not.toBeNull()
      expect(dialogBox!.x).toBeGreaterThanOrEqual(0)
      expect(dialogBox!.y).toBeGreaterThanOrEqual(0)
      expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(viewportSize.width)
      expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(viewportSize.height)
      expect(Math.abs(imageViewportBox!.x - previewBodyBox!.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(imageViewportBox!.y - previewBodyBox!.y)).toBeLessThanOrEqual(1)
      expect(Math.abs(imageViewportBox!.width - previewBodyBox!.width)).toBeLessThanOrEqual(1)
      expect(Math.abs(imageViewportBox!.height - previewBodyBox!.height)).toBeLessThanOrEqual(1)
      expect(previewImageBox!.x).toBeGreaterThanOrEqual(imageViewportBox!.x)
      expect(previewImageBox!.y).toBeGreaterThanOrEqual(imageViewportBox!.y)
      expect(previewImageBox!.x + previewImageBox!.width).toBeLessThanOrEqual(
        imageViewportBox!.x + imageViewportBox!.width,
      )
      expect(previewImageBox!.y + previewImageBox!.height).toBeLessThanOrEqual(
        imageViewportBox!.y + imageViewportBox!.height,
      )
      await expect(page.evaluate(() => document.documentElement.scrollWidth)).resolves.toBeLessThanOrEqual(
        viewportSize.width,
      )

      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
    }
  })

  test('PBS-3111 — broken thumbnails do not open the image preview', async ({ page }) => {
    await page.route('**/help/screenshots/dashboard-overview.png', async (route) => {
      await route.abort()
    })

    await gotoHelp(page)
    await openHelpTopic(page, 'dashboard-overview')

    const trigger = page.getByRole('button', { name: dashboardPreviewName })
    await expect(trigger).toBeDisabled()
    await trigger.click({ force: true })
    await expect(page.getByTestId('help-image-preview-dialog')).toHaveCount(0)
  })

  test('PBS-3112 — preview image failures show a persistent error with a close path', async ({ page }) => {
    await gotoHelp(page)
    await openHelpTopic(page, 'dashboard-overview')
    const loadedTrigger = page.getByRole('button', { name: dashboardPreviewName })
    await expect(loadedTrigger).toBeEnabled()
    await loadedTrigger.click()

    const previewImage = page.getByTestId('help-image-preview-image')
    await previewImage.evaluate((image) => image.dispatchEvent(new Event('error')))
    await expect(page.getByRole('alert')).toContainText('This image could not be loaded')
    await page.getByRole('button', { name: 'Close image preview' }).click()
    await expect(page.getByTestId('help-image-preview-dialog')).toBeHidden()
    await expect(loadedTrigger).toBeFocused()
  })
})
