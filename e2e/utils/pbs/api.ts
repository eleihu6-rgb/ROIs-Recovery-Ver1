/**
 * PBS API utility functions.
 *
 * PBS Portal and PBS App share the same backend (pbs-server).
 * Base URL: PBS_API_URL (default http://localhost:3002)
 * Auth: Bearer JWT token (same system for both Portal and App)
 */
import { type APIRequestContext, expect } from '@playwright/test'
import { loginToPbsApi } from './auth'

export class PbsApiHelper {
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

  async login(userCode: string, password: string): Promise<{ token: string; user: Record<string, unknown>; authMode: string }> {
    const body = await loginToPbsApi(this.request, this.baseUrl, userCode, password)
    this.token = body.token
    return body
  }

  async getSession(): Promise<Record<string, unknown> | null> {
    const response = await this.request.get(`${this.baseUrl}/auth/session`, {
      headers: this.headers(),
    })
    expect(response.ok()).toBeTruthy()
    return await response.json() as Record<string, unknown> | null
  }

  async logout(): Promise<void> {
    const response = await this.request.delete(`${this.baseUrl}/auth/session`, {
      headers: this.headers(),
    })
    expect(response.ok()).toBeTruthy()
  }

  // ─── PBS Resources ──────────────────────────────────────────────────

  async getPairings(params?: Record<string, string | number>): Promise<Record<string, unknown>> {
    const query = params ? new URLSearchParams(params as Record<string, string>).toString() : ''
    const url = query ? `${this.baseUrl}/api/pairings?${query}` : `${this.baseUrl}/api/pairings`
    const response = await this.request.get(url, { headers: this.headers() })
    expect(response.ok()).toBeTruthy()
    return await response.json() as Record<string, unknown>
  }

  async getPairingDetail(id: string): Promise<Record<string, unknown>> {
    const response = await this.request.get(`${this.baseUrl}/api/pairings/${id}`, {
      headers: this.headers(),
    })
    expect(response.ok()).toBeTruthy()
    return await response.json() as Record<string, unknown>
  }

  async applyForPairing(pairingId: string): Promise<Record<string, unknown>> {
    const response = await this.request.post(`${this.baseUrl}/api/applications`, {
      headers: this.headers(),
      data: { pairingId },
    })
    expect(response.ok()).toBeTruthy()
    return await response.json() as Record<string, unknown>
  }

  async getMyApplications(): Promise<Record<string, unknown>> {
    const response = await this.request.get(`${this.baseUrl}/api/applications/my`, {
      headers: this.headers(),
    })
    expect(response.ok()).toBeTruthy()
    return await response.json() as Record<string, unknown>
  }

  async getSchedule(): Promise<Record<string, unknown>> {
    const response = await this.request.get(`${this.baseUrl}/api/schedule`, {
      headers: this.headers(),
    })
    expect(response.ok()).toBeTruthy()
    return await response.json() as Record<string, unknown>
  }

  // ─── Days Off ───────────────────────────────────────────────────────

  async getDaysOff(): Promise<Record<string, unknown>> {
    const response = await this.request.get(`${this.baseUrl}/api/days-off`, {
      headers: this.headers(),
    })
    expect(response.ok()).toBeTruthy()
    return await response.json() as Record<string, unknown>
  }

  async requestDaysOff(date: string, reason?: string): Promise<Record<string, unknown>> {
    const response = await this.request.post(`${this.baseUrl}/api/days-off`, {
      headers: this.headers(),
      data: { date, reason },
    })
    expect(response.ok()).toBeTruthy()
    return await response.json() as Record<string, unknown>
  }
}

/**
 * Create a pre-authenticated PBS API helper.
 */
export async function createAuthenticatedPbsApi(
  request: APIRequestContext,
  baseUrl: string,
  userCode: string,
  password: string,
): Promise<PbsApiHelper> {
  const api = new PbsApiHelper(request, baseUrl)
  await api.login(userCode, password)
  return api
}
