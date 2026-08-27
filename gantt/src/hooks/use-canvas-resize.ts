import { useEffect, useRef, useCallback, useState } from 'react'
import { useGanttViewStore } from '@/stores/gantt-view-store'

interface CanvasSize {
  width: number
  height: number
}

/**
 * Hook that manages canvas size, handling DPI scaling and container resize.
 * Returns a ref to attach to the canvas element and the current logical size.
 */
export const useCanvasResize = (containerRef: React.RefObject<HTMLDivElement | null>) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 })
  const markDirty = useGanttViewStore((s) => s.markDirty)

  const updateSize = useCallback(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const dpr = window.devicePixelRatio || 1
    const rect = container.getBoundingClientRect()
    const width = Math.floor(rect.width)
    const height = Math.floor(rect.height)

    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    setSize({ width, height })
    markDirty()
  }, [containerRef, markDirty])

  useEffect(() => {
    updateSize()

    const observer = new ResizeObserver(() => {
      updateSize()
    })

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => {
      observer.disconnect()
    }
  }, [containerRef, updateSize])

  return { canvasRef, size }
}
