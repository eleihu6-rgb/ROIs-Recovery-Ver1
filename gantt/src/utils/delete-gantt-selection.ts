import { useDraftStore } from '@/stores/draft-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { usePairingStore } from '@/stores/pairing-store'
import { useRosterStore } from '@/stores/roster-store'
import type { PairingItem } from '@/types'

/** Map a canvas selection id to a pairing id (pairing row id or segment id). */
export const resolveIdToPairingId = (
  id: number,
  items: PairingItem[] = usePairingStore.getState().items,
): number | null => {
  for (const item of items) {
    if (item.pairing.id === id) return id
    for (const seg of item.segments ?? []) {
      if (seg.id === id) return item.pairing.id
    }
  }
  return null
}

/** Resolve canvas selection ids to unique pairing ids for pairing-pane deletes. */
export const resolveSelectedPairingIds = (
  selectedIds: Iterable<number>,
  items: PairingItem[] = usePairingStore.getState().items,
): number[] => {
  const pairingIds = new Set<number>()
  for (const id of selectedIds) {
    const pairingId = resolveIdToPairingId(id, items)
    if (pairingId != null) pairingIds.add(pairingId)
  }
  return [...pairingIds]
}

/** Queue one remove-pairing draft op (batched for multi-select) and drop them from the pane. */
export const deletePairings = (pairingIds: number[]): void => {
  const unique = [...new Set(pairingIds)]
  if (unique.length === 0) return
  const first = unique[0]
  if (first == null) return
  useDraftStore.getState().addOp(
    unique.length === 1
      ? { type: 'remove-pairing', pairingId: first }
      : { type: 'remove-pairing', pairingId: first, pairingIds: unique },
    [],
    unique,
  )
  for (const pairingId of unique) {
    usePairingStore.getState().removeItem(pairingId)
  }
}

/**
 * Delete the current canvas selection from Live Gantt.
 * Roster selections remove roster duties; pairing-pane selections remove whole pairings.
 */
export const deleteSelectedGanttItems = async (): Promise<void> => {
  const selectedTaskIds = useGanttViewStore.getState().selectedTaskIds
  if (selectedTaskIds.size === 0) return

  const rosterItems = useRosterStore.getState().main.rosterItems
  const rosterById = new Map(rosterItems.map((i) => [i.id, i]))
  const removeTask = useRosterStore.getState().removeTask
  const removeTasksByPairingAndCrew = useRosterStore.getState().removeTasksByPairingAndCrew

  const pairingIds: number[] = []
  const pairingCrewGroups = new Map<string, { pairingId: number; crewId: string }>()
  const standaloneTaskIds: number[] = []

  for (const id of selectedTaskIds) {
    const pairingId = resolveIdToPairingId(id)
    if (pairingId != null) {
      pairingIds.push(pairingId)
      continue
    }
    const rosterItem = rosterById.get(id)
    if (rosterItem == null) continue
    if (rosterItem.pairingId != null) {
      const key = `${rosterItem.pairingId}:${rosterItem.crewId}`
      pairingCrewGroups.set(key, { pairingId: rosterItem.pairingId, crewId: rosterItem.crewId })
    } else {
      standaloneTaskIds.push(id)
    }
  }

  deletePairings(pairingIds)

  for (const { pairingId, crewId } of pairingCrewGroups.values()) {
    await removeTasksByPairingAndCrew('main', pairingId, crewId)
  }
  for (const id of standaloneTaskIds) {
    await removeTask('main', id)
  }

  useGanttViewStore.getState().clearSelection()
}
