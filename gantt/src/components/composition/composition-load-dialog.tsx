// gantt/src/components/composition/composition-load-dialog.tsx
import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useCompositionLoadStore } from '@/stores/composition-load-store'
import { GanttEnglishDatePicker } from '@/components/common/gantt-date-fields'
import { notify } from '@/utils/notify'
import type { CompositionLoad, CreateLoadData } from '@/types/composition'

interface Props {
  open: boolean
  editItem: CompositionLoad | null
  onClose(): void
}

const EMPTY: Omit<CreateLoadData, 'filiale'> = {
  division: '',
  sequence: 1,
  fltNum: null,
  fleet: null,
  flightFlag: null,
  fltType: null,
  segType: null,
  routeId: null,
  loadFactor: null,
  effDt: new Date().toISOString().slice(0, 10),
  expDt: null,
  dow: '1234567',
  description: null,
  compId: null,
  subFleet: null,
  flightAssignment: null,
  serviceType: null,
  paxNum: null,
  restFacility: null,
  departureTime: null,
  arrivalTime: null,
  optionId: null,
  blhLow: null,
  blhUpper: null,
}

export const CompositionLoadDialog = ({ open, editItem, onClose }: Props) => {
  const create = useCompositionLoadStore((s) => s.create)
  const update = useCompositionLoadStore((s) => s.update)
  const compositions = useCompositionLoadStore((s) => s.compositions)

  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editItem) {
      const f: Record<string, string> = {}
      Object.entries(editItem).forEach(([k, v]) => {
        if (k !== 'id') f[k] = v === null ? '' : String(v)
      })
      setForm(f)
    } else {
      const f: Record<string, string> = {}
      Object.entries({ filiale: '', ...EMPTY }).forEach(([k, v]) => {
        f[k] = v === null ? '' : String(v)
      })
      setForm(f)
    }
  }, [open, editItem])

  // ESC key to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const field = (key: string) => form[key] ?? ''
  const setField = (key: string, val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }))

  const toPayload = (): CreateLoadData => ({
    filiale: field('filiale') || null,
    division: field('division'),
    sequence: parseInt(field('sequence')) || 1,
    fltNum:           field('fltNum') || null,
    fleet:            field('fleet') || null,
    flightFlag:       field('flightFlag') || null,
    fltType:          field('fltType') || null,
    segType:          field('segType') || null,
    routeId:          field('routeId') ? parseInt(field('routeId')) : null,
    loadFactor:       field('loadFactor') || null,
    effDt:            field('effDt') || new Date().toISOString(),
    expDt:            field('expDt') || null,
    dow:              field('dow') || '1234567',
    description:      field('description') || null,
    compId:           field('compId') ? parseInt(field('compId')) : null,
    subFleet:         field('subFleet') || null,
    flightAssignment: field('flightAssignment') || null,
    serviceType:      field('serviceType') || null,
    paxNum:           field('paxNum') || null,
    restFacility:     field('restFacility') ? parseInt(field('restFacility')) : null,
    departureTime:    field('departureTime') || null,
    arrivalTime:      field('arrivalTime') || null,
    optionId:         field('optionId') ? parseInt(field('optionId')) : null,
    blhLow:           field('blhLow') || null,
    blhUpper:         field('blhUpper') || null,
  })

  const handleSubmit = async () => {
    if (!field('division') || !field('sequence')) {
      notify.error('Division and Sequence are required')
      return
    }
    setSaving(true)
    try {
      if (editItem) {
        await update(editItem.id, toPayload())
        notify.success('Load rule updated')
      } else {
        await create(toPayload())
        notify.success('Load rule created')
      }
      onClose()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const inputCls = 'h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none'
  const labelCls = 'text-2xs font-semibold text-muted-foreground mb-1 block'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/25" onClick={onClose}>
      <div className="relative w-[720px] max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-sm font-bold">
            {editItem ? 'Edit Load Rule' : 'Add Load Rule'}
          </span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form grid */}
        <div className="grid grid-cols-3 gap-4 p-5">
          <div>
            <label className={labelCls}>Division *</label>
            <input className={inputCls} value={field('division')} onChange={(e) => setField('division', e.target.value)} placeholder="P / C" />
          </div>
          <div>
            <label className={labelCls}>Priority (Sequence) *</label>
            <input className={inputCls} type="number" value={field('sequence')} onChange={(e) => setField('sequence', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Filiale</label>
            <input className={inputCls} value={field('filiale')} onChange={(e) => setField('filiale', e.target.value)} placeholder="F8" />
          </div>

          <div>
            <label className={labelCls}>Fleet</label>
            <input className={inputCls} value={field('fleet')} onChange={(e) => setField('fleet', e.target.value)} placeholder="* = any" />
          </div>
          <div>
            <label className={labelCls}>Flight No.</label>
            <input className={inputCls} value={field('fltNum')} onChange={(e) => setField('fltNum', e.target.value)} placeholder="* = any" />
          </div>
          <div>
            <label className={labelCls}>Sub Fleet</label>
            <input className={inputCls} value={field('subFleet')} onChange={(e) => setField('subFleet', e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Flight Flag</label>
            <input className={inputCls} value={field('flightFlag')} onChange={(e) => setField('flightFlag', e.target.value)} placeholder="A / C" />
          </div>
          <div>
            <label className={labelCls}>Flight Assignment</label>
            <input className={inputCls} value={field('flightAssignment')} onChange={(e) => setField('flightAssignment', e.target.value)} placeholder="FLY / SBY" />
          </div>
          <div>
            <label className={labelCls}>Service Type</label>
            <input className={inputCls} value={field('serviceType')} onChange={(e) => setField('serviceType', e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Segment Type</label>
            <input className={inputCls} value={field('segType')} onChange={(e) => setField('segType', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Load Factor %</label>
            <input className={inputCls} value={field('loadFactor')} onChange={(e) => setField('loadFactor', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Pax Num</label>
            <input className={inputCls} value={field('paxNum')} onChange={(e) => setField('paxNum', e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>DEP Time (HH:mm-HH:mm)</label>
            <input className={inputCls} value={field('departureTime')} onChange={(e) => setField('departureTime', e.target.value)} placeholder="00:00-23:59" />
          </div>
          <div>
            <label className={labelCls}>ARR Time (HH:mm-HH:mm)</label>
            <input className={inputCls} value={field('arrivalTime')} onChange={(e) => setField('arrivalTime', e.target.value)} placeholder="00:00-23:59" />
          </div>
          <div>
            <label className={labelCls}>Rest Facility</label>
            <input className={inputCls} type="number" value={field('restFacility')} onChange={(e) => setField('restFacility', e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>BLH Low</label>
            <input className={inputCls} value={field('blhLow')} onChange={(e) => setField('blhLow', e.target.value)} placeholder="0:00" />
          </div>
          <div>
            <label className={labelCls}>BLH Upper</label>
            <input className={inputCls} value={field('blhUpper')} onChange={(e) => setField('blhUpper', e.target.value)} placeholder="99:00" />
          </div>
          <div>
            <label className={labelCls}>Day of Week</label>
            <input className={inputCls} value={field('dow')} onChange={(e) => setField('dow', e.target.value)} placeholder="1234567" />
          </div>

          <div>
            <label className={labelCls}>Effective Date *</label>
            <GanttEnglishDatePicker ariaLabel="Effective Date" value={field('effDt')?.slice(0, 10)} onValueChange={(value) => setField('effDt', value)} />
          </div>
          <div>
            <label className={labelCls}>Expiry Date</label>
            <GanttEnglishDatePicker ariaLabel="Expiry Date" value={field('expDt')?.slice(0, 10)} onValueChange={(value) => setField('expDt', value)} />
          </div>
          <div>
            <label className={labelCls}>Composition</label>
            <select className={inputCls} value={field('compId')} onChange={(e) => setField('compId', e.target.value)}>
              <option value="">- none -</option>
              {compositions.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name} ({c.division})</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Option ID</label>
            <input className={inputCls} type="number" value={field('optionId')} onChange={(e) => setField('optionId', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Description</label>
            <input className={inputCls} value={field('description')} onChange={(e) => setField('description', e.target.value)} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="px-4 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
