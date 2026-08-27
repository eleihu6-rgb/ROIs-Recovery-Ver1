import { useState } from 'react'
import { ChevronDown, ChevronRight, Database } from 'lucide-react'
import { DATA_TREE } from '@/config/data-entity-registry'
import type { DataTreeNode } from '@/config/data-entity-registry'
import { useDataMaintenanceStore } from '@/stores/data-maintenance-store'
import type { DataPageId } from '@/types/data-maintenance'
import { cn } from '@rois/ui'

function isLeaf(node: DataTreeNode): node is DataTreeNode & { id: DataPageId } {
  return !node.isRoot
}

interface TreeRootProps {
  node: DataTreeNode
}

const TreeRoot = ({ node }: TreeRootProps) => {
  const [expanded, setExpanded] = useState(true)
  const selectedPage = useDataMaintenanceStore((s) => s.selectedPage)
  const setSelectedPage = useDataMaintenanceStore((s) => s.setSelectedPage)

  const rootTestId =
    node.id === 'basic' ? 'data-tree-root-basic' :
    node.id === 'crew'  ? 'data-tree-root-crew'  :
    `data-tree-root-${node.id}`

  return (
    <div>
      {/* Root row */}
      <button
        type="button"
        data-testid={rootTestId}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/60 transition-colors"
      >
        {expanded
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        }
        <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{node.label}</span>
      </button>

      {/* Children */}
      {expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <button
              key={child.id}
              type="button"
              data-testid={`data-tree-item-${child.id}`}
              onClick={() => {
                if (isLeaf(child)) {
                  setSelectedPage(child.id as DataPageId)
                }
              }}
              className={cn(
                'flex w-full items-center gap-1.5 pl-8 pr-2 py-1 text-xs transition-colors',
                selectedPage === child.id
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
            >
              <span className="truncate">{child.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export const DataTree = () => {
  return (
    <nav
      data-testid="data-tree"
      className="flex flex-col gap-0.5 overflow-y-auto py-2"
    >
      {DATA_TREE.map((root) => (
        <TreeRoot key={root.id} node={root} />
      ))}
    </nav>
  )
}
