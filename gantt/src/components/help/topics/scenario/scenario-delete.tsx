import { HelpStep, HelpWarning, HelpControlsRef } from '../../help-article'

export default function ScenarioDelete() {
  return (
    <>
      <HelpStep n={1}>
        In the scenario list, hover over the row you want to delete. A{' '}
        <strong>⋯ menu button</strong> appears on the right side of the row.
        Click it to open the action menu (the same menu used for Duplicate).
      </HelpStep>

      <HelpStep n={2}>
        Click <strong>Delete</strong> (trash icon) in the menu. A confirmation dialog appears —
        click <strong>Delete</strong> again to confirm. The scenario is permanently removed
        from the list.
      </HelpStep>

      <HelpWarning>
        Deleting a scenario cannot be undone. All settings, filters, and KPI results for
        that scenario are permanently lost.
      </HelpWarning>

      <HelpControlsRef items={[
        { name: '⋯ menu → Delete', description: 'Appears on hover over any scenario row — the same menu as Duplicate. Opens a confirmation dialog.' },
        { name: 'Confirm Delete', description: 'Permanently removes the scenario and all its data.' },
      ]} />
    </>
  )
}
