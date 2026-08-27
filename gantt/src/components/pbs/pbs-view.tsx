import { type ReactNode } from 'react'
import { PbsAdminTools } from './pbs-admin-tools'
import { PbsBusinessTimeView } from './pbs-business-time-view'
import { PbsPeriodView } from './pbs-period-view'
import { PbsBidDefinitionsView } from './pbs-bid-definitions-view'
import { PbsSimulatedCrewPortalView } from './pbs-simulated-crew-portal-view'
import { useShellStore } from '@/stores/shell-store'
import { useMenuStore } from '@/stores/menu-store'

export const PbsView = (): ReactNode => {
  const activePbsItem = useShellStore((s) => s.activePbsItem)
  const setPbsItem = useShellStore((s) => s.setPbsItem)
  const canAccessMenu = useMenuStore((s) => s.canAccessMenu)

  // PBS sub-views all hit module-gated endpoints on mount. Use the menu
  // permission (PBS) as the gate instead of users.is_admin so non-admins who
  // have been granted the PBS menu can land here. Top nav / sidebar already
  // filter the tab based on the same permission; this is defense-in-depth
  // against a stale localStorage restore.
  if (!canAccessMenu('PBS')) {
    return null
  }

  if (activePbsItem === 'admin-tools') {
    return <PbsAdminTools />
  }

  if (activePbsItem === 'bid-definitions') {
    return <PbsBidDefinitionsView />
  }

  if (activePbsItem === 'business-time') {
    return <PbsBusinessTimeView />
  }

  if (activePbsItem === 'simulated-crew-portal') {
    return <PbsSimulatedCrewPortalView />
  }

  return <PbsPeriodView />
}
