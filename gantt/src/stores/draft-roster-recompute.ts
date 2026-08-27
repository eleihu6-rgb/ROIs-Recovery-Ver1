import type { RosterItem } from '@/types'

type ApplyDraftFn = (base: RosterItem[]) => RosterItem[]
type RecomputeCallback = (applyFn: ApplyDraftFn) => void

let recomputeCallback: RecomputeCallback | null = null
let promoteBaseCallback: (() => void) | null = null

export const setDraftRecomputeCallback = (cb: RecomputeCallback): void => {
  recomputeCallback = cb
}

export const setDraftPromoteBaseCallback = (cb: () => void): void => {
  promoteBaseCallback = cb
}

export const recomputeRosterItems = (applyFn: ApplyDraftFn): void => {
  recomputeCallback?.(applyFn)
}

export const promoteDraftBase = (): void => {
  promoteBaseCallback?.()
}
