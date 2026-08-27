import { addDays, format, parseISO, startOfMonth, endOfMonth, addMonths } from 'date-fns'

export interface DateChunk {
  startDt: string  // YYYY-MM-DD
  endDt: string
}

export function chunkDateRange(
  startDt: string,
  endDt: string,
  chunkDays: number,
): DateChunk[] {
  const start = parseISO(startDt)
  const end = parseISO(endDt)
  const chunks: DateChunk[] = []
  let cursor = start

  while (cursor <= end) {
    const chunkEnd = addDays(cursor, chunkDays - 1)
    const clampedEnd = chunkEnd < end ? chunkEnd : end
    chunks.push({
      startDt: format(cursor, 'yyyy-MM-dd'),
      endDt: format(clampedEnd, 'yyyy-MM-dd'),
    })
    cursor = addDays(clampedEnd, 1)
  }

  return chunks
}

/**
 * Split a date range into calendar-month chunks.
 * Each chunk covers exactly one calendar month (1st → last day),
 * with the first/last chunks clamped to startDt/endDt.
 *
 * Example: '2025-01-15' – '2025-03-10'
 *   → [{2025-01-15, 2025-01-31}, {2025-02-01, 2025-02-28}, {2025-03-01, 2025-03-10}]
 */
export function chunkByMonth(startDt: string, endDt: string): DateChunk[] {
  const start = parseISO(startDt)
  const end = parseISO(endDt)
  const chunks: DateChunk[] = []
  let cursor = start

  while (cursor <= end) {
    const monthEnd = endOfMonth(cursor)
    const chunkEnd = monthEnd < end ? monthEnd : end
    chunks.push({
      startDt: format(cursor, 'yyyy-MM-dd'),
      endDt: format(chunkEnd, 'yyyy-MM-dd'),
    })
    cursor = startOfMonth(addMonths(cursor, 1))
  }

  return chunks
}

export type FetchFn = (startDt: string, endDt: string) => Promise<unknown[]>

export interface FetchWithChunkRetryOptions {
  maxRowsPerResponse?: number
  splitOnCap?: boolean
  failOnSingleDayCap?: boolean
  failOnRepeatedFailure?: boolean
  singleDayRetryAttempts?: number
  singleDayRetryDelayMs?: number
  singleDayRetryMaxDelayMs?: number
}

// Next smaller chunk size: 30→10→5→3→1, then 0 (cannot split further).
const nextChunkDays = (d: number): number =>
  d > 10 ? 10 : d > 5 ? 5 : d > 3 ? 3 : d > 1 ? 1 : 0

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const retryDelayMs = (attempt: number, options: FetchWithChunkRetryOptions): number => {
  const base = options.singleDayRetryDelayMs ?? 5000
  const max = options.singleDayRetryMaxDelayMs ?? 60000
  return Math.min(max, base * Math.pow(2, Math.max(0, attempt - 1)))
}

const isFailFastError = (err: unknown): boolean => {
  const status = (err as { status?: number }).status
  return status === 401 || status === 403
}

/**
 * Fetch a date chunk, splitting into smaller sub-chunks on failure
 * (30→10→5→3→1). Auth errors (401/403) fail fast. If even a single-day
 * range keeps failing (persistent upstream error), the default is to skip it
 * with a warning so the rest of the import continues; callers importing
 * authoritative datasets can opt into failing instead.
 */
export async function fetchWithChunkRetry(
  fn: FetchFn,
  startDt: string,
  endDt: string,
  chunkDays: number,
  options: FetchWithChunkRetryOptions = {},
): Promise<unknown[]> {
  try {
    const rows = await fn(startDt, endDt)
    const cap = options.maxRowsPerResponse
    if (options.splitOnCap && cap && rows.length >= cap) {
      const subChunkDays = nextChunkDays(chunkDays)
      if (subChunkDays === 0) {
        const message = `[f8] ${startDt}..${endDt} returned ${rows.length} rows, meeting/exceeding cap ${cap}`
        if (options.failOnSingleDayCap) throw new Error(`${message}; refusing to silently truncate single-day import`)
        console.warn(message)
        return rows
      }

      const subChunks = chunkDateRange(startDt, endDt, subChunkDays)
      const results: unknown[] = []
      for (const chunk of subChunks) {
        const subResult = await fetchWithChunkRetry(fn, chunk.startDt, chunk.endDt, subChunkDays, options)
        results.push(...subResult)
      }
      return results
    }
    return rows
  } catch (err) {
    if (isFailFastError(err)) throw err
    if (
      options.failOnSingleDayCap &&
      err instanceof Error &&
      err.message.includes('refusing to silently truncate single-day import')
    ) {
      throw err
    }

    const subChunkDays = nextChunkDays(chunkDays)
    if (subChunkDays === 0) {
      const retryAttempts = Math.max(0, options.singleDayRetryAttempts ?? 0)
      let lastErr = err

      for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
        const delayMs = retryDelayMs(attempt, options)
        console.warn(`[f8] retrying ${startDt}..${endDt} after single-day failure (${attempt}/${retryAttempts}) in ${delayMs}ms: ${(lastErr as Error).message}`)
        await sleep(delayMs)

        try {
          const rows = await fn(startDt, endDt)
          const cap = options.maxRowsPerResponse
          if (options.splitOnCap && cap && rows.length >= cap) {
            const message = `[f8] ${startDt}..${endDt} returned ${rows.length} rows, meeting/exceeding cap ${cap}`
            if (options.failOnSingleDayCap) throw new Error(`${message}; refusing to silently truncate single-day import`)
            console.warn(message)
          }
          return rows
        } catch (retryErr) {
          if (isFailFastError(retryErr)) throw retryErr
          if (
            options.failOnSingleDayCap &&
            retryErr instanceof Error &&
            retryErr.message.includes('refusing to silently truncate single-day import')
          ) {
            throw retryErr
          }
          lastErr = retryErr
        }
      }

      if (options.failOnRepeatedFailure) {
        throw new Error(`[f8] ${startDt}..${endDt} failed after repeated retries: ${(lastErr as Error).message}`)
      }
      // Smallest range still failing — skip it and keep importing the rest.
      console.warn(`[f8] skipping ${startDt}..${endDt} after repeated failure: ${(lastErr as Error).message}`)
      return []
    }

    const subChunks = chunkDateRange(startDt, endDt, subChunkDays)
    const results: unknown[] = []
    for (const chunk of subChunks) {
      const subResult = await fetchWithChunkRetry(fn, chunk.startDt, chunk.endDt, subChunkDays, options)
      results.push(...subResult)
    }
    return results
  }
}
