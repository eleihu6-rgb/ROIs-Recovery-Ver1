import { HelpStep, HelpNote, HelpTip, HelpControlsRef } from '../../help-article'
import { CalendarRange, Search, History, Gauge, RefreshCw } from 'lucide-react'

export default function LiveDateRange() {
  return (
    <>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        The <strong>roster-period selector</strong> at the left of the Live toolbar sets which
        days of crew rosters and flights appear on the scheduling canvas. Instead of picking
        arbitrary start and end dates, you choose one or more <strong>roster periods</strong> —
        the canvas window becomes the merged selection with seven days of context on each side.
      </p>

      <HelpStep n={1}>
        Find the <strong>roster-period selector</strong> at the far left of the Live toolbar (a
        calendar icon before a box that reads <strong>Select RPs</strong>). On first load it
        defaults to the roster period containing today and zooms the viewport to that period with
        seven days of context on each side — no data is loaded yet, so the toolbar shows an inline{' '}
        <em>No data loaded — apply filters to pull data</em> reminder.
      </HelpStep>

      <HelpStep n={2}>
        Click the selector to open the dropdown. Each row shows a <strong>roster period</strong>{' '}
        (for example <em>2026RP08</em>) with its date range on the right. Type in the search box
        to filter the list. If older (historical) periods exist, a <strong>Load earlier RPs</strong>{' '}
        button at the top fetches the next batch.
      </HelpStep>

      <HelpStep n={3}>
        Select one or more periods — the trigger then shows the <strong>merged window</strong>{' '}
        on a single line (for example <em>2026-07-25 ~ 2026-09-07</em>), and the Gantt window
        becomes <strong>{`[earliest start − 7 days, latest end + 7 days]`}</strong>. Selecting a
        period only updates the selection and date range (and re-zooms the viewport) — it does
        not load data by itself. If the selection changes after a previous load, the toolbar shows
        an <em>RP Date changed — apply filters to pull data</em> reminder; click it (or the Filter
        button) and <strong>Apply Filters</strong> to pull the new window. The selection span is
        capped at <strong>six consecutive roster periods</strong> for performance — the footer
        notes <em>Max 6 RPs span (performance)</em>, and adding a period beyond that rebuilds a
        six-period window containing the newly-selected one.
      </HelpStep>

      <HelpStep n={4}>
        The <strong>Refresh button</strong> (the circular-arrows icon, ↻) sits just to the right
        of the selector, after a thin divider. Click it to reload the <em>same</em> window with
        the latest crew data — useful when assignments have changed while you have been working.
        It spins while the reload is in progress.
      </HelpStep>

      <HelpNote>
        The roster-period selector replaces the old free-form date picker — the window is always
        derived from whole roster periods (plus a seven-day margin), so you cannot type arbitrary
        dates. To remove every selection, open the dropdown and choose <strong>Clear all</strong>.
      </HelpNote>

      <HelpTip>
        Save your current work with <kbd>Ctrl+S</kbd> before changing the roster-period selection
        so you do not lose unsaved edits.
      </HelpTip>

      <HelpControlsRef items={[
        { name: 'Roster-period selector', icon: <CalendarRange className="h-3.5 w-3.5" />, description: 'At the far left of the Live toolbar. Selects one or more roster periods; the canvas window follows the merged selection.' },
        { name: 'Period search', icon: <Search className="h-3.5 w-3.5" />, description: 'Filters the dropdown list by period code.' },
        { name: 'Load earlier RPs', icon: <History className="h-3.5 w-3.5" />, description: 'Fetches the next batch of older (historical) roster periods.' },
        { name: 'Selection span', icon: <Gauge className="h-3.5 w-3.5" />, description: 'Capped at six consecutive roster periods for performance.' },
        { name: 'Refresh button (↻)', icon: <RefreshCw className="h-3.5 w-3.5" />, description: 'Reloads the same window with the latest data.' },
      ]} />
    </>
  )
}
