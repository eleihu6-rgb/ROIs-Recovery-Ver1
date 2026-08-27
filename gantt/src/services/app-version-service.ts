import { create } from 'zustand'
import { LIVE_API_BASE } from '@/config/api-paths'

interface VersionResponse {
  appVersion?: string
}

interface AppVersionStore {
  appVersion: string
  refresh: () => Promise<void>
  setAppVersion: (value: string) => void
}

const fetchRuntimeVersion = async (): Promise<string | null> => {
  try {
    const response = await fetch(`${LIVE_API_BASE}/api/version`, {
      headers: { Accept: 'application/json' },
    })
    const body = await response.json() as { code?: number; data?: VersionResponse }
    return body.code === 200 && body.data?.appVersion ? body.data.appVersion : null
  } catch {
    return null
  }
}

export const useAppVersionStore = create<AppVersionStore>((set) => ({
  appVersion: __ROIS_APP_VERSION__,
  setAppVersion: (value) => set({ appVersion: value }),
  refresh: async () => {
    const appVersion = await fetchRuntimeVersion()
    if (appVersion) set({ appVersion })
  },
}))

export const initAppVersionUpdates = (): void => {
  void useAppVersionStore.getState().refresh()

  if (import.meta.hot) {
    import.meta.hot.on('rois-version:update', (data: { appVersion?: string }) => {
      if (data.appVersion) useAppVersionStore.getState().setAppVersion(data.appVersion)
    })
  }
}
