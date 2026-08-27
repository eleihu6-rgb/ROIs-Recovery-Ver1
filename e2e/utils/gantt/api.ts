/**
 * Gantt API utility functions.
 *
 * Gantt uses its own backend (live-server) with independent authentication.
 * Base URL: GANTT_API_URL (default http://localhost:3000)
 * Auth: Bearer JWT token
 */
import { type APIRequestContext, expect } from '@playwright/test'

export class GanttApiHelper {
  private readonly request: APIRequestContext
  private readonly baseUrl: string
  private token: string | null = null

  constructor(request: APIRequestContext, baseUrl: string, token?: string) {
    this.request = request
    this.baseUrl = baseUrl
    if (token) this.token = token
  }

  setToken(token: string): void {
    this.token = token
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`
    return headers
  }

  // ─── Authentication ─────────────────────────────────────────────────

  async login(userCode: string, password: string): Promise<{ token: string; userCode: string; userName: string; schema: string }> {
    const response = await this.request.post(`${this.baseUrl}/api/auth/login`, {
      data: { userCode, password },
    })
    expect(response.ok()).toBeTruthy()
    const body = await response.json()
    this.token = body.token as string
    return body as { token: string; userCode: string; userName: string; schema: string }
  }

  async me(): Promise<Record<string, unknown>> {
    const response = await this.request.get(`${this.baseUrl}/api/auth/me`, {
      headers: this.headers(),
    })
    expect(response.ok()).toBeTruthy()
    return await response.json() as Record<string, unknown>
  }

  // ─── Crew ───────────────────────────────────────────────────────────

  async getCrewList(params?: Record<string, string | number>): Promise<Record<string, unknown>> {
    const query = params ? new URLSearchParams(params as Record<string, string>).toString() : ''
    const url = query ? `${this.baseUrl}/api/crew?${query}` : `${this.baseUrl}/api/crew`
    const response = await this.request.get(url, { headers: this.headers() })
    expect(response.ok()).toBeTruthy()
    return await response.json() as Record<string, unknown>
  }

  async getCrewDetail(id: number): Promise<Record<string, unknown>> {
    const response = await this.request.get(`${this.baseUrl}/api/crew/${id}/detail`, {
      headers: this.headers(),
    })
    expect(response.ok()).toBeTruthy()
    return await response.json() as Record<string, unknown>
  }

  // ─── Pairing ────────────────────────────────────────────────────────

  async getPairings(params?: Record<string, string | number>): Promise<Record<string, unknown>> {
    const query = params ? new URLSearchParams(params as Record<string, string>).toString() : ''
    const url = query ? `${this.baseUrl}/api/pairing?${query}` : `${this.baseUrl}/api/pairing`
    const response = await this.request.get(url, { headers: this.headers() })
    expect(response.ok()).toBeTruthy()
    return await response.json() as Record<string, unknown>
  }

  async getPairingDetail(id: number): Promise<Record<string, unknown>> {
    const response = await this.request.get(`${this.baseUrl}/api/pairing/${id}`, {
      headers: this.headers(),
    })
    expect(response.ok()).toBeTruthy()
    return await response.json() as Record<string, unknown>
  }

  // ─── Timezone Options ───────────────────────────────────────────────

  async getTimezoneOptions(): Promise<Record<string, unknown>[]> {
    const response = await this.request.get(`${this.baseUrl}/altair/live/base/timezone-options`, {
      headers: this.headers(),
    })
    expect(response.ok()).toBeTruthy()
    return await response.json() as Record<string, unknown>[]
  }

  // ─── Rule Check ─────────────────────────────────────────────────────

  async runRuleCheck(crewIds: string[]): Promise<Record<string, unknown>> {
    const response = await this.request.post(`${this.baseUrl}/api/rule-check`, {
      headers: this.headers(),
      data: { crewIds },
    })
    expect(response.ok()).toBeTruthy()
    return await response.json() as Record<string, unknown>
  }
}

/**
 * Create a pre-authenticated Gantt API helper.
 * Uses API login to get a token.
 */
export async function createAuthenticatedGanttApi(
  request: APIRequestContext,
  baseUrl: string,
  userCode: string,
  password: string,
): Promise<GanttApiHelper> {
  const api = new GanttApiHelper(request, baseUrl)
  await api.login(userCode, password)
  return api
}
