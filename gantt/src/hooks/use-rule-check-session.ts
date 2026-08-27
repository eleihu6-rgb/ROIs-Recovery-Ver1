import { useCallback, useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import { useSessionViolationStore } from '@/stores/session-violation-store'
import { ruleSessionApi, type PairingPayload, type CrewPayload } from '@/services/rule-session-api'

/**
 * Provides a debounced rule session check function for undo/redo operations.
 * Callers invoke checkSession() with the current pairing after each edit/undo/redo.
 * Results go into sessionViolationStore (per-user, not persisted).
 */

let _sessionId = crypto.randomUUID()

export const useRuleCheckSession = () => {
  const user = useAuthStore((s) => s.user)
  // Live rule-check session follows the toolbar's active rule set (the single source of
  // truth for the live bell, now a RULE workset id) — Model B's rule-config store is gone.
  const selectedGroupCode = useRuleCheckStore((s) => s.ruleGroupCode || 'ccar121_gantt')
  const setSessionViolations = useSessionViolationStore((s) => s.setSessionViolations)
  const clearSessionViolations = useSessionViolationStore((s) => s.clearSessionViolations)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionId = _sessionId
  const userId = user?.userCode ?? 'anonymous'

  const checkSession = useCallback(
    (pairing: PairingPayload | null, crew: CrewPayload | null, operation: 'edit' | 'undo' | 'redo') => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        void ruleSessionApi
          .checkSession({ sessionId, userId, groupCode: selectedGroupCode, operation, pairing, crew })
          .then((result) => {
            if (result.pairingId !== null && crew?.crew_id) {
              setSessionViolations(crew.crew_id, result.pairingId, result.violations)
            }
          })
          .catch(() => {})
      }, 300)
    },
    [sessionId, userId, selectedGroupCode, setSessionViolations],
  )

  const commitSession = useCallback(
    async (eventId: number) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      await ruleSessionApi.commitSession(sessionId, userId, eventId)
      clearSessionViolations()
      _sessionId = crypto.randomUUID()
    },
    [sessionId, userId, clearSessionViolations],
  )

  const discardSession = useCallback(async () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    await ruleSessionApi.discardSession(sessionId, userId)
    clearSessionViolations()
    _sessionId = crypto.randomUUID()
  }, [sessionId, userId, clearSessionViolations])

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  return { checkSession, commitSession, discardSession, sessionId }
}
