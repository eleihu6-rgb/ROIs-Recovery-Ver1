import { env } from '../config/index.js'

interface StartRoTaskArgs {
  scenarioId: number
  rosterPeriodId: number
  periodCode: string
  liveServerUrl: string
  token: string
  airline: string
  version?: string
}

export interface EngineProgressDetail {
  schema_version?: number
  state?: string
  percent?: number
  stage?: string
  stage_label?: string
  stage_index?: number
  stage_total?: number
  detail?: string
  step_index?: number
  step_total?: number
  started_at?: string
  updated_at?: string
  elapsed_sec?: number
  error?: string | null
}

export interface EngineTaskProgress {
  task_id: string
  progress: number
  status: string
  airline: string
  progress_detail?: EngineProgressDetail | null
  progress_age_sec?: number | null
}

const headers = (token: string, airline: string): Record<string, string> => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
  'X-Airline': airline,
})

const engineAirlineCode = (airline: string): string => airline.trim().split('_')[0]?.toUpperCase() ?? airline

export class EngineServerStartError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'EngineServerStartError'
    this.statusCode = statusCode
  }
}

const parseErrorDetail = (bodyText: string): string => {
  try {
    const parsed = JSON.parse(bodyText) as unknown
    if (parsed && typeof parsed === 'object') {
      const detail = (parsed as { detail?: unknown }).detail
      if (typeof detail === 'string' && detail.trim()) return detail
      const message = (parsed as { message?: unknown }).message
      if (typeof message === 'string' && message.trim()) return message
    }
  } catch {
    // Non-JSON error bodies are valid for upstream failures; use the raw text.
  }
  return bodyText
}

const pluralizeOptimization = (count: number): string => count === 1 ? 'optimization' : 'optimizations'

const concurrencyLimitMessage = (statusCode: number, detail: string): string | null => {
  if (statusCode !== 429 || !/Maximum concurrency limit reached/i.test(detail)) return null

  const optimizerMatch = detail.match(/for optimizer\s+([^:]+):\s*(\d+)/i)
  if (optimizerMatch) {
    const optimizerType = optimizerMatch[1]
    const limit = Number(optimizerMatch[2])
    if (Number.isFinite(limit) && limit > 0) {
      return `Another optimization is already running. This environment allows ${limit} ${optimizerType} ${pluralizeOptimization(limit)} at a time. Please wait for the current run to finish.`
    }
  }

  const globalMatch = detail.match(/Maximum concurrency limit reached:\s*(\d+)/i)
  if (globalMatch) {
    const limit = Number(globalMatch[1])
    if (Number.isFinite(limit) && limit > 0) {
      return `The optimization server is already running the maximum number of jobs (${limit}). Please wait for a current run to finish before starting another one.`
    }
  }

  return 'The optimization server is busy. Please wait for the current run to finish before starting another one.'
}

