import { useEffect } from 'react'
import { wsClient } from '@/services/ws'
import { clearPairingInfoCache } from '@/services/pairing-detail-cache'
import { useRuleCheckStore } from '@/stores/rule-check-store'

/** Effective toolbar ruleset id used for /api/violations and WS join. */
const effectiveRuleGroupCode = (): string =>
  useRuleCheckStore.getState().ruleGroupCode || '103'

export const useRuleCheckWs = () => {
  const applyPairingUpdate = useRuleCheckStore((s) => s.applyWsPairingUpdate)
  const applyRosterUpdate  = useRuleCheckStore((s) => s.applyWsRosterUpdate)

  useEffect(() => {
    const unsubscribe = wsClient.onMessage((msg) => {
      if (msg.type === 'violation:pairing:updated') {
        applyPairingUpdate(msg as Parameters<typeof applyPairingUpdate>[0])
      } else if (msg.type === 'violation:roster:updated') {
        applyRosterUpdate(msg as Parameters<typeof applyRosterUpdate>[0])
      } else if (msg.type === 'violations.updated') {
        // live-legality also persists crew-specific 7500 Ref values. Drop the
        // Pairing Info cache so the next open reads the recalculated values.
        clearPairingInfoCache()
        window.dispatchEvent(new CustomEvent('violations:updated', {
          detail: { eventId: msg.eventId, groupCode: msg.groupCode }
        }))
      } else if (msg.type === 'authenticated' || msg.type === 'connected') {
        // Re-join after (re)connect — otherwise client.groupCode stays '' and
        // live-legality PUBLISH never reaches this browser.
        wsClient.send({ type: 'set_rule_group', groupCode: effectiveRuleGroupCode() })
      }
    })
    return unsubscribe
  }, [applyPairingUpdate, applyRosterUpdate])
}
