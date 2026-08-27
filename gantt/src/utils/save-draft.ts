import { useDraftStore } from '@/stores/draft-store'
import { useRosterStore } from '@/stores/roster-store'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import { notify } from './notify'

/**
 * Shared save logic — used by both Ctrl+S and Save button.
 * Runs rule pre-check, shows confirmation dialog if needed, then commits.
 * Returns true if save succeeded.
 */
export const saveDraft = async (): Promise<boolean> => {
  const draft = useDraftStore.getState()
  if (draft.operations.length === 0) return true

  // baseItems = server state before any draft ops (the "before" snapshot)
  // draftItems = base + all draft ops applied (the "after" snapshot)
  const baseItems = useRosterStore.getState().main.baseItems
  const draftItems = draft.applyDraftOps(baseItems)
  const dirtyCrewIds = draft.getDirtyCrewIds()

  const ruleStore = useRuleCheckStore.getState()
  // Pass baseItems as currentItems so the before/after diff correctly identifies
  // only violations newly introduced by the draft operations.
  const preResult = await ruleStore.preCheck(dirtyCrewIds, draftItems, baseItems)

  // Only show dialog when this batch of draft ops introduced new violations
  const hasNewViolations = preResult.violations.some((v) => v.isNew)
  if (hasNewViolations) {
    const proceed = await ruleStore.showConfirmDialog(preResult.violations, preResult.hasBlocking)
    if (!proceed) return false
  }

  try {
    await draft.commit()
    notify.success('Changes saved successfully')
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    notify.error(`Save failed: ${msg}`)
    return false
  }
}
