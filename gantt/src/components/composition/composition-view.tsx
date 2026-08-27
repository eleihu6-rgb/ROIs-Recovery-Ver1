import { useEffect, useState } from 'react'
import { useCompositionStore } from '@/stores/composition-store'
import { CompositionTree } from './composition-tree'
import { CompositionDetail } from './composition-detail'
import { CompositionCreateDialog } from './composition-create-dialog'

export const CompositionView = () => {
  const fetchAll = useCompositionStore((s) => s.fetchAll)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  return (
    <div data-testid="composition-view" className="flex h-full overflow-hidden">
      <CompositionTree onAdd={() => setCreateOpen(true)} />
      <CompositionDetail />
      <CompositionCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}