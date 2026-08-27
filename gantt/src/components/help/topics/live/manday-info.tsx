import { HelpStep, HelpNote, HelpControlsRef } from '../../help-article'
import { CalendarClock, Building2, Table2 } from 'lucide-react'

export default function LiveMandayInfo() {
  return (
    <>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        <strong>Manday Info</strong> is a quick daily Credit + Block Hours (BH) + Duty Period (DP) table for one crew
        member — one row per calendar day of a single month.
      </p>

      <HelpStep n={1}>
        <strong>Open it from the roster.</strong> Right-click a crew member&apos;s row background (the
        name cell area, not a task block) and choose <strong>Manday Info</strong>. It is available in
        both the Live and Scenario roster panes.
      </HelpStep>

      <HelpStep n={2}>
        <strong>Which month is shown.</strong> The dialog follows the canvas: it covers the{' '}
        <em>leftmost calendar month visible in the Gantt</em> in the display timezone, so scrolling the
        view and re-opening gives you that month. The title reads{' '}
        <em>Manday Info — {`{crew ID}`} ({`{YYYY-MM}`})</em>.
      </HelpStep>

      <HelpStep n={3}>
        <strong>Read the table.</strong> Each row is one calendar day of the month with{' '}
        <strong>Date</strong>, <strong>Credit</strong>, <strong>BH</strong> (block hours), and{' '}
        <strong>DP</strong> (duty period), values
        shown as hours and minutes (e.g. <em>8:00</em>). The dialog header also shows the crew&apos;s{' '}
        <strong>Base</strong>.
      </HelpStep>

      <HelpNote>
        Manday Info has no timezone toggle — it is a per-calendar-day table, and the month boundary is
        resolved from the display timezone. Days without data are listed with a zero value.
      </HelpNote>

      <HelpControlsRef items={[
        { name: 'Manday Info', icon: <CalendarClock className="h-3.5 w-3.5" />, description: 'Opens the dialog for the crew under the cursor. Right-click the row background → Manday Info.' },
        { name: 'Date', icon: <Table2 className="h-3.5 w-3.5" />, description: 'Calendar day of the viewport’s leftmost month (one row per day).' },
        { name: 'Credit', icon: <CalendarClock className="h-3.5 w-3.5" />, description: 'Daily credited hours for the day (HH:MM).' },
        { name: 'BH', icon: <CalendarClock className="h-3.5 w-3.5" />, description: 'Daily block (flight) hours for the day (HH:MM).' },
        { name: 'DP', icon: <CalendarClock className="h-3.5 w-3.5" />, description: 'Daily duty period for the day (HH:MM).' },
        { name: 'Base', icon: <Building2 className="h-3.5 w-3.5" />, description: 'The crew member’s base, shown in the dialog description.' },
      ]} />
    </>
  )
}
