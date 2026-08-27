import { api } from '@/services/api'
import type { DataTableQuery, DataPageResult, DataChange, DataValidationIssue } from '@/types/data-maintenance'

export interface DataCatalogEntry {
  pageId: string
  entityId: string
  label: string
  count?: number
}

export const dataApi = {
  getCatalog: (): Promise<DataCatalogEntry[]> =>
    api.get('/api/data/catalog'),

  getReferenceOptions: (entityId: string): Promise<{ value: string; label: string }[]> =>
    api.get('/api/data/reference-options', { params: { entityId } }),

  queryTable: (query: DataTableQuery): Promise<DataPageResult> =>
    api.post('/api/data/table', query),

  validate: (changes: DataChange[]): Promise<DataValidationIssue[]> =>
    api.post('/api/data/validate', { changes }),

  save: (changes: DataChange[]): Promise<{ revisionId: number; committed: number }> =>
    api.post('/api/data/save', { changes }),
}
