import { HelpStep, HelpNote, HelpScreenshot, HelpControlsRef } from '../../help-article'

export default function LiveRuleSet() {
  return (
    <>
      <HelpStep n={1}>
        Click the <strong>rule set selector</strong> in the toolbar — the{' '}
        <strong>shield-check icon</strong> followed by the active division and rule set&apos;s name
        (for example <em>P · 103</em>; on narrow screens only the icon appears, with a{' '}
        <em>Rule Set</em> tooltip).
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/live-ruleset-open.png"
        alt="Rule set dropdown open showing the Division P and Division C entries with their enabled rule sets"
        caption="Each entry is a division (Division P or Division C) with that division's enabled rule set underneath. The active division has a tick and a coloured shield."
      />
      <HelpStep n={2}>
        Click <strong>Division P</strong> or <strong>Division C</strong> to switch to that
        division&apos;s enabled rule set (shown underneath as <em>P · name</em> / <em>C · name</em>).
        Picking a division also <strong>narrows the crew and pairing filters</strong> to that
        division. Switching <strong>clears the current violation highlights</strong>; the new rule
        set is then applied as you continue editing — each change you make is re-checked against it,
        and a brief <em>Checking...</em> indicator appears on the right of the toolbar while a check
        runs.
      </HelpStep>

      <HelpNote>
        Different rule sets may be set up for different divisions, routes, fleets, or regulatory
        frameworks. Ask your system administrator if you are unsure which rule set to use.
      </HelpNote>

      <HelpControlsRef items={[
        { name: 'Rule set selector', description: 'Shield-check icon plus the active division and rule set name (e.g. P · 103). Click to open the list and switch divisions / rule sets; the active division is ticked.' },
        { name: 'Checking... indicator', description: 'Transient text on the right of the toolbar (next to the Create Ground Task button) shown while assignments are being re-checked.' },
      ]} />
    </>
  )
}
