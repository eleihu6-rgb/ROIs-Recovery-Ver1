---
name: demo-video
description: Record a subtitled, narrated feature-walkthrough video by driving the real ROIS UI with Playwright. Trigger when the user wants a demo/tour/screen-recording of a gantt / pbs-portal flow with captions, callouts, a pointer, highlights, or chapter cards.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# ROIS Demo-Video Skill (Playwright + burned-in subtitles)

Produce a polished, self-contained walkthrough video of a real user flow: a
Playwright test drives the **actual UI** (real login, real clicks — §Simulate-User,
no API shortcuts for the operation under test) while a reusable `DemoDirector`
draws production chrome on the page **during recording**:

- **subtitle bar** — the current narration line, burned into the video
- **chapter cards** — full-screen section intros ("Chapter 1 · Sign In")
- **animated pointer** — a synthetic cursor that glides to each target
- **highlight ring** + **callout label** — frames and names the element in use

Output: a full-speed `.webm` master, a widely-playable H.264 `.mp4`, and an
editable `.srt` sidecar.

## Where everything lives

| Piece | Path |
|---|---|
| Director (overlay, pointer, captions, chapters) | `e2e/utils/demo-video/demo-director.ts` |
| SRT builder (`buildSrt(cues, timeScale)`) | `e2e/utils/demo-video/srt.ts` |
| ffmpeg transcode (`transcodeToMp4(webm, mp4, startSec, speedFactor)`) | `e2e/utils/demo-video/render-video.ts` |
| Playwright config (`video:'on'`, 1440×900, real tunnel) | `e2e/config/demo-video.config.ts` |
| Reference spec (Live ADD-base tour) | `e2e/tests/gantt/demo-live-add-base-tour.spec.ts` |
| Artifacts | `docs/assets/videos/gantt/*.{webm,mp4,srt}` + `docs/assets/screenshots/gantt/` |

## Authoring a new demo (copy the reference spec)

1. New spec under `e2e/tests/gantt/` (or `pbs-portal/`). Instantiate
   `const d = new DemoDirector(page)`.
2. Navigate with `waitUntil:'domcontentloaded'` — the SPA holds the browser
   `load` event open forever, so `'load'` hangs. Measure `leadInSec` right before
   the goto to trim the blank page-load head later.
3. `await d.start()` once (anchors the caption clock + injects the overlay).
4. Drive the flow with the director's verbs — each one narrates + points + acts:
   - `d.chapter(title, subtitle)` — full-screen section card
   - `d.fill(locator, value, caption, label)` — visible per-character typing
   - `d.click(locator, caption, label)` — point, highlight, real click
   - `d.focusOn(locator, caption, label)` — point without clicking (e.g. before a right-click)
   - `d.narrateFor(caption, ms)` — hold a line while data loads
5. Prove the flow really worked (§No-Illusion): assert real data
   (`counts(page)`, `toContainText`, `toHaveCount`) — never "no error".
6. `d.finish()`, then capture a `§PW-Snapshot` screenshot
   (`docs/assets/screenshots/<module>/<feature>-Ver<N>.png`, bump `-Ver<N>` per round).
7. In `afterAll` (the webm flushes only after the context closes): copy the webm,
   write `d.getSrt(1 / SPEED)`, and `transcodeToMp4(webm, mp4, trimSec, SPEED)`.

## Playback speed

The delivered mp4 defaults to **half speed** (`SPEED = 0.5`) so each action is
easy to follow. Speed is a single lever:

- `transcodeToMp4(webm, mp4, startSec, speedFactor)` applies
  `setpts=(1/speedFactor)*PTS` — `0.5` = half speed / twice as long, `1` = original.
- Keep the SRT in sync by building it with the reciprocal:
  `d.getSrt(1 / speedFactor)`.
- The `.webm` stays the full-speed master; only the mp4 (+ its SRT) is retimed.

To retime an already-produced clip without re-running the live flow:
`ffmpeg -y -i in.mp4 -vf "setpts=2.0*PTS" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -movflags +faststart out.mp4`
(2.0 = half speed) and stretch the SRT timestamps by the same factor.

## Hard constraint — ffmpeg on this Mac has NO libass and NO drawtext

This box's ffmpeg (`--enable-gpl --enable-libx264`) cannot render text. That is
**why captions are drawn on the page during capture** instead of burned in
afterward — the webm is already subtitled, and the mp4 step is a plain libx264
re-encode (only `setpts`, `scale`, `format`, `overlay` are available). If a text
filter is ever needed, install an ffmpeg with libass; do not reach for
`-vf subtitles=` / `drawtext` here — it fails with "No option name near…".
See memory [[demo-video-pipeline]] and tunnel notes [[cr-rois-one-tunnel-routing]].

## Run

```bash
cd e2e   # must run from e2e/ — it has its own @playwright/test
npx playwright test tests/gantt/demo-live-add-base-tour.spec.ts \
  --config config/demo-video.config.ts --reporter=list
```

Single worker, no retries (one clean take). Login speed over the public tunnel
varies run-to-run; the `leadInSec` measurement trims the blank head adaptively.
Do not commit results — §No-Auto-Commit.
