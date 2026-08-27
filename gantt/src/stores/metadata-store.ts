import { create } from 'zustand'
import { metadataApi, type MetadataTable } from '@/services/metadata-api'
import { useAuthStore } from './auth-store'

export type MetadataSchemaKey = 'live' | 'scenario'

const SCHEMA_KEYS: MetadataSchemaKey[] = ['live', 'scenario']

const liveSchema = (): string | null => useAuthStore.getState().user?.schema ?? null

const scenarioSchemaFromLive = (schema: string): string => {
  if (schema.endsWith('_live')) return `${schema.slice(0, -'_live'.length)}_scenario`
  if (!schema.includes('_')) return 'scenario'
  return `${schema}_scenario`
}

export const resolveMetadataSchema = (key: MetadataSchemaKey): string | null => {
  const live = liveSchema()
  if (!live) return null
  return key === 'live' ? live : scenarioSchemaFromLive(live)
}

export const metadataSchemaLabel = (key: MetadataSchemaKey): string => {
  const schema = resolveMetadataSchema(key)
  if (!schema) return key === 'live' ? 'Live' : 'Scenario'
  return key === 'live' ? `Live (${schema})` : `Scenario (${schema})`
}

interface MetadataStore {
  tables:        Record<MetadataSchemaKey, MetadataTable[]>
  tablesLoading: Record<MetadataSchemaKey, boolean>
  selectedSchema: MetadataSchemaKey
  selectedTable:  string | null
  setSelectedTable: (schema: MetadataSchemaKey, table: string) => void
  loadTables: () => void
}

export const useMetadataStore = create<MetadataStore>((set, get) => ({
  tables:         { live: [], scenario: [] },
  tablesLoading:  { live: false, scenario: false },
  selectedSchema: 'live',
  selectedTable:  null,

  setSelectedTable: (schema, table) => set({ selectedSchema: schema, selectedTable: table }),

  loadTables: () => {
    const { tablesLoading, tables } = get()
    for (const key of SCHEMA_KEYS) {
      if (tablesLoading[key] || tables[key].length > 0) continue
      const schema = resolveMetadataSchema(key)
      if (!schema) continue
      set((s) => ({ tablesLoading: { ...s.tablesLoading, [key]: true } }))
      metadataApi.getTables(schema)
        .then((res) => set((s) => ({
          tables:        { ...s.tables,        [key]: res.tables },
          tablesLoading: { ...s.tablesLoading, [key]: false },
        })))
        .catch(() => set((s) => ({
          tablesLoading: { ...s.tablesLoading, [key]: false },
        })))
    }
  },
}))
