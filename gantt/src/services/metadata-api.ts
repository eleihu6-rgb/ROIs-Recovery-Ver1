import { api } from '@/services/api'

export interface MetadataTable {
  name: string
  rowEstimate: number
}

export interface MetadataColumn {
  name: string
  type: string
  ordinal: number
}

export interface MetadataQueryResult {
  rows: Record<string, unknown>[]
  total: number
  page: number
  pageSize: number
}

export interface MetadataQueryParams {
  schema: string
  table: string
  filters: Record<string, string>
  page: number
  pageSize: number
}

export const metadataApi = {
  getTables: (schema: string): Promise<{ schema: string; tables: MetadataTable[] }> =>
    api.get('/api/metadata/tables', { params: { schema } }),

  getColumns: (schema: string, table: string): Promise<{ schema: string; table: string; columns: MetadataColumn[] }> =>
    api.get('/api/metadata/columns', { params: { schema, table } }),

  query: (params: MetadataQueryParams): Promise<MetadataQueryResult> =>
    api.post('/api/metadata/query', params),
}
