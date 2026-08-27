import type { DataChange, DataColumnConfig, DataValidationIssue } from '@/types/data-maintenance'
import { DATA_ENTITY_REGISTRY } from '@/config/data-entity-registry'

export interface ParsedDataCellValue {
  value: unknown
  error: string | null
}

const emptyToNull = (raw: string): string | null => {
  const value = raw.trim()
  return value === '' ? null : value
}

const isNullable = (col: DataColumnConfig): boolean => !col.required || col.nullable === true

const inputKindOf = (col: DataColumnConfig): NonNullable<DataColumnConfig['inputKind']> => {
  if (col.inputKind) return col.inputKind
  if (col.type === 'boolean') return 'boolean'
  if (col.type === 'number') return 'decimal'
  if (col.type === 'date') return 'date'
  if (col.type === 'datetime') return 'datetime'
  if (col.type === 'select') return 'select'
  return 'text'
}

export const formatDataCellValue = (value: unknown, col: DataColumnConfig): string => {
  if (value === null || value === undefined) return ''
  if (inputKindOf(col) === 'boolean') return Number(value) !== 0 ? '1' : '0'
  if (col.type === 'date') {
    const d = value instanceof Date ? value : new Date(String(value))
    return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10)
  }
  if (col.type === 'datetime') {
    const d = value instanceof Date ? value : new Date(String(value))
    return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 16)
  }
  return String(value)
}

export const parseDataCellValue = (raw: string, col: DataColumnConfig): ParsedDataCellValue => {
  const value = emptyToNull(raw)
  if (value === null) {
    return isNullable(col)
      ? { value: null, error: null }
      : { value: null, error: `${col.label} is required` }
  }

  if (col.maxLength && value.length > col.maxLength) {
    return { value, error: `${col.label} must be ${col.maxLength} characters or fewer` }
  }

  switch (inputKindOf(col)) {
    case 'boolean': {
      if (value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes') return { value: 1, error: null }
      if (value === '0' || value.toLowerCase() === 'false' || value.toLowerCase() === 'no') return { value: 0, error: null }
      return { value, error: `${col.label} must be Yes or No` }
    }
    case 'integer': {
      if (!/^-?\d+$/.test(value)) return { value, error: `${col.label} must be a whole number` }
      const n = Number(value)
      if (col.min !== undefined && n < col.min) return { value: n, error: `${col.label} must be at least ${col.min}` }
      if (col.max !== undefined && n > col.max) return { value: n, error: `${col.label} must be at most ${col.max}` }
      return { value: n, error: null }
    }
    case 'decimal':
    case 'percentRatio': {
      if (!/^-?(\d+|\d*\.\d+)$/.test(value)) return { value, error: `${col.label} must be a number` }
      const n = Number(value)
      if (col.min !== undefined && n < col.min) return { value: n, error: `${col.label} must be at least ${col.min}` }
      if (col.max !== undefined && n > col.max) {
        const suffix = inputKindOf(col) === 'percentRatio' ? '. Use 0.33 for 33%.' : ''
        return { value: n, error: `${col.label} must be at most ${col.max}${suffix}` }
      }
      return { value: String(n), error: null }
    }
    case 'time': {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
        return { value, error: `${col.label} must use HH:mm, e.g. 04:00` }
      }
      return { value, error: null }
    }
    case 'date': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
        return { value, error: `${col.label} must be a valid date` }
      }
      return { value, error: null }
    }
    case 'datetime': {
      const normalised = value.length === 16 ? value : value.replace(' ', 'T')
      if (Number.isNaN(new Date(normalised).getTime())) return { value, error: `${col.label} must be a valid date and time` }
      return { value: normalised, error: null }
    }
    case 'colorHex': {
      const hex = value.startsWith('#') ? value.slice(1) : value
      if (!/^[0-9a-fA-F]{6}$/.test(hex)) return { value, error: `${col.label} must be a 6-character hex color, e.g. 8B7BD8` }
      return { value: hex.toUpperCase(), error: null }
    }
    case 'select':
    case 'text':
    default:
      return { value, error: null }
  }
}

export function validateChanges(changes: DataChange[]): DataValidationIssue[] {
  const issues: DataValidationIssue[] = []

  // Check required fields on create/update
  for (const change of changes) {
    if (change.action === 'delete' || change.action === 'expire') continue
    const config = DATA_ENTITY_REGISTRY[change.entityId]
    if (!config) continue
    for (const col of config.columns) {
      if (col.required && !col.readonly) {
        const val = change.after[col.key]
        if (val === undefined || val === null || val === '') {
          issues.push({
            severity: 'error',
            code: 'invalid_value',
            entityId: change.entityId,
            rowId: change.rowId,
            clientChangeId: change.clientChangeId,
            field: col.key,
            message: `${col.label} is required`,
          })
        }
      }
      const raw = change.after[col.key]
      if (raw !== undefined && !col.readonly) {
        const { error } = parseDataCellValue(String(raw ?? ''), col)
        if (error) {
          issues.push({
            severity: 'error',
            code: 'invalid_value',
            entityId: change.entityId,
            rowId: change.rowId,
            clientChangeId: change.clientChangeId,
            field: col.key,
            message: error,
          })
        }
      }
    }
  }

  // Check duplicate business keys in draft creates
  const creates = changes.filter((c) => c.action === 'create')
  const seenKeys: Record<string, Set<string>> = {}
  for (const change of creates) {
    const config = DATA_ENTITY_REGISTRY[change.entityId]
    if (!config) continue
    const bkStr = config.businessKey.map((k) => String(change.after[k] ?? '')).join('|')
    if (!seenKeys[change.entityId]) seenKeys[change.entityId] = new Set()
    if (seenKeys[change.entityId].has(bkStr)) {
      issues.push({
        severity: 'error',
        code: 'duplicate_key',
        entityId: change.entityId,
        clientChangeId: change.clientChangeId,
        message: `Duplicate record: ${bkStr}`,
      })
    } else {
      seenKeys[change.entityId].add(bkStr)
    }
  }

  // Check effective date validity (effDt < expDt) for effective-dated entities
  for (const change of changes) {
    if (change.action === 'delete') continue
    const config = DATA_ENTITY_REGISTRY[change.entityId]
    if (!config?.effectiveDate) continue
    const { effField, expField } = config.effectiveDate
    const eff = change.after[effField]
    const exp = change.after[expField]
    if (eff && exp) {
      const effDate = new Date(eff as string)
      const expDate = new Date(exp as string)
      if (expDate <= effDate) {
        issues.push({
          severity: 'error',
          code: 'invalid_effective_range',
          entityId: change.entityId,
          rowId: change.rowId,
          clientChangeId: change.clientChangeId,
          field: expField,
          message: 'Expiry date must be after effective date',
        })
      }
    }
  }

  return issues
}
