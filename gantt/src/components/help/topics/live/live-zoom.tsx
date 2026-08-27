import { HelpStep, HelpNote, HelpControlsRef } from '../../help-article'

export default function LiveZoom() {
  return (
    <>
      <HelpStep n={1}>
        To <strong>zoom in</strong> (see fewer days at higher detail), click the{' '}
        <strong>Zoom In</strong> button (the magnifier-plus icon) in the toolbar, or press{' '}
        <kbd>Ctrl++</kbd> (hold Ctrl and press the plus key).
      </HelpStep>

      <HelpStep n={2}>
        To <strong>zoom out</strong> (see more days at once), click the <strong>Zoom Out</strong>{' '}
        button (the magnifier-minus icon), or press <kbd>Ctrl+−</kbd>.
      </HelpStep>

      <HelpStep n={3}>
        To jump straight to a roster period, <strong>right-click the time axis</strong> (the date
        ruler above the canvas) and pick a period from the <strong>GO TO RPDate</strong> menu. The
        menu lists the roster periods that are currently loaded — choosing one zooms so that period
        fills the view. The same menu also offers <strong>Daily Gantt Statistics</strong> for the day
        under your cursor.
      </HelpStep>

      <HelpNote>
        You can also <strong>drag across the time axis</strong> to zoom: drag right over a range to
        zoom in on it, or drag left to zoom out.
      </HelpNote>

      <HelpNote>
        The zoom buttons are disabled when you reach the minimum or maximum zoom level.
        On macOS, use <kbd>⌘</kbd> instead of <kbd>Ctrl</kbd>.
      </HelpNote>

      <HelpControlsRef items={[
        { name: 'Zoom In (icon)', description: 'Increases detail. Fewer days fit on screen but assignments are easier to read.' },
        { name: 'Zoom Out (icon)', description: 'Decreases detail. More days fit on screen, useful for planning over longer periods.' },
        { name: 'GO TO RPDate (right-click time axis)', description: 'Zooms so the chosen roster period fills the view. Daily Gantt Statistics opens the day stats panel.' },
      ]} />
    </>
  )
}
