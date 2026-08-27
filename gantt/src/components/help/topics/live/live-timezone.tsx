import { HelpStep, HelpNote, HelpTip, HelpScreenshot, HelpControlsRef } from '../../help-article'
import { useHelpExamples } from '../../use-help-examples'

export default function LiveTimezone() {
  const ex = useHelpExamples()
  return (
    <>
      <HelpStep n={1}>
        Click the <strong>timezone selector</strong> in the toolbar. It shows a clock icon, the
        current airport code, and that airport&apos;s IANA timezone ID — e.g.{' '}
        <em>🕐 {ex.base} {ex.baseTz ?? 'local time'}</em>.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/live-timezone-open.png"
        alt="Timezone switcher dropdown open, headed 'Display Timezone', with UTC first, then Airline Bases, then Other Airports"
        caption="The dropdown is headed 'Display Timezone' and lists UTC first, then ★ Airline Bases, then ✈ Other Airports."
      />
      <HelpStep n={2}>
        Pick any entry. Each row shows the airport <strong>code</strong> and name, its{' '}
        <strong>timezone ID</strong>, and its <strong>UTC offset</strong> as an H:MM clock
        offset (e.g. <em>-4:00</em>); <strong>UTC</strong> itself shows no offset. The active
        one is ticked. The canvas immediately re-draws every time in the chosen zone.
      </HelpStep>

      <HelpNote>
        <strong>UTC</strong> always sits at the <em>top</em> of the list for quick access. The{' '}
        <strong>★ Airline Bases</strong> section lists your airline&apos;s home bases next, followed
        by <strong>✈ Other Airports</strong> for every other reference point.
      </HelpNote>

      <HelpTip>
        Switching zones keeps the <em>same calendar days</em> on screen: the loaded date range is
        re-anchored to local midnight in the new zone, so you do not silently lose or gain a day at
        the edges of the view. Your selection is remembered between sessions.
      </HelpTip>

      <HelpControlsRef items={[
        { name: 'Timezone selector', description: 'Clock icon + airport code + timezone ID. Shows the current display timezone; click to change it.' },
        { name: 'Display Timezone list', description: 'Dropdown headed "Display Timezone": UTC first, then Airline Bases, then Other Airports. Each row shows code, name, timezone ID, and UTC offset.' },
        { name: 'UTC', description: 'Coordinated Universal Time — the global baseline, always pinned to the top of the list.' },
        { name: '★ Airline Bases', description: "Your airline's home airports, grouped for convenience just below UTC." },
        { name: '✈ Other Airports', description: 'All other airports available as timezone references.' },
      ]} />
    </>
  )
}
