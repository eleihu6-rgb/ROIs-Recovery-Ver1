/**
 * Deterministic loading bar for Gantt panes.
 * Renders a 2px strip between the toolbar and canvas area while data is fetching.
 * progress: 0-100 real percentage; null = not loading (hidden).
 */
export const PaneLoadingBar = ({ progress }: { progress: number | null }) => {
  if (progress === null) return null
  return (
    <div className="relative h-[2px] shrink-0 overflow-hidden bg-muted/50" data-testid="pane-loading-bar">
      <div
        data-testid="pane-loading-bar-fill"
        className="absolute left-0 top-0 h-full bg-primary/70 transition-[width] duration-150"
        style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
      />
    </div>
  )
}
