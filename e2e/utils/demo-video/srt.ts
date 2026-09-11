/**
 * SRT subtitle building (Option A — SRT + ffmpeg burn-in).
 *
 * A demo spec records one {startMs,endMs,text} cue per narration line, timed
 * from the moment recording started (t0). buildSrt turns those cues into a
 * standard SRT string whose clock matches the Playwright video clock, so the
 * captions line up when burned in with ffmpeg (see burn-subtitles.ts).
 *
 * Timing note: the Playwright video clock starts at browser-context creation.
 * DemoDirector.start() captures t0 on the first page action, so cues carry a
 * small (sub-second) constant offset at most — acceptable for a guided demo.
 */

export interface Cue {
  startMs: number
  endMs: number
  text: string
}

/** ms → `HH:MM:SS,mmm` (SRT timestamp). */
const stamp = (ms: number): string => {
  const clamped = Math.max(0, Math.round(ms))
  const h = Math.floor(clamped / 3_600_000)
  const m = Math.floor((clamped % 3_600_000) / 60_000)
  const s = Math.floor((clamped % 60_000) / 1_000)
  const millis = clamped % 1_000
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${p(h)}:${p(m)}:${p(s)},${p(millis, 3)}`
}

/**
 * Build an SRT document from cues (empty text dropped, sorted by start).
 *
 * `timeScale` stretches every timestamp — pass `1 / speedFactor` so the sidecar
 * lines up with a slowed video (e.g. a half-speed mp4 needs timeScale = 2).
 */
export const buildSrt = (cues: Cue[], timeScale = 1): string =>
  cues
    .filter((c) => c.text.trim().length > 0 && c.endMs > c.startMs)
    .sort((a, b) => a.startMs - b.startMs)
    .map(
      (c, i) =>
        `${i + 1}\n${stamp(c.startMs * timeScale)} --> ${stamp(c.endMs * timeScale)}\n${c.text.trim()}\n`,
    )
    .join('\n')
