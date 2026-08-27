import { useEffect, useMemo, useState } from 'react'
import { AppDialog, Button } from '@rois/ui'
import { crewInfoFromStore } from '@/stores/crew-store'
import { useUiStore } from '@/stores/ui-store'
import type { CrewInfo } from '@/types'

const normalizedKey = (key: string): string => key.replace(/_/g, '').toLowerCase()

const labelOf = (key: string): string => {
  if (normalizedKey(key) === 'senioritynum') return 'Seniority'
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
}

const AUDIT_FIELDS = new Set(['id', 'createdby', 'createdat', 'updatedby', 'updatedat'])
const HIDDEN_BASIC_FIELDS = new Set([
  'nationalid',
  'spousecrewid',
  'remarks',
  'status',
  'branchcode',
  'nationality',
  'idcard',
  'interfacecrewid',
  'employeeno',
  'panelrank',
  'panelbase',
  'interfaceid',
  'politics',
  'nation',
  'birthplaceen',
  'birthplace',
  'birthcountry',
  'visatype',
  'grade',
  'passportfirstname',
  'passportmiddlename',
  'passportlastname',
  'retiredt',
  'termdt',
  'avatar',
])

const RECORD_HIDDEN_FIELDS: Record<string, Set<string>> = {
  base: new Set(['isprimebase', 'effdtutc', 'expdtutc']),
  rank: new Set(['division', 'probationenddt', 'position', 'precumulatedexpdays', 'fleetgrp', 'actype']),
  fleet: new Set(),
  qualification: new Set([
    'fleetspecific',
    'actype',
    'rank',
    'position',
    'isvalid',
    'remarks',
    'airport',
    'remarkdetails',
    'bases',
    'ranks',
    'fleets',
    'teams',
    'reneweddt',
    'nextplanneddate',
    'displayflag',
    'status',
    'projectdate',
    'recordstatus',
    'basemonth',
  ]),
  certification: new Set([
    'tmpissuecountry',
    'tmpissueauthority',
    'referenceno',
    'referenceid',
    'isvalid',
    'remarks',
    'isprimary',
    'nationality',
    'surname',
    'titlename',
    'givenname',
    'certificateno',
    'invaliddt',
  ]),
  team: new Set(['isvalid', 'remarks', 'source', 'teamtaskid']),
}

const isHiddenRecordField = (key: string, hiddenFields = new Set<string>()): boolean => {
  const normalized = normalizedKey(key)
  return AUDIT_FIELDS.has(normalized) || normalized.startsWith('interface') || hiddenFields.has(normalized)
}

const isDateLike = (key: string, value: string): boolean =>
  /(dt|date|birthday|birth|seniority)/i.test(key) &&
  /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(value)

const formatValue = (key: string, value: unknown): string => {
  if (value == null || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'string' && isDateLike(key, value)) return value.slice(0, 10)
  if (normalizedKey(key) === 'seniority' || normalizedKey(key) === 'senioritynum') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return String(numeric)
  }
  return String(value)
}

const recordColumns = (rows: object[], hiddenFields: Set<string>): string[] => {
  const keys = new Set<string>()
  rows.forEach((row) => Object.keys(row).filter((key) => !isHiddenRecordField(key, hiddenFields)).forEach((key) => keys.add(key)))
  return [...keys]
}

const effectiveDateOf = (row: object): number => {
  const record = row as Record<string, unknown>
  const value = record.effDtUtc ?? record.effDt ?? record.eff_dt_utc ?? record.eff_dt
  if (value == null) return 0
  const timestamp = Date.parse(String(value))
  return Number.isNaN(timestamp) ? 0 : timestamp
}

const sortRowsByEffectiveDate = (rows: object[]): object[] =>
  [...rows].sort((left, right) => effectiveDateOf(right) - effectiveDateOf(left))

type RecordSection = {
  id: string
  label: string
  rows: object[]
  hiddenFields: Set<string>
}

