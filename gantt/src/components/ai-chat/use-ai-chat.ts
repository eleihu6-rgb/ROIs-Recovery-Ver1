import { useState, useCallback } from 'react'
import { aiApi } from '@/services/ai-api'
import { applyGanttFilters } from '@/utils/apply-filters'
import { dispatchAiAction } from './dispatch-ai-action'
import type { AiAction, ChatMessage } from './types'

export interface ThreadEntry extends ChatMessage {
  /** confirmation chips for applied actions */
  applied?: string[]
}

/** Action types whose effect requires a data reload (same reload the Filter dialog Apply triggers). */
const RELOAD_ACTIONS = new Set<AiAction['type']>([
  'filter_crew',
  'filter_pairing',
  'filter_flight',
  'reset_filters',
  'set_date_range',
])

export function useAiChat() {
  const [thread, setThread] = useState<ThreadEntry[]>([])
  const [busy, setBusy] = useState(false)

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || busy) return
      const userMsg: ThreadEntry = { role: 'user', content: trimmed }
      const history: ChatMessage[] = [
        ...thread.map((m) => ({ role: m.role, content: m.content })),
        userMsg,
      ]
      setThread((t) => [...t, userMsg])
      setBusy(true)
      try {
        const resp = await aiApi.chat(history)
        // Sequential, not Promise.all: mutating actions await their own legality confirm
        // dialog (showConfirmDialog) before the next action runs, so two dependent edits
        // in one instruction never race each other's lock/legality checks.
        const applied: string[] = []
        for (const action of resp.actions) {
          const s = await dispatchAiAction(action)
          if (s !== null) applied.push(s)
        }
        // Centralized reload: trigger exactly once if any action needs fresh data.
        // Reuses the Filter dialog's Apply path (applyGanttFilters): selective refetch
        // by diffing appliedFilters — crew filters refetch the crew list (refreshAllPanes
        // only reloaded the OLD selectedCrewIds, so AI crew filters never took effect),
        // date changes reload every pane, and markApplied keeps pane badges truthful.
        if (resp.actions.some((a) => RELOAD_ACTIONS.has(a.type))) {
          void applyGanttFilters()
        }
        setThread((t) => [...t, { role: 'assistant', content: resp.content, applied }])
      } catch (err) {
        console.error('[ai-chat]', err)
        setThread((t) => [
          ...t,
          { role: 'assistant', content: 'AI request failed. Please try again.' },
        ])
      } finally {
        setBusy(false)
      }
    },
    [thread, busy],
  )

  return { thread, busy, send }
}
