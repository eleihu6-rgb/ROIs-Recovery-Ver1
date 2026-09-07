import { useEffect } from 'react'
import { wsClient } from '@/services/ws'
import { clearPairingInfoCache } from '@/services/pairing-detail-cache'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import { useLegalityStore } from '@/stores/legality-store'

/** Effective toolbar ruleset id used for /api/violations and WS join. */
const effectiveRuleGroupCode = (): string =>
  String(useLegalityStore.getState().selectedId ?? '')

export const useRuleCheckWs = () => {
  const applyPairingUpdate = useRuleCheckStore((s) => s.applyWsPairingUpdate)
  const applyRosterUpdate  = useRuleCheckStore((s) => s.applyWsRosterUpdate)
  const selectedRulesetId = useLegalityStore((s) => s.selectedId)
  const ruleGroupCode = selectedRulesetId == null ? '' : String(selectedRulesetId)

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
        const groupCode = effectiveRuleGroupCode()
        if (groupCode) wsClient.send({ type: 'set_rule_group', groupCode })
      }
    })
    return unsubscribe
  }, [applyPairingUpdate, applyRosterUpdate])

  // A ruleset can finish loading after the socket has authenticated. Join the
  // actual selected ruleset at that point as well; otherwise the socket remains
  // subscribed to no group until the next reconnect.
  useEffect(() => {
    if (ruleGroupCode) wsClient.send({ type: 'set_rule_group', groupCode: ruleGroupCode })
  }, [ruleGroupCode])
}
