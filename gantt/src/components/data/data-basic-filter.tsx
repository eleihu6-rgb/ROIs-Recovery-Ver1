import { useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rois/ui'
import type { DataFilterField } from '@/types/data-maintenance'

interface DataBasicFilterProps {
  filterFields: DataFilterField[]
  onSearch: (filters: Record<string, string>) => void
  onClear: () => void
}

export const DataBasicFilter = ({ filterFields, onSearch, onClear }: DataBasicFilterProps) => {
  const [values, setValues] = useState<Record<string, string>>({})

  const set = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  const clear = () => {
    setValues({})
    onClear()
  }

  const hasValues = Object.values(values).some((v) => v !== '' && v !== undefined)

  return (
    <div
      data-testid="data-basic-filter"
      className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-4 py-2"
    >
      {filterFields.map((field) =>
        field.type === 'select' ? (
          <Select
            key={field.key}
            value={values[field.key] ?? ''}
            onValueChange={(v) => set(field.key, v === '__all__' ? '' : v)}
          >
            <SelectTrigger
              data-testid={`data-filter-${field.key}`}
              className="h-7 w-36 text-xs"
            >
              <SelectValue placeholder={field.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All {field.label}s</SelectItem>
              {field.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            key={field.key}
            data-testid={`data-filter-${field.key}`}
            placeholder={field.label}
            value={values[field.key] ?? ''}
            onChange={(e) => set(field.key, e.target.value)}
            className="h-7 w-36 text-xs"
          />
        ),
      )}
      <Button
        data-testid="data-filter-search"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() => onSearch(values)}
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        Search
      </Button>
      {hasValues && (
        <Button
          data-testid="data-filter-clear"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={clear}
        >
          <X className="h-3.5 w-3.5 shrink-0" />
          Clear
        </Button>
      )}
    </div>
  )
}
