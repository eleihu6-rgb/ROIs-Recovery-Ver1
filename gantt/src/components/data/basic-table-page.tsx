import { useCallback, useEffect, useState } from 'react'
import { DataSection } from './data-section'
import { DataGrid } from './data-grid'
import { DataEditDialog } from './data-edit-dialog'
import { DataBasicFilter } from './data-basic-filter'
import { dataApi } from '@/services/data-api'
import { useDataMaintenanceStore } from '@/stores/data-maintenance-store'
import { DATA_ENTITY_REGISTRY, PAGE_ENTITY_MAP } from '@/config/data-entity-registry'
import { notify } from '@/utils/notify'
import type { DataChange, DataEntityId, DataPageRow } from '@/types/data-maintenance'

const FULL_TABLE_PAGE_SIZE = 0

export const BasicTablePage = () => {
  const selectedPage = useDataMaintenanceStore((s) => s.selectedPage)
  const setLoadedRows = useDataMaintenanceStore((s) => s.setLoadedRows)
  const loadedRows = useDataMaintenanceStore((s) => s.loadedRows)
  const [loading, setLoading] = useState<Partial<Record<DataEntityId, boolean>>>({})
  const [creating, setCreating] = useState<{ entityId: DataEntityId; initialValues?: Record<string, unknown>; mode: 'add' | 'copy' } | null>(null)
  const [activeFilters, setActiveFilters] = useState<Partial<Record<DataEntityId, Record<string, string>>>>({})

  const entityIds = selectedPage ? (PAGE_ENTITY_MAP[selectedPage] ?? []) : []

  const loadEntity = useCallback(
    (entityId: DataEntityId, opts?: { filters?: Record<string, string> }) => {
      if (!selectedPage) return
      const { filters } = opts ?? {}
      setLoading((prev) => ({ ...prev, [entityId]: true }))
      const cleanFilters: Record<string, unknown> = {}
      if (filters) {
        for (const [k, v] of Object.entries(filters)) {
          if (v !== '' && v !== undefined) cleanFilters[k] = v
        }
      }
      dataApi
        .queryTable({
          pageId: selectedPage,
          entityId,
          page: 1,
          pageSize: FULL_TABLE_PAGE_SIZE,
          filters: Object.keys(cleanFilters).length > 0 ? cleanFilters : undefined,
        })
        .then((result) => {
          setLoadedRows(entityId, result.rows)
        })
        .catch(() => setLoadedRows(entityId, []))
        .finally(() => setLoading((prev) => ({ ...prev, [entityId]: false })))
    },
    [selectedPage, setLoadedRows],
  )

  useEffect(() => {
    if (!selectedPage || entityIds.length === 0) return
    for (const entityId of entityIds) {
      if (!DATA_ENTITY_REGISTRY[entityId]) continue
      loadEntity(entityId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPage])

  const handleDelete = async (entityId: DataEntityId, row: DataPageRow) => {
    if (typeof row.id !== 'number') return
    try {
      const change: DataChange = {
        clientChangeId: `delete-${entityId}-${row.id}-${Date.now()}`,
        entityId,
        action: 'delete',
        rowId: row.id,
        after: {},
      }
      const result = await dataApi.save([change])
      if (result.committed < 1) {
        notify.error('Delete rejected')
        return
      }
      notify.success('Row deleted')
      loadEntity(entityId, { filters: activeFilters[entityId] })
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const handleCellCommit = async (entityId: DataEntityId, row: DataPageRow, field: string, value: unknown) => {
    if (typeof row.id !== 'number') throw new Error('Row ID is required')
    const change: DataChange = {
      clientChangeId: `cell-${entityId}-${row.id}-${field}-${Date.now()}`,
      entityId,
      action: 'update',
      rowId: row.id,
      before: { [field]: row[field] },
      after: { [field]: value },
    }
    const result = await dataApi.save([change])
    if (result.committed < 1) throw new Error('Save rejected')
    setLoadedRows(
      entityId,
      (loadedRows[entityId] ?? []).map((item) =>
        item.id === row.id ? { ...item, [field]: value } : item,
      ),
    )
    notify.success('Cell updated')
  }

  if (!selectedPage || entityIds.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        No entities configured for this page.
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {entityIds.map((entityId) => {
        const config = DATA_ENTITY_REGISTRY[entityId]
        if (!config) return null
        const rows = loadedRows[entityId] ?? []
        const isLoading = loading[entityId] ?? false

        return (
          <DataSection
            key={entityId}
            entityId={entityId}
            title={config.label}
            instruction="Double-click a cell to edit."
            rowCount={rows.length}
            defaultExpanded
            onAdd={config.creatable ? () => setCreating({ entityId, mode: 'add' }) : undefined}
          >
            {config.filterFields && config.filterFields.length > 0 && (
              <DataBasicFilter
                filterFields={config.filterFields}
                onSearch={(f) => {
                  setActiveFilters((prev) => ({ ...prev, [entityId]: f }))
                  loadEntity(entityId, { filters: f })
                }}
                onClear={() => {
                  setActiveFilters((prev) => ({ ...prev, [entityId]: {} }))
                  loadEntity(entityId)
                }}
              />
            )}
            <DataGrid
              entityId={entityId}
              rows={rows}
              loading={isLoading}
              onCopyRow={(row) => setCreating({ entityId, mode: 'copy', initialValues: row })}
              onDeleteRow={(row) => handleDelete(entityId, row)}
              onCellCommit={(row, field, value) => handleCellCommit(entityId, row, field, value)}
            />
          </DataSection>
        )
      })}

      {creating && (
        <DataEditDialog
          entityId={creating.entityId}
          row={null}
          initialValues={creating.initialValues}
          mode={creating.mode}
          open={true}
          onOpenChange={(open) => { if (!open) setCreating(null) }}
          onSaved={() => {
            loadEntity(creating.entityId, { filters: activeFilters[creating.entityId] })
          }}
        />
      )}
    </div>
  )
}
