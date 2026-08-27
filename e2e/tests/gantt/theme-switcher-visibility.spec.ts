/**
 * Regression test — theme switcher trigger was hard to spot.
 *
 * Before: the toolbar theme control rendered an *invisible* Palette icon
 * (`<Palette className="h-3.5 w-3.5 opacity-0" />`) plus a 2px colored dot —
 * effectively a tiny dot that users (and the test team) could not find,
 * especially in dark mode.
 *
 * Fix: render a real, visible Palette icon (h-4 w-4, text-muted-foreground)
 * with the active-theme color shown as a small corner badge.
 *
 * This test loads the gantt under every theme (light + dark variants) and asserts:
 *  1. the trigger icon has non-zero computed opacity (would have caught the opacity-0 bug)
 *  2. the icon has real contrast against its effective background (it is *spottable*),
 *     which is the actual "visible under each theme / dark mode" requirement
 *  3. clicking the trigger opens the theme menu (confirms it is the right control)
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

interface ThemeCase {
  id: string
  label: string
  themeKey: string // value written to localStorage('rois-theme')
  dark: boolean // value written to localStorage('rois-dark')
}

// Covers all 5 selectable themes + the dark toggle on a light theme.
// dark-pro always forces dark regardless of the rois-dark flag.
const THEME_CASES: ThemeCase[] = [
  { id: 'Live-1283', label: 'Ocean Blue (light)', themeKey: 'ocean-blue', dark: false },
  { id: 'Live-1284', label: 'Ocean Blue (dark toggle)', themeKey: 'ocean-blue', dark: true },
  { id: 'Live-1285', label: 'Dark Pro', themeKey: 'dark-pro', dark: false },
  { id: 'Live-1286', label: 'Emerald Green', themeKey: 'emerald-green', dark: false },
  { id: 'Live-1287', label: 'Sunset Orange', themeKey: 'sunset-orange', dark: false },
  { id: 'Live-1288', label: 'Slate Gray', themeKey: 'slate-gray', dark: false },
]

/** Compute the trigger icon's opacity, color, effective background, and WCAG contrast. */
const measureIconVisibility = (page: Page) =>
  page.evaluate(() => {
    const trigger = document.querySelector<HTMLElement>('[data-testid="theme-switcher-trigger"]')
    if (!trigger) return null
    const svg = trigger.querySelector('svg')
    if (!svg) return null

    const parseRgb = (s: string): [number, number, number, number] => {
      const m = s.match(/rgba?\(([^)]+)\)/)
      if (!m) return [0, 0, 0, 0]
      const parts = m[1].split(',').map((p) => parseFloat(p.trim()))
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1]
    }

    const lum = (r: number, g: number, b: number): number => {
      const f = (c: number) => {
        const x = c / 255
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }

    const svgStyle = getComputedStyle(svg)
    const opacity = parseFloat(svgStyle.opacity)
    const [cr, cg, cb] = parseRgb(svgStyle.color)

    // Walk up from the trigger to find the first opaque background color.
    let el: HTMLElement | null = trigger
    let bg: [number, number, number] = [255, 255, 255]
    while (el) {
      const [r, g, b, a] = parseRgb(getComputedStyle(el).backgroundColor)
      if (a > 0) {
        bg = [r, g, b]
        break
      }
      el = el.parentElement
    }

    const l1 = lum(cr, cg, cb)
    const l2 = lum(bg[0], bg[1], bg[2])
    const contrast = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)

    const box = svg.getBoundingClientRect()

    return {
      opacity,
      color: [cr, cg, cb],
      bg,
      contrast,
      iconWidth: box.width,
      iconHeight: box.height,
    }
  })

for (const tc of THEME_CASES) {
  test(`${tc.id} — theme switcher icon is visible & spottable under ${tc.label}`, async ({
    page,
    request,
  }) => {
    // Apply the theme + dark flag before the app boots so it paints in this theme.
    await page.addInitScript(
      ([t, d]) => {
        localStorage.setItem('rois-theme', t as string)
        localStorage.setItem('rois-dark', d as string)
      },
      [tc.themeKey, String(tc.dark)],
    )
    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, {
      timeout: 30_000,
    })

    const trigger = page.getByTestId('theme-switcher-trigger')
    await expect(trigger, 'theme trigger must be present in the top nav').toBeVisible()

    const m = await measureIconVisibility(page)
    expect(m, 'could not measure theme trigger icon').not.toBeNull()
    if (!m) return

    // 1. Regression for the opacity-0 bug — the icon must actually render.
    expect(m.opacity, `icon opacity under ${tc.label}`).toBeGreaterThan(0)

    // 2. The icon must be a real, bigger glyph (h-4 w-4 = 16px), not a 2px dot.
    expect(m.iconWidth, `icon width under ${tc.label}`).toBeGreaterThanOrEqual(14)
    expect(m.iconHeight, `icon height under ${tc.label}`).toBeGreaterThanOrEqual(14)

    // 3. The icon must be *spottable* against its background in this theme.
    //    A same-color (invisible) icon scores ~1.0; we require clear separation.
    expect(
      m.contrast,
      `icon contrast vs background under ${tc.label} (color=${m.color} bg=${m.bg})`,
    ).toBeGreaterThan(2.0)

    // 4. Clicking the trigger opens the theme menu (confirms correct control).
    await trigger.click()
    await expect(page.getByText('Dark Pro')).toBeVisible()
    await expect(page.getByText(/Dark Mode|Light Mode/)).toBeVisible()
  })
}
