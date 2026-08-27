import axios from 'axios'
import { LIVE_API_BASE } from '@/config/api-paths'

/**
 * Public API client — no authentication required.
 * Used for fetching system config before login.
 */
export const publicApi = axios.create({
  baseURL: LIVE_API_BASE,
  timeout: 10000,
})

/**
 * Response wrapper for public API.
 */
interface ApiResponse<T> {
  code: number
  data: T
  message: string
}

/**
 * Default system configuration.
 */
export interface PublicConfig {
  airline: string
  timezone: string
  language: string
  theme: string
  dateFormat: string
}

const SESSION_KEY = 'rois-public-config'

/**
 * Fetch public system config from backend.
 * Result is cached in sessionStorage for the current session.
 *
 * Usage:
 * - Call on login page load (first visit in new tab/window)
 * - After login, read from sessionStorage instead of re-fetching
 * - New page/refresh = new session = re-fetch
 */
export const publicConfigService = {
  /**
   * Get cached config from sessionStorage.
   * Returns null if not cached.
   */
  getCached(): PublicConfig | null {
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (!stored) return null
    try {
      return JSON.parse(stored) as PublicConfig
    } catch {
      return null
    }
  },

  /**
   * Fetch config from backend and cache to sessionStorage.
   * Returns cached value on subsequent calls within same session.
   */
  async fetch(): Promise<PublicConfig> {
    // Return cached if available
    const cached = this.getCached()
    if (cached) return cached

    // Fetch from backend
    const res = await publicApi.get<ApiResponse<PublicConfig>>('/api/public/config')
    const config = res.data.data

    // Cache to sessionStorage
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(config))

    return config
  },

  /**
   * Get default airline code.
   * Fetches if not cached.
   */
  async getDefaultAirline(): Promise<string> {
    const config = await this.fetch()
    return config.airline
  },

  /**
   * Get default airline from cache only (no fetch).
   * Returns null when the backend config has not been fetched in this session.
   */
  getDefaultAirlineCached(): string | null {
    const cached = this.getCached()
    return cached?.airline ?? null
  },

  /**
   * Clear cached config (e.g., on logout).
   */
  clearCache(): void {
    sessionStorage.removeItem(SESSION_KEY)
  },
}
