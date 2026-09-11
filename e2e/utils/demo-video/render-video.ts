/**
 * Transcode the recorded demo (.webm) to a widely-playable .mp4 (H.264).
 *
 * Captions are already burned into the pixels during capture (DemoDirector draws
 * the subtitle bar on the page while recording), so no subtitle/text filter is
 * needed here — which is exactly why this works on a minimal ffmpeg build that
 * lacks libass and drawtext. We only re-encode VP8/webm → H.264/mp4 with
 * +faststart so the clip plays inline in browsers, Slack, and QuickTime.
 *
 * libx264 is confirmed present in the local ffmpeg (`--enable-gpl
 * --enable-libx264`); if it were missing, callers can keep the .webm as-is.
 */
import { spawn } from 'node:child_process'

export interface TranscodeResult {
  outPath: string
  ok: boolean
  stderrTail: string
}

export const transcodeToMp4 = async (
  videoPath: string,
  outPath: string,
  /** Seconds to trim off the start (drops the blank page-load lead-in). */
  startSec = 0,
  /**
   * Playback speed of the output (1 = original, 0.5 = half speed / twice as
   * long). Implemented with `setpts=(1/speedFactor)*PTS` — a core ffmpeg video
   * filter (no libass/drawtext needed). There is no audio track to retime.
   */
  speedFactor = 1,
): Promise<TranscodeResult> => {
  const seek = startSec > 0.1 ? ['-ss', startSec.toFixed(3)] : []
  const slow =
    speedFactor > 0 && Math.abs(speedFactor - 1) > 1e-3
      ? ['-vf', `setpts=${(1 / speedFactor).toFixed(4)}*PTS`]
      : []
  const args = [
    '-y',
    ...seek,
    '-i',
    videoPath,
    ...slow,
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outPath,
  ]

  return new Promise<TranscodeResult>((resolve) => {
    const proc = spawn('ffmpeg', args)
    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    proc.on('error', (err) => {
      resolve({ outPath, ok: false, stderrTail: `spawn failed: ${String(err)}` })
    })
    proc.on('close', (code) => {
      resolve({ outPath, ok: code === 0, stderrTail: stderr.slice(-800) })
    })
  })
}
