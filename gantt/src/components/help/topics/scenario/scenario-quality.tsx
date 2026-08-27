import { HelpStep, HelpNote, HelpControlsRef } from '../../help-article'

export default function ScenarioQuality() {
  return (
    <>
      <HelpStep n={1}>
        Open a <strong>Scenario</strong> that has finished optimizing, so its roster is loaded. In the{' '}
        <strong>Roster</strong> pane toolbar, click the <strong>Gauge</strong> icon (tooltip{' '}
        <em>Quality Analyzer — roster quality per crew</em>). This button is Scenario-only — it does not
        appear on the Live roster.
      </HelpStep>

      <HelpStep n={2}>
        The <strong>Roster Quality Analyzer</strong> opens in a master–detail layout grouped by
        quality rule. The left panel lists each <strong>QLTY</strong> criterion with the number of affected
        crew; click a rule to see its crew table on the right. Each row shows <strong>Crew ID</strong>,{' '}
        <strong>Base/Rank</strong>, <strong>Awarded credit</strong> (
        <em>Before opt</em> / <em>After opt</em>), and the finding detail for that rule.
      </HelpStep>

      <HelpStep n={3}>
        Four quality checks are available — select each in the left nav to review affected crew:
        <ul className="mt-1 ml-4 list-disc space-y-0.5">
          <li><strong>Qlty-1001 Standalone RES</strong> — an isolated reserve/standby day with no adjacent reserve day (the client expects at least 2 consecutive).</li>
          <li><strong>Qlty-1002 Working &gt;6d</strong> — a run of more than 6 consecutive working days.</li>
          <li><strong>Qlty-1003 Day-off only</strong> — a crew whose whole roster is days off, with no flying or reserve assignment (usually a data issue).</li>
          <li><strong>Qlty-1004 Max working days</strong> — flight crew with more than the configured working-day limit in the scenario period.</li>
        </ul>
      </HelpStep>

      <HelpStep n={4}>
        The dialog opens with <strong>Issues only</strong> ticked, so the left nav lists only rules with
        open findings and the table shows affected crew for the selected rule. Untick it to list every rule
        (including those with zero findings) and every crew for the selected rule. Use the crew filter on
        the right to narrow a long list. Click any <strong>Crew ID</strong> to bring that crew to the top
        of the roster — the dialog stays open.
      </HelpStep>

      <HelpStep n={5}>
        Click <strong>Parameters</strong> to open the <strong>Parameter Configuration</strong> tab.
        You can adjust <strong>Min consecutive RES days</strong>,{' '}
        <strong>Max consecutive working days</strong>, <strong>Max working days in period</strong>,{' '}
        <strong>Non-working assignment codes</strong>, and <strong>Applicable divisions</strong>.
        Click <strong>Save &amp; Re-analyze</strong> to apply the session-only thresholds, or{' '}
        <strong>Cancel</strong> to return without changing them.
      </HelpStep>

      <HelpNote>
        Open the Analyzer before a result is loaded and it shows <em>No crew loaded — open a scenario
        with an optimization result.</em> When <strong>Issues only</strong> is on and nothing is flagged,
        it shows <em>No crew with open quality findings.</em>
      </HelpNote>

      <HelpControlsRef items={[
        { name: 'Quality Analyzer (Gauge)', description: 'Scenario roster-pane toolbar button. Opens the QLTY-grouped quality analyzer. Not shown on Live.' },
        { name: 'Quality rules (left nav)', description: 'Lists each QLTY criterion with affected crew count. Click to view that rule\'s crew table.' },
        { name: 'Issues only', description: 'Default-on filter: left nav shows only rules with findings; table shows affected crew for the selected rule. Untick to show all rules and all crew per rule.' },
        { name: 'Filter crew', description: 'Narrows the right-hand crew table by crew id, base or rank.' },
        { name: 'Crew ID link', description: 'Brings that crew to the top row of the roster; the dialog stays open.' },
        { name: 'Awarded credit', description: 'Two rows per crew — Before opt is live pre-assignment credit; After opt is newly added CR credit from pairings and credited reserve duties.' },
        { name: 'Parameters', description: 'Opens Parameter Configuration for session-only quality thresholds.' },
        { name: 'Save & Re-analyze', description: 'Applies the draft parameter values and returns to the Quality Analyzer tab.' },
      ]} />
    </>
  )
}
