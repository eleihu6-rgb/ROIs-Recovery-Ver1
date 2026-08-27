import { HelpStep, HelpTip, HelpScreenshot, HelpControlsRef } from '../../help-article'
import { useHelpExamples } from '../../use-help-examples'

export default function ScenarioCreate() {
  const ex = useHelpExamples()
  return (
    <>
      <HelpStep n={1}>
        In the Scenario sidebar, pick the section for the type of scenario you want:{' '}
        <strong>Pairing</strong> for PO scenarios, <strong>Roster</strong> for RO scenarios, or{' '}
        <strong>All Scenarios</strong>. New scenarios inherit the type of the section you are in.
        <strong> Crew Bids</strong> is a separate review module, not a scenario type.
      </HelpStep>

      <HelpStep n={2}>
        Click the <strong>+</strong> (Create new scenario) button at the top of the scenario list.
        A new scenario is created right away with a <em>Draft</em> status and opens in the
        detail panel on the right.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/scenario-create-dialog.png"
        alt="A newly created Draft scenario open in the detail panel, with name, type, RP Date, and scenario options"
        caption="The new scenario opens on the right. Edit its name, roster period, and options directly in this panel."
      />

      <HelpStep n={3}>
        Edit the <strong>name</strong> at the top of the detail panel. Use something descriptive,
        for example <em>June PO — {ex.base} {ex.fleet}</em>.
      </HelpStep>

      <HelpStep n={4}>
        Set the period the scenario should cover with the <strong>RP Date</strong> selector in{' '}
        <strong>Basic Info</strong>. The <strong>Start</strong> and <strong>End</strong> date inputs
        are filled automatically from the selected roster period and are read-only.
      </HelpStep>

      <HelpStep n={5}>
        Fill in the other fields shown for the scenario type:
        <ul className="mt-1.5 space-y-1 list-none pl-0">
          <li><strong>Division</strong> — shown for PO and RO/TO scenarios (e.g. P / C).</li>
          <li><strong>Bases</strong> — PO scenarios: multi-select of home bases, defaults to All bases.</li>
          <li><strong>Rule Set</strong> and <strong>Pairing Sc.</strong> — RO/TO scenarios. Pairing Sc. 0 - Live uses the current live pairings.</li>
          <li><strong>Algorithm Parameters</strong> — RO/TO scenarios: button that shows Using defaults or Changed: … and opens the parameter dialog.</li>
          <li><strong>Comment</strong> — RO/TO scenarios: free-text notes with an Optional notes... placeholder.</li>
        </ul>
      </HelpStep>

      <HelpStep n={6}>
        Click the <strong>Save</strong> icon (floppy disk) in the toolbar to keep your changes.
        The icon shows a spinner while saving and then a success notification confirms the save.
        If nothing has changed the icon is greyed out and its tooltip reads <em>Saved</em>. The
        scenario stays in <em>Draft</em> status until you run it.
      </HelpStep>

      <HelpTip>
        The RO/TO <strong>Algorithm Parameters</strong> button opens a dialog with tabs for Credit
        Range, Floor Rescue, Reserve Priority, Min Reserve Coverage %, Day Pressure Spread, Team
        Rules, and Crew Bid. Once a value differs from the default, the button label changes to{' '}
        <em>Changed: …</em>. For a <em>Running</em> or <em>Published</em> scenario the dialog opens
        read-only — parameters can be reviewed but not changed.
      </HelpTip>

      <HelpControlsRef items={[
        { name: '+ (Create new scenario)', description: 'Creates a new Draft scenario of the current section type and opens it for editing.' },
        { name: 'Name field', description: 'A label for this scenario, shown at the top of the detail panel.' },
        { name: 'RP Date selector', description: 'Picks the roster period; fills the read-only Start / End date inputs.' },
        { name: 'Division', description: 'Select division — shown for PO and RO/TO scenarios.' },
        { name: 'Bases (PO)', description: 'Multi-select of home bases; defaults to All bases.' },
        { name: 'Rule Set', description: 'The compliance rule set applied during optimization (RO/TO).' },
        { name: 'Pairing Sc.', description: 'The pairing scenario to assign — 0 - Live uses the current live pairings (RO/TO).' },
        { name: 'Algorithm Parameters', description: 'Opens the parameter dialog; the label shows Using defaults or Changed: … (RO/TO).' },
        { name: 'Comment', description: 'Optional free-text notes on the scenario (RO/TO).' },
        { name: 'Save icon', description: 'Saves your edits. Shows a spinner while saving and a success toast on completion.' },
      ]} />
    </>
  )
}
