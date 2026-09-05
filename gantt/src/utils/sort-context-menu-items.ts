import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type ContextMenuItem = {
  icon: LucideIcon
  label: ReactNode
  /** Plain-text key for alphabetical ordering; required when `label` is not a string. */
  sortKey?: string
  shortcut?: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

export function contextMenuItemSortKey(item: ContextMenuItem): string {
  if (item.sortKey) return item.sortKey
  return typeof item.label === 'string' ? item.label : ''
}

/** Returns menu items sorted A→Z by `sortKey` or string `label`. */
export function sortContextMenuItems(items: ContextMenuItem[]): ContextMenuItem[] {
  return [...items].sort((a, b) =>
    contextMenuItemSortKey(a).localeCompare(contextMenuItemSortKey(b), 'en', { sensitivity: 'base' }),
  )
}
