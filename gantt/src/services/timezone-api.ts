import { api } from './api'
import type { TzOption } from '@/stores/timezone-store'

/**
 * Timezone options API.
 * Route: /altair/live/base/timezone-options (proxied via vite/nginx to live-server)
 * Backend path: /base/timezone-options (registered in routes/base/index.ts with '/base' prefix)
 * Requires: Authorization header with valid JWT token
 */
export const timezoneApi = {
  async getOptions(): Promise<TzOption[]> {
    return api.get('/api/base/timezone-options') as Promise<TzOption[]>
  },

  /** Airport→IANA zoneId map for ALL airports (incl. non-base). */
  async getAirportTimezones(): Promise<Record<string, string>> {
    return api.get('/api/base/airport-timezones') as Promise<Record<string, string>>
  },
}
