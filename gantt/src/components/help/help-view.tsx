// gantt/src/components/help/help-view.tsx
import { useState, lazy, Suspense, useRef, useEffect, Component } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { HelpNav } from './help-nav'
import { HelpHome } from './help-home'
import { HelpArticle } from './help-article'
import { ActiveHelpTopicContext } from './help-topic-context'

// Lazy-load each topic component to avoid bundling all content upfront
const TOPIC_MAP: Record<string, ComponentType> = {
  // Dashboard
  'dashboard-overview': lazy(() => import('./topics/dashboard/dashboard-overview')),
  // Live
  'live-overview':    lazy(() => import('./topics/live/live-overview')),
  'live-date-range':  lazy(() => import('./topics/live/live-date-range')),
  'live-filter':      lazy(() => import('./topics/live/live-filter')),
  'live-panes':          lazy(() => import('./topics/live/live-panes')),
  'live-pairing-label':  lazy(() => import('./topics/live/live-pairing-label')),
  'live-flight-navi':    lazy(() => import('./topics/live/live-flight-navi')),
  'live-edit':        lazy(() => import('./topics/live/live-edit')),
  'live-context-menu': lazy(() => import('./topics/live/live-context-menu')),
  'schedule-details':     lazy(() => import('./topics/live/schedule-details')),
  'daily-task-calendar':  lazy(() => import('./topics/live/daily-task-calendar')),
  'manday-info':          lazy(() => import('./topics/live/manday-info')),
  'crew-info':            lazy(() => import('./topics/live/crew-info')),
  'live-crew-memo':     lazy(() => import('./topics/live/live-crew-memo')),
  'live-res-pairing':   lazy(() => import('./topics/live/live-res-pairing')),
  'live-save-undo':   lazy(() => import('./topics/live/live-save-undo')),
  'live-ground-task': lazy(() => import('./topics/live/live-ground-task')),
  'live-source-column': lazy(() => import('./topics/live/live-source-column')),
  'live-timezone':    lazy(() => import('./topics/live/live-timezone')),
  'live-rule-set':    lazy(() => import('./topics/live/live-rule-set')),
  'live-zoom':        lazy(() => import('./topics/live/live-zoom')),
  'live-keyboard':    lazy(() => import('./topics/live/live-keyboard')),
  // Scenario
  'scenario-overview': lazy(() => import('./topics/scenario/scenario-overview')),
  'scenario-browse':   lazy(() => import('./topics/scenario/scenario-browse')),
  'scenario-create':    lazy(() => import('./topics/scenario/scenario-create')),
  'scenario-duplicate': lazy(() => import('./topics/scenario/scenario-duplicate')),
  'scenario-import':    lazy(() => import('./topics/scenario/scenario-import')),
  'scenario-filters':  lazy(() => import('./topics/scenario/scenario-filters')),
  'scenario-run':      lazy(() => import('./topics/scenario/scenario-run')),
  'scenario-kpi':      lazy(() => import('./topics/scenario/scenario-kpi')),
  'scenario-quality':  lazy(() => import('./topics/scenario/scenario-quality')),
  'scenario-publish':  lazy(() => import('./topics/scenario/scenario-publish')),
  'scenario-delete':   lazy(() => import('./topics/scenario/scenario-delete')),
  // Data
  'data-overview': lazy(() => import('./topics/data/data-overview')),
  'data-org-base': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.DataMenuTopic }))),
  'data-rank': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.DataMenuTopic }))),
  'data-fleet-aircraft': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.DataMenuTopic }))),
  'data-location-route': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.DataMenuTopic }))),
  'data-assignment': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.DataMenuTopic }))),
  'data-qualification': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.DataMenuTopic }))),
  'data-composition': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.DataMenuTopic }))),
  'data-roster-period': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.DataMenuTopic }))),
  'data-config-dictionary': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.DataMenuTopic }))),
  'data-query': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.DataMenuTopic }))),
  'data-holiday': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.DataMenuTopic }))),
  'data-crew-master': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.DataMenuTopic }))),
  'data-crew-workload': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.DataMenuTopic }))),
  // Legality tab
  'legality-tab-overview': lazy(() => import('./topics/legality-tab/legality-tab-overview')),
  'legality-tab-rule-sets': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.LegalityMenuTopic }))),
  'legality-tab-rule-templates': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.LegalityMenuTopic }))),
  'legality-tab-composition': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.LegalityMenuTopic }))),
  'legality-tab-comp-load': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.LegalityMenuTopic }))),
  // System
  'system-overview': lazy(() => import('./topics/system/system-overview')),
  'system-scheduler': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.SystemMenuTopic }))),
  'system-users': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.SystemMenuTopic }))),
  'system-roles': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.SystemMenuTopic }))),
  'system-menus': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.SystemMenuTopic }))),
  'system-pbs-users': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.SystemMenuTopic }))),
  'system-departments': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.SystemMenuTopic }))),
  'system-queue-tasks': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.SystemMenuTopic }))),
  'system-grafana': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.SystemMenuTopic }))),
  'system-prometheus': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.SystemMenuTopic }))),
  'system-windmill': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.SystemMenuTopic }))),
  'system-data-quality': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.SystemMenuTopic }))),
  // PBS
  'pbs-overview': lazy(() => import('./topics/pbs/pbs-overview')),
  'pbs-period': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.PbsMenuTopic }))),
  'pbs-bid-definitions': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.PbsMenuTopic }))),
  'pbs-business-time': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.PbsMenuTopic }))),
  'pbs-admin-tools': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.PbsMenuTopic }))),
  'pbs-simulated-crew-portal': lazy(() => import('./topics/menu-topics').then((module) => ({ default: module.PbsMenuTopic }))),
  // Release
  'release-overview': lazy(() => import('./topics/release/release-overview')),
  // Settings
  'settings-theme':    lazy(() => import('./topics/settings/settings-theme')),
  'settings-darkmode': lazy(() => import('./topics/settings/settings-darkmode')),
  'settings-signout':  lazy(() => import('./topics/settings/settings-signout')),
  // Legality rules
  'legality-overview':          lazy(() => import('./topics/legality/legality-overview')),
  'legality-rule-sets':         lazy(() => import('./topics/legality/legality-rule-sets')),
  'legality-rule-templates':    lazy(() => import('./topics/legality/legality-rule-templates')),
  'legality-edit-params':       lazy(() => import('./topics/legality/legality-edit-params')),
  'legality-2014':              lazy(() => import('./topics/legality/legality-2014')),
  'legality-2015':              lazy(() => import('./topics/legality/legality-2015')),
  'legality-7500':              lazy(() => import('./topics/legality/legality-7500')),
  'legality-7502':              lazy(() => import('./topics/legality/legality-7502')),
  'legality-7272':              lazy(() => import('./topics/legality/legality-7272')),
  'legality-8002-flight-time':  lazy(() => import('./topics/legality/legality-8002-flight-time')),
  'legality-8002-hours':        lazy(() => import('./topics/legality/legality-8002-hours')),
  'legality-7501':              lazy(() => import('./topics/legality/legality-7501')),
  'legality-7505':              lazy(() => import('./topics/legality/legality-7505')),
  'legality-7507':              lazy(() => import('./topics/legality/legality-7507')),
  'legality-7508':              lazy(() => import('./topics/legality/legality-7508')),
  'legality-7503':              lazy(() => import('./topics/legality/legality-7503')),
  'legality-7504':              lazy(() => import('./topics/legality/legality-7504')),
  'legality-7506':              lazy(() => import('./topics/legality/legality-7506')),
  'legality-1001':              lazy(() => import('./topics/legality/legality-1001')),
  'legality-8004':              lazy(() => import('./topics/legality/legality-8004')),
  'legality-8030':              lazy(() => import('./topics/legality/legality-8030')),
  'legality-8056':              lazy(() => import('./topics/legality/legality-8056')),
  // Glossary
  'glossary': lazy(() => import('./topics/glossary')),
}

class TopicErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
          This article could not be loaded. Try switching to another topic.
        </div>
      )
    }
    return this.props.children
  }
}

export const HelpView = () => {
  const [activeTopic, setActiveTopic] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    contentRef.current?.scrollTo(0, 0)
  }, [activeTopic])

  const TopicBody = activeTopic ? TOPIC_MAP[activeTopic] : null

  return (
    <div data-testid="help-view" className="flex h-full overflow-hidden">
      {/* Left nav — fixed width */}
      <div className="w-64 shrink-0 border-r border-border bg-muted/20">
        <HelpNav activeTopic={activeTopic} onTopicSelect={setActiveTopic} />
      </div>

      {/* Content area */}
      <div ref={contentRef} className="flex-1 overflow-y-auto bg-background">
        {!activeTopic && <HelpHome onTopicSelect={setActiveTopic} />}
        {activeTopic && TopicBody && (
          <TopicErrorBoundary>
            <Suspense fallback={
              <div className="flex h-32 items-center justify-center text-muted-foreground text-xs">
                Loading…
              </div>
            }>
              <ActiveHelpTopicContext.Provider value={activeTopic}>
                <HelpArticle slug={activeTopic}>
                  <TopicBody />
                </HelpArticle>
              </ActiveHelpTopicContext.Provider>
            </Suspense>
          </TopicErrorBoundary>
        )}
      </div>
    </div>
  )
}
