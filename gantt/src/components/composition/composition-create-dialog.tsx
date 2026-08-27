import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useCompositionStore } from '@/stores/composition-store'
import { notify } from '@/utils/notify'

interface Props {
  open: boolean
  onClose(): void
}

export const CompositionCreateDialog = ({ open, onClose }: Props) => {
  const createComposition = useCompositionStore((s) => s.createComposition)

  const [name, setName] = useState('')
  const [division, setDivision] = useState('')
  const [displayOrder, setDisplayOrder] = useState('1')
  const [hierarchy, setHierarchy] = useState('1')
  const [nameDesc, setNameDesc] = useState('')
  const [saving, setSaving] = useState(false)

  const reset = () => { setName(''); setDivision(''); setDisplayOrder('1'); setHierarchy('1'); setNameDesc('') }

  // ESC key handler
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { reset(); onClose() } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const handleSubmit = async () => {
    if (!name.trim() || !division.trim()) {
      notify.error('Name and Division are required')
      return
    }
    setSaving(true)
    try {
      await createComposition({
        name: name.trim(),
        division: division.trim(),
        displayOrder: parseInt(displayOrder) || 1,
        hierarchy: parseInt(hierarchy) || 1,
        nameDesc: nameDesc.trim() || null,
      })
      notify.success('Composition created')
      reset()
      onClose()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/25" onClick={() => { reset(); onClose() }}>
      <div className="w-96 rounded-lg border border-border bg-card shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-bold">New Composition</span>
          <button type="button" onClick={() => { reset(); onClose() }} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4">
          <div>
            <label className="block text-2xs font-semibold text-muted-foreground mb-1">Name *</label>
            <input type="text" className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Double" />
          </div>
          <div>
            <label className="block text-2xs font-semibold text-muted-foreground mb-1">Division *</label>
            <input type="text" className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none" value={division} onChange={(e) => setDivision(e.target.value)} placeholder="P / C" />
          </div>
          <div>
            <label className="block text-2xs font-semibold text-muted-foreground mb-1">Display Order</label>
            <input type="number" className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} />
          </div>
          <div>
            <label className="block text-2xs font-semibold text-muted-foreground mb-1">Hierarchy</label>
            <select className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none" value={hierarchy} onChange={(e) => setHierarchy(e.target.value)}>
              <option value="1">1 — Standard</option>
              <option value="2">2 — Enhanced</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-2xs font-semibold text-muted-foreground mb-1">Description</label>
            <input type="text" className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none" value={nameDesc} onChange={(e) => setNameDesc(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button type="button" onClick={() => { reset(); onClose() }} className="px-4 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving} className="px-4 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}