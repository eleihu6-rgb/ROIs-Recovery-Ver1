import type { MetadataColumn } from '@/services/metadata-api'

interface MetadataFilterRowProps {
  columns:  MetadataColumn[]
  filters:  Record<string, string>
  onChange: (col: string, value: string) => void
}

export const MetadataFilterRow = ({ columns, filters, onChange }: MetadataFilterRowProps) => {
  if (columns.length === 0) return null

  return (
    <div
      data-testid="metadata-filter-row"
      className="overflow-x-auto border-b border-border bg-muted/20 px-3 py-2"
    >
      <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
        {columns.map((col) => (
          <div key={col.name} className="flex flex-col gap-1">
            <span className="font-mono text-2xs text-foreground">{col.name}</span>
            <span className="font-mono text-2xs text-primary">{col.type}</span>
            <input
              data-testid={`metadata-filter-col-${col.name}`}
              value={filters[col.name] ?? ''}
              onChange={(e) => onChange(col.name, e.target.value)}
              placeholder={col.type.includes('date') ? '≥ value' : '= value'}
              className="w-20 rounded border border-input bg-background px-1.5 py-0.5 font-mono text-2xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
