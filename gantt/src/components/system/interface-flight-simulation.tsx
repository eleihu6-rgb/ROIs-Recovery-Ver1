import { useCallback, useEffect, useState } from 'react'
import { Pencil, RefreshCw, Save, Search, X } from 'lucide-react'
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rois/ui'
import { OPS_EMPTY_FLEET, OPS_EMPTY_TAIL_NUMBER, OPS_FLEET_OPTIONS, OPS_TAIL_NUMBER_OPTIONS } from '@/config/ops-flight-simulation-options'
import { flightApi } from '@/services/flight-api'
import type { Flight } from '@/types'

interface Draft {
  schDepDtUtc: string
  schArvDtUtc: string
  estDepDtUtc: string
  estArvDtUtc: string
  actDepDtUtc: string
  actArvDtUtc: string
  fleet: string
  register: string
}

const today = new Date().toISOString().slice(0, 10)

const toInputDateTime = (value: string | null | undefined): string => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 16)
}

const toUtc = (value: string): string | null => value ? new Date(value).toISOString() : null

const draftOf = (flight: Flight): Draft => ({
  schDepDtUtc: toInputDateTime(flight.schDepDtUtc),
  schArvDtUtc: toInputDateTime(flight.schArvDtUtc),
  estDepDtUtc: toInputDateTime(flight.estDepDtUtc),
  estArvDtUtc: toInputDateTime(flight.estArvDtUtc),
  actDepDtUtc: toInputDateTime(flight.actDepDtUtc),
  actArvDtUtc: toInputDateTime(flight.actArvDtUtc),
  fleet: flight.fleet || OPS_EMPTY_FLEET,
  register: flight.register ?? '',
})

const display = (value: string | null | undefined): string => value ? new Date(value).toISOString().replace('T', ' ').slice(0, 16) : '-'

const optionsWithCurrentValue = (options: readonly string[], currentValue: string, emptyValue: string): string[] => {
  const value = currentValue || emptyValue
  return options.includes(value) ? [...options] : [value, ...options]
}

