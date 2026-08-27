// gantt/src/components/res-pairing/res-pairing-planner-dialog.tsx
//
// RES Pairing Planner dialog shell — Live-only feature.
// Two visible tabs: Define / Manage existing.
// Define tab wired in Task E; Review/Manage are stubs until tasks F/G.
import { Calendar } from 'lucide-react'
import { AppDialog } from '@rois/ui'
import { useResPlannerStore } from '@/stores/res-planner-store'
import type { ResPlannerTab } from '@/stores/res-planner-store'
import { DefineWorkspace } from './define-workspace'
import { ManageExisting } from './manage-existing'

const TABS: { id: Extract<ResPlannerTab, 'define' | 'manage'>; label: string; testId: string }[] = [
  { id: 'define', label: 'Define', testId: 'res-tab-define' },
  { id: 'manage', label: 'Manage existing', testId: 'res-tab-manage' },
]

/** Tab body — review is intentionally folded into Define. */
const TabBody = ({ tab }: { tab: ResPlannerTab }) => {
  if (tab === 'manage') {
    return <ManageExisting />
  }
  return <DefineWorkspace />
}

/**
 * RES Pairing Planner dialog (Live-only, mounted once in AppLayout).
 * Driven by useResPlannerStore: open/close + tab.
 */
export const ResPairingPlannerDialog = () => {
  const isOpen = useResPlannerStore((s) => s.isOpen)
  const close = useResPlannerStore((s) => s.close)
  const tab = useResPlannerStore((s) => s.tab)
  const setTab = useResPlannerStore((s) => s.setTab)
  const activeTab = tab === 'manage' ? 'manage' : 'define'

  return (
    <AppDialog
      open={isOpen}
      onOpenChange={(open) => { if (!open) close() }}
      data-testid="res-planner-dialog"
      className="sm:max-w-[1100px]"
      icon={<Calendar className="h-4 w-4" />}
      title="RES Pairing Planner"
    >
      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            data-testid={t.testId}
            className={[
              'px-4 py-2 text-sm font-medium transition-colors',
              activeTab === t.id
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab body */}
      <TabBody tab={tab} />
    </AppDialog>
  )
}
