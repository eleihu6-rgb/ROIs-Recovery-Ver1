import { useRef } from 'react'
import { PanelBottomOpen, X } from 'lucide-react'
import { usePaneStore } from '@/stores/pane-store'
import { PANE_LABELS } from '@/types/pane'
import type { PaneConfig } from '@/types/pane'

const PANE_COLORS: Record<string, string> = {
  'roster-main': '#3b82f6',
  'roster-sub': '#3b82f6',
  'pairing': '#22c55e',
  'flight': '#a855f7',
}

const MIN_WIDTH = 480
const MIN_HEIGHT = 200

interface FloatingPaneProps {
  config: PaneConfig
  children: React.ReactNode
}

/**
 * Floating window chrome that wraps a pane component.
 * Supports drag-to-move (title bar) and resize (bottom-right corner).
 * All geometry is stored directly in pane-store so it persists.
 */
export const FloatingPane = ({ config, children }: FloatingPaneProps) => {
  const { type, floatGeometry, minHeight } = config
  const dockPane = usePaneStore((s) => s.dockPane)
  const setVisible = usePaneStore((s) => s.setVisible)
  const setFloatGeometry = usePaneStore((s) => s.setFloatGeometry)

  // Drag-move refs
  const dragStartMouse = useRef({ x: 0, y: 0 })
  const dragStartGeom = useRef({ x: 0, y: 0 })

  // Resize refs
  const resizeStartMouse = useRef({ x: 0, y: 0 })
  const resizeStartSize = useRef({ w: 0, h: 0 })

  if (!floatGeometry) return null

  const { x, y, width, height } = floatGeometry

  const handleTitleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragStartMouse.current = { x: e.clientX, y: e.clientY }
    dragStartGeom.current = { x, y }

    const onMove = (ev: MouseEvent) => {
      const nx = dragStartGeom.current.x + (ev.clientX - dragStartMouse.current.x)
      const ny = dragStartGeom.current.y + (ev.clientY - dragStartMouse.current.y)
      // Clamp so title bar stays on screen
      const clampedX = Math.max(0, Math.min(nx, window.innerWidth - 80))
      const clampedY = Math.max(0, Math.min(ny, window.innerHeight - 40))
      usePaneStore.getState().setFloatGeometry(type, { x: clampedX, y: clampedY })
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    resizeStartMouse.current = { x: e.clientX, y: e.clientY }
    resizeStartSize.current = { w: width, h: height }

    const onMove = (ev: MouseEvent) => {
      const nw = Math.max(MIN_WIDTH, resizeStartSize.current.w + (ev.clientX - resizeStartMouse.current.x))
      const nh = Math.max(Math.max(MIN_HEIGHT, minHeight), resizeStartSize.current.h + (ev.clientY - resizeStartMouse.current.y))
      usePaneStore.getState().setFloatGeometry(type, { width: nw, height: nh })
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleDock = () => {
    dockPane(type)
  }

  const handleClose = () => {
    dockPane(type)
    setVisible(type, false)
  }

  const label = PANE_LABELS[type] ?? type
  const color = PANE_COLORS[type] ?? '#6b7280'

  return (
    <div
      className="fixed flex flex-col overflow-hidden rounded-md border border-border bg-background shadow-2xl"
      style={{ left: x, top: y, width, height, zIndex: 60 }}
    >
      {/* Title bar — draggable */}
      <div
        className="flex h-7 shrink-0 cursor-move select-none items-center gap-2 border-b border-border bg-muted/60 px-2"
        onMouseDown={handleTitleMouseDown}
      >
        <span
          className="inline-block h-3 w-1.5 shrink-0 rounded-sm"
          style={{ backgroundColor: color }}
        />
        <span className="flex-1 text-xs font-semibold text-foreground">{label}</span>

        {/* Dock button */}
        <button
          className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
          onClick={handleDock}
          title="Dock back"
        >
          <PanelBottomOpen className="h-3 w-3" />
        </button>

        {/* Close (hide) button */}
        <button
          className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive active:scale-95"
          onClick={handleClose}
          title="Close"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Pane content */}
      <div className="flex flex-1 overflow-hidden">
        {children}
      </div>

      {/* Resize handle — bottom-right */}
      <div
        className="absolute bottom-0 right-0 h-5 w-5 cursor-se-resize"
        onMouseDown={handleResizeMouseDown}
        style={{
          background: 'linear-gradient(135deg, transparent 40%, rgba(128,128,128,0.3) 40%, rgba(128,128,128,0.3) 60%, transparent 60%, transparent 73%, rgba(128,128,128,0.3) 73%)',
        }}
      />
    </div>
  )
}
