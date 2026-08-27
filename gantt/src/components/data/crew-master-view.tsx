import { useCallback, useEffect } from 'react'
import { useState } from 'react'
import { DataFilterBar } from './data-filter-bar'
import { DataSection } from './data-section'
import { DataGrid } from './data-grid'
import { DataEditDialog } from './data-edit-dialog'
import { dataApi } from '@/services/data-api'
import { useDataMaintenanceStore } from '@/stores/data-maintenance-store'
import { notify } from '@/utils/notify'
import type { DataEntityId, DataExpiryFilter, DataPageRow } from '@/types/data-maintenance'
import type { DataChange } from '@/types/data-maintenance'

const CREW_ENTITY = 'crew' as const

const PRIMARY_SUB_ENTITIES: DataEntityId[] = [
  'crew_base', 'crew_rank', 'crew_fleet', 'crew_qualification', 'crew_team',
]

const SECONDARY_SUB_ENTITIES: DataEntityId[] = [
  'crew_status', 'crew_certificate', 'crew_license', 'crew_language',
  'crew_entitlement', 'crew_memo', 'crew_seniority', 'crew_kpi_adjust',
]

const ALL_SUB_ENTITIES: DataEntityId[] = [
  ...PRIMARY_SUB_ENTITIES,
  ...SECONDARY_SUB_ENTITIES,
]

/** Split a crew ID input string by comma or period, returning trimmed non-empty IDs. */
const parseCrewIds = (input: string): string[] =>
  input.split(/[,.]/).map((s) => s.trim()).filter(Boolean)

