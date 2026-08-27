import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { DataToolbar } from '../data-toolbar'

describe('DataToolbar immediate-save mode', () => {
  it('renders the title strip without dead draft action buttons', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(<DataToolbar pageId="basic.assignment" />)
    })

    expect(container.querySelector('[data-testid="data-toolbar"]')?.textContent).toContain('Basic Assignment')
    expect(container.querySelector('[data-testid="data-undo"]')).toBeNull()
    expect(container.querySelector('[data-testid="data-redo"]')).toBeNull()
    expect(container.querySelector('[data-testid="data-validate"]')).toBeNull()
    expect(container.querySelector('[data-testid="data-save"]')).toBeNull()
    expect(container.querySelector('[data-testid="data-discard"]')).toBeNull()

    act(() => root.unmount())
  })
})
