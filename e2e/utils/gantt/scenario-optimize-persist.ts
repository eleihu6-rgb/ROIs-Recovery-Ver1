/**
 * Shared helpers for scenario optimize → DONE → DB/API persistence proofs.
 *
 * Used by SIT/local Playwright specs that must prove more than "status badge
 * says Done": gantt-data must expose crew + duties after the async
 * loadResultGzIntoDb transcription into scenario.roster_flight.
 */
import { expect, type APIRequestContext } from '@playwright/test'

export type ScenarioStatus = 'DRAFT' | 'RUNNING' | 'DONE' | 'FAILED' | 'PUBLISHED' | string

export interface ScenarioDetail {
  id: number
  name?: string
  status: ScenarioStatus
  taskId?: string | null
  filePath?: string | null
  fileSize?: number | null
  checksum?: string | null
  optimizedCount?: number | null
}

export interface GanttDataShape {
  crew?: unknown[]
  crews?: unknown[]
  assignments?: unknown[]
  rosters?: unknown[]
  groundItems?: unknown[]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const loginGantt = async (
  request: APIRequestContext,
  apiBase: string,
  userCode: string,
  password: string,
): Promise<{ token: string; userCode: string; userName: string; schema: string }> => {
  const res = await request.post(`${apiBase}/api/auth/login`, {
    data: { userCode, password },
  })
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
  const body = (await res.json()) as {
    data?: { token: string; userCode: string; userName: string; schema: string }
    token?: string
  }
  const data = body.data ?? (body as unknown as { token: string; userCode: string; userName: string; schema: string })
  expect(data.token, 'login token missing').toBeTruthy()
  return data as { token: string; userCode: string; userName: string; schema: string }
}

export const fetchScenario = async (
  request: APIRequestContext,
  apiBase: string,
  token: string,
  scenarioId: number,
): Promise<ScenarioDetail> => {
  const res = await request.get(`${apiBase}/api/scenario/${scenarioId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok(), `GET scenario ${scenarioId} → ${res.status()}`).toBeTruthy()
  const body = (await res.json()) as { data: ScenarioDetail }
  return body.data
}

export const fetchStatus = async (
  request: APIRequestContext,
  apiBase: string,
  token: string,
  scenarioId: number,
): Promise<string> => (await fetchScenario(request, apiBase, token, scenarioId)).status

export const waitForStatus = async (
  request: APIRequestContext,
  apiBase: string,
  token: string,
  scenarioId: number,
  accept: (s: string) => boolean,
  timeoutMs: number,
  pollMs = 4_000,
): Promise<string> => {
  const deadline = Date.now() + timeoutMs
  let status = await fetchStatus(request, apiBase, token, scenarioId)
  while (!accept(status) && Date.now() < deadline) {
    await sleep(pollMs)
    status = await fetchStatus(request, apiBase, token, scenarioId)
  }
  return status
}

/** FAILED/DONE/PUBLISHED → DRAFT; RUNNING → FAILED → DRAFT. */
export const ensureDraftViaApi = async (
  request: APIRequestContext,
  apiBase: string,
  token: string,
  scenarioId: number,
): Promise<void> => {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  const sc = await fetchScenario(request, apiBase, token, scenarioId)
  if (sc.status === 'DRAFT') return
  if (sc.status === 'RUNNING') {
    const r1 = await request.post(`${apiBase}/api/scenario/${scenarioId}/transition`, {
      headers,
      data: { status: 'FAILED' },
    })
    expect(r1.ok(), `RUNNING→FAILED: ${r1.status()}`).toBeTruthy()
  }
  const r2 = await request.post(`${apiBase}/api/scenario/${scenarioId}/transition`, {
    headers,
    data: { status: 'DRAFT' },
  })
  expect(r2.ok(), `→DRAFT: ${r2.status()} ${(await r2.text()).slice(0, 200)}`).toBeTruthy()
  const after = await fetchStatus(request, apiBase, token, scenarioId)
  expect(after, 'must be DRAFT before run').toBe('DRAFT')
}

/**
 * After DONE, live-server loads gz → scenario.roster_flight asynchronously.
 * Poll gantt-data until crew + (assignments|groundItems) are non-empty.
 */
export const waitForPersistedGanttData = async (
  request: APIRequestContext,
  apiBase: string,
  token: string,
  scenarioId: number,
  timeoutMs: number,
  pollMs = 3_000,
): Promise<{ crewCount: number; dutyCount: number; raw: GanttDataShape }> => {
  const deadline = Date.now() + timeoutMs
  let last: GanttDataShape = {}
  let crewCount = 0
  let dutyCount = 0
  while (Date.now() < deadline) {
    const res = await request.get(`${apiBase}/api/scenario/${scenarioId}/gantt-data`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 90_000,
    })
    if (res.ok()) {
      const body = (await res.json()) as { data?: GanttDataShape }
      last = body.data ?? {}
      const crew = last.crew ?? last.crews ?? []
      const asg = last.assignments ?? last.rosters ?? []
      const ground = last.groundItems ?? []
      crewCount = Array.isArray(crew) ? crew.length : 0
      dutyCount = (Array.isArray(asg) ? asg.length : 0) + (Array.isArray(ground) ? ground.length : 0)
      if (crewCount > 0 && dutyCount > 0) {
        return { crewCount, dutyCount, raw: last }
      }
    }
    await sleep(pollMs)
  }
  throw new Error(
    `timeout waiting for persisted gantt-data (crew=${crewCount} duties=${dutyCount}). ` +
      `loadResultGzIntoDb may have failed — check live-server for "DB load failed".`,
  )
}

export const assertDoneMetadata = (sc: ScenarioDetail): void => {
  expect(sc.status, 'scenario must be DONE').toBe('DONE')
  expect(sc.taskId, 'taskId must be set after DONE').toBeTruthy()
  expect(sc.filePath, 'filePath must be set after DONE (engine callback)').toBeTruthy()
}
