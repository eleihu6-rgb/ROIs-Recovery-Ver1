/**
 * DemoDirector — reusable "screen-recording director" for Playwright demo videos.
 *
 * Captions are drawn ON the page as a bottom subtitle bar while recording, so the
 * webm is already burned-in and stays subtitled after a plain libx264 transcode
 * to mp4 — no libass/drawtext-enabled ffmpeg required (this Mac's ffmpeg has
 * neither). The same lines are also emitted as an SRT sidecar (srt.ts) for
 * editing/re-timing. Alongside the captions, the director draws the *production
 * chrome* a viewer expects from a polished walkthrough:
 *
 *   • subtitle bar    — the current narration line, bottom-centre (burned in)
 *   • chapter cards   — full-screen section intros ("Chapter 1 · Sign In")
 *   • animated pointer — a synthetic cursor that glides to each target
 *   • highlight ring   — a box that frames the element about to be used
 *   • action callout   — a small label pinned beside the target ("Sign In")
 *
 * The overlay is injected into the page (re-injected automatically after every
 * navigation) and never intercepts clicks (pointer-events: none), so the real
 * UI underneath keeps working exactly as a user would drive it (§Simulate-User).
 *
 * Colours/sizes below are intentionally hard-coded: this is demo-recording
 * chrome living in e2e utilities, NOT application UI, so the token/typography
 * standard for gantt/pbs source does not apply here.
 */
import { type Locator, type Page } from '@playwright/test'
import { buildSrt, type Cue } from './srt'

declare global {
  // eslint-disable-next-line no-var
  interface Window {
    __demo?: {
      focus: (box: { x: number; y: number; w: number; h: number }, label?: string) => void
      clearFocus: () => void
      caption: (text: string) => void
      chapter: (title: string, subtitle: string) => void
      hideChapter: () => void
    }
  }
}

export interface DemoDirectorOptions {
  /** How long a chapter card stays on screen (ms). */
  chapterHoldMs?: number
  /** Pause after the pointer lands before the real interaction fires (ms). */
  settleMs?: number
  /** Per-character delay when typing, for legible on-screen typing (ms). */
  typeDelayMs?: number
}

const OVERLAY_ID = '__demo_overlay'

export class DemoDirector {
  private readonly page: Page
  private readonly cues: Cue[] = []
  private t0 = 0
  private open: { startMs: number; text: string } | null = null
  private readonly chapterHoldMs: number
  private readonly settleMs: number
  private readonly typeDelayMs: number

  constructor(page: Page, opts: DemoDirectorOptions = {}) {
    this.page = page
    this.chapterHoldMs = opts.chapterHoldMs ?? 2400
    this.settleMs = opts.settleMs ?? 550
    this.typeDelayMs = opts.typeDelayMs ?? 55
  }

  /** Anchor the subtitle clock and inject the overlay. Call once, first. */
  async start(): Promise<void> {
    this.t0 = Date.now()
    await this.ensureOverlay()
  }

  private elapsed(): number {
    return Date.now() - this.t0
  }

  /** Close the current caption at `now`, open a new one, and show it on screen. */
  private async narrate(text: string): Promise<void> {
    const now = this.elapsed()
    if (this.open) this.cues.push({ startMs: this.open.startMs, endMs: now, text: this.open.text })
    this.open = { startMs: now, text }
    await this.page.evaluate((t) => window.__demo?.caption(t), text)
  }