export const InterfaceFlightSimulation = () => {
  const [fltNum, setFltNum] = useState('')
  const [fltDt, setFltDt] = useState(today)
  const [rows, setRows] = useState<Flight[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const search = useCallback(async () => {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const result = await flightApi.listFlat({
        startDate: fltDt,
        endDate: fltDt,
        fltNum: fltNum.trim() || undefined,
        page: 1,
        pageSize: 100,
      })
      setRows(result.items)
      setMessage(`${result.items.length} flight${result.items.length === 1 ? '' : 's'} found`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to search flights')
    } finally {
      setLoading(false)
    }
  }, [fltDt, fltNum])

  useEffect(() => { void search() }, [])

  const save = async () => {
    const current = rows.find((row) => row.id === editingId)
    if (!current || !draft) return
    if (new Date(draft.schArvDtUtc) <= new Date(draft.schDepDtUtc)) {
      setError('STA must be after STD')
      return
    }
    if (new Date(draft.actArvDtUtc) <= new Date(draft.actDepDtUtc)) {
      setError('ATA must be after ATD')
      return
    }
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const updated = await flightApi.updateTimes(current.id, {
        schDepDtUtc: toUtc(draft.schDepDtUtc) ?? current.schDepDtUtc,
        schArvDtUtc: toUtc(draft.schArvDtUtc) ?? current.schArvDtUtc,
        actDepDtUtc: toUtc(draft.actDepDtUtc) ?? current.actDepDtUtc,
        actArvDtUtc: toUtc(draft.actArvDtUtc) ?? current.actArvDtUtc,
        estDepDtUtc: toUtc(draft.estDepDtUtc),
        estArvDtUtc: toUtc(draft.estArvDtUtc),
        fleet: draft.fleet === OPS_EMPTY_FLEET ? '' : draft.fleet,
        register: draft.register || null,
      })
      setRows((currentRows) => currentRows.map((row) => row.id === updated.id ? updated : row))
      setEditingId(null)
      setDraft(null)
      setMessage('Flight schedule saved. Linked Pairing, Roster and Rule checks were refreshed.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save flight schedule')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="interface-flight-simulation">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-sm font-semibold text-foreground">OPS Flight Schedule Simulation</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Search and simulate operational flight schedule updates. Times are UTC.</p>
        </div>
        <Input aria-label="Flight number" placeholder="Flight number" value={fltNum} onChange={(event) => setFltNum(event.target.value)} className="h-8 w-40 text-xs" data-testid="interface-flight-number" />
        <Input aria-label="Flight date" type="date" value={fltDt} onChange={(event) => setFltDt(event.target.value)} className="h-8 w-36 text-xs" data-testid="interface-flight-date" />
        <Button size="sm" onClick={() => void search()} disabled={loading} className="gap-1.5" data-testid="interface-flight-search"><Search className="h-3.5 w-3.5" /> Search</Button>
        <Button size="sm" variant="outline" onClick={() => void search()} disabled={loading} title="Refresh" aria-label="Refresh"><RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} /></Button>
      </header>
      {message && <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">{message}</div>}
      {error && <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">{error}</div>}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[1180px] text-left text-xs" data-testid="interface-flight-table">
          <thead className="sticky top-0 z-10 border-b border-border bg-muted/80 text-2xs uppercase tracking-wide text-muted-foreground">
            <tr>{['Flight', 'Date', 'From', 'To', 'STD', 'STA', 'ETD', 'ETA', 'ATD', 'ATA', 'Type', 'Tail', ''].map((label) => <th key={label} className="px-3 py-2 font-medium">{label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((flight) => {
              const isEditing = editingId === flight.id
              const fleetOptions = optionsWithCurrentValue(OPS_FLEET_OPTIONS, flight.fleet, OPS_EMPTY_FLEET)
              const tailNumberOptions = optionsWithCurrentValue(OPS_TAIL_NUMBER_OPTIONS, flight.register ?? '', OPS_EMPTY_TAIL_NUMBER)
              return <tr key={flight.id} className={isEditing ? 'bg-primary/[0.04]' : ''}>
                <td className="px-3 py-2 font-mono font-semibold">{flight.airline}{flight.fltNum}</td>
                <td className="px-3 py-2 font-mono">{flight.fltDt}</td>
                <td className="px-3 py-2 font-mono">{flight.depArp}</td>
                <td className="px-3 py-2 font-mono">{flight.arvArp}</td>
                {(['schDepDtUtc', 'schArvDtUtc', 'estDepDtUtc', 'estArvDtUtc', 'actDepDtUtc', 'actArvDtUtc'] as const).map((key) => <td key={key} className="px-3 py-2 whitespace-nowrap font-mono">{isEditing && draft ? <Input type="datetime-local" value={draft[key] as string} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} className="h-7 w-36 text-2xs" data-testid={`interface-edit-${key}`} /> : display(flight[key])}</td>)}
                <td className="px-3 py-2">{isEditing && draft ? <Select value={draft.fleet} onValueChange={(value) => setDraft({ ...draft, fleet: value })}>
                  <SelectTrigger aria-label={`Fleet for ${flight.airline}${flight.fltNum}`} data-testid={`interface-edit-fleet-${flight.id}`} className="h-7 w-24 text-2xs"><SelectValue placeholder="Fleet" /></SelectTrigger>
                  <SelectContent>{fleetOptions.map((option) => <SelectItem key={option} value={option} className="text-2xs">{option === OPS_EMPTY_FLEET ? 'No fleet' : option}</SelectItem>)}</SelectContent>
                </Select> : flight.fleet}</td>
                <td className="px-3 py-2">{isEditing && draft ? <Select value={draft.register || OPS_EMPTY_TAIL_NUMBER} onValueChange={(value) => setDraft({ ...draft, register: value === OPS_EMPTY_TAIL_NUMBER ? '' : value })}>
                  <SelectTrigger aria-label={`Tail number for ${flight.airline}${flight.fltNum}`} data-testid={`interface-edit-tail-${flight.id}`} className="h-7 w-28 text-2xs"><SelectValue placeholder="Tail number" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={OPS_EMPTY_TAIL_NUMBER} className="text-2xs">No tail</SelectItem>
                    {tailNumberOptions.filter((option) => option !== OPS_EMPTY_TAIL_NUMBER).map((option) => <SelectItem key={option} value={option} className="text-2xs">{option}</SelectItem>)}
                  </SelectContent>
                </Select> : flight.register ?? '-'}</td>
                <td className="px-3 py-2"><div className="flex items-center gap-1">{isEditing ? <><Button size="sm" onClick={() => void save()} disabled={saving} title="Save" aria-label="Save"><Save className="h-3.5 w-3.5" /></Button><Button size="sm" variant="outline" onClick={() => { setEditingId(null); setDraft(null) }} title="Cancel" aria-label="Cancel"><X className="h-3.5 w-3.5" /></Button></> : <Button size="sm" variant="outline" onClick={() => { setEditingId(flight.id); setDraft(draftOf(flight)); setError(null) }} className="gap-1.5" data-testid={`interface-edit-${flight.id}`}><Pencil className="h-3.5 w-3.5" /> Edit</Button>}</div></td>
              </tr>
            })}
          </tbody>
        </table>
        {rows.length === 0 && !loading && <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">No flights found for this date.</div>}
      </div>
    </div>
  )
}
