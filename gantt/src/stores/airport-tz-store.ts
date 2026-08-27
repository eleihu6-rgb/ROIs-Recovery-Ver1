import { create } from 'zustand'
import { timezoneApi } from '@/services/timezone-api'

interface AirportTzStore {
  map: Record<string, string>
  loaded: boolean
  /** IANA zoneId for an airport code, or undefined if unknown. */
  zoneIdFor: (airport: string) => string | undefined
  /** Fetch the map once; no-op if already loaded or in flight. */
  load: () => Promise<void>
}

let inFlight: Promise<void> | null = null

export const useAirportTzStore = create<AirportTzStore>((set, get) => ({
  map: {},
  loaded: false,
  zoneIdFor: (airport) => get().map[airport],
  load: async () => {
    if (get().loaded) return
    if (inFlight) return inFlight
    inFlight = (async () => {
      try {
        const map = await timezoneApi.getAirportTimezones()
        set({ map, loaded: true })
      } catch {
        // 401/offline: leave map empty; local date falls back to gantt tz.
      } finally {
        inFlight = null
      }
    })()
    return inFlight
  },
}))