  /** Inject the overlay DOM + control API if this document doesn't have it yet. */
  private async ensureOverlay(): Promise<void> {
    await this.page.evaluate((overlayId) => {
      if (document.getElementById(overlayId)) return

      const root = document.createElement('div')
      root.id = overlayId
      root.style.cssText =
        'position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-family:Helvetica,Arial,sans-serif;'
      document.documentElement.appendChild(root)

      // Highlight ring.
      const ring = document.createElement('div')
      ring.style.cssText =
        'position:fixed;left:0;top:0;width:0;height:0;border:2px solid #38bdf8;border-radius:8px;' +
        'box-shadow:0 0 0 3px rgba(56,189,248,.35),0 0 24px rgba(56,189,248,.55);opacity:0;' +
        'transition:all .45s cubic-bezier(.22,1,.36,1);'
      root.appendChild(ring)

      // Callout label.
      const callout = document.createElement('div')
      callout.style.cssText =
        'position:fixed;left:0;top:0;opacity:0;transform:translateY(4px);transition:all .3s ease;' +
        'background:#0ea5e9;color:#fff;font-size:13px;font-weight:600;padding:4px 10px;border-radius:6px;' +
        'box-shadow:0 4px 14px rgba(0,0,0,.35);white-space:nowrap;'
      root.appendChild(callout)

      // Synthetic pointer (an arrow cursor).
      const pointer = document.createElement('div')
      pointer.style.cssText =
        'position:fixed;left:50%;top:50%;width:26px;height:26px;opacity:0;' +
        'transition:left .55s cubic-bezier(.22,1,.36,1),top .55s cubic-bezier(.22,1,.36,1),opacity .3s ease;' +
        'transform:translate(-2px,-2px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));'
      pointer.innerHTML =
        '<svg width="26" height="26" viewBox="0 0 24 24" fill="none">' +
        '<path d="M4 2 L4 20 L9 15 L12.5 22 L15.5 20.7 L12 14 L19 14 Z" fill="#fff" stroke="#0f172a" stroke-width="1.2" stroke-linejoin="round"/>' +
        '</svg>'
      root.appendChild(pointer)

      // Subtitle bar (burned into the recording). Appended BEFORE the chapter
      // card so a full-screen card cleanly covers it while it's showing.
      const caption = document.createElement('div')
      caption.style.cssText =
        'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:78%;opacity:0;' +
        'transition:opacity .2s ease;background:rgba(2,6,23,.82);color:#fff;font-size:19px;font-weight:500;' +
        'line-height:1.45;text-align:center;padding:9px 18px;border-radius:10px;' +
        'box-shadow:0 4px 18px rgba(0,0,0,.4);text-shadow:0 1px 2px rgba(0,0,0,.6);'
      root.appendChild(caption)

      // Chapter card.
      const chapter = document.createElement('div')
      chapter.style.cssText =
        'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'gap:14px;background:radial-gradient(circle at 50% 40%,rgba(15,23,42,.92),rgba(2,6,23,.97));' +
        'opacity:0;transition:opacity .4s ease;text-align:center;padding:0 8%;'
      const cTitle = document.createElement('div')
      cTitle.style.cssText = 'color:#f8fafc;font-size:38px;font-weight:700;letter-spacing:.5px;'
      const cSub = document.createElement('div')
      cSub.style.cssText = 'color:#7dd3fc;font-size:19px;font-weight:500;max-width:820px;line-height:1.5;'
      const cRule = document.createElement('div')
      cRule.style.cssText = 'width:64px;height:3px;border-radius:2px;background:#38bdf8;margin-top:2px;'
      chapter.append(cTitle, cRule, cSub)
      root.appendChild(chapter)

      window.__demo = {
        focus(box, label) {
          const cx = box.x + box.w / 2
          const cy = box.y + box.h / 2
          pointer.style.left = `${cx}px`
          pointer.style.top = `${cy}px`
          pointer.style.opacity = '1'
          ring.style.left = `${box.x - 4}px`
          ring.style.top = `${box.y - 4}px`
          ring.style.width = `${box.w + 8}px`
          ring.style.height = `${box.h + 8}px`
          ring.style.opacity = '1'
          if (label) {
            callout.textContent = label
            const above = box.y > 44
            callout.style.left = `${box.x}px`
            callout.style.top = above ? `${box.y - 34}px` : `${box.y + box.h + 8}px`
            callout.style.opacity = '1'
            callout.style.transform = 'translateY(0)'
          } else {
            callout.style.opacity = '0'
          }
        },
        clearFocus() {
          ring.style.opacity = '0'
          callout.style.opacity = '0'
        },
        caption(text) {
          caption.textContent = text
          caption.style.opacity = text ? '1' : '0'
        },
        chapter(title, subtitle) {
          cTitle.textContent = title
          cSub.textContent = subtitle
          chapter.style.opacity = '1'
        },
        hideChapter() {
          chapter.style.opacity = '0'
        },
      }
    }, OVERLAY_ID)
  }

  /** Show a full-screen chapter card; its subtitle doubles as the caption line. */
  async chapter(title: string, subtitle = ''): Promise<void> {
    await this.ensureOverlay()
    await this.narrate(subtitle || title)
    await this.page.evaluate(
      ({ t, s }) => window.__demo?.chapter(t, s),
      { t: title, s: subtitle },
    )
    await this.page.waitForTimeout(this.chapterHoldMs)
    await this.page.evaluate(() => window.__demo?.hideChapter())
    await this.page.waitForTimeout(300)
  }

  /** Move pointer + ring (+ optional callout) onto a locator, and narrate. */
  async focusOn(locator: Locator, caption: string, label?: string): Promise<void> {
    await this.ensureOverlay()
    await this.narrate(caption)
    await locator.scrollIntoViewIfNeeded().catch(() => {})
    const box = await locator.boundingBox()
    if (box) {
      await this.page.evaluate(
        ({ b, l }) => window.__demo?.focus(b, l),
        { b: { x: box.x, y: box.y, w: box.width, h: box.height }, l: label },
      )
      await this.page.waitForTimeout(this.settleMs)
    }
  }

  /** Narrate + point at + really click a target. */
  async click(locator: Locator, caption: string, label?: string): Promise<void> {
    await this.focusOn(locator, caption, label)
    await locator.click()
    await this.page.evaluate(() => window.__demo?.clearFocus())
  }

  /** Narrate + point at + type into a field with visible per-character typing. */
  async fill(locator: Locator, value: string, caption: string, label?: string): Promise<void> {
    await this.focusOn(locator, caption, label)
    await locator.click()
    await locator.fill('')
    await locator.pressSequentially(value, { delay: this.typeDelayMs })
    await this.page.evaluate(() => window.__demo?.clearFocus())
  }

  /** Hold the current caption on screen for `ms` (e.g. while data loads). */
  async narrateFor(caption: string, ms: number): Promise<void> {
    await this.ensureOverlay()
    await this.narrate(caption)
    await this.page.waitForTimeout(ms)
  }

  /** Close the final caption. Call once, last, before reading the SRT. */
  finish(): void {
    if (this.open) {
      this.cues.push({ startMs: this.open.startMs, endMs: this.elapsed(), text: this.open.text })
      this.open = null
    }
  }

  /**
   * The collected captions as an SRT document. Pass `timeScale` (= 1/speedFactor)
   * to match a slowed render — e.g. `getSrt(2)` for a half-speed video.
   */
  getSrt(timeScale = 1): string {
    return buildSrt(this.cues, timeScale)
  }
}
