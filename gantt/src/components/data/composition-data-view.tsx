import { DataSection } from './data-section'
import { DataGrid } from './data-grid'

export const CompositionDataView = () => {
  return (
    <div className="flex flex-col overflow-y-auto">
      <DataSection entityId="composition" title="Composition" defaultExpanded>
        <DataGrid entityId="composition" rows={[]} />
      </DataSection>

      <DataSection entityId="composition_rank" title="Composition Rank" defaultExpanded>
        <DataGrid entityId="composition_rank" rows={[]} />
      </DataSection>

      <DataSection entityId="composition_load" title="Composition Load" defaultExpanded>
        <DataGrid entityId="composition_load" rows={[]} />
      </DataSection>
    </div>
  )
}
