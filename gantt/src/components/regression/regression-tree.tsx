import { Layers, FlaskConical } from 'lucide-react'
import { cn } from '@rois/ui'
import { useRegressionUiStore } from '@/stores/regression-ui-store'

interface RegressionTreeProps {
  isCollapsed?: boolean
}

/**
 * Regression sidebar navigation tree.
 *
 * Lists one item per test category (mirroring the grouped sections in the main
 * list) plus an "All Tests" item. Selecting an item drives the shared
 * `categoryFilter`, which the main RegressionView list filters on.
 */
export const RegressionTree = ({ isCollapsed = false }: RegressionTreeProps) => {
  const categories = useRegressionUiStore((s) => s.categories)
  const categoryFilter = useRegressionUiStore((s) => s.categoryFilter)
  const setCategoryFilter = useRegressionUiStore((s) => s.setCategoryFilter)

  const total = categories.reduce((n, c) => n + c.total, 0)

  const renderItem = (
    id: string,
    label: string,
    count: number,
    active: boolean,
    onClick: () => void,
    Icon: typeof Layers,
  ) => (
    <div
      key={id}
      role="button"
      tabIndex={0}
      data-testid={`regression-tree-item-${id}`}
      aria-current={active ? 'true' : undefined}
      onClick={onClick}
      title={label}
      className={cn(
        'flex items-center gap-2.5 overflow-hidden whitespace-nowrap border-l-2 px-3 py-1.5 text-xs transition-colors duration-100',
        active
          ? 'border-sidebar-primary bg-sidebar-accent font-semibold text-sidebar-accent-foreground cursor-default'
          : 'cursor-pointer border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!isCollapsed && <span className="flex-1 truncate">{label}</span>}
      {!isCollapsed && (
        <span
          className={cn(
            'shrink-0 rounded-full px-1.5 text-2xs font-semibold tabular-nums',
            active ? 'bg-sidebar-primary/20 text-sidebar-accent-foreground' : 'bg-sidebar-accent/60 text-sidebar-foreground/60',
          )}
        >
          {count}
        </span>
      )}
    </div>
  )

  return (
    <nav data-testid="regression-tree" className="flex flex-col gap-0.5">
      {!isCollapsed && (
        <div className="px-3 pb-1 pt-2 text-3xs font-bold uppercase tracking-widest text-sidebar-foreground/40">
          Categories
        </div>
      )}
      {renderItem('all', 'All Tests', total, categoryFilter === '', () => setCategoryFilter(''), Layers)}
      {categories.map((c) =>
        renderItem(c.name, c.name, c.total, categoryFilter === c.name, () => setCategoryFilter(c.name), FlaskConical),
      )}
    </nav>
  )
}
