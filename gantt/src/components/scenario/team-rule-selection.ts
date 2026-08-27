/**
 * Selection helpers for the Add Team / Add Rule crew & pairing tables.
 * A stored array is the source of truth when present; otherwise the selection
 * defaults to every row the team/rule filter currently matches (an empty
 * filter matches everything, so a brand-new team/rule defaults to all rows).
 */
import { useEffect, useRef, useState } from 'react'

export const defaultSelectedIds = <T>(
  rows: T[],
  idOf: (row: T) => string,
  stored: string[] | null | undefined,
  matchesFilter: (row: T) => boolean,
): string[] => {
  if (Array.isArray(stored)) return [...stored]
  return rows.filter(matchesFilter).map(idOf)
}

export const toggleId = (selected: string[], id: string): string[] =>
  selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]

export const applyToggleAll = (
  selected: string[],
  visible: string[],
  shouldSelectAll: boolean,
): string[] =>
  shouldSelectAll
    ? [...new Set([...selected, ...visible])]
    : selected.filter((id) => !visible.includes(id))

/**
 * Row-selection state for a crew/pairing table whose rows load asynchronously.
 *
 * The stored array (team.crew_ids / rule.pairing_ids) is the source of truth
 * when present. Otherwise the selection defaults to every row the team/rule
 * filter matches, but ONLY once rows arrive — the rows prop may be empty when
 * the editor first mounts because the preview data loads over the network.
 * Once the user toggles a checkbox the selection is considered touched and is
 * never reset by later row-array changes.
 */
export const useRowSelection = <T>({
  rows,
  idOf,
  stored,
  matchesFilter,
}: {
  rows: T[]
  idOf: (row: T) => string
  stored: string[] | null | undefined
  matchesFilter: (row: T) => boolean
}): {
  selectedIds: string[]
  toggle: (id: string) => void
  toggleAll: (visible: string[], shouldSelectAll: boolean) => void
} => {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const touchedRef = useRef(false)
  // Capture the team/rule's original definition once; later filter edits only
  // narrow the view and must not reset the selection.
  const specRef = useRef({ stored, matchesFilter }).current
  const idOfRef = useRef(idOf)
  idOfRef.current = idOf

  useEffect(() => {
    if (touchedRef.current) return
    if (Array.isArray(specRef.stored) || rows.length > 0) {
      setSelectedIds(defaultSelectedIds(rows, idOfRef.current, specRef.stored, specRef.matchesFilter))
    }
  }, [rows])

  const toggle = (id: string): void => {
    touchedRef.current = true
    setSelectedIds((current) => toggleId(current, id))
  }
  const toggleAll = (visible: string[], shouldSelectAll: boolean): void => {
    touchedRef.current = true
    setSelectedIds((current) => applyToggleAll(current, visible, shouldSelectAll))
  }
  return { selectedIds, toggle, toggleAll }
}
