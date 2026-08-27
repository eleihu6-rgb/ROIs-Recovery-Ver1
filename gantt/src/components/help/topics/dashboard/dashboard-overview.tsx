import { HelpH2 } from '../../help-article'

export default function DashboardOverview() {
  return (
    <>
      <HelpH2>What the Dashboard shows</HelpH2>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        The <strong className="text-foreground">Dashboard</strong> tab is the first operational
        summary screen. It gives planners a compact status view before they open a detailed
        workspace such as Live, Scenario, Data, Legality, System, PBS, or Release.
      </p>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        The top stat cards show today&apos;s scheduled departures, active crew, current rule-check
        violations, and pending approvals. Lower cards summarize crew by rank and flight activity
        over the recent operating window.
      </p>

      <HelpH2>Main actions</HelpH2>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Use <strong className="text-foreground">Refresh</strong> to reload the dashboard numbers.
        If a data source is not ready, the related card remains empty or shows an integration-pending
        state instead of blocking the rest of the page.
      </p>
    </>
  )
}
