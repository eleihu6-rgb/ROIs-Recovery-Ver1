import { HelpH2, HelpWarning } from '../help-article'
import { useActiveHelpTopic } from '../help-topic-context'

interface MenuTopicContent {
  purpose: string
  sections?: string[]
  partial?: string
  access?: string
}

const DATA_TOPICS: Record<string, MenuTopicContent> = {
  'data-org-base': { purpose: 'Maintain the organisational reference values used to group crew and operational data.', sections: ['Base: code, airline, name, and display order.', 'Department: branch code, branch name, parent code, division, and filiale.', 'Division: division code and description.'] },
  'data-rank': { purpose: 'Maintain rank codes used by crew records, qualification and composition data.', sections: ['Rank code, division, display order, and description.'] },
  'data-fleet-aircraft': { purpose: 'Maintain fleet definitions and individual aircraft registrations.', sections: ['Fleet: fleet code, description, group, aircraft type, and display order.', 'Aircraft: registration, airline, fleet, and aircraft type.'] },
  'data-location-route': { purpose: 'Maintain airport reference records used by scheduling and filters.', sections: ['Airport: airport code, airport name, city, and country.'], partial: 'Route and Hotel are registered data entities, but this page currently exposes Airport only.' },
  'data-assignment': { purpose: 'Maintain task codes and their operational grouping.', sections: ['Assignment: code, description, type, rest and credit-related settings, colours, and timing fields.', 'Assignment Group: group identity, display colour, overlap policy, and optimizer indicator.', 'Assignment Group Map: read-only resolved mapping from assignment groups to assignment codes.'] },
  'data-qualification': { purpose: 'Maintain qualification codes used in crew eligibility records.', sections: ['Qualification, description, filiale, division, and qualification group.'] },
  'data-composition': { purpose: 'Maintain crew-composition definitions and their rank and fleet-load rows.', sections: ['Composition: name, division, and display order.', 'Composition Rank: required rank and plan value for a composition.', 'Composition Load: fleet sequence with effective and expiry dates.'] },
  'data-roster-period': { purpose: 'Maintain the operational roster-period calendar.', sections: ['Roster-period code, name, year, start/end, publication date, paid date, and lock status.'] },
  'data-config-dictionary': { purpose: 'Maintain configurable dictionary values used throughout the product.', sections: ['Filter by Category, then review Parent Code, Code, Name, and Code Value.'] },
  'data-query': { purpose: 'Review the configured Query records available to the Data module.', sections: ['The current page loads the Query entity.'] },
  'data-holiday': { purpose: 'Maintain the holiday calendar used by operational date handling.', sections: ['Filter by Year and City.', 'Holiday rows include city, date, holiday, type, authority, country, and filiale.'] },
  'data-crew-master': { purpose: 'Review a crew member and the effective-dated records associated with that crew.', sections: ['Crew Basic, Crew Base, Crew Rank, Crew Fleet, Crew Qualification, and Crew Team.', 'The page also loads status, certificates, licences, language, entitlement, profile, seniority, memo, and KPI-adjustment records where available.'] },
  'data-crew-workload': { purpose: 'Crew workload summary is reserved for a future Data view.', partial: 'The current UI displays “This page is not yet implemented.”' },
}

const LEGALITY_TOPICS: Record<string, MenuTopicContent> = {
  'legality-tab-rule-sets': { purpose: 'Open the Rule Sets workspace to review rule-set cards, their enabled state, division/type scope, member rules, and parameter changes.', sections: ['Admins can create, edit, copy, delete, and add rules to a set.', 'Saving parameter changes marks affected rosters for recheck.'] },
  'legality-tab-rule-templates': { purpose: 'Browse the master rule catalog and its instances.', sections: ['Use the reference, category, function, and instance tree or table view.', 'Admins can add a rule to a set, copy a template into a new instance, and delete eligible rules.'] },
  'legality-tab-composition': { purpose: 'Open the composition workspace used by legality calculations.', partial: 'This is a valid route and permission target, but it is not currently exposed in the Legality sidebar.' },
  'legality-tab-comp-load': { purpose: 'Open the composition-load workspace used by legality calculations.', partial: 'This is a valid route and permission target, but it is not currently exposed in the Legality sidebar.' },
}

