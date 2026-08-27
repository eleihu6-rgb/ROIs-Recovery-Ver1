import { Database } from 'lucide-react'
import { DataToolbar } from './data-toolbar'
import { CrewMasterView } from './crew-master-view'
import { BasicTablePage } from './basic-table-page'
import { MetadataView } from './metadata-view'
import { useDataMaintenanceStore } from '@/stores/data-maintenance-store'
import type { DataPageId } from '@/types/data-maintenance'

// ─── Placeholder for unimplemented pages ─────────────────────────────────────

interface PlaceholderDataPageProps {
  pageId: DataPageId | null
}

const PlaceholderDataPage = ({ pageId }: PlaceholderDataPageProps) => {
  const label = pageId
    ? pageId.replace(/[.-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground">
      <Database className="h-8 w-8 shrink-0 opacity-30" />
      {label ? (
        <>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs">This page is not yet implemented.</p>
        </>
      ) : (
        <p className="text-xs">Select a section from the left sidebar to begin.</p>
      )}
    </div>
  )
}

// ─── Main DataView ────────────────────────────────────────────────────────────

export const DataView = () => {
  const selectedPage = useDataMaintenanceStore((s) => s.selectedPage)

  const renderPage = () => {
    if (selectedPage === 'crew.master') return <CrewMasterView />
    if (selectedPage?.startsWith('basic.')) return <BasicTablePage />
    if (selectedPage === 'metadata.live' || selectedPage === 'metadata.scenario') return <MetadataView />
    return <PlaceholderDataPage pageId={selectedPage} />
  }

  return (
    <div
      data-testid="data-view"
      className="flex h-full w-full flex-col overflow-hidden"
    >
      <DataToolbar pageId={selectedPage} />
      <div className="flex flex-1 overflow-hidden">
        {renderPage()}
      </div>
    </div>
  )
}
