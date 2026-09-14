// gantt/src/components/scenario-gantt/cross-rank-confirm-dialog.tsx
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AppDialog, Button } from '@rois/ui'

interface CrossRankPayload {
  crewId: string
  crewRank: string
  actingRank: string
  pairingLabel: string | null
}

interface CrossRankConfirmApi {
  confirmCrossRank: (payload: CrossRankPayload) => Promise<boolean>
}

const CrossRankConfirmContext = createContext<CrossRankConfirmApi>({
  confirmCrossRank: () => Promise.resolve(false),
})

export const useCrossRankConfirm = (): CrossRankConfirmApi => useContext(CrossRankConfirmContext)

/**
 * Promise-based cross-rank assignment confirmation (AppDialog per §Pop-up Window Standard).
 * Mount once at the scenario-gantt view root; the assignment gate awaits `confirmCrossRank`.
 */
export const CrossRankConfirmProvider = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false)
  const [payload, setPayload] = useState<CrossRankPayload | null>(null)
  const resolverRef = useRef<((ok: boolean) => void) | null>(null)

  const confirmCrossRank = useCallback((p: CrossRankPayload) => new Promise<boolean>((resolve) => {
    setPayload(p)
    setOpen(true)
    resolverRef.current = resolve
  }), [])

  const close = useCallback((ok: boolean) => {
    setOpen(false)
    resolverRef.current?.(ok)
    resolverRef.current = null
  }, [])

  return (
    <CrossRankConfirmContext.Provider value={{ confirmCrossRank }}>
      {children}
      <AppDialog
        open={open}
        onOpenChange={(o) => { if (!o) close(false) }}
        data-testid="cross-rank-confirm"
        // Pop-up standard: a message + confirm is the `status` layout — the tone
        // glyph replaces the old title-bar icon, and the message is centred.
        variant="status"
        tone="warning"
        title="Cross-rank assignment"
        showClose
        description={(
          <>
            <span className="block">
              Crew <span className="font-mono font-medium">{payload?.crewId}</span>
              {' '}(rank <span className="font-mono font-medium">{payload?.crewRank}</span>) will be assigned to
              {' '}<span className="font-medium">{payload?.pairingLabel ?? ''}</span>
              {' '}acting as <span className="font-mono font-medium">{payload?.actingRank}</span>.
            </span>
            <span className="mt-2 block">Continue with the cross-rank assignment?</span>
          </>
        )}
        footer={
          <>
            <Button variant="outline" data-testid="cross-rank-cancel" onClick={() => close(false)}>Cancel</Button>
            <Button data-testid="cross-rank-confirm-btn" onClick={() => close(true)}>Confirm</Button>
          </>
        }
      />
    </CrossRankConfirmContext.Provider>
  )
}
