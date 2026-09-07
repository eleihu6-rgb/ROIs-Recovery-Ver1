import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { sortContextMenuItems } from '../sort-context-menu-items'

describe('sortContextMenuItems', () => {
  const noop = () => {}

  it('sorts string labels alphabetically (case-insensitive)', () => {
    const sorted = sortContextMenuItems([
      { icon: noop as never, label: 'View pairing detail', onClick: noop },
      { icon: noop as never, label: 'Delete Pairing', onClick: noop },
      { icon: noop as never, label: 'Edit Duty Nodes', onClick: noop },
      { icon: noop as never, label: 'Select', onClick: noop },
    ])
    expect(sorted.map((i) => i.label)).toEqual([
      'Delete Pairing',
      'Edit Duty Nodes',
      'Select',
      'View pairing detail',
    ])
  })

  it('uses sortKey for non-string labels', () => {
    const sorted = sortContextMenuItems([
      { icon: noop as never, label: 'View flight detail', onClick: noop },
      {
        icon: noop as never,
        label: null as ReactNode,
        sortKey: 'Scroll to Sep 10 pairings',
        onClick: noop,
      },
      { icon: noop as never, label: 'Find Crew by Flight', onClick: noop },
    ])
    expect(sorted.map((i) => i.sortKey ?? i.label)).toEqual([
      'Find Crew by Flight',
      'Scroll to Sep 10 pairings',
      'View flight detail',
    ])
  })
})
