import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect } from 'vitest'
import { PaneLoadingBar } from '../pane-loading-bar'

const renderBar = (progress: number | null): HTMLElement => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(<PaneLoadingBar progress={progress} />)
  })
  return container
}

describe('PaneLoadingBar', () => {
  it('renders a determinate bar at the given percentage', () => {
    const container = renderBar(42)
    const bar = container.querySelector('[data-testid="pane-loading-bar-fill"]') as HTMLElement | null
    expect(bar).not.toBeNull()
    expect(bar?.style.width).toBe('42%')
    container.remove()
  })

  it('hidden when progress is null', () => {
    const container = renderBar(null)
    expect(container.querySelector('[data-testid="pane-loading-bar"]')).toBeNull()
    container.remove()
  })
})