function entityLabel(entityId: DataEntityId): string {
  return entityId
    .replace('crew_', 'Crew ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export const CrewMasterView = () => {
  const { crewFilter, setLoadedRows, loadedRows, selectedCrewId, setSelectedCrewId } =
    useDataMaintenanceStore()

  const [loadingCrew, setLoadingCrew] = useState(false)
  const [loadingSubResources, setLoadingSubResources] = useState(false)
  const [creating, setCreating] = useState<{ entityId: DataEntityId; initialValues: Record<string, unknown>; mode: 'add' | 'copy' } | null>(null)

  const fetchSubResources = useCallback(
    async (crewIds: string[]) => {
      if (crewIds.length === 0) return
      setLoadingSubResources(true)
      // Pass all IDs as comma-separated string; backend splits and merges.
      const crewId = crewIds.join(',')
      await Promise.allSettled(
        ALL_SUB_ENTITIES.map(async (entityId) => {
          try {
            const result = await dataApi.queryTable({
              pageId: 'crew.master',
              entityId,
              page: 1,
              pageSize: 500,
              filters: { crewId },
            })
            setLoadedRows(entityId, result.rows)
          } catch {
            setLoadedRows(entityId, [])
          }
        }),
      )
      setLoadingSubResources(false)
    },
    [setLoadedRows],
  )

  const fetchCrew = useCallback(async () => {
    setLoadingCrew(true)
    try {
      const ids = crewFilter.crewId ? parseCrewIds(crewFilter.crewId) : []
      const filters: Record<string, unknown> = {
        name: crewFilter.name || undefined,
        rank: crewFilter.rank && crewFilter.rank !== 'all' ? crewFilter.rank : undefined,
        base: crewFilter.base && crewFilter.base !== 'all' ? crewFilter.base : undefined,
      }
      if (ids.length > 1) {
        // Multiple exact IDs — use IN query
        filters.crewIds = ids
      } else if (ids.length === 1) {
        // Single ID — keep ILIKE partial match
        filters.empCode = ids[0]
      }
      const result = await dataApi.queryTable({
        pageId: 'crew.master',
        entityId: CREW_ENTITY,
        page: 1,
        pageSize: 200,
        filters,
        expiry: {
          scope: crewFilter.expiryScope as DataExpiryFilter['scope'],
          mode: crewFilter.expiryMode,
          referenceDate: crewFilter.referenceDate,
          days: crewFilter.expiryMode === 'expiring_in_days' ? crewFilter.expiryDays : undefined,
        },
      })
      setLoadedRows(CREW_ENTITY, result.rows)
      // Auto-load sub-resources when crew IDs are explicitly listed.
      if (ids.length > 0) {
        fetchSubResources(ids)
      }
    } catch {
      setLoadedRows(CREW_ENTITY, [])
    } finally {
      setLoadingCrew(false)
    }
  }, [crewFilter, setLoadedRows, fetchSubResources])

  // Auto-load crew on mount
  useEffect(() => {
    fetchCrew()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRowClick = useCallback(
    (row: DataPageRow) => {
      const crewId = String(row.crewId ?? row.crew_id ?? '')
      if (!crewId) return
      setSelectedCrewId(crewId)
      fetchSubResources([crewId])
    },
    [setSelectedCrewId, fetchSubResources],
  )

  const reloadAfterMutation = useCallback(
    (entityId: DataEntityId, row?: DataPageRow) => {
      if (entityId === CREW_ENTITY) {
        fetchCrew()
        return
      }
      const crewId = String(row?.crewId ?? row?.crew_id ?? selectedCrewId ?? '')
      if (crewId) fetchSubResources([crewId])
    },
    [fetchCrew, fetchSubResources, selectedCrewId],
  )

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
      reloadAfterMutation(entityId, row)
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

  const crewRows = loadedRows[CREW_ENTITY] ?? []

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden h-full">
      <DataFilterBar onSearch={() => fetchCrew()} />

      <div className="flex-1 overflow-y-auto">
        <DataSection entityId="crew" title="Crew Basic" rowCount={crewRows.length} defaultExpanded>
          <DataGrid
            entityId="crew"
            rows={crewRows}
            loading={loadingCrew}
            selectedRowId={selectedCrewId ? null : null}
            onRowClick={handleRowClick}
            onCopyRow={(row) => setCreating({ entityId: CREW_ENTITY, mode: 'copy', initialValues: row })}
            onDeleteRow={(row) => handleDelete(CREW_ENTITY, row)}
            onCellCommit={(row, field, value) => handleCellCommit(CREW_ENTITY, row, field, value)}
          />
        </DataSection>

        {PRIMARY_SUB_ENTITIES.map((entityId) => {
          const rows = loadedRows[entityId] ?? []
          return (
            <DataSection
              key={entityId}
              entityId={entityId}
              title={entityLabel(entityId)}
              rowCount={rows.length}
              defaultExpanded
            >
              <DataGrid
                entityId={entityId}
                rows={rows}
                loading={loadingSubResources && rows.length === 0}
                onCopyRow={(row) => setCreating({ entityId, mode: 'copy', initialValues: row })}
                onDeleteRow={(row) => handleDelete(entityId, row)}
                onCellCommit={(row, field, value) => handleCellCommit(entityId, row, field, value)}
              />
            </DataSection>
          )
        })}

        {SECONDARY_SUB_ENTITIES.map((entityId) => {
          const rows = loadedRows[entityId] ?? []
          return (
            <DataSection
              key={entityId}
              entityId={entityId}
              title={entityLabel(entityId)}
              rowCount={rows.length}
              defaultExpanded={false}
            >
              <DataGrid
                entityId={entityId}
                rows={rows}
                loading={false}
                onCopyRow={(row) => setCreating({ entityId, mode: 'copy', initialValues: row })}
                onDeleteRow={(row) => handleDelete(entityId, row)}
                onCellCommit={(row, field, value) => handleCellCommit(entityId, row, field, value)}
              />
            </DataSection>
          )
        })}
      </div>

      {creating && (
        <DataEditDialog
          entityId={creating.entityId}
          row={null}
          initialValues={creating.initialValues}
          mode={creating.mode}
          open={true}
          onOpenChange={(open) => { if (!open) setCreating(null) }}
          onSaved={() => reloadAfterMutation(creating.entityId, creating.initialValues)}
        />
      )}
    </div>
  )
}
