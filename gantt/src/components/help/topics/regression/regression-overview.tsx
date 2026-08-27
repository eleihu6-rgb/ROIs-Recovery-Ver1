import { HelpStep, HelpNote, HelpControlsRef } from '../../help-article'
import { useHelpExamples } from '../../use-help-examples'

export default function RegressionOverview() {
  const ex = useHelpExamples()
  return (
    <>
      <HelpStep n={1}>
        Open the <strong>Regression</strong> tab. Use the filter bar at the top —{' '}
        <strong>Category</strong>, <strong>Priority</strong>, <strong>Source</strong>, and{' '}
        <strong>Status</strong> dropdowns plus the search box — to narrow the catalog, then click{' '}
        <strong>Add Test</strong> to create one from a plain-English story. Describe what should
        happen — for example, &ldquo;filtering the roster to {ex.base} shows a {ex.base} chip and
        only {ex.base} crew rows&rdquo;. Pick a category and priority, then save.
      </HelpStep>

      <HelpNote>
        The Regression tab is backed by a separate AI service. In environments
        where that backend is not deployed, the tab shows{' '}
        <strong>Regression backend not available in this environment</strong>{' '}
        instead of the test catalog.
      </HelpNote>

      <HelpStep n={2}>
        Click the <strong>wand</strong> button on the test row. The AI writes Playwright code
        from your story. If the code preview shows red issue chips (for example a missing
        assertion), click <strong>Regenerate with fixes</strong> until the chips are gone, then
        click <strong>Apply</strong>.
      </HelpStep>

      <HelpStep n={3}>
        Each category header has its own <strong>Run</strong> button. To run the whole catalog,
        click <strong>Run All</strong> (it runs all non-quarantined tests, failing cases first;
        when filters are active the button shows and runs the filtered count instead). A status
        bar at the bottom shows live progress; results update when the run finishes.
      </HelpStep>

      <HelpStep n={4}>
        Watch the stability badges. A test&apos;s badge shows <strong>Nx stable</strong> when every
        run has passed, otherwise <strong>N% fail</strong>. A separate <strong>N% unstable</strong>{' '}
        badge counts pass/fail flips over recent runs. When a test is too unstable, quarantine it
        with the <strong>shield</strong> button — its tooltip reads &ldquo;Quarantine excludes this
        test from Run All until it is stable&rdquo;, and it is excluded from Run All until it is
        stable, then released automatically.
      </HelpStep>

      <HelpStep n={5}>
        Expand the chevron on any test row. The left column shows the <strong>Test story</strong> —
        click <strong>Edit</strong> to update it and <strong>Save</strong> to keep the change. The
        right column holds the <strong>Pass conditions</strong>. Below that, the version history
        lists each run round with an <strong>evidence snapshot</strong> — a screenshot taken at the
        assertion point. Failed rounds show a <strong>Diagnose</strong> button — click it to get an
        AI explanation of whether the failure is a code bug, a data gap, or a test issue.
      </HelpStep>

      <HelpStep n={6}>
        When you mention a specific value like a fleet code, crew ID, or flight number in a pass
        condition, the system automatically detects it and opens the{' '}
        <strong>entity disambiguation</strong> panel headed{' '}
        <em>Specific value detected</em>. Answer <strong>Is this intentional?</strong> with{' '}
        <strong>Yes, it is</strong> or <strong>No, let me correct it</strong>. If the value is
        intentional, choose a condition:
        <br />
        <br />
        <strong>Condition A — UI must return data</strong> if the value should exist in the app.
        The test fails if the result is empty — this catches data gaps and AI illusions where the
        AI assumed something existed when it does not.
        <br />
        <br />
        <strong>Condition B — UI shows empty state</strong> if you are deliberately testing a
        value that is not in the dataset. The test passes only if the UI handles the absence
        gracefully (empty message, no crash).
        <br />
        <br />
        Click <strong>Confirm intent</strong> to apply the choice.
      </HelpStep>

      <HelpNote>
        Click <strong>Import specs</strong> once to load the existing automated test catalog.
        Conditions, entity intents, and evidence snapshots are preserved across runs and
        versions so you build up a traceable QA record over time — no code editing required.
      </HelpNote>

      <HelpControlsRef items={[
        { name: 'Filter bar', description: 'Category, Priority, Source, and Status dropdowns plus a search box that narrows the catalog.' },
        { name: 'Import specs', description: 'Registers the existing automated e2e tests as catalog entries. Safe to repeat — already-imported tests are skipped.' },
        { name: 'Add Test', description: 'Create a test from a plain-English story. No coding required.' },
        { name: 'Run All', description: 'Runs all non-quarantined runnable tests, failing cases first. With filters active it shows and runs the filtered count.' },
        { name: 'Category Run button', description: 'Runs all runnable tests in that category.' },
        { name: 'Wand (Generate)', description: 'AI writes Playwright code from the story and from any pass conditions you have set. Quality issues are flagged before you can apply.' },
        { name: 'Play (Run)', description: 'Runs the latest version of one test.' },
        { name: 'Flakiness badge', description: 'Shows Nx stable or N% fail for the test.' },
        { name: 'Unstable badge', description: 'Shows N% unstable — pass/fail flips over recent runs.' },
        { name: 'Shield (Quarantine)', description: 'Excludes an unstable test from Run All until it is stable. Auto-released once stable.' },
        { name: 'Chevron (History)', description: 'Shows the Test story, Pass conditions, version timeline, run outcomes, and evidence snapshots.' },
        { name: 'Test story', description: 'Plain-English description of what the test does — edit and save it in the expanded row.' },
        { name: 'Pass conditions', description: 'Plain-English rules that define what the test must verify. AI converts them to Playwright assertions.' },
        { name: 'Diagnose (failed rounds)', description: 'AI analyses a failed run and classifies the root cause: code bug, data gap, environment issue, or test bug — with a recommendation.' },
        { name: 'Condition A — UI must return data', description: 'Assert count > 0 for the specified entity. Fails if the result is empty. Use this to verify data exists and catch data gaps or AI illusions.' },
        { name: 'Condition B — UI shows empty state', description: 'Assert the UI gracefully handles an absent value (0 results, empty message). Passes when the app handles the absence correctly.' },
        { name: 'Evidence snapshot', description: 'Screenshot captured at the assertion point during a Playwright run. Click to open full size; trash icon to delete.' },
      ]} />
    </>
  )
}
