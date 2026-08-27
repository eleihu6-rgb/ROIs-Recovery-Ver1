import { Play, Square, Eraser, XCircle, RefreshCw, ExternalLink, LoaderCircle, CheckCircle2, AlertCircle } from 'lucide-react'
import { HelpStep, HelpNote, HelpTip, HelpWarning, HelpH2, HelpScreenshot, HelpControlsRef } from '../../help-article'

export default function ScenarioRun() {
  return (
    <>
      <HelpH2>Before you run</HelpH2>

      <HelpStep n={1}>
        Make sure the following <strong>required fields</strong> are filled in before clicking
        Kick off run. If any are missing the pre-run check will block the optimization:
      </HelpStep>

      <table className="w-full text-xs mb-4 ml-7">
        <thead>
          <tr className="border-b border-border">
            <th className="py-1.5 pr-4 text-left font-semibold text-foreground w-2/5">Field</th>
            <th className="py-1.5 text-left font-semibold text-foreground">Why it matters</th>
          </tr>
        </thead>
        <tbody>
          {[
            { field: 'Start date', why: 'Defines the first day the engine will consider.' },
            { field: 'End date', why: 'Defines the last day of the optimization window.' },
            { field: 'Rule Set', why: 'Determines which compliance rules are applied during optimization.' },
            { field: 'Pairing Scenario', why: 'Selects which set of pairings to assign. Choose "0 - Live" to use current live pairings.' },
          ].map((r) => (
            <tr key={r.field} className="border-b border-border/50 last:border-0">
              <td className="py-1.5 pr-4 font-semibold text-foreground align-top">{r.field}</td>
              <td className="py-1.5 text-muted-foreground align-top">{r.why}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <HelpTip>
        Crew Filters and Pairing Filters are optional but recommended. Without them the engine
        will cover all crew and pairings in the date range, which takes longer and may produce
        noisier results.
      </HelpTip>

      <HelpH2>Starting the optimization</HelpH2>

      <HelpStep n={2}>
        Click the <strong>Play</strong> icon (Kick off run) in the scenario toolbar.
        If any required field is missing, a <strong>Pre-run Check</strong> dialog opens listing
        the blockers under <em>Must fix before running</em> in red. Fix each item and try again.
      </HelpStep>

      <HelpScreenshot
        src="/help/screenshots/scenario-run.png"
        alt="Pre-run check dialog showing red blockers and yellow warnings"
        caption="Red items must be fixed. Yellow warnings let you proceed with 'Proceed Anyway'."
      />

      <HelpStep n={3}>
        If there are only warnings (no blockers), a <strong>Proceed Anyway</strong> button
        appears. You can continue — but check the warnings first, as they indicate a broader
        scope that may slow the engine down.
      </HelpStep>

      <HelpStep n={4}>
        If the scenario has <strong>unsaved changes</strong>, an <strong>Unsaved changes</strong>{' '}
        dialog appears instead of starting immediately. Choose <strong>Save &amp; Run</strong> to
        save the scenario and start the optimization, or <strong>Cancel</strong> to keep editing.
        The run only starts after the scenario is saved.
      </HelpStep>

      <HelpStep n={5}>
        Once the engine accepts the job, a <strong>"Optimization started successfully"</strong>{' '}
        notification appears and the button immediately switches to an amber <strong>Stop</strong>{' '}
        icon. The status icon in the list turns into a spinning <strong>Running</strong> icon and
        the detail badge changes to <strong>Running</strong>.
      </HelpStep>

      <HelpStep n={6}>
        When the engine finishes, a notification confirms <strong>success</strong> or{' '}
        <strong>failure</strong>. The status badge changes to:
        <ul className="mt-1.5 space-y-1 list-none pl-0">
          <li><strong>Done</strong> — optimization completed. Results appear below.</li>
          <li><strong>Failed</strong> — engine could not complete. Review filters and re-run.</li>
        </ul>
      </HelpStep>

      <HelpStep n={7}>
        If the scenario appears stuck in <strong>Running</strong> without a solver progress update,
        click the <strong>Refresh status</strong> button (RefreshCw icon) to re-check the status.
      </HelpStep>

      <HelpStep n={8}>
        To open the scenario in the Gantt view, click the <strong>Open scenario</strong> button
        (ExternalLink icon).
      </HelpStep>

      <HelpH2>Removing a result</HelpH2>

      <HelpStep n={9}>
        To discard a result and reset the scenario to <strong>Draft</strong>, click the{' '}
        <strong>Eraser</strong> icon (Remove result). The <strong>Remove Optimization Result</strong>{' '}
        confirmation dialog appears. Tick <strong>Delete all version files</strong> if you also want
        to permanently remove every archived optimizer version, then click{' '}
        <strong>Remove Result</strong>.
      </HelpStep>

      <HelpWarning>
        Removing a result deletes all KPI data for that run. Make a note of key numbers
        before removing if you need them for comparison.
      </HelpWarning>

      <HelpNote>
        If the status is <strong>Done</strong> and you want to re-run, you must first remove
        the existing result (Eraser icon) or the pre-run check will block the run.
      </HelpNote>

      <HelpControlsRef items={[
        { icon: <Play className="h-4 w-4 text-muted-foreground" />, name: 'Play icon (Kick off run)', description: 'Opens the pre-run check, prompts to save unsaved changes, then starts the optimization.' },
        { icon: <XCircle className="h-4 w-4 text-muted-foreground" />, name: 'Pre-run Check dialog', description: 'Lists blockers under Must fix before running (red) and warnings (amber). Blockers block the run; warnings allow Proceed Anyway.' },
        { icon: <Square className="h-4 w-4 text-amber-500" />, name: 'Stop icon (amber)', description: 'Appears while the engine is running. Click to kill the current run.' },
        { icon: <LoaderCircle className="h-4 w-4 text-blue-500" />, name: 'Running status', description: 'Blue badge with a spinning icon — optimization is in progress.' },
        { icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />, name: 'Done status', description: 'Green badge — optimization completed. Results appear below.' },
        { icon: <AlertCircle className="h-4 w-4 text-destructive" />, name: 'Failed status', description: 'Red badge — engine could not complete. Fix your settings and re-run.' },
        { icon: <RefreshCw className="h-4 w-4 text-muted-foreground" />, name: 'Refresh status', description: 'Re-checks the run status when a scenario appears stuck in Running.' },
        { icon: <ExternalLink className="h-4 w-4 text-muted-foreground" />, name: 'Open scenario', description: 'Opens the scenario in the Gantt view.' },
        { icon: <Eraser className="h-4 w-4 text-muted-foreground" />, name: 'Eraser icon (Remove result)', description: 'Reverts the scenario to Draft after confirmation. Optionally deletes all version files.' },
      ]} />
    </>
  )
}
