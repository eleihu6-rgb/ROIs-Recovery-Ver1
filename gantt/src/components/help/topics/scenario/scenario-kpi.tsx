import { HelpStep, HelpNote, HelpScreenshot, HelpH2 } from '../../help-article'

export default function ScenarioKpi() {
  return (
    <>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        When a scenario reaches <strong>Done</strong> status, the detail panel shows a tab rail
        with six tabs: <strong>KPI</strong>, <strong>Credit Hours</strong>,{' '}
        <strong>Uncovered</strong>, <strong>Distribution</strong>, <strong>Versions</strong>, and{' '}
        <strong>Notes</strong>.
        They summarize what the optimization produced — and <strong>Notes</strong> additionally
        stays available while the scenario is still a Draft.
      </p>

      <HelpH2>KPI — headline numbers</HelpH2>
      <HelpStep n={1}>
        The <strong>KPI</strong> tab shows one card per key metric — the metric name, the
        optimized value, and a short description. If the run failed, a red banner explains that
        you should review the configuration and resubmit.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/scenario-detail-done.png"
        alt="Scenario detail panel in Done state showing the result tab rail and a grid of KPI cards"
        caption="The KPI tab shows one card per key metric from the optimization result."
      />

      <HelpH2>Credit Hours — per-crew credited hours</HelpH2>
      <HelpStep n={2}>
        The <strong>Credit Hours</strong> tab reviews credited hours per crew. The{' '}
        <strong>Credit Hours per Crew</strong> table lists each crew&apos;s{' '}
        <strong>Crew Id</strong>, <strong>Base</strong>,{' '}
        <strong>Rank</strong>, <strong>Credited Hours</strong>, <strong>Credit Min</strong> /{' '}
        <strong>Credit Max</strong>, <strong>Pre Assigned Types</strong>, <strong>In Range</strong>,{' '}
        <strong>Available Days</strong>, <strong>Per Day Rate</strong>, <strong>Period Credit Target</strong>,{' '}
        <strong>Target Gap</strong>, <strong>Preassign Rest Days</strong>, <strong>Required Dayoff</strong>,{' '}
        <strong>Actual Dayoff</strong>, and <strong>Dayoff Ok</strong>. Use the search box to
        filter rows or the <strong>CSV</strong> button to export.
      </HelpStep>

      <HelpH2>Uncovered — demand the run could not fill</HelpH2>
      <HelpStep n={3}>
        The <strong>Uncovered</strong> tab shows a single table —{' '}
        <strong>Uncovered Pairings &amp; Reserves</strong> — matching the Report&apos;s Results
        dialog. It lists the pairing-complement rows the solver left unassigned,{' '}
        <strong>Pairing</strong> first then <strong>Reserve</strong>, with the row count in the
        table header. The columns are <strong>Type</strong>, <strong>Pairing Id</strong>,{' '}
        <strong>Task Id</strong>, <strong>Name</strong>, <strong>Base</strong>,{' '}
        <strong>Rank</strong>, <strong>Start Base</strong> / <strong>End Base</strong> (shown in
        the base&apos;s local time), and <strong>Credit</strong>. When every pairing is covered,
        the table is empty.
      </HelpStep>

      <HelpH2>Distribution — daily slot-day spread</HelpH2>
      <HelpStep n={4}>
        The <strong>Distribution</strong> tab shows the daily slot-day distribution. The{' '}
        <strong>Both</strong> / <strong>Pairing</strong> / <strong>Reserve</strong> type filter
        and the <strong>Chart</strong> / <strong>Table</strong> view toggle always apply; when
        the report-shaped source is present, <strong>Rank</strong> (All ranks or a specific
        rank) and <strong>Timezone</strong> (UTC or a base&apos;s local time) filters join them.
        Tiles summarise <strong>Assigned slots</strong>, <strong>Uncovered slots</strong>,{' '}
        <strong>Peak day load</strong>, and <strong>Crew utilization</strong>. The two charts —{' '}
        <strong>Daily duty load vs available crew</strong> and <strong>Uncovered demand</strong>{' '}
        — share a linked cursor and tooltips, with a legend (Pairing in blue, Reserve in amber,
        Available crew in green), weekend bands, and month separators. The table view shows the{' '}
        <strong>Daily Distribution</strong> rows — <strong>Day</strong>,{' '}
        <strong>Pairing</strong>, <strong>Reserve</strong>, <strong>On duty</strong>,{' '}
        <strong>Available</strong>, <strong>Idle</strong>, <strong>Unc. pairing</strong>,{' '}
        <strong>Unc. reserve</strong> — with weekend rows highlighted and a{' '}
        <strong>Σ slot-days</strong> totals row.
      </HelpStep>

      <HelpH2>Versions — archived optimization runs</HelpH2>
      <HelpStep n={5}>
        The <strong>Versions</strong> tab lists the archived optimization versions with{' '}
        <strong>Version</strong>, <strong>Executed By</strong>, <strong>Executed At</strong>,{' '}
        <strong>File Timestamp</strong>, <strong>Size</strong>, and <strong>Actions</strong>. The
        current version carries a <strong>Current</strong> badge. Actions let you{' '}
        <strong>Open Gantt</strong> on a version, view <strong>Differences</strong> (a dialog
        comparing <strong>Algorithm Parameters</strong> and <strong>Regulatory Parameters</strong>,
        with changed values in red and “Only in archived version” / “Only in current scenario”
        markers), or <strong>delete</strong> a non-current version via the{' '}
        <strong>Delete Scenario Version</strong> dialog.
      </HelpStep>

      <HelpH2>Notes — questions and replies on this scenario</HelpH2>
      <HelpStep n={6}>
        The <strong>Notes</strong> tab records questions about the scenario and the replies
        they receive. The header shows a red <strong>N open</strong> badge counting the
        unanswered questions. The composer posts a question — <strong>Your name</strong> is
        prefilled with your user code and can be changed. Each message carries a{' '}
        <strong>Q</strong> (question) or <strong>A</strong> (reply) label and a full date-time
        byline; a question with no replies is marked <strong>unanswered</strong>. Each message
        can be <strong>replied to</strong> (nested under the question), <strong>edited</strong>{' '}
        (the original author is kept), or <strong>deleted</strong> (with its replies).{' '}
        <strong>Clear messages</strong> removes every note for the scenario. Notes survive{' '}
        <strong>Remove Result</strong> and are deleted together with the scenario.
      </HelpStep>

      <HelpNote>
        The result tabs (KPI, Credit Hours, Uncovered, Distribution, Versions) are read-only —
        they summarise what the engine produced. To improve the result, change your scenario
        settings and re-run. <strong>Notes</strong> is interactive and available in Draft.
      </HelpNote>
    </>
  )
}
