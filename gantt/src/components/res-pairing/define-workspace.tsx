// gantt/src/components/res-pairing/define-workspace.tsx
//
// Define tab body for the RES Pairing Planner dialog.
// Left: ResCalendar (month grid with base/rank breakdown per cell)
// Right: ResEntryPanel (selection mode + plan matrix + Apply)
//
// Default month: current calendar month (so the dialog opens on today's month).
// Base list comes from /api/base via the reference store; falls back to YVR/YEG/YYZ.
import { useState, useEffect } from 'react'
import { cn } from '@rois/ui'
import { useResPlannerStore, DIVISION_RANKS, type ResCallOption } from '@/stores/res-planner-store'
import { useReferenceStore } from '@/stores/reference-store'
import { dictionaryApi } from '@/services/dictionary-api'
import { api } from '@/services/api'
import { ResCalendar } from './res-calendar'
import { ResEntryPanel } from './res-entry-panel'
import { ReviewGenerate } from './review-generate'

const FALLBACK_BASES = ['YVR', 'YEG', 'YYZ']

export const DefineWorkspace = () => {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth())

  const division = useResPlannerStore((s) => s.division)
  const setDivision = useResPlannerStore((s) => s.setDivision)
  const focusBase = useResPlannerStore((s) => s.focusBase)
  const setFocusBase = useResPlannerStore((s) => s.setFocusBase)
  const clearCells = useResPlannerStore((s) => s.clearCells)
  const ensureBrushBase = useResPlannerStore((s) => s.ensureBrushBase)
  const setCallOptions = useResPlannerStore((s) => s.setCallOptions)
  const setAssignmentWindow = useResPlannerStore((s) => s.setAssignmentWindow)
  const selectedAssignments = useResPlannerStore((s) => s.selectedAssignments)
  const callOptions = useResPlannerStore((s) => s.callOptions)

  // Load bases from reference store
  const referenceBases = useReferenceStore((s) => s.bases)
  const referenceLoad = useReferenceStore((s) => s.load)
  const referenceLoaded = useReferenceStore((s) => s.loaded)

  useEffect(() => {
    if (!referenceLoaded) void referenceLoad()
  }, [referenceLoad, referenceLoaded])

  // Load RES_CALL_TYPE + assignment fixed windows for multi-select defaults.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [dictRows, assignmentRows] = await Promise.all([
          dictionaryApi.getByParentCode('RES_CALL_TYPE'),
          api.get('/api/assignment') as Promise<Array<{
            assignment: string
            fixedStrTm?: string | null
            fixedEndTm?: string | null
          }>>,
        ])
        if (cancelled) return

        const fixedByCode = new Map<string, { start: string; end: string }>()
        for (const a of assignmentRows ?? []) {
          if (a.fixedStrTm && a.fixedEndTm) {
            fixedByCode.set(a.assignment, { start: a.fixedStrTm, end: a.fixedEndTm })
          }
        }

        const byDivision: Record<'P' | 'C', ResCallOption[]> = { P: [], C: [] }
        for (const row of dictRows ?? []) {
          const dictCode = row.code ?? ''
          const div = dictCode.startsWith('P_') ? 'P' : dictCode.startsWith('C_') ? 'C' : null
          if (!div || !row.codeValue) continue
          const [assignment, start, end, cross] = row.codeValue.split('|')
          if (!assignment) continue
          const fixed = fixedByCode.get(assignment)
          const opt: ResCallOption = {
            dictCode,
            assignment,
            start: fixed?.start ?? start ?? '10:00',
            end: fixed?.end ?? end ?? '22:00',
            crosses: cross === '1',
          }
          byDivision[div].push(opt)
          // Prefer assignment fixed times as the session window default.
          setAssignmentWindow(assignment, { start: opt.start, end: opt.end })
        }
        if (byDivision.P.length) setCallOptions('P', byDivision.P)
        if (byDivision.C.length) setCallOptions('C', byDivision.C)
      } catch {
        // keep FALLBACK_CALL_OPTIONS
      }
    }
    void load()
    return () => { cancelled = true }
  }, [setCallOptions, setAssignmentWindow])

  const bases: string[] = referenceBases.length > 0
    ? referenceBases.map((b) => b.base)
    : FALLBACK_BASES

  // Ensure brush has entries for selected assignments × known bases
  useEffect(() => {
    const codes = selectedAssignments.length > 0
      ? selectedAssignments
      : callOptions[division].map((o) => o.assignment)
    for (const code of codes) {
      for (const base of bases) ensureBrushBase(code, base)
    }
  }, [bases.join(','), selectedAssignments.join(','), division, ensureBrushBase])  // eslint-disable-line react-hooks/exhaustive-deps

  function handleMonthChange(y: number, m: number) {
    setYear(y)
    setMonth(m)
  }

  const ranks = DIVISION_RANKS[division]

  return (
    <div className="flex flex-col gap-3 overflow-auto p-3">
      {/* Scope toolbar */}
      <div className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-muted/20 px-3 py-2">
        {/* Base chips */}
        <div className="flex items-center gap-2">
          <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Base</span>
          <div className="flex flex-wrap gap-1">
            <button
              data-testid="res-base-ALL"
              onClick={() => setFocusBase('ALL')}
              className={cn(
                'h-6 rounded-sm px-2 text-xs font-medium transition-colors',
                focusBase === 'ALL'
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-background text-muted-foreground hover:bg-accent/60',
              )}
            >
              All bases
            </button>
            {bases.map((base) => (
              <button
                key={base}
                data-testid={`res-base-${base}`}
                onClick={() => setFocusBase(base)}
                className={cn(
                  'h-6 rounded-sm px-2 font-mono text-xs font-medium transition-colors',
                  focusBase === base
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-background text-muted-foreground hover:bg-accent/60',
                )}
              >
                {base}
              </button>
            ))}
          </div>
        </div>

        <div className="h-5 w-px shrink-0 bg-border" />

        {/* Division toggle */}
        <div className="flex items-center gap-2">
          <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Division</span>
          <div className="flex rounded-md border border-border">
            <button
              data-testid="res-div-P"
              onClick={() => setDivision('P')}
              className={cn(
                'rounded-l-md px-2 py-0.5 text-xs font-medium transition-colors',
                division === 'P'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-accent/60',
              )}
            >
              Pilot (P)
            </button>
            <button
              data-testid="res-div-C"
              onClick={() => setDivision('C')}
              className={cn(
                'rounded-r-md border-l border-border px-2 py-0.5 text-xs font-medium transition-colors',
                division === 'C'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-accent/60',
              )}
            >
              Cabin (C)
            </button>
          </div>
        </div>

        <div className="h-5 w-px shrink-0 bg-border" />

        {/* Rank hint */}
        <span className="text-2xs text-muted-foreground">
          Ranks: <span className="font-semibold text-foreground">{ranks.join(', ')}</span>
        </span>

        {/* Clear all */}
        <button
          onClick={clearCells}
          className="ml-auto text-2xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Clear all
        </button>
      </div>

      {/* Main layout: calendar (left) + entry panel (right) */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 360px' }}>
        {/* Calendar */}
        <ResCalendar
          year={year}
          month={month}
          onMonthChange={handleMonthChange}
        />

        {/* Entry panel */}
        <ResEntryPanel year={year} month={month} />
      </div>

      {/* Generate controls live at the end of Define so setup and creation stay on one page. */}
      <ReviewGenerate />
    </div>
  )
}
