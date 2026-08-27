import axios from 'axios'
import { AI_API_BASE } from '@/config/api-paths'
import { useAuthStore } from '@/stores/auth-store'
import type {
  RegressionTest,
  GenerateResult,
  DiagnosisResult,
  EntityIntent,
  RunOrder,
  RunScope,
  RunStartResult,
  RunStatusResult,
  ImportResult,
  ApplyGateError,
  RegressionRound,
  RegressionRoundDetail,
} from '@/types/regression'

/**
 * ai-server returns RAW JSON (no { code, data } envelope), so we use a plain
 * axios instance rather than the shared http-client. The shared client's
 * interceptor unwraps any body with a `code` property — but the generate
 * response legitimately carries a field literally named `code` (the generated
 * Playwright source), which that interceptor would misread as a status code and
 * reject. A plain instance avoids the collision and returns `response.data`
 * verbatim.
 *
 * The 422 quality gate returns `{ detail, issues[] }`; we copy `issues` + the
 * status onto the rejected Error so the Apply flow can render the chips.
 */
const client = axios.create({
  baseURL: AI_API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const data = error?.response?.data
    if (data && typeof data === 'object') {
      const issues = (data as { issues?: unknown }).issues
      if (Array.isArray(issues)) {
        ;(error as { __issues?: string[] }).__issues = issues.map((i) => String(i))
      }
    }
    if (error?.response?.status) {
      ;(error as { __status?: number }).__status = error.response.status
    }
    return Promise.reject(error)
  },
)

// Identity for actor tracking (creator / modifier / tester) — ai-server has no
// auth of its own, so the logged-in planner's userCode rides along as a header.
client.interceptors.request.use((config) => {
  const userCode = useAuthStore.getState().user?.userCode
  if (userCode) config.headers.set('X-User-Code', userCode)
  return config
})

const enrichGateError = (err: unknown): ApplyGateError => {
  const e = (err instanceof Error ? err : new Error(String(err))) as ApplyGateError
  const issues = (err as { __issues?: string[] }).__issues
  const status = (err as { __status?: number }).__status
  if (issues) e.issues = issues
  if (status) e.status = status
  return e
}

interface CreateTestBody {
  title: string
  category: string
  priority: string
  description: string
}

type UpdateTestBody = Partial<CreateTestBody> & { quarantined?: boolean }

interface GenerateBody {
  title: string
  description: string
  category: string
  previous_code?: string
  issues?: string[]
  conditions?: string[]
  entity_intents?: EntityIntent[]
}

/**
 * Normalize a test row so the v2 UI never crashes on a field an older / not-yet-
 * restarted ai-server omits (e.g. `recent_results`, `instability`, `quarantined`,
 * `versions`). The backend migrates these on load, but a stale running process may
 * still return v1-shaped rows — the UI must tolerate that, not white-screen.
 */
const normalizeTest = (t: RegressionTest): RegressionTest => ({
  ...t,
  recent_results: t.recent_results ?? [],
  instability: t.instability ?? 0,
  quarantined: t.quarantined ?? false,
  total_duration_ms: t.total_duration_ms ?? 0,
  last_run_at: t.last_run_at ?? null,
  story: t.story ?? '',
  conditions: t.conditions ?? [],
})

export const regressionApi = {
  list: async (): Promise<{ tests: RegressionTest[] }> => {
    const res = (await client.get('/regression/tests')) as { tests?: RegressionTest[] }
    return { tests: (res.tests ?? []).map(normalizeTest) }
  },

  create: (body: CreateTestBody): Promise<RegressionTest> =>
    client.post('/regression/tests', body) as Promise<RegressionTest>,

  update: (id: number, body: UpdateTestBody): Promise<RegressionTest> =>
    client.put(`/regression/tests/${id}`, body) as Promise<RegressionTest>,

  remove: (id: number): Promise<{ deleted: number }> =>
    client.delete(`/regression/tests/${id}`) as Promise<{ deleted: number }>,

  generate: (body: GenerateBody): Promise<GenerateResult> =>
    client.post('/regression/generate-playwright', body) as Promise<GenerateResult>,

  updateConditions: (id: number, conditions: string[]): Promise<RegressionTest> =>
    client.put(`/regression/tests/${id}/conditions`, conditions) as Promise<RegressionTest>,

  updateStory: (id: number, story: string): Promise<RegressionTest> =>
    client.put(`/regression/tests/${id}/story`, { story }) as Promise<RegressionTest>,

  extractEntities: (id: number, conditions: string[]): Promise<EntityIntent[]> =>
    (client.post(`/regression/tests/${id}/extract-entities`, { conditions }) as Promise<EntityIntent[]>),

  updateEntityIntents: (id: number, intents: EntityIntent[]): Promise<RegressionTest> =>
    client.put(`/regression/tests/${id}/entity-intents`, intents) as Promise<RegressionTest>,

  diagnose: (id: number): Promise<DiagnosisResult> =>
    client.post(`/regression/tests/${id}/diagnose`) as Promise<DiagnosisResult>,

  /**
   * Apply generated code; on the 422 quality gate the rejected error carries
   * `issues[]` so the caller can surface them and keep Apply disabled.
   */
  applyGenerated: (id: number, code: string): Promise<{ spec_file: string; test_name: string }> =>
    (client.post(`/regression/tests/${id}/apply-generated`, { code }) as Promise<{
      spec_file: string
      test_name: string
    }>).catch((err) => {
      throw enrichGateError(err)
    }),

  run: (testIds: number[], opts?: { order?: RunOrder; scope?: RunScope }): Promise<RunStartResult> =>
    client.post('/regression/runs', {
      test_ids: testIds,
      base_url: window.location.origin,
      ...(opts?.order ? { order: opts.order } : {}),
      ...(opts?.scope ? { scope: opts.scope } : {}),
    }) as Promise<RunStartResult>,

  runStatus: (runId: string): Promise<RunStatusResult> =>
    client.get(`/regression/runs/${runId}`) as Promise<RunStatusResult>,

  importSpecs: (): Promise<ImportResult> =>
    client.post('/regression/import-specs') as Promise<ImportResult>,

  detail: (id: number): Promise<RegressionTest> =>
    client.get(`/regression/tests/${id}/detail`) as Promise<RegressionTest>,

  recordManualRound: (
    id: number,
    version: number,
    body: { status: 'pass' | 'fail' | 'flaky'; duration_ms?: number; details?: RegressionRoundDetail; log?: string },
  ): Promise<RegressionRound> =>
    client.post(`/regression/tests/${id}/versions/${version}/rounds`, body) as Promise<RegressionRound>,

  setQuarantined: (id: number, quarantined: boolean): Promise<RegressionTest> =>
    client.put(`/regression/tests/${id}`, { quarantined }) as Promise<RegressionTest>,

  /** Browser-navigable URL for a failed test's trace zip (open at trace.playwright.dev). */
  traceUrl: (runId: string, testId: number): string =>
    `${AI_API_BASE}/regression/runs/${runId}/trace/${testId}`,

  /** Full URL to serve a snapshot image inline (ai-server artifact endpoint). */
  snapshotUrl: (artifactUrl: string): string => {
    if (artifactUrl.startsWith('/ai/')) {
      return `${AI_API_BASE}/${artifactUrl.replace(/^\/ai\//, '')}`
    }
    return artifactUrl
  },

  deleteSnapshot: (runId: string, filename: string): Promise<{ deleted: string }> =>
    client.delete(`/regression/artifacts/${runId}/snapshots/${filename}`) as Promise<{ deleted: string }>,
}