const SYSTEM_TOPICS: Record<string, MenuTopicContent> = {
  'system-scheduler': { purpose: 'Monitor scheduled jobs by service, select a job, use its controls, and review run history.' },
  'system-users': { purpose: 'Administer product user records, profile/role bindings, department membership, and access settings.', sections: ['Users table shows account, name, department, gender, email, branch, pyAbbr, role profile, status, and effective dates; create users with a one-step role + department picker.', 'Reset passwords, enable/disable accounts, and edit profile fields inline; save errors surface as toasts.'], access: 'Admin-only.' },
  'system-roles': { purpose: 'Administer roles, the menus and controls assigned to each role, and the data scope.', sections: ['Cascade-select menus and controls — toggling a parent applies the same visual state to every descendant.', 'Saving silently drops any orphan menus or controls that no longer exist; a confirmation toast lists the dropped codes.', 'Edit data scope and confirm successful saves via toast notifications.'], access: 'Admin-only.' },
  'system-menus': { purpose: 'Review the menu tree and manage menu-level permissions.', access: 'Admin-only.' },
  'system-pbs-users': { purpose: 'Administer PBS crew accounts, including enable/disable state, password reset, and detailed account fields.', sections: ['PBS Users table extends Users with email, telephone, branch, pyAbbr, gender, effective date, and expiry date.', 'Create, reset passwords, and edit profile fields inline; save errors surface as toasts.'], access: 'Admin-only.' },
  'system-departments': { purpose: 'Administer department records used by the organisation structure.', access: 'Admin-only.' },
  'system-queue-tasks': { purpose: 'Open the connector queue dashboard for repeatable jobs and task execution state.', partial: 'Supported by the System runtime, but not currently exposed in the sidebar.' },
  'system-grafana': { purpose: 'Open the Grafana operational dashboard for metrics and logs.', partial: 'Supported by the System runtime, but not currently exposed in the sidebar.' },
  'system-prometheus': { purpose: 'Open Prometheus to inspect metrics targets, queries, and scrape health.', partial: 'Supported by the System runtime, but not currently exposed in the sidebar.' },
  'system-windmill': { purpose: 'Open Windmill for scheduled scripts and operational automations.', partial: 'Supported by the System runtime, but not currently exposed in the sidebar.' },
  'system-data-quality': { purpose: 'Run periodic checks for data-integrity issues across Live database tables.', partial: 'Supported by the System runtime, but not currently exposed in the sidebar.' },
}

const PBS_TOPICS: Record<string, MenuTopicContent> = {
  'pbs-period': { purpose: 'Maintain PBS periods and their bidding timeline.', sections: ['Filter, refresh, add, edit, or delete a period.', 'Generate draft periods for a whole year and inspect the preview before saving.'] },
  'pbs-bid-definitions': { purpose: 'Maintain company definitions used by PBS bids and exports.', access: 'Admin-only.' },
  'pbs-business-time': { purpose: 'Set, clear, refresh, or roll PBS Business Time for development and testing.', sections: ['The setting affects the current PBS period, bid-window availability, remaining time, and Award period selection.'], access: 'Admin-only.' },
  'pbs-admin-tools': { purpose: 'Run PBS administrative file and roster operations.', sections: ['Download an algorithm package for a selected period.', 'Import crew bids and inspect import or roster-import run history, details, and rollback actions.'] },
  'pbs-simulated-crew-portal': { purpose: 'Configure and simulate a crew Portal login, then inspect simulation logs.', access: 'Admin-only.' },
}

const renderTopic = (topics: Record<string, MenuTopicContent>) => {
  const slug = useActiveHelpTopic()
  const topic = topics[slug]
  if (!topic) return null

  return (
    <>
      <HelpH2>What this page does</HelpH2>
      <p className="text-xs leading-relaxed text-muted-foreground">{topic.purpose}</p>
      {topic.sections && (
        <>
          <HelpH2>Current functions</HelpH2>
          <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
            {topic.sections.map((section) => <li key={section}>{section}</li>)}
          </ul>
        </>
      )}
      {topic.access && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{topic.access}</p>}
      {topic.partial && <HelpWarning>Partial — {topic.partial}</HelpWarning>}
    </>
  )
}

export const DataMenuTopic = () => renderTopic(DATA_TOPICS)
export const LegalityMenuTopic = () => renderTopic(LEGALITY_TOPICS)
export const SystemMenuTopic = () => renderTopic(SYSTEM_TOPICS)
export const PbsMenuTopic = () => renderTopic(PBS_TOPICS)
