import { useRef, useState } from 'react'
import { severityLabelFromNum } from '@/utils/severity-labels'
import { SEVERITY_CHIP } from '@/components/rule/rule-badge-styles'
import { TAXONOMY_CHIP } from '@/components/rule/rule-badge-styles'
import { notify } from '@/utils/notify'

const SEV_CODE: Record<number, string> = { 1: 'INFO', 2: 'WARNING', 3: 'ERROR' }

interface Props {
  /** Current stored value. Pass the raw severity number (1/2/3) for type='severity'. */
  value: string | number | null
  type: 'text' | 'severity' | 'select'
  /** Options for type='select'. Rendered as a native <select> with a blank "clear" option. */
  options?: Array<{ value: string; label: string }>
  /** If undefined, renders read-only (no click-to-edit). Called on confirm; throw to signal failure. */
  onSave?: (val: string | null) => Promise<void>
  placeholder?: string
}

export const RuleInlineCell = ({ value, type, options, onSave, placeholder = '—' }: Props) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const original = useRef<string | null>(null)
  const committingRef = useRef(false)

  const strVal = value !== null && value !== undefined ? String(value) : null

  const startEdit = () => {
    if (!onSave) return
    original.current = strVal
    setDraft(strVal ?? (type === 'severity' ? '1' : ''))
    setEditing(true)
  }

  const commit = async () => {
    if (committingRef.current) return  // guard against double-fire (Enter then blur on unmount)
    committingRef.current = true
    try {
      setEditing(false)
      const newVal = (type === 'text' || type === 'select') ? (draft.trim() || null) : draft
      if (newVal === original.current) return
      if (!onSave) return
      try {
        await onSave(newVal)
      } catch (e) {
        notify.error(e instanceof Error ? e.message : 'Failed to save')
        // parent re-renders with the old value from the store rollback — no local state needed
      }
    } finally {
      committingRef.current = false
    }
  }

  const cancel = () => setEditing(false)

  if (!editing) {
    const displayNode =
      type === 'severity' && strVal ? (
        <span className={`rounded px-1.5 py-0.5 text-2xs font-semibold ${SEVERITY_CHIP[SEV_CODE[Number(strVal)]] ?? 'bg-muted text-muted-foreground'}`}>
          {severityLabelFromNum(Number(strVal))}
        </span>
      ) : type === 'select' && strVal ? (
        <span className={`text-3xs ${TAXONOMY_CHIP}`}>
          {options?.find((o) => o.value === strVal)?.label ?? strVal}
        </span>
      ) : strVal ? (
        <span className={`text-3xs ${TAXONOMY_CHIP}`}>{strVal}</span>
      ) : (
        <span className="text-2xs text-muted-foreground">{placeholder}</span>
      )

    return (
      <span
        className={onSave ? 'cursor-pointer rounded px-0.5 hover:ring-1 hover:ring-border' : ''}
        onClick={startEdit}
        title={onSave ? 'Click to edit' : undefined}
      >
        {displayNode}
      </span>
    )
  }

  if (type === 'severity' || type === 'select') {
    return (
      <select
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => { if (e.key === 'Enter') void commit(); if (e.key === 'Escape') cancel() }}
        className="rounded border border-border bg-card px-1 py-0.5 text-2xs text-foreground outline-none focus:ring-1 focus:ring-primary"
      >
        {type === 'select' ? (
          <>
            <option value="">—</option>
            {(options ?? []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </>
        ) : (
          <>
            <option value="1">Soft</option>
            <option value="2">Overridable</option>
            <option value="3">Hard</option>
          </>
        )}
      </select>
    )
  }

  return (
    <input
      autoFocus
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => { if (e.key === 'Enter') void commit(); if (e.key === 'Escape') cancel() }}
      placeholder={placeholder}
      className="w-full min-w-[80px] rounded border border-border bg-card px-1.5 py-0.5 text-2xs text-foreground outline-none focus:ring-1 focus:ring-primary"
    />
  )
}
