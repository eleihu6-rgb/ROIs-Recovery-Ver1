import { HelpH2 } from '../../help-article'

export default function PbsOverview() {
  return (
    <>
      <HelpH2>What the PBS tab is for</HelpH2>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        The <strong className="text-foreground">PBS</strong> tab opens planning and bidding
        administration tools that sit alongside the Gantt workspace.
      </p>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        The submenu can include roster periods, bid definitions, business-time settings, admin
        tools, and the simulated crew portal entry point.
      </p>

      <HelpH2>How this relates to the portal</HelpH2>
      <p className="text-xs leading-relaxed text-muted-foreground">
        PBS administration in Gantt supports planning setup and operational control. Crew-facing
        bid entry and portal-specific help belong to the PBS Portal help center.
      </p>
    </>
  )
}
