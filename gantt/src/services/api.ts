import { LIVE_API_BASE } from '@/config/api-paths'
import { createHttpClient } from './http-client'

/** Callback invoked on 401 response — set by auth-store to trigger logout */
let onUnauthorized: (() => void) | null = null
export const setOnUnauthorized = (cb: () => void) => { onUnauthorized = cb }

/** Timestamp (ms) of the last successful API request — used for idle timeout */
let lastActivityAt = Date.now()

export const getLastActivityAt = (): number => lastActivityAt
export const resetActivity = (): void => { lastActivityAt = Date.now() }

export const api = createHttpClient({
  baseURL: LIVE_API_BASE,
  onUnauthorized: () => onUnauthorized?.(),
  onRequest: () => { lastActivityAt = Date.now() },
})
