import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@rois/ui'

interface TextChipInputProps {
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  testId?: string
  className?: string
}

const splitTokens = (raw: string): string[] =>
  raw.split(/[\s,.;]+/).map((v) => v.trim()).filter(Boolean)

export const TextChipInput = ({ value, onChange, placeholder = 'All', testId, className }: TextChipInputProps) => {
  const [draft, setDraft] = useState('')

  const addTokens = (raw: string) => {
    const tokens = splitTokens(raw)
    if (tokens.length === 0) return
    const existing = new Set(value.map((v) => v.toUpperCase()))
    const next = [...value]
    for (const token of tokens) {
      const key = token.toUpperCase()
      if (existing.has(key)) continue
      existing.add(key)
      next.push(token)
    }
    onChange(next)
  }

  return (
    <div
      data-testid={testId}
      className={cn(
        'flex min-h-7 min-w-[150px] max-w-[240px] items-center gap-1 overflow-hidden rounded-md border border-input bg-background px-1.5 py-0.5 text-xs',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {value.map((item) => (
          <span key={item} className="inline-flex h-5 shrink-0 items-center gap-1 rounded bg-muted px-1.5 font-mono text-2xs">
            {item}
            <button
              type="button"
              aria-label={`Remove ${item}`}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onChange(value.filter((v) => v !== item))}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          placeholder={value.length === 0 ? placeholder : ''}
          className="h-5 min-w-[54px] flex-1 bg-transparent font-mono text-xs outline-none placeholder:font-sans placeholder:text-muted-foreground"
          onChange={(e) => {
            const next = e.target.value
            if (/[,.;\s]$/.test(next)) {
              addTokens(next)
              setDraft('')
              return
            }
            setDraft(next)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTokens(draft)
              setDraft('')
            } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={() => {
            addTokens(draft)
            setDraft('')
          }}
        />
      </div>
    </div>
  )
}