const RecordTable = ({ rows, testId, hiddenFields }: { rows: object[]; testId: string; hiddenFields: Set<string> }) => {
  const columns = useMemo(() => recordColumns(rows, hiddenFields), [rows, hiddenFields])

  if (rows.length === 0) {
    return <div className="flex min-h-32 items-center justify-center text-xs text-muted-foreground">No records</div>
  }

  return (
    <div className="min-h-0 max-h-52 overflow-auto rounded-md border border-border" data-testid={testId}>
      <table className="w-full min-w-max text-xs">
        <thead className="sticky top-0 z-10 bg-muted/95">
          <tr className="border-b border-border text-left text-2xs font-medium text-muted-foreground">
            {columns.map((column) => (
              <th key={column} className="whitespace-nowrap px-2 py-1.5">{labelOf(column)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String((row as Record<string, unknown>).id ?? index)} className="border-b border-border/50 last:border-0">
              {columns.map((column) => (
                <td key={column} className="whitespace-nowrap px-2 py-1 font-mono tabular-nums">
                  {formatValue(column, (row as Record<string, unknown>)[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const RecordSection = ({ section }: { section: RecordSection }) => (
  <section className="min-w-0 space-y-1.5">
    <h2 className="text-xs font-medium text-foreground">{section.label}</h2>
    <RecordTable rows={section.rows} testId={`crew-info-table-${section.id}`} hiddenFields={section.hiddenFields} />
  </section>
)

export const CrewInfoDialog = () => {
  const open = useUiStore((s) => s.crewInfoOpen)
  const crewId = useUiStore((s) => s.crewInfoCrewId)
  const close = useUiStore((s) => s.closeCrewInfo)
  const [info, setInfo] = useState<CrewInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !crewId) {
      setInfo(null)
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    void crewInfoFromStore(crewId)
      .then(setInfo)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Failed to load crew info')
      })
      .finally(() => setLoading(false))
  }, [open, crewId])

  const crew = info?.crew
  const fullName = crew
    ? [crew.preferredName || crew.firstName, crew.middleName, crew.lastName].filter(Boolean).join(' ')
    : crewId ?? ''
  const basicEntries = crew
    ? Object.entries(crew).filter(([key, value]) =>
      !isHiddenRecordField(key) &&
      !HIDDEN_BASIC_FIELDS.has(normalizedKey(key)) &&
      (value == null || typeof value !== 'object'),
    )
    : []

  const recordSections: RecordSection[] = info
    ? [
      { id: 'base', label: 'Crew Base', rows: sortRowsByEffectiveDate(info.bases), hiddenFields: RECORD_HIDDEN_FIELDS.base },
      { id: 'rank', label: 'Crew Rank', rows: sortRowsByEffectiveDate(info.ranks), hiddenFields: RECORD_HIDDEN_FIELDS.rank },
      { id: 'fleet', label: 'Crew Fleet', rows: sortRowsByEffectiveDate(info.fleets), hiddenFields: RECORD_HIDDEN_FIELDS.fleet },
      { id: 'qualification', label: 'Crew Qualification', rows: sortRowsByEffectiveDate(info.qualifications), hiddenFields: RECORD_HIDDEN_FIELDS.qualification },
      { id: 'certification', label: 'Crew Certification', rows: sortRowsByEffectiveDate(info.certifications), hiddenFields: RECORD_HIDDEN_FIELDS.certification },
      { id: 'team', label: 'Crew Team', rows: sortRowsByEffectiveDate(info.teams), hiddenFields: RECORD_HIDDEN_FIELDS.team },
    ]
    : []
  const [baseSection, rankSection, fleetSection, qualificationSection, certificationSection, teamSection] = recordSections

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => { if (!next) close() }}
      title={`Crew Info${fullName ? ` — ${fullName}` : ''}`}
      // Above Flight Detail (z-index 1000/1001) so Crew Info stacks on top when opened from it.
      className="z-[1100] w-[min(96vw,1200px)] sm:max-w-[1200px]"
      overlayClassName="z-[1100]"
      bodyClassName="flex min-h-0 flex-col"
      footer={<Button variant="ghost" onClick={close} data-testid="crew-info-close">Close</Button>}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3" data-testid="crew-info-dialog">
        {loading && <p className="text-xs text-muted-foreground">Loading crew information…</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!loading && !error && crew && (
          <div className="min-h-0 flex-1 space-y-2 overflow-auto" data-testid="crew-info-records">
            <div className="grid grid-cols-5 gap-x-3 gap-y-1 rounded-md border border-border bg-muted/20 p-2.5 text-xs" data-testid="crew-info-summary">
              {basicEntries.map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <span className="text-muted-foreground">{labelOf(key)}</span>
                  <div className="truncate" title={formatValue(key, value)}>{formatValue(key, value)}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {baseSection && <RecordSection section={baseSection} />}
              {rankSection && <RecordSection section={rankSection} />}
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {fleetSection && <RecordSection section={fleetSection} />}
              {qualificationSection && <RecordSection section={qualificationSection} />}
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {certificationSection && <RecordSection section={certificationSection} />}
              {teamSection && <RecordSection section={teamSection} />}
            </div>
          </div>
        )}
      </div>
    </AppDialog>
  )
}