export const engineServerClient = {
  /** Start an RO optimization task on engine-server; returns its task_id. */
  async startRoTask({ scenarioId, rosterPeriodId, periodCode, liveServerUrl, token, airline, version }: StartRoTaskArgs): Promise<string> {
    // engine-server config keys are airline codes (BR/F8), while live-server
    // may pass a schema name such as f8. Bridge here.
    const engineAirline = engineAirlineCode(airline)
    const res = await fetch(`${env.ENGINE_SERVER_URL}/api/optimize/start`, {
      method: 'POST',
      headers: headers(token, engineAirline),
      body: JSON.stringify({
        airline: engineAirline,
        // TEMPORARY: use LegacyRO (Java server + PBS optimizer) until new engine is ready
        type: 'LegacyRO',
        // inputSource:"db" → engine-server builds ro_input.gz from PostgreSQL and skips the
        // legacy Java admin server (:8011) login. Without it the run takes the Java path and
        // fails with 502 "Java server login failed: ...:8011 Connection refused" on any host
        // where :8011 is unreachable. javaScenarioId is kept only for the (now-bypassed) Java path.
        // rosterPeriodId + periodCode identify the scenario's roster period so engine-server can
        // fetch the scenario-scoped bid package (live-server /api/admin/algorithm-export/scenario-package).
        parameters: {
          scenarioId,
          javaScenarioId: 114,
          inputSource: 'db',
          rosterPeriodId,
          periodCode,
          ...(version ? { version } : {}),
        },
        url: liveServerUrl,
        token,
      }),
      // /optimize/start builds the ro_input AND the scenario-scoped crew-bid
      // package from PostgreSQL synchronously before returning; for a real
      // scenario this is minutes (e.g. YVR scenario 540 = 72 crew: ~97s ro_input
      // + ~171s bid build = ~268s). The old 300s default left almost no margin
      // (sized for the 14-crew YEG test path), so a slightly slower WAN build
      // tripped it. Default 600s; tune per-deploy via ENGINE_START_TIMEOUT_MS.
      signal: AbortSignal.timeout(Number(process.env.ENGINE_START_TIMEOUT_MS ?? 600_000)),
    })
    if (!res.ok) {
      const bodyText = await res.text()
      const detail = parseErrorDetail(bodyText)
      throw new EngineServerStartError(
        res.status,
        concurrencyLimitMessage(res.status, detail) ?? `engine-server /optimize/start ${res.status}: ${bodyText}`,
      )
    }
    const json = (await res.json()) as { task_id: string }
    return json.task_id
  },

  /** Fetch ro_output.gz bytes for a finished task (approach B: on-demand pull).
   *  scenarioId is passed as a query param so engine-server can fall back to
   *  the complete/ directory when task_manager memory was cleared after restart. */
  async fetchResultFile(taskId: string, token: string, airline: string, scenarioId?: number): Promise<Buffer> {
    const url = new URL(`${env.ENGINE_SERVER_URL}/api/optimize/result/${taskId}`)
    if (scenarioId != null) url.searchParams.set('scenario_id', String(scenarioId))
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, 'X-Airline': engineAirlineCode(airline) },
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      throw new Error(`engine-server /optimize/result ${res.status}`)
    }
    return Buffer.from(await res.arrayBuffer())
  },

  /** Fetch ro_input.gz bytes for a scenario (path B: leadinLive=0 snapshots). */
  async fetchInputFile(taskId: string, token: string, airline: string, scenarioId?: number): Promise<Buffer> {
    const url = new URL(`${env.ENGINE_SERVER_URL}/api/optimize/input/${taskId}`)
    if (scenarioId != null) url.searchParams.set('scenario_id', String(scenarioId))
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, 'X-Airline': engineAirlineCode(airline) },
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      throw new Error(`engine-server /optimize/input ${res.status}`)
    }
    return Buffer.from(await res.arrayBuffer())
  },

  async fetchVersionFile(
    scenarioId: number,
    version: string,
    filename: string,
    token: string,
    airline: string,
  ): Promise<Buffer> {
    const url = new URL(`${env.ENGINE_SERVER_URL}/api/optimize/scenario/${scenarioId}/versions/${encodeURIComponent(version)}/files/${encodeURIComponent(filename)}`)
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, 'X-Airline': engineAirlineCode(airline) },
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      throw new Error(`engine-server scenario version file ${res.status}`)
    }
    return Buffer.from(await res.arrayBuffer())
  },

  /** Read coarse task progress plus the solver's output/progress.json payload. */
  async fetchProgress(taskId: string, token: string, airline: string): Promise<EngineTaskProgress> {
    const res = await fetch(`${env.ENGINE_SERVER_URL}/api/optimize/progress/${taskId}`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Airline': engineAirlineCode(airline) },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      throw new Error(`engine-server /optimize/progress ${res.status}`)
    }
    return await res.json() as EngineTaskProgress
  },

  /** Overwrite ro_output.gz on engine-server (called after patch-output save). */
  async writeOutputFile(taskId: string, gzBytes: Buffer, token: string, airline: string): Promise<void> {
    const res = await fetch(`${env.ENGINE_SERVER_URL}/api/optimize/result/${taskId}/output`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/gzip',
        Authorization: `Bearer ${token}`,
        'X-Airline': engineAirlineCode(airline),
      },
      body: gzBytes,
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      throw new Error(`engine-server PUT /optimize/result output ${res.status}: ${await res.text()}`)
    }
  },

  async deleteScenarioVersionFiles({
    scenarioId,
    version,
    token,
    airline,
  }: {
    scenarioId: number
    version?: string
    token: string
    airline: string
  }): Promise<void> {
    const engineAirline = engineAirlineCode(airline)
    const url = version
      ? `${env.ENGINE_SERVER_URL}/api/optimize/scenario/${scenarioId}/versions/${encodeURIComponent(version)}`
      : `${env.ENGINE_SERVER_URL}/api/optimize/scenario/${scenarioId}/versions`
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'X-Airline': engineAirline },
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      throw new Error(`engine-server scenario version delete ${res.status}: ${bodyText}`)
    }
  },
}
