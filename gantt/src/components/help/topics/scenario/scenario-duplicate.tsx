import { HelpStep, HelpNote, HelpTip, HelpControlsRef } from '../../help-article'

export default function ScenarioDuplicate() {
  return (
    <>
      <HelpStep n={1}>
        In the scenario list, hover over the row you want to copy. A{' '}
        <strong>⋯ menu button</strong> appears on the right side of the row.
        Click it to open the action menu.
      </HelpStep>

      <HelpStep n={2}>
        Click <strong>Duplicate</strong> in the menu. The system creates a copy
        of the scenario — same type, date range, scope filters and all{' '}
        <strong>type-specific configuration</strong> — as a new <strong>Draft</strong>.
        The name is set to <em>&quot;Copy of [original name]&quot;</em>.
      </HelpStep>

      <HelpNote>
        A scenario&apos;s configuration is <strong>specific to its type</strong>, so the copy
        keeps whatever the original had:
        <ul className="mt-1.5 space-y-1 list-disc pl-5">
          <li><strong>PO</strong> — date range and the Flight scope filters (flight numbers, airports, fleets, status).</li>
          <li><strong>RO</strong> — adds Model, Rule Set, Pairing Scenario, and Crew / Pairing scope filters.</li>
          <li><strong>TO</strong> — the RO configuration plus the Training scope filters.</li>
        </ul>
      </HelpNote>

      <HelpStep n={3}>
        The new scenario is automatically selected and its detail panel opens on
        the right. The <strong>name field is highlighted</strong> — type a new
        name immediately to rename it, then press <strong>Save</strong> (disk icon)
        to confirm.
      </HelpStep>

      <HelpTip>
        Duplication does not copy optimization results or KPIs — only the setup
        parameters. Use it to create a variant of an existing scenario without
        re-entering all the filters from scratch.
      </HelpTip>

      <HelpControlsRef items={[
        { name: '⋯ menu → Duplicate', description: 'Appears on hover over any scenario row. Creates a Draft copy with all config fields.' },
        { name: 'Name field (auto-focused)', description: 'After duplication the name input is selected — type to rename without clicking first.' },
        { name: 'Save (disk icon)', description: 'Saves the new name and any other edits in the detail panel.' },
      ]} />
    </>
  )
}
