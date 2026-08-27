import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'

import { SYSTEM_TOOL_DEFINITIONS, type ActiveSystemItem } from '@/config/system-tools'
import { useShellStore } from '@/stores/shell-store'
import { useMenuStore } from '@/stores/menu-store'
import { DataQualityMonitor } from './data-quality-monitor'
import { SchedulerView } from './scheduler-view'
import { PermissionAdminPanel } from './permission-admin-panel'

const CUSTOM_COMPONENTS: Partial<Record<string, () => React.ReactNode>> = {
  'data-quality': () => <DataQualityMonitor />,
  scheduler: () => <SchedulerView />,
}

// Items that route to the in-app permission admin panel rather than an
// iframe-backed external tool. Each item's menu_code is the gate.
const ADMIN_ITEMS: ActiveSystemItem[] = ['user-mgmt', 'profile-mgmt', 'menu-mgmt', 'pbs-user-mgmt', 'dept-mgmt']

export const SystemView = () => {
  const activeSystemItem = useShellStore((s) => s.activeSystemItem)
  const setSystemItem = useShellStore((s) => s.setSystemItem)
  const [frameKey, setFrameKey] = useState(0)
  const canAccessPage = useMenuStore((s) => s.canAccessPage)

  // If localStorage restores an item the user has no menu permission for
  // (or it is fail-open and menus have since loaded), redirect to the first
  // tool they can actually see. canAccessPage short-circuits admin → true.
  useEffect(() => {
    if (canAccessPage(activeSystemItem)) return
    const fallback = SYSTEM_TOOL_DEFINITIONS.find((item) => canAccessPage(item.item))
    setSystemItem(fallback?.item ?? SYSTEM_TOOL_DEFINITIONS[0].item)
  }, [activeSystemItem, canAccessPage, setSystemItem])

  const tool = useMemo(
    () => SYSTEM_TOOL_DEFINITIONS.find((item) => item.item === activeSystemItem) ?? SYSTEM_TOOL_DEFINITIONS[0],
    [activeSystemItem],
  )

  // Permission gate: users without canAccessPage on the active item must not
  // see the underlying view. Top nav / sidebar already filter items by the
  // same permission; this is defense-in-depth against a stale localStorage
  // restore (the useEffect above will redirect on the next paint).
  if (!canAccessPage(activeSystemItem)) {
    return null
  }

  // 管理页直接渲染面板（tool 对 admin item 回退到 scheduler，未使用）
  if (ADMIN_ITEMS.includes(activeSystemItem as ActiveSystemItem)) {
    return <PermissionAdminPanel />
  }

  const CustomComponent = CUSTOM_COMPONENTS[tool.item]

  const openExternal = () => {
    if (tool.url) window.open(tool.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {!CustomComponent && (
        <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-card px-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">{tool.label}</div>
            <div className="truncate text-xs text-muted-foreground">{tool.description}</div>
          </div>
          <div className="hidden max-w-[42vw] truncate rounded-sm border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground md:block">
            {tool.url}
          </div>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => setFrameKey((key) => key + 1)}
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={openExternal}
            title="Open externally"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </header>
      )}

      <div className="min-h-0 flex-1 bg-background">
        {CustomComponent ? (
          <CustomComponent />
        ) : (
          <iframe
            key={`${tool.item}-${frameKey}`}
            title={tool.label}
            src={tool.url}
            className="h-full w-full border-0 bg-background"
          />
        )}
      </div>
    </div>
  )
}
