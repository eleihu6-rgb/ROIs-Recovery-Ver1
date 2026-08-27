import { HelpStep, HelpNote, HelpControlsRef } from '../../help-article'

export default function SettingsDarkmode() {
  return (
    <>
      <HelpStep n={1}>
        Click the <strong>palette icon</strong> in the top-right corner to open the theme dropdown.
      </HelpStep>

      <HelpStep n={2}>
        Click the <strong>Dark Mode</strong> toggle at the bottom of the dropdown.
        The label switches between <em>Dark Mode</em> and <em>Light Mode</em> to show
        which will be applied next. The app switches modes immediately.
      </HelpStep>

      <HelpNote>
        The <strong>Dark Pro</strong> theme always uses dark mode regardless of this toggle —
        if you switch to Dark Pro, the toggle has no effect.
        All other themes respect the dark/light toggle independently.
      </HelpNote>

      <HelpControlsRef items={[
        { name: 'Dark Mode / Light Mode toggle', description: 'Switches the app between dark and light rendering. Your choice is saved automatically.' },
      ]} />
    </>
  )
}
