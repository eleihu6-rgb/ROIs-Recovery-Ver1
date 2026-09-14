import { Eye } from 'lucide-react'
import { Button } from '@rois/ui'

/** Shared compact Live-Gantt preview summary for every recovery incident. */
export function RecoveryPreviewDock({ title, crew, method, impact, cost, onReturn }: {
  title: string; crew: string; method: string; impact: number; cost: string; onReturn: () => void
}) {
  return <div className="p-3" data-testid="recovery-preview-dock">
    <div className="flex items-start gap-2 rounded border border-success/30 bg-success/10 p-3">
      <Eye className="h-4 w-4 shrink-0 text-success" />
      <div className="min-w-0"><div className="truncate text-xs font-semibold">{title}</div>
        <div className="mt-1 text-2xs leading-4 text-muted-foreground">The Live Gantt shows the original roster and the selected recovery roster together. The preview remains in memory only.</div>
      </div>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-2xs">{[['Affected Crew', crew], ['Method', method], ['Roster impact', impact], ['Total cost', cost]].map(([label, value]) => <div key={label}><span className="block text-muted-foreground">{label}</span><span className="font-semibold tabular-nums">{value}</span></div>)}</div>
    <Button variant="ghost" className="mt-3 h-7 px-2 text-2xs" onClick={onReturn} data-testid="recovery-expand-options">Return to recovery options</Button>
  </div>
}
