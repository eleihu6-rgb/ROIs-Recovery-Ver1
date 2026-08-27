import { HelpH2 } from '../../help-article'

export default function ReleaseOverview() {
  return (
    <>
      <HelpH2>What the Release tab shows</HelpH2>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        The <strong className="text-foreground">Release</strong> tab lists user-facing release
        notes for the Gantt application. Each note summarizes visible changes from a specific
        delivery window.
      </p>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        Release notes are organized so planners and testers can scan changes by product area,
        including Live, Scenario, Data, Legality, System, PBS, and global navigation.
      </p>

      <HelpH2>How to use release notes</HelpH2>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Open the latest release first when checking what changed after an update. Older releases
        remain available for audit, regression testing, and training context.
      </p>
    </>
  )
}
