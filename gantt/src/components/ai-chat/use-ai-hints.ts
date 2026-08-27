import { useEffect, useState } from 'react'
import { aiHintsApi, type AiHints } from '@/services/ai-hints-api'

/**
 * R'Bot example-prompt hints, backed by a persisted localStorage snapshot.
 *
 * Per product decision: extract the airline's basic reference values ONCE and store
 * them — do not pull them live on every panel open. We read the cached snapshot
 * synchronously for an instant first render, and only hit /api/ai/hints when the
 * cache is missing or older than the TTL (basic data changes rarely).
 */
const STORAGE_KEY = 'rbot.hints.v1'
const TTL_MS = 24 * 60 * 60 * 1000 // 24h — same horizon as the backend cache
const EMPTY: AiHints = { base: null, rank: null, fleet: null, crewId: null }

interface CachedHints {
  data: AiHints
  fetchedAt: number
}

const readCache = (): CachedHints | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CachedHints>
    if (!parsed || typeof parsed.fetchedAt !== 'number' || !parsed.data) return null
    return { data: { ...EMPTY, ...parsed.data }, fetchedAt: parsed.fetchedAt }
  } catch {
    return null
  }
}

const writeCache = (data: AiHints): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, fetchedAt: Date.now() }))
  } catch {
    // localStorage unavailable (private mode / quota) — degrade to in-memory only.
  }
}

/**
 * @param active when false the hook stays idle (no fetch); pass the panel's open state
 * so the snapshot is fetched lazily the first time R'Bot is opened.
 */
export const useAiHints = (active: boolean): AiHints => {
  const [hints, setHints] = useState<AiHints>(() => readCache()?.data ?? EMPTY)

  useEffect(() => {
    if (!active) return
    const cached = readCache()
    // Fresh snapshot already stored → use it, skip the network entirely.
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
      setHints(cached.data)
      return
    }
    let cancelled = false
    void aiHintsApi
      .get()
      .then((data) => {
        if (cancelled) return
        setHints(data)
        writeCache(data)
      })
      .catch(() => {
        // Non-fatal: tips fall back to the generic examples (see ai-chat-panel).
      })
    return () => {
      cancelled = true
    }
  }, [active])

  return hints
}
